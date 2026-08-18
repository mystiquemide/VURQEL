/**
 * CP-002.3 end-to-end test: the `investigate` flow against a live HydraDB.
 *
 * Requires a running node (`pnpm hydradb:up`). Proves the vertical slice:
 *  - the verified TanStack case ingests and reads back the complete same-SHA
 *    provenance path under a strong snapshot and yields an EXPOSED receipt
 *    (FR-008, FR-009, FR-011);
 *  - repeating the same investigation is idempotent and byte-identical apart
 *    from retrieval metadata (FR-013, NFR-002);
 *  - a SHA mismatch and a missing-frozen-install case never reach EXPOSED and
 *    return no complete path (BR-002, BR-003, FR-010).
 *
 * Negative cases use salted, disjoint identities so their unique target service
 * is unreachable from the EXPOSED chain in the shared default graph (HydraDB
 * exposes only the provisioned `default`/`cell-0` scope — verified 2026-08-18).
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

import { loadHydraDbConfig } from "../src/config.js";
import { HydraDbClient } from "../src/hydradb/client.js";
import { investigate } from "../src/investigate.js";
import { PROVENANCE_EDGE_ORDER, type EvidenceBundle, type InvestigationRequest } from "../src/domain/schema.js";
import { tanstackEvidence, tanstackRequest } from "../src/fixtures/tanstack.js";

const client = new HydraDbClient(loadHydraDbConfig());
const FIXED = { generatedAt: "2026-08-18T12:00:00Z" as const };

/** Build a disjoint clone whose node ids never collide with the real EXPOSED chain. */
function saltedCase(prefix: string): { request: InvestigationRequest; evidence: EvidenceBundle } {
  const sha = prefix + "0".repeat(40 - prefix.length); // 40-hex, disjoint from the real SHA
  const runId = `990${prefix}`;
  const checkRunId = `880${prefix}`;
  const service = `websites-tools-${prefix}`;
  const repoUrl = "https://github.com/vurqel-test/neg";

  const evidence = structuredClone(tanstackEvidence);
  evidence.commit!.sha = sha;
  evidence.commit!.url = `${repoUrl}/commit/${sha}`;
  evidence.lockfile!.commitSha = sha;
  evidence.lockfile!.sourceUrl = `${repoUrl}/blob/${sha}/tools/pnpm-lock.yaml`;
  evidence.workflow!.commitSha = sha;
  evidence.workflow!.sourceUrl = `${repoUrl}/blob/${sha}/.github/workflows/ci.yml`;
  evidence.run!.runId = runId;
  evidence.run!.headSha = sha;
  evidence.run!.url = `${repoUrl}/actions/runs/${runId}`;
  evidence.job!.headSha = sha;
  evidence.job!.url = `${repoUrl}/actions/runs/${runId}`;
  evidence.serviceBuild!.headSha = sha;
  evidence.serviceBuild!.service = service;
  evidence.serviceBuild!.checkRunId = checkRunId;
  evidence.serviceBuild!.url = `${repoUrl}/runs/${checkRunId}`;

  const request: InvestigationRequest = {
    ...structuredClone(tanstackRequest),
    repository: { owner: "vurqel-test", name: "neg" },
    serviceNameFilter: service,
  };
  return { request, evidence };
}

before(async () => {
  assert.ok(await client.ready(), "HydraDB is not reachable. Run `pnpm hydradb:up` first.");
});

test("EXPOSED: verified TanStack case ingests and reads back the complete same-SHA path", async () => {
  const result = await investigate(client, tanstackRequest, tanstackEvidence, FIXED);

  assert.equal(result.receipt.state, "EXPOSED");
  assert.equal(result.receipt.reasonCode, "EXPOSED_SAME_SHA_PATH");

  // The proof is graph-native: HydraDB returned the full 8-node / 7-edge path.
  assert.ok(result.path, "expected a complete provenance path from HydraDB");
  assert.equal(result.path.nodes.length, 8);
  assert.equal(result.path.relationships.length, 7);
  assert.deepEqual(result.path.relationships.map((r) => r.edge_type), [...PROVENANCE_EDGE_ORDER]);

  // Receipt is source-linked and snapshot-bound (FR-011).
  assert.equal(result.receipt.commitSha, "939d3bd1b05ee09f0f4c2585a492f98da0fd066d");
  assert.equal(result.receipt.ciJob?.name, "Build (tools)");
  assert.equal(result.receipt.serviceBuild?.checkRunId, "75454451577");
  assert.ok((result.receipt.snapshot?.bookmark ?? "").length > 0, "receipt must carry a snapshot bookmark");
  assert.equal(typeof result.receipt.snapshot?.readEpoch, "number");
  assert.ok(result.receipt.sources.length >= 6);
  assert.ok(result.receipt.claimBoundary.includes("Does NOT prove malware execution"));
});

test("idempotent: repeating the verified investigation is byte-identical apart from retrieval metadata", async () => {
  const a = await investigate(client, tanstackRequest, tanstackEvidence, FIXED);
  const b = await investigate(client, tanstackRequest, tanstackEvidence, FIXED);

  // Deterministic graph ids (NFR-002) and identical receipts modulo the snapshot bookmark/epoch.
  assert.deepEqual(a.graph.nodes.map((n) => n.id), b.graph.nodes.map((n) => n.id));
  const stripSnapshot = (r: typeof a.receipt) => ({ ...r, snapshot: undefined });
  assert.deepEqual(stripSnapshot(a.receipt), stripSnapshot(b.receipt));
  assert.equal(b.path?.nodes.length, 8, "repeated import must not duplicate the path");
  assert.equal(b.path?.relationships.length, 7);
});

test("UNPROVEN: a SHA mismatch never reaches EXPOSED and returns no complete path (BR-003)", async () => {
  const { request, evidence } = saltedCase("a1");
  evidence.job!.headSha = "0000000000000000000000000000000000000000"; // named job SHA != commit SHA

  const result = await investigate(client, request, evidence, FIXED);

  assert.equal(result.receipt.state, "UNPROVEN");
  assert.equal(result.receipt.reasonCode, "UNPROVEN_SHA_MISMATCH");
  assert.equal(result.path, null, "an incomplete chain must not produce a provenance path");
  assert.notEqual(result.receipt.state, "EXPOSED");
});

test("UNPROVEN: missing frozen-install evidence never reaches EXPOSED (BR-002)", async () => {
  const { request, evidence } = saltedCase("b2");
  evidence.workflow!.frozenInstall = false; // lockfile entry alone is not proof

  const result = await investigate(client, request, evidence, FIXED);

  assert.equal(result.receipt.state, "UNPROVEN");
  assert.equal(result.receipt.reasonCode, "UNPROVEN_MISSING_FROZEN_INSTALL");
  assert.equal(result.path, null);
});

test("NOT_EXPOSED: a same-SHA build that is not production-labelled yields no path", async () => {
  const { request, evidence } = saltedCase("c3");
  evidence.serviceBuild!.environmentLabel = "preview"; // complete evidence, not production

  const result = await investigate(client, request, evidence, FIXED);

  assert.equal(result.receipt.state, "NOT_EXPOSED");
  assert.equal(result.receipt.reasonCode, "NOT_EXPOSED_NO_PRODUCTION_BUILD");
  assert.equal(result.path, null);
});
