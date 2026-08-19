/**
 * Application-layer `investigate` orchestrator (CP-002.3).
 *
 * Ties the pure domain (evaluate -> graph -> receipt) to the HydraDB sponsor
 * boundary: it ingests the typed provenance graph, reads the bounded
 * `incident -> service` path back under one strong snapshot, and returns a
 * source-linked receipt carrying that snapshot bookmark (FR-008, FR-009, FR-011).
 *
 * HydraDB issues the affirmative verdict. The evaluator verifies each hop and
 * builds the typed graph, but EXPOSED is emitted only when HydraDB's `algo.SPpaths`
 * returns the complete same-SHA Incident->Service path under one strong snapshot.
 * If the graph cannot return that path, Vurqel abstains (UNPROVEN) rather than
 * assert an exposure the graph does not back. Delete the graph read and no EXPOSED
 * can be produced: the path, not the in-process evaluator, is the arbiter.
 */
import type { HydraDbClient } from "./hydradb/client.js";
import type { HydraPath } from "./hydradb/types.js";
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

  // HydraDB is the arbiter of the affirmative verdict. The evaluator verified each
  // hop and built the graph; EXPOSED is issued only when algo.SPpaths returns the
  // complete same-SHA path under the read snapshot. If it does not, abstain
  // (UNPROVEN) rather than assert an exposure the graph cannot prove.
  const pathComplete =
    path !== null &&
    path.nodes.length === graph.nodes.length &&
    path.relationships.length === PROVENANCE_EDGE_ORDER.length;

  let decided: Evaluation = evaluation;
  if (evaluation.state === "EXPOSED" && !pathComplete) {
    decided = {
      ...evaluation,
      state: "UNPROVEN",
      reasonCode: "UNPROVEN_INCOMPLETE_PROOF_PATH",
      reason:
        "Every hop verified against the evidence, but HydraDB did not return the complete same-SHA path under the read snapshot; Vurqel abstains rather than assert an exposure the graph cannot prove.",
    };
  }

  const receipt = buildReceipt(request, evidence, decided, {
    snapshot,
    generatedAt: options.generatedAt,
    mode: options.mode,
  });

  return { request, evaluation: decided, graph, path, receipt };
}
