/**
 * CP-003.1 integration test: the commit + lockfile source adapter against live
 * (then cached) public GitHub. Reproduces the verified TanStack case's commit,
 * content hash, and resolved version WITHOUT any hand-entered graph rows
 * (Phase 2 acceptance). Retryable outages (rate limit / transport) skip rather
 * than fail so the suite stays honest offline; hard mismatches fail.
 *
 * Uses the default cache mode: the first run fetches live and caches; later runs
 * replay from `.vurqel-cache` and consume no rate-limit budget.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { loadGitHubConfig } from "../src/config.js";
import { GitHubClient, SourceError } from "../src/sources/github.js";
import { collectCommitLockfile } from "../src/sources/commit-lockfile.js";
import { tanstackRequest } from "../src/fixtures/tanstack.js";

const COMMIT = "939d3bd1b05ee09f0f4c2585a492f98da0fd066d";
const LOCK_SHA256 = "sha256:04916898507a414af7e59f9083ade5f604a0358ae676ad216e50d0f605330f6d";

test("collectCommitLockfile reproduces the verified case from public GitHub", async (t) => {
  const client = new GitHubClient(loadGitHubConfig());

  let ev;
  try {
    ev = await collectCommitLockfile(client, tanstackRequest);
  } catch (err) {
    if (err instanceof SourceError && err.retryable) {
      t.skip(`GitHub unavailable/rate-limited (${err.code}): ${err.message}`);
      return;
    }
    throw err;
  }

  assert.ok(ev.commit, "expected a resolving commit in the incident window");
  assert.equal(ev.commit.sha, COMMIT);
  assert.equal(ev.commit.committedAt, "2026-05-11T21:40:47Z");
  assert.match(ev.commit.url, new RegExp(`/commit/${COMMIT}$`));

  assert.ok(ev.lockfile, "expected a lockfile snapshot");
  assert.equal(ev.lockfile.contentHash, LOCK_SHA256, "live lockfile hash must match the pinned content hash");
  assert.equal(ev.lockfile.resolvedName, "@tanstack/react-router");
  assert.equal(ev.lockfile.resolvedVersion, "1.169.8");
  assert.match(ev.lockfile.sourceUrl, new RegExp(`/blob/${COMMIT}/tools/pnpm-lock\\.yaml$`));

  assert.equal(ev.historyComplete, true, "the in-window lockfile history fit in one page");
  assert.equal(ev.candidatesChecked, 1, "exactly one commit changed the lockfile in the window");
  assert.ok(ev.mode === "online" || ev.mode === "cached-replay");
});

test("a package/version not in the lockfile yields no commit evidence (fail-closed)", async (t) => {
  const client = new GitHubClient(loadGitHubConfig());
  const req = { ...tanstackRequest, version: "0.0.0-not-a-real-version" };

  let ev;
  try {
    ev = await collectCommitLockfile(client, req);
  } catch (err) {
    if (err instanceof SourceError && err.retryable) {
      t.skip(`GitHub unavailable/rate-limited (${err.code}): ${err.message}`);
      return;
    }
    throw err;
  }

  assert.equal(ev.commit, undefined, "no commit should resolve a non-existent version");
  assert.equal(ev.lockfile, undefined);
});
