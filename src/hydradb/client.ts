/**
 * HydraDB HTTP client (Vurqel's sponsor adapter).
 *
 * Transport: HTTP JSON API `POST {httpUrl}/v1/graphs/{graph}/query` (DEC-002),
 * validated end-to-end in CP-001. Writes use batched `UNWIND` with the
 * `parameters` object; whole-path reads use the native `algo.SPpaths`
 * procedure under a pinned snapshot. The adapter fails closed: any HydraDB
 * `error` payload is raised as a typed `HydraDbError`, never swallowed.
 *
 * Query-surface constraints honored here (from cypher-compat.md + CP-001):
 *  - node ids are non-negative integers;
 *  - a vertex upsert must be `MERGE (n {id: row.id})` then exactly one `SET`
 *    label plus properties;
 *  - one relationship type per pattern, directed;
 *  - variable-length paths must be bounded; whole paths come from algo.*paths.
 */
import type { HydraDbConfig } from "../config.js";
import {
  HydraDbError,
  isHydraPathValue,
  type HydraConsistency,
  type HydraPath,
  type HydraQueryResult,
  type HydraValue,
} from "./types.js";

interface RawResponse {
  query_id?: string;
  columns?: string[];
  rows?: HydraValue[][];
  read_epoch?: number | null;
  next_cursor?: string | null;
  bookmark?: string | null;
  error?: { code?: string; message?: string };
}

export interface QueryOptions {
  parameters?: Record<string, unknown>;
  consistency?: HydraConsistency;
  cell?: string;
  timeoutMs?: number;
}

/** A node row for a batched upsert. `id` must be a non-negative integer. */
export interface NodeUpsert {
  id: number;
  [property: string]: unknown;
}

export interface ShortestPathQuery {
  sourceNode: number;
  targetNode: number;
  relTypes: string[];
  maxLen: number;
  relDirection?: "outgoing" | "incoming" | "both";
  pathCount?: number;
  consistency?: HydraConsistency;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class HydraDbClient {
  constructor(private readonly config: HydraDbConfig) {}

  private get queryUrl(): string {
    const base = this.config.httpUrl.replace(/\/$/, "");
    return `${base}/v1/graphs/${encodeURIComponent(this.config.graph)}/query`;
  }

  /** Execute one OpenCypher statement. Raises HydraDbError on any error payload. */
  async query(cypher: string, options: QueryOptions = {}): Promise<HydraQueryResult> {
    const body: Record<string, unknown> = {
      cell_id: options.cell ?? this.config.cell,
      query: cypher,
    };
    if (options.parameters) body.parameters = options.parameters;
    if (options.consistency) body.consistency = options.consistency;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(this.queryUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          "X-Graph-Namespace": this.config.namespace,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new HydraDbError("transport_error", `HydraDB request failed: ${reason}`);
    } finally {
      clearTimeout(timeout);
    }

    const text = await res.text();
    let parsed: RawResponse;
    try {
      parsed = JSON.parse(text) as RawResponse;
    } catch {
      throw new HydraDbError(
        "invalid_response",
        `Non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}`,
      );
    }
    if (parsed.error) {
      throw new HydraDbError(parsed.error.code ?? "error", parsed.error.message ?? "HydraDB error");
    }
    if (!res.ok) {
      throw new HydraDbError("http_error", `HydraDB returned HTTP ${res.status}`);
    }
    return {
      queryId: parsed.query_id ?? "",
      columns: parsed.columns ?? [],
      rows: parsed.rows ?? [],
      readEpoch: parsed.read_epoch ?? null,
      nextCursor: parsed.next_cursor ?? null,
      bookmark: parsed.bookmark ?? null,
    };
  }

  /** Admin readiness probe (`GET {adminUrl}/readyz`). */
  async ready(timeoutMs = 3_000): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.config.adminUrl.replace(/\/$/, "")}/readyz`, {
        signal: controller.signal,
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Batch-upsert nodes carrying a single label and scalar properties.
   * Idempotent: MERGE-by-id, then SET the label and remaining properties.
   */
  async upsertNodes(label: string, nodes: NodeUpsert[], options: QueryOptions = {}): Promise<HydraQueryResult> {
    assertLabel(label);
    if (nodes.length === 0) {
      throw new HydraDbError("empty_batch", "upsertNodes requires at least one node");
    }
    const propertyKeys = new Set<string>();
    for (const node of nodes) {
      assertNodeId(node.id);
      for (const key of Object.keys(node)) {
        if (key !== "id") propertyKeys.add(key);
      }
    }
    const sets = [`n:${label}`, ...[...propertyKeys].map((key) => `n.${key} = row.${key}`)].join(", ");
    const cypher = `UNWIND $rows AS row MERGE (n {id: row.id}) SET ${sets}`;
    return this.query(cypher, { ...options, parameters: { ...options.parameters, rows: nodes } });
  }

  /** Create one typed, directed relationship between two existing/absent node ids (idempotent MERGE). */
  async mergeEdge(sourceId: number, edgeType: string, targetId: number, options: QueryOptions = {}): Promise<HydraQueryResult> {
    assertNodeId(sourceId);
    assertNodeId(targetId);
    assertRelType(edgeType);
    const cypher = `MERGE (a {id: ${sourceId}})-[:${edgeType}]->(b {id: ${targetId}})`;
    return this.query(cypher, options);
  }

  /**
   * Bounded whole-path read via the native `algo.SPpaths` procedure between one
   * source and one target. Returns the first path (if any) plus the snapshot
   * bookmark/epoch. Defaults to a `strong` read so a receipt comes from one
   * refreshed snapshot.
   */
  async shortestPath(query: ShortestPathQuery, options: QueryOptions = {}): Promise<{ path: HydraPath | null; result: HydraQueryResult }> {
    assertNodeId(query.sourceNode);
    assertNodeId(query.targetNode);
    if (query.relTypes.length === 0) {
      throw new HydraDbError("empty_rel_types", "shortestPath requires at least one relationship type");
    }
    query.relTypes.forEach(assertRelType);
    if (!Number.isInteger(query.maxLen) || query.maxLen < 1) {
      throw new HydraDbError("invalid_max_len", "maxLen must be a positive integer (paths must be bounded)");
    }
    const config = {
      sourceNode: query.sourceNode,
      targetNode: query.targetNode,
      relTypes: query.relTypes,
      maxLen: query.maxLen,
      relDirection: query.relDirection ?? "outgoing",
      pathCount: query.pathCount ?? 1,
    };
    const cypher = `CALL algo.SPpaths(${toCypherMap(config)}) YIELD path, pathWeight, pathCost RETURN path, pathWeight, pathCost`;
    const result = await this.query(cypher, {
      ...options,
      consistency: query.consistency ?? options.consistency ?? "strong",
    });
    const firstRow = result.rows[0];
    const firstCell = firstRow?.[0];
    const path = firstCell && isHydraPathValue(firstCell) ? firstCell.value : null;
    return { path, result };
  }
}

const LABEL_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const REL_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertLabel(label: string): void {
  if (!LABEL_PATTERN.test(label)) {
    throw new HydraDbError("invalid_label", `Invalid label: ${label}`);
  }
}

function assertRelType(relType: string): void {
  if (!REL_PATTERN.test(relType)) {
    throw new HydraDbError("invalid_rel_type", `Invalid relationship type: ${relType}`);
  }
}

function assertNodeId(id: number): void {
  if (!Number.isInteger(id) || id < 0) {
    throw new HydraDbError("invalid_node_id", `Node id must be a non-negative integer: ${String(id)}`);
  }
}

/**
 * Serialize a JS value as an OpenCypher literal. Unlike JSON, Cypher map keys
 * are bare identifiers and string literals use single quotes.
 */
export function toCypherValue(value: unknown): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new HydraDbError("invalid_value", `Non-finite number cannot be a Cypher literal: ${String(value)}`);
    }
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "string") {
    return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  }
  if (Array.isArray(value)) {
    return `[${value.map(toCypherValue).join(", ")}]`;
  }
  if (value !== null && typeof value === "object") {
    return toCypherMap(value as Record<string, unknown>);
  }
  throw new HydraDbError("invalid_value", `Unsupported Cypher literal: ${String(value)}`);
}

function toCypherMap(map: Record<string, unknown>): string {
  const entries = Object.entries(map).map(([key, val]) => {
    if (!LABEL_PATTERN.test(key)) {
      throw new HydraDbError("invalid_key", `Invalid Cypher map key: ${key}`);
    }
    return `${key}: ${toCypherValue(val)}`;
  });
  return `{${entries.join(", ")}}`;
}
