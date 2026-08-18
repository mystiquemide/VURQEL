/**
 * CP-003.2 tests: workflow frozen-install detection (pure) and the GitHub
 * Actions/Checks adapters (network, then cached). The adapters must reproduce
 * the decisive verified facts from live data:
 *   - the named `Build (tools)` job SUCCEEDED even though the overall run FAILED
 *     (BR-003);
 *   - the CI workflow at the commit runs a frozen-lockfile install (BR-002);
 *   - the Cloudflare `Workers Builds: websites-tools` check-run succeeded.
 *
 * Retryable outages skip; hard mismatches fail.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { loadGitHubConfig } from "../src/config.js";
import { GitHubClient, SourceError } from "../src/sources/github.js";
import { detectFrozenInstall } from "../src/sources/workflow.js";
import { collectRunAndJob, collectWorkflowFile, collectServiceBuild } from "../src/sources/actions.js";
import { tanstackRequest } from "../src/fixtures/tanstack.js";

const COMMIT = "939d3bd1b05ee09f0f4c2585a492f98da0fd066d";

const skipIfRetryable = (t: { skip: (m?: string) => void }, err: unknown): boolean => {
  if (err instanceof SourceError && err.retryable) {
    t.skip(`GitHub unavailable/rate-limited (${err.code}): ${err.message}`);
    return true;
  }
  return false;
};

test("detectFrozenInstall recognizes frozen-lockfile directives", () => {
  assert.equal(detectFrozenInstall("        run: pnpm install --frozen-lockfile"), true);
  assert.equal(detectFrozenInstall("      - run: npm ci"), true);
  assert.equal(detectFrozenInstall("        run: yarn install --immutable"), true);
  assert.equal(detectFrozenInstall("        with:\n          frozen-lockfile: true"), true);
});

test("detectFrozenInstall returns false for a non-frozen install", () => {
  assert.equal(detectFrozenInstall("        run: pnpm install\n        run: pnpm build"), false);
});

test("collectRunAndJob: named Build (tools) job succeeded despite a failed overall run (BR-003)", async (t) => {
  const client = new GitHubClient(loadGitHubConfig());
  let ev;
  try {
    ev = await collectRunAndJob(client, tanstackRequest, COMMIT);
  } catch (err) {
    if (skipIfRetryable(t, err)) return;
    throw err;
  }

  assert.ok(ev.job, "expected the named CI job");
  assert.equal(ev.job.name, "Build (tools)");
  assert.equal(ev.job.conclusion, "success");
  assert.equal(ev.job.headSha, COMMIT);

  assert.ok(ev.run, "expected the workflow run");
  assert.equal(ev.run.runId, "25698962181");
  assert.equal(ev.run.conclusion, "failure", "overall run is red; the named job is what matters (BR-003)");
  assert.equal(ev.workflowPath, ".github/workflows/ci.yml");
});

test("collectWorkflowFile: the CI workflow at the commit runs a frozen-lockfile install (BR-002)", async (t) => {
  const client = new GitHubClient(loadGitHubConfig());
  let ev;
  try {
    ev = await collectWorkflowFile(client, tanstackRequest, COMMIT, ".github/workflows/ci.yml");
  } catch (err) {
    if (skipIfRetryable(t, err)) return;
    throw err;
  }
  assert.ok(ev.workflow, "expected a workflow record");
  assert.equal(ev.workflow.frozenInstall, true);
  assert.equal(ev.workflow.jobSelector, "Build (tools)");
  assert.match(ev.workflow.sourceUrl, new RegExp(`/blob/${COMMIT}/\\.github/workflows/ci\\.yml$`));
});

test("collectServiceBuild: the Cloudflare production check-run succeeded on the same SHA", async (t) => {
  const client = new GitHubClient(loadGitHubConfig());
  let ev;
  try {
    ev = await collectServiceBuild(client, tanstackRequest, COMMIT);
  } catch (err) {
    if (skipIfRetryable(t, err)) return;
    throw err;
  }
  assert.ok(ev.serviceBuild, "expected a service-build record");
  assert.equal(ev.serviceBuild.provider, "cloudflare");
  assert.equal(ev.serviceBuild.service, "websites-tools");
  assert.equal(ev.serviceBuild.environmentLabel, "production");
  assert.equal(ev.serviceBuild.status, "success");
  assert.equal(ev.serviceBuild.checkRunId, "75454451577");
  assert.equal(ev.serviceEvidenceComplete, true);
});
