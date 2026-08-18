/**
 * CP-003.3 end-to-end test: the FULL Phase 2 slice.
 *
 * Collects the verified TanStack case's evidence LIVE from public GitHub (then
 * cache), runs `investigate` against HydraDB, and asserts the receipt carries
 * the same load-bearing proof as the hand-authored fixture — commit, lockfile
 * hash, named job, workflow run, and Cloudflare production check-run — with the
 * complete same-SHA path returned from the graph. This is the Phase 2 exit
 * gate: "the verified public case can be normalized without manually editing
 * graph rows."
 *
 * Requires `pnpm hydradb:up`. Retryable GitHub outages skip; mismatches fail.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

import { loadGitHubConfig, loadHydraDbConfig } from "../src/config.js";
import { HydraDbClient } from "../src/hydradb/client.js";
import { GitHubClient, SourceError } from "../src/sources/github.js";
import { collectEvidence } from "../src/sources/collect.js";
import { investigate } from "../src/investigate.js";
import { deriveRequestId } from "../src/domain/receipt.js";
import { PROVENANCE_EDGE_ORDER, type Receipt } from "../src/domain/schema.js";
import { tanstackEvidence, tanstackRequest } from "../src/fixtures/tanstack.js";

const hydra = new HydraDbClient(loadHydraDbConfig());
const FIXED = { generatedAt: "2026-08-18T12:00:00Z" };

/** The load-bearing proof fields that must be identical between live and fixture. */
const proof = (r: Receipt) => ({
  state: r.state,
  reasonCode: r.reasonCode,
  commitSha: r.commitSha,
  lockfile: r.lockfile,
  workflowRunId: r.workflowRunId,
  ciJob: r.ciJob,
  serviceBuild: r.serviceBuild,
  requestId: r.requestId,
  package: r.package,
  interval: r.interval,
  repository: r.repository,
});

before(async () => {
  assert.ok(await hydra.ready(), "HydraDB is not reachable. Run `pnpm hydradb:up` first.");
});

test("live GitHub evidence produces the same EXPOSED proof as the bundled fixture", async (t) => {
  const gh = new GitHubClient(loadGitHubConfig());

  let collected;
  try {
    collected = await collectEvidence(gh, tanstackRequest);
  } catch (err) {
    if (err instanceof SourceError && err.retryable) {
      t.skip(`GitHub unavailable/rate-limited (${err.code}): ${err.message}`);
      return;
    }
    throw err;
  }

  const live = await investigate(hydra, tanstackRequest, collected.evidence, { ...FIXED, mode: collected.mode });

  // Live evidence classifies EXPOSED and the graph returns the complete path.
  assert.equal(live.receipt.state, "EXPOSED");
  assert.equal(live.receipt.reasonCode, "EXPOSED_SAME_SHA_PATH");
  assert.ok(live.path, "expected the complete provenance path from HydraDB");
  assert.equal(live.path.nodes.length, 8);
  assert.equal(live.path.relationships.length, 7);
  assert.deepEqual(live.path.relationships.map((r) => r.edge_type), [...PROVENANCE_EDGE_ORDER]);

  // The decisive fields came from live GitHub, not a hand-authored row.
  assert.equal(live.receipt.commitSha, "939d3bd1b05ee09f0f4c2585a492f98da0fd066d");
  assert.equal(live.receipt.lockfile?.contentHash, "sha256:04916898507a414af7e59f9083ade5f604a0358ae676ad216e50d0f605330f6d");
  assert.equal(live.receipt.workflowRunId, "25698962181");
  assert.deepEqual(live.receipt.ciJob, { name: "Build (tools)", conclusion: "success" });
  assert.equal(live.receipt.serviceBuild?.provider, "cloudflare");
  assert.equal(live.receipt.serviceBuild?.checkRunId, "75454451577");
  assert.ok((live.receipt.snapshot?.bookmark ?? "").length > 0);
  assert.ok(live.receipt.mode === "online" || live.receipt.mode === "cached-replay", "receipt must be labelled live/replay (FR-012)");
  assert.equal(live.receipt.requestId, deriveRequestId(tanstackRequest));

  // Parity: the live receipt's proof fields equal the bundled fixture's.
  const fixtureRun = await investigate(hydra, tanstackRequest, tanstackEvidence, FIXED);
  assert.deepEqual(proof(live.receipt), proof(fixtureRun.receipt));
});
