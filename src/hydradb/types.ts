/**
 * HydraDB HTTP query API types.
 *
 * Shapes are taken from the responses observed against the pinned runtime in
 * CP-001 and from `src/client/http.rs` in hydra-db/hydradb@6a2fbb19. HydraDB
 * returns a single result envelope per request; scalar rows use a tagged
 * `{ type, value }` value, and path rows carry a structured `path` value.
 */

export type HydraConsistency = "causal" | "strong";

/** A tagged scalar/aggregate value in a result row, e.g. { type: "vertex_id", value: 2 }. */
export interface HydraValue {
  type: string;
  value: unknown;
}

export interface HydraPathNode {
  id: number;
  labels: string[];
  /** Properties are tag-wrapped by HydraDB, e.g. { kind: { String: "Incident" } }. */
  properties: Record<string, unknown>;
}

export interface HydraPathRelationship {
  id: number | null;
  edge_type: string;
  src: number;
  dst: number;
  properties: Record<string, unknown>;
}

export interface HydraPath {
  nodes: HydraPathNode[];
  relationships: HydraPathRelationship[];
}

/** Parsed, camel-cased result envelope. */
export interface HydraQueryResult {
  queryId: string;
  columns: string[];
  rows: HydraValue[][];
  /** Snapshot epoch pinned for the read (present on reads, null on writes). */
  readEpoch: number | null;
  nextCursor: string | null;
  /** Snapshot bookmark; the receipt's proof-of-snapshot handle. */
  bookmark: string | null;
}

export class HydraDbError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "HydraDbError";
    this.code = code;
  }
}

/** Type guard: is a result row cell a structured path value? */
export function isHydraPathValue(value: HydraValue): value is { type: "path"; value: HydraPath } {
  return value.type === "path" && typeof value.value === "object" && value.value !== null;
}
