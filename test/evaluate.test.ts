/**
 * CP-002.2 unit tests for the deterministic invariant evaluator. Pure logic, no
 * HydraDB. Uses the verified TanStack fixture as the EXPOSED baseline and mutates
 * clones to exercise NOT_EXPOSED and UNPROVEN branches, interval boundaries, and
 * SHA case-insensitivity.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { evaluateInvestigation, parseInstant } from "../src/domain/evaluate.js";
import type { EvidenceBundle } from "../src/domain/schema.js";
import { tanstackEvidence, tanstackRequest } from "../src/fixtures/tanstack.js";

const clone = (e: EvidenceBundle): EvidenceBundle => structuredClone(e);

test("EXPOSED: verified TanStack chain, despite the overall run failing (BR-003)", () => {
  assert.equal(tanstackEvidence.run?.conclusion, "failure"); // overall run is red
  const result = evaluateInvestigation(tanstackRequest, tanstackEvidence);
  assert.equal(result.state, "EXPOSED");
  assert.equal(result.reasonCode, "EXPOSED_SAME_SHA_PATH");
  assert.ok(Object.values(result.verified).every(Boolean), "all seven hops verified");
});

test("interval is half-open [from, to): commit exactly at `from` is inside", () => {
  const ev = clone(tanstackEvidence);
  ev.commit!.committedAt = tanstackRequest.interval.from;
  assert.equal(evaluateInvestigation(tanstackRequest, ev).state, "EXPOSED");
});

test("interval is half-open [from, to): commit exactly at `to` is outside", () => {
  const ev = clone(tanstackEvidence);
  ev.commit!.committedAt = tanstackRequest.interval.to;
  const result = evaluateInvestigation(tanstackRequest, ev);
  assert.equal(result.state, "NOT_EXPOSED");
  assert.equal(result.reasonCode, "NOT_EXPOSED_RESOLUTION_OUTSIDE_WINDOW");
});

test("SHA join is case-insensitive", () => {
  const ev = clone(tanstackEvidence);
  ev.commit!.sha = ev.commit!.sha.toUpperCase();
  assert.equal(evaluateInvestigation(tanstackRequest, ev).state, "EXPOSED");
});

test("NOT_EXPOSED: lockfile does not resolve the affected version (complete history)", () => {
  const ev = clone(tanstackEvidence);
  ev.lockfile!.resolvedVersion = "1.170.0";
  const result = evaluateInvestigation(tanstackRequest, ev);
  assert.equal(result.state, "NOT_EXPOSED");
  assert.equal(result.reasonCode, "NOT_EXPOSED_NO_RESOLUTION_IN_WINDOW");
});

test("NOT_EXPOSED: named job did not succeed", () => {
  const ev = clone(tanstackEvidence);
  ev.job!.conclusion = "failure";
  const result = evaluateInvestigation(tanstackRequest, ev);
  assert.equal(result.state, "NOT_EXPOSED");
  assert.equal(result.reasonCode, "NOT_EXPOSED_BUILD_NOT_SUCCESSFUL");
});

test("NOT_EXPOSED: no production-labelled build though service evidence is complete", () => {
  const ev = clone(tanstackEvidence);
  delete ev.serviceBuild;
  const result = evaluateInvestigation(tanstackRequest, ev);
  assert.equal(result.state, "NOT_EXPOSED");
  assert.equal(result.reasonCode, "NOT_EXPOSED_NO_PRODUCTION_BUILD");
});

test("NOT_EXPOSED: same-SHA build is not production-labelled", () => {
  const ev = clone(tanstackEvidence);
  ev.serviceBuild!.environmentLabel = "preview";
  const result = evaluateInvestigation(tanstackRequest, ev);
  assert.equal(result.state, "NOT_EXPOSED");
  assert.equal(result.reasonCode, "NOT_EXPOSED_NO_PRODUCTION_BUILD");
});

test("UNPROVEN: SHA mismatch never advances to EXPOSED", () => {
  const ev = clone(tanstackEvidence);
  ev.job!.headSha = "0000000000000000000000000000000000000000";
  const result = evaluateInvestigation(tanstackRequest, ev);
  assert.equal(result.state, "UNPROVEN");
  assert.equal(result.reasonCode, "UNPROVEN_SHA_MISMATCH");
});

test("UNPROVEN: missing frozen-install evidence (lockfile alone is not proof, BR-002)", () => {
  const ev = clone(tanstackEvidence);
  ev.workflow!.frozenInstall = false;
  const result = evaluateInvestigation(tanstackRequest, ev);
  assert.equal(result.state, "UNPROVEN");
  assert.equal(result.reasonCode, "UNPROVEN_MISSING_FROZEN_INSTALL");
});

test("UNPROVEN: service evidence not fully retrieved (cannot conclude a negative)", () => {
  const ev = clone(tanstackEvidence);
  delete ev.serviceBuild;
  ev.serviceEvidenceComplete = false;
  const result = evaluateInvestigation(tanstackRequest, ev);
  assert.equal(result.state, "UNPROVEN");
  assert.equal(result.reasonCode, "UNPROVEN_MISSING_SERVICE_EVIDENCE");
});

test("UNPROVEN: incomplete lockfile history cannot conclude a negative", () => {
  const ev = clone(tanstackEvidence);
  ev.lockfile!.resolvedVersion = "1.170.0";
  ev.historyComplete = false;
  const result = evaluateInvestigation(tanstackRequest, ev);
  assert.equal(result.state, "UNPROVEN");
  assert.equal(result.reasonCode, "UNPROVEN_INCOMPLETE_HISTORY");
});

test("UNPROVEN: ambiguous (non-UTC) interval timestamp", () => {
  const badRequest = { ...tanstackRequest, interval: { from: "2026-05-11 19:26:14", to: "2026-05-11T22:13:38Z" } };
  const result = evaluateInvestigation(badRequest, tanstackEvidence);
  assert.equal(result.state, "UNPROVEN");
  assert.equal(result.reasonCode, "UNPROVEN_AMBIGUOUS_TIMESTAMP");
});

test("parseInstant accepts UTC Z and offset, rejects naive local time", () => {
  assert.equal(typeof parseInstant("2026-05-11T19:26:14Z"), "number");
  assert.equal(typeof parseInstant("2026-05-11T19:26:14+00:00"), "number");
  assert.equal(parseInstant("2026-05-11 19:26:14"), null);
  assert.equal(parseInstant("not-a-date"), null);
});
