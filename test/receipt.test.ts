/**
 * CP-002.2 unit tests for the provenance graph builder and the receipt builder.
 * Pure logic, no HydraDB.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { evaluateInvestigation } from "../src/domain/evaluate.js";
import { buildProvenanceGraph } from "../src/domain/graph.js";
import { buildReceipt, deriveRequestId } from "../src/domain/receipt.js";
import type { EvidenceBundle } from "../src/domain/schema.js";
import { tanstackEvidence, tanstackRequest } from "../src/fixtures/tanstack.js";

const clone = (e: EvidenceBundle): EvidenceBundle => structuredClone(e);

test("graph: EXPOSED fixture yields the full 8-node / 7-edge provenance path", () => {
  const evaluation = evaluateInvestigation(tanstackRequest, tanstackEvidence);
  const graph = buildProvenanceGraph(tanstackRequest, tanstackEvidence, evaluation);

  assert.equal(graph.nodes.length, 8);
  assert.equal(graph.edges.length, 7);
  assert.deepEqual(
    graph.edges.map((e) => e.type),
    ["AFFECTS", "RESOLVED_BY", "AT_COMMIT", "TRIGGERS", "HAS_JOB", "PRODUCES", "TARGETS"],
  );
  assert.equal(typeof graph.incidentId, "number");
  assert.equal(typeof graph.serviceId, "number");

  // Node ids are non-negative integers and unique (HydraDB requirement).
  const ids = graph.nodes.map((n) => n.id);
  assert.ok(ids.every((id) => Number.isInteger(id) && id >= 0));
  assert.equal(new Set(ids).size, ids.length);
});

test("graph: deterministic ids are stable across rebuilds (idempotent ingest)", () => {
  const evaluation = evaluateInvestigation(tanstackRequest, tanstackEvidence);
  const a = buildProvenanceGraph(tanstackRequest, tanstackEvidence, evaluation);
  const b = buildProvenanceGraph(tanstackRequest, tanstackEvidence, evaluation);
  assert.deepEqual(
    a.nodes.map((n) => [n.key, n.id]),
    b.nodes.map((n) => [n.key, n.id]),
  );
});

test("graph: a broken hop removes downstream edges (no complete path)", () => {
  const ev = clone(tanstackEvidence);
  ev.job!.headSha = "0000000000000000000000000000000000000000"; // SHA mismatch -> HAS_JOB unverified
  const evaluation = evaluateInvestigation(tanstackRequest, ev);
  const graph = buildProvenanceGraph(tanstackRequest, ev, evaluation);

  const types = graph.edges.map((e) => e.type);
  assert.deepEqual(types, ["AFFECTS", "RESOLVED_BY", "AT_COMMIT", "TRIGGERS"]);
  assert.ok(!types.includes("HAS_JOB"));
});

test("receipt: EXPOSED receipt carries source-linked, same-SHA fields and the claim boundary", () => {
  const evaluation = evaluateInvestigation(tanstackRequest, tanstackEvidence);
  const receipt = buildReceipt(tanstackRequest, tanstackEvidence, evaluation, {
    snapshot: { bookmark: "sgk:1:demo:demo:cell-0:9", readEpoch: 9 },
    generatedAt: "2026-08-18T12:00:00Z",
  });

  assert.equal(receipt.state, "EXPOSED");
  assert.equal(receipt.reasonCode, "EXPOSED_SAME_SHA_PATH");
  assert.equal(receipt.commitSha, "939d3bd1b05ee09f0f4c2585a492f98da0fd066d");
  assert.equal(receipt.lockfile?.contentHash, "sha256:04916898507a414af7e59f9083ade5f604a0358ae676ad216e50d0f605330f6d");
  assert.equal(receipt.workflowRunId, "25698962181");
  assert.equal(receipt.ciJob?.name, "Build (tools)");
  assert.equal(receipt.serviceBuild?.checkRunId, "75454451577");
  assert.equal(receipt.snapshot?.bookmark, "sgk:1:demo:demo:cell-0:9");
  assert.ok(receipt.claimBoundary.includes("Does NOT prove malware execution"));

  const urls = receipt.sources.map((s) => s.url);
  const fullSha = "939d3bd1b05ee09f0f4c2585a492f98da0fd066d";
  assert.ok(urls.some((u) => u.includes(`/commit/${fullSha}`)));
  assert.ok(urls.some((u) => u.includes(`/blob/${fullSha}/tools/pnpm-lock.yaml`)));
  assert.ok(urls.some((u) => u.includes("/actions/runs/25698962181")));
  assert.ok(urls.some((u) => u.includes("/runs/75454451577")));
});

test("receipt: identical input produces an identical payload apart from generatedAt (NFR-002)", () => {
  const evaluation = evaluateInvestigation(tanstackRequest, tanstackEvidence);
  const opts = { generatedAt: "2026-08-18T12:00:00Z" };
  const a = buildReceipt(tanstackRequest, tanstackEvidence, evaluation, opts);
  const b = buildReceipt(tanstackRequest, tanstackEvidence, evaluation, opts);
  assert.deepEqual(a, b);
  assert.equal(a.requestId, deriveRequestId(tanstackRequest));
  assert.match(a.requestId, /^vq_[0-9a-f]{8}$/);
});
