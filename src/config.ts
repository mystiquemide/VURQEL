/**
 * Runtime configuration for Vurqel.
 *
 * Values resolve from environment variables with development-safe defaults that
 * match the pinned HydraDB runtime validated in CP-001 (see PROJECT_STATE.md).
 * The HydraDB client transport is HTTP JSON (DEC-002).
 */

export interface HydraDbConfig {
  httpUrl: string;
  adminUrl: string;
  token: string;
  namespace: string;
  graph: string;
  cell: string;
}

function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

export function loadHydraDbConfig(): HydraDbConfig {
  return {
    httpUrl: env("HYDRADB_HTTP_URL", "http://127.0.0.1:8443"),
    adminUrl: env("HYDRADB_ADMIN_URL", "http://127.0.0.1:9090"),
    token: env("HYDRADB_TOKEN", "local-development-token-32-bytes"),
    namespace: env("HYDRADB_NAMESPACE", "default"),
    graph: env("HYDRADB_GRAPH", "default"),
    cell: env("HYDRADB_CELL", "cell-0"),
  };
}

/** GitHub source-adapter configuration (Phase 2). */
export interface GitHubConfig {
  apiBaseUrl: string;
  rawBaseUrl: string;
  htmlBaseUrl: string;
  /** Optional PAT (env GITHUB_TOKEN) for a higher rate limit; never logged. */
  token?: string;
  /** Directory for cached responses (cached-replay + rate-limit conservation). */
  cacheDir: string;
  /** readwrite = use cache, fetch on miss; readonly = cache only (offline); refresh = always fetch. */
  cacheMode: "readwrite" | "readonly" | "refresh";
  timeoutMs: number;
}

function cacheMode(): GitHubConfig["cacheMode"] {
  const raw = env("VURQEL_GH_CACHE", "readwrite");
  return raw === "readonly" || raw === "refresh" ? raw : "readwrite";
}

export function loadGitHubConfig(): GitHubConfig {
  const token = process.env.GITHUB_TOKEN;
  return {
    apiBaseUrl: env("GITHUB_API_URL", "https://api.github.com"),
    rawBaseUrl: env("GITHUB_RAW_URL", "https://raw.githubusercontent.com"),
    htmlBaseUrl: env("GITHUB_HTML_URL", "https://github.com"),
    ...(token ? { token } : {}),
    cacheDir: env("VURQEL_GH_CACHE_DIR", ".vurqel-cache/github"),
    cacheMode: cacheMode(),
    timeoutMs: Number(env("GITHUB_TIMEOUT_MS", "15000")),
  };
}
