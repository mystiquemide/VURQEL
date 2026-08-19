/**
 * HydraDB-as-arbiter unit tests.
 *
 * These prove the load-bearing claim: the EXPOSED verdict is issued by HydraDB's
 * path read, not by the in-process evaluator. Using a fake client we can force
 * the graph to return no path (or an incomplete one) for evidence the evaluator
 * fully verifies, and assert the verdict falls to UNPROVEN — never EXPOSED.
 *
 * Pure (no live HydraDB): the fake client stands in for the transport, so this
 * runs in the unit suite / CI.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { investigate } from "../src/investigate.js";
import { tanstackRequest, tanstackEvidence } from "../src/fixtures/tanstack.js";
import { PROVENANCE_EDGE_ORDER } from "../src/domain/schema.js";
import type { HydraDbClient } from "../src/hydradb/client.js";
import type { HydraPath } from "../src/hydradb/types.js";

const WRITE = { queryId: "", columns: [], rows: [], readEpoch: 7, nextCursor: null, bookmark: "sgk:test:7" };

/** A minimal client whose only interesting behavior is what path the graph returns. */
function fakeClient(pathFor: (relTypeCount: number) => HydraPath | null): HydraDbClient {
  return {
    async ready() { return true; },
    async upsertNodes() { return { ...WRITE }; },
    async mergeEdge() { return { ...WRITE }; },
    async shortestPath(query: { relTypes: string[] }) {
      return { path: pathFor(query.relTypes.length), result: { ...WRITE } };
    },
  } as unknown as HydraDbClient;
}

function pathOf(nodeCount: number, relCount: number): HydraPath {
  return {
    nodes: Array.from({ length: nodeCount }, (_, i) => ({ id: i, labels: [], properties: {} })),
    relationships: Array.from({ length: relCount }, (_, i) => ({
      id: i, edge_type: "X", src: i, dst: i + 1, properties: {},
    })),
  };
}

test("arbiter: a complete algo.SPpaths result yields EXPOSED for verified evidence", async () => {
  // A complete chain is (edges + 1) nodes and (edges) relationships.
  const client = fakeClient((n) => pathOf(n + 1, n));
  const { receipt } = await investigate(client, tanstackRequest, tanstackEvidence, { mode: "cached-replay" });
  assert.equal(receipt.state, "EXPOSED");
  assert.equal(receipt.reasonCode, "EXPOSED_SAME_SHA_PATH");
});

test("arbiter: no path from HydraDB forces UNPROVEN, never EXPOSED", async () => {
  const client = fakeClient(() => null);
  const { receipt } = await investigate(client, tanstackRequest, tanstackEvidence, { mode: "cached-replay" });
  assert.equal(receipt.state, "UNPROVEN");
  assert.equal(receipt.reasonCode, "UNPROVEN_INCOMPLETE_PROOF_PATH");
});

test("arbiter: an incomplete path (short one hop) forces UNPROVEN", async () => {
  // One relationship short of the full provenance chain — the graph cannot back EXPOSED.
  const client = fakeClient((n) => pathOf(n, n - 1));
  const { receipt } = await investigate(client, tanstackRequest, tanstackEvidence, { mode: "cached-replay" });
  assert.equal(receipt.state, "UNPROVEN");
  assert.equal(receipt.reasonCode, "UNPROVEN_INCOMPLETE_PROOF_PATH");
});

test("arbiter: the full chain is 7 hops / 8 nodes (guards the completeness check)", () => {
  assert.equal(PROVENANCE_EDGE_ORDER.length, 7);
});
