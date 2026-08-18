/**
 * CP-002.1 integration test: reproduces the CP-001 HydraDB round trip from code.
 *
 * Requires a running HydraDB node (run `pnpm hydradb:up` first). Writes a typed
 * provenance chain via the adapter, reads it back as one bounded `algo.SPpaths`
 * path under a strong snapshot, and asserts the full path, the snapshot
 * bookmark, idempotency, and fail-closed behavior on an unsupported query.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

import { loadHydraDbConfig } from "../src/config.js";
import { HydraDbClient, type NodeUpsert } from "../src/hydradb/client.js";
import { HydraDbError } from "../src/hydradb/types.js";

const LABEL = "VurqelSmoke";
const BASE = 700_000;
const KINDS = [
  "Incident",
  "PackageVersion",
  "LockfileSnapshot",
  "GitCommit",
  "WorkflowRun",
  "CIJob",
  "ServiceBuild",
  "Service",
] as const;
const EDGE_TYPES = [
  "AFFECTS",
  "RESOLVED_BY",
  "AT_COMMIT",
  "TRIGGERS",
  "HAS_JOB",
  "PRODUCES",
  "TARGETS",
] as const;

const nodes: NodeUpsert[] = KINDS.map((kind, index) => ({ id: BASE + index + 1, kind }));
const source = nodes[0]!.id;
const target = nodes[nodes.length - 1]!.id;

const client = new HydraDbClient(loadHydraDbConfig());

async function ingestChain(): Promise<void> {
  await client.upsertNodes(LABEL, nodes);
  for (let i = 0; i < EDGE_TYPES.length; i += 1) {
    await client.mergeEdge(nodes[i]!.id, EDGE_TYPES[i]!, nodes[i + 1]!.id);
  }
}

before(async () => {
  const ready = await client.ready();
  assert.ok(ready, "HydraDB is not reachable at HYDRADB_ADMIN_URL. Run `pnpm hydradb:up` first.");
});

test("writes a typed provenance chain and reads it back as a bounded path (strong snapshot)", async () => {
  await ingestChain();

  const { path, result } = await client.shortestPath({
    sourceNode: source,
    targetNode: target,
    relTypes: [...EDGE_TYPES],
    maxLen: EDGE_TYPES.length + 1,
    relDirection: "outgoing",
    pathCount: 1,
    consistency: "strong",
  });

  assert.ok(path, "expected a provenance path");
  assert.equal(path.nodes.length, KINDS.length, "path should contain every provenance node");
  assert.deepEqual(
    path.nodes.map((n) => n.id),
    nodes.map((n) => n.id),
    "path node ids should be in provenance order",
  );
  assert.equal(path.relationships.length, EDGE_TYPES.length, "path should contain every typed edge");
  assert.deepEqual(
    path.relationships.map((r) => r.edge_type),
    [...EDGE_TYPES],
    "edge types should match the provenance chain in order",
  );

  // Snapshot proof: a receipt must carry the pinned snapshot bookmark/epoch.
  assert.equal(typeof result.bookmark, "string");
  assert.ok((result.bookmark ?? "").length > 0, "bookmark must be present for the receipt");
  assert.equal(typeof result.readEpoch, "number");
});

test("is idempotent on repeated import (no duplicated path)", async () => {
  await ingestChain();
  await ingestChain();

  const { path } = await client.shortestPath({
    sourceNode: source,
    targetNode: target,
    relTypes: [...EDGE_TYPES],
    maxLen: EDGE_TYPES.length + 1,
    pathCount: 5,
    consistency: "strong",
  });

  assert.ok(path);
  assert.equal(path.nodes.length, KINDS.length);
  assert.equal(path.relationships.length, EDGE_TYPES.length);
});

test("fails closed on an unsupported query (no silent success)", async () => {
  await assert.rejects(
    () => client.query("MATCH (n) RETURN count(*) AS c", { consistency: "strong" }),
    (err: unknown) => {
      assert.ok(err instanceof HydraDbError, "should raise a typed HydraDbError");
      assert.equal(err.code, "invalid_request");
      return true;
    },
  );
});
