/**
 * Application-layer `investigate` orchestrator (CP-002.3).
 *
 * Ties the pure domain (evaluate -> graph -> receipt) to the HydraDB sponsor
 * boundary: it ingests the typed provenance graph, reads the bounded
 * `incident -> service` path back under one strong snapshot, and returns a
 * source-linked receipt carrying that snapshot bookmark (FR-008, FR-009,
 * FR-011). A complete path exists in HydraDB only when the evaluator returns
 * EXPOSED, so the graph read is the graph-native realization of the invariant.
 *
 * Fail-closed: if the evaluator concludes EXPOSED but HydraDB does not return
 * the complete same-SHA path, this raises rather than emitting an EXPOSED
 * receipt the graph cannot back (no client-side substitute is accepted).
 */
import type { HydraDbClient } from "./hydradb/client.js";
import { HydraDbError, type HydraPath } from "./hydradb/types.js";
import { evaluateInvestigation, type Evaluation } from "./domain/evaluate.js";
import { buildProvenanceGraph, type BuiltGraph } from "./domain/graph.js";
import { buildReceipt } from "./domain/receipt.js";
import {
  PROVENANCE_EDGE_ORDER,
  type EvidenceBundle,
  type InvestigationRequest,
  type ProvenanceGraph,
  type Receipt,
  type ReceiptSnapshot,
} from "./domain/schema.js";

/** Longest provenance chain is 7 hops (8 nodes); bound the path read just above it. */
const MAX_PATH_LEN = PROVENANCE_EDGE_ORDER.length + 1;

export interface IngestResult {
  bookmark: string | null;
  readEpoch: number | null;
}

/**
 * Batch-write the typed provenance graph. Nodes are grouped by kind so each
 * batch carries a single label (the adapter's `SET n:Label` requirement); edges
 * are merged in provenance order. MERGE-by-deterministic-id makes this
 * idempotent (FR-013): repeating the same graph writes no new nodes or edges.
 */
export async function ingestProvenanceGraph(
  client: HydraDbClient,
  graph: ProvenanceGraph,
  options: { cell?: string } = {},
): Promise<IngestResult> {
  const byKind = new Map<string, { id: number; [k: string]: unknown }[]>();
  for (const node of graph.nodes) {
    const rows = byKind.get(node.kind) ?? [];
    rows.push({ id: node.id, ...node.properties });
    byKind.set(node.kind, rows);
  }

  let last: IngestResult = { bookmark: null, readEpoch: null };
  for (const [kind, rows] of byKind) {
    const res = await client.upsertNodes(kind, rows, { cell: options.cell });
    last = { bookmark: res.bookmark, readEpoch: res.readEpoch };
  }
  for (const edge of graph.edges) {
    const res = await client.mergeEdge(edge.sourceId, edge.type, edge.targetId, { cell: options.cell });
    last = { bookmark: res.bookmark, readEpoch: res.readEpoch };
  }
  return last;
}

export interface InvestigateOptions {
  /** Overrides the generated timestamp for deterministic receipts (NFR-002). */
  generatedAt?: string;
  /** HydraDB cell to write/read; defaults to the client's configured cell. */
  cell?: string;
  /** Evidence provenance to stamp on the receipt (FR-012). */
  mode?: "online" | "cached-replay";
}

export interface InvestigationResult {
  request: InvestigationRequest;
  evaluation: Evaluation;
  graph: BuiltGraph;
  /** The bounded provenance path returned by HydraDB, or null when incomplete. */
  path: HydraPath | null;
  receipt: Receipt;
}

/**
 * Run one investigation end to end against a live HydraDB.
 *
 * The evidence bundle is supplied by the caller (a live source adapter or a
 * labelled cached replay); this function owns evaluation, graph ingestion, the
 * snapshot-scoped proof read, and the receipt.
 */
export async function investigate(
  client: HydraDbClient,
  request: InvestigationRequest,
  evidence: EvidenceBundle,
  options: InvestigateOptions = {},
): Promise<InvestigationResult> {
  const evaluation = evaluateInvestigation(request, evidence);
  const graph = buildProvenanceGraph(request, evidence, evaluation);

  const written = await ingestProvenanceGraph(client, graph, { cell: options.cell });

  let path: HydraPath | null = null;
  let snapshot: ReceiptSnapshot = { bookmark: written.bookmark ?? "", readEpoch: written.readEpoch };

  if (graph.serviceId !== null) {
    const read = await client.shortestPath(
      {
        sourceNode: graph.incidentId,
        targetNode: graph.serviceId,
        relTypes: [...PROVENANCE_EDGE_ORDER],
        maxLen: MAX_PATH_LEN,
        relDirection: "outgoing",
        pathCount: 1,
        consistency: "strong",
      },
      { cell: options.cell },
    );
    path = read.path;
    if (read.result.bookmark) {
      snapshot = { bookmark: read.result.bookmark, readEpoch: read.result.readEpoch };
    }
  }

  // Fail closed: an EXPOSED verdict must be backed by the complete HydraDB path.
  if (evaluation.state === "EXPOSED") {
    const complete =
      path !== null &&
      path.nodes.length === graph.nodes.length &&
      path.relationships.length === PROVENANCE_EDGE_ORDER.length;
    if (!complete) {
      throw new HydraDbError(
        "incomplete_proof_path",
        "Evaluator concluded EXPOSED but HydraDB did not return the complete same-SHA provenance path; refusing to emit an unbacked EXPOSED receipt.",
      );
    }
  }

  const receipt = buildReceipt(request, evidence, evaluation, {
    snapshot,
    generatedAt: options.generatedAt,
    mode: options.mode,
  });

  return { request, evaluation, graph, path, receipt };
}
