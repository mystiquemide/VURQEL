/**
 * GitHub source client (Vurqel Phase 2).
 *
 * Read-only public GitHub access with three concerns baked in:
 *  - Caching: every successful response is cached under `cacheDir` keyed by
 *    URL+Accept. A cache hit is served as `cached-replay`; a miss is fetched
 *    `online` and then cached. This conserves the 60/hr anonymous budget and
 *    implements the plan's labelled online/replay distinction (FR-012).
 *  - Fail-closed errors: HTTP/transport failures raise a typed `SourceError`
 *    with an explicit `retryable` flag (rate-limit / 5xx / transport are
 *    retryable; 403-forbidden / 404 are not). Errors are never cached and never
 *    silently swallowed (FR-014).
 *  - Secret safety: an optional PAT (config.token) is sent as a header only and
 *    is never written to the cache or logs (NFR-005).
 *
 * No workflow or package script is ever executed; only data is fetched.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

import type { GitHubConfig } from "../config.js";

export type SourceMode = "online" | "cached-replay";

export class SourceError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly retryable: boolean;
  constructor(code: string, message: string, opts: { status?: number; retryable?: boolean } = {}) {
    super(message);
    this.name = "SourceError";
    this.code = code;
    if (opts.status !== undefined) this.status = opts.status;
    this.retryable = opts.retryable ?? false;
  }
}

export interface FetchResult {
  body: string;
  status: number;
  mode: SourceMode;
  url: string;
}

interface CacheEntry {
  url: string;
  accept: string;
  status: number;
  body: string;
  fetchedAt: string;
}

const GH_ACCEPT = "application/vnd.github+json";

export class GitHubClient {
  constructor(private readonly config: GitHubConfig) {}

  get rawBaseUrl(): string {
    return this.config.rawBaseUrl.replace(/\/$/, "");
  }

  get htmlBaseUrl(): string {
    return this.config.htmlBaseUrl.replace(/\/$/, "");
  }

  /** GET a GitHub REST path (relative to apiBaseUrl) and parse JSON. */
  async getJson<T>(path: string): Promise<{ data: T; mode: SourceMode; url: string }> {
    const url = `${this.config.apiBaseUrl.replace(/\/$/, "")}${path}`;
    const res = await this.fetchCached(url, GH_ACCEPT);
    let data: T;
    try {
      data = JSON.parse(res.body) as T;
    } catch {
      throw new SourceError("invalid_response", `Non-JSON response from ${url}`, { retryable: false });
    }
    return { data, mode: res.mode, url };
  }

  /** GET a raw text resource by absolute URL (e.g. a raw.githubusercontent blob). */
  async getText(url: string): Promise<{ data: string; mode: SourceMode; url: string }> {
    const res = await this.fetchCached(url, "text/plain");
    return { data: res.body, mode: res.mode, url };
  }

  private cachePath(url: string, accept: string): string {
    const key = createHash("sha256").update(`${accept}\n${url}`).digest("hex");
    return join(this.config.cacheDir, `${key}.json`);
  }

  private readCache(file: string): CacheEntry | null {
    if (!existsSync(file)) return null;
    try {
      return JSON.parse(readFileSync(file, "utf8")) as CacheEntry;
    } catch {
      return null;
    }
  }

  private writeCache(file: string, entry: CacheEntry): void {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(entry));
  }

  private async fetchCached(url: string, accept: string): Promise<FetchResult> {
    const file = this.cachePath(url, accept);

    if (this.config.cacheMode !== "refresh") {
      const cached = this.readCache(file);
      if (cached) return { body: cached.body, status: cached.status, mode: "cached-replay", url };
      if (this.config.cacheMode === "readonly") {
        throw new SourceError("cache_miss", `No cached response for ${url} (VURQEL_GH_CACHE=readonly)`, { retryable: false });
      }
    }

    const headers: Record<string, string> = {
      Accept: accept,
      "User-Agent": "vurqel/0.1",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (this.config.token) headers.Authorization = `Bearer ${this.config.token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, { headers, signal: controller.signal });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new SourceError("transport_error", `GitHub request failed: ${reason}`, { retryable: true });
    } finally {
      clearTimeout(timer);
    }

    const body = await res.text();
    if (!res.ok) throw this.mapHttpError(res, url, body);

    this.writeCache(file, { url, accept, status: res.status, body, fetchedAt: new Date().toISOString() });
    return { body, status: res.status, mode: "online", url };
  }

  private mapHttpError(res: Response, url: string, body: string): SourceError {
    const remaining = res.headers.get("x-ratelimit-remaining");
    if ((res.status === 403 || res.status === 429) && remaining === "0") {
      const reset = res.headers.get("x-ratelimit-reset");
      return new SourceError("rate_limited", `GitHub rate limit exhausted (reset ${reset ?? "?"}) for ${url}`, {
        status: res.status,
        retryable: true,
      });
    }
    if (res.status === 403) {
      return new SourceError("forbidden", `GitHub returned 403 for ${url}: ${snippet(body)}`, { status: 403, retryable: false });
    }
    if (res.status === 404) {
      return new SourceError("not_found", `GitHub resource not found: ${url}`, { status: 404, retryable: false });
    }
    if (res.status >= 500) {
      return new SourceError("server_error", `GitHub returned HTTP ${res.status} for ${url}`, { status: res.status, retryable: true });
    }
    return new SourceError("http_error", `GitHub returned HTTP ${res.status} for ${url}: ${snippet(body)}`, {
      status: res.status,
      retryable: false,
    });
  }
}

function snippet(body: string): string {
  return body.replace(/\s+/g, " ").slice(0, 160);
}
