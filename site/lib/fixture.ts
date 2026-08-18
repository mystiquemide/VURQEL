/**
 * The verified public TanStack case (demo fixture).
 *
 * Every field below was independently confirmed against the public source URLs
 * on 2026-08-18:
 *  - @tanstack/react-router@1.169.8 is an affected second-batch version
 *    (StepSecurity) live within [19:26:14, 22:13:38) UTC (TanStack postmortem).
 *  - commit 939d3bd... committed 2026-05-11T21:40:47Z (inside the window).
 *  - tools/pnpm-lock.yaml @ that commit resolves 1.169.8 (line 1595) and the
 *    malicious @tanstack/setup git dependency; sha256 captured below.
 *  - .github/workflows/ci.yml @ that commit runs `pnpm install --frozen-lockfile`
 *    for the Build (${matrix.project}) job (project includes `tools`).
 *  - run 25698962181 head SHA matches; overall conclusion is `failure`, but the
 *    NAMED job `Build (tools)` succeeded at 21:41:18Z (BR-003).
 *  - Cloudflare check `Workers Builds: websites-tools` (check run 75454451577)
 *    succeeded on the same SHA at 21:41:31Z.
 */
import type { EvidenceBundle, InvestigationRequest } from "./schema";

const COMMIT = "939d3bd1b05ee09f0f4c2585a492f98da0fd066d";
const REPO_URL = "https://github.com/RelativeSure/websites";

export const tanstackRequest: InvestigationRequest = {
  repository: { owner: "RelativeSure", name: "websites" },
  lockfilePath: "tools/pnpm-lock.yaml",
  packageName: "@tanstack/react-router",
  version: "1.169.8",
  interval: { from: "2026-05-11T19:26:14Z", to: "2026-05-11T22:13:38Z" },
  incidentSourceUrl: "https://tanstack.com/blog/npm-supply-chain-compromise-postmortem",
  serviceNameFilter: "websites-tools",
  jobSelector: "Build (tools)",
  serviceCheckName: "Workers Builds: websites-tools",
  serviceEnvironmentLabel: "production",
  mode: "cached-replay",
};

export const tanstackEvidence: EvidenceBundle = {
  incident: {
    packageName: "@tanstack/react-router",
    version: "1.169.8",
    liveFrom: "2026-05-11T19:26:14Z",
    liveUntil: "2026-05-11T22:13:38Z",
    sourceUrl:
      "https://www.stepsecurity.io/blog/mini-shai-hulud-is-back-a-self-spreading-supply-chain-attack-hits-the-npm-ecosystem",
    observedAt: "2026-08-18T00:00:00Z",
  },
  packageVersion: {
    ecosystem: "npm",
    name: "@tanstack/react-router",
    version: "1.169.8",
    purl: "pkg:npm/%40tanstack/react-router@1.169.8",
    sourceUrl:
      "https://www.stepsecurity.io/blog/mini-shai-hulud-is-back-a-self-spreading-supply-chain-attack-hits-the-npm-ecosystem",
  },
  commit: {
    sha: COMMIT,
    committedAt: "2026-05-11T21:40:47Z",
    url: `${REPO_URL}/commit/${COMMIT}`,
    message: "chore(deps): update dependency @tanstack/react-router to v1.169.8 (#718)",
  },
  lockfile: {
    path: "tools/pnpm-lock.yaml",
    commitSha: COMMIT,
    contentHash: "sha256:04916898507a414af7e59f9083ade5f604a0358ae676ad216e50d0f605330f6d",
    resolvedName: "@tanstack/react-router",
    resolvedVersion: "1.169.8",
    sourceUrl: `${REPO_URL}/blob/${COMMIT}/tools/pnpm-lock.yaml`,
  },
  workflow: {
    path: ".github/workflows/ci.yml",
    commitSha: COMMIT,
    frozenInstall: true,
    jobSelector: "Build (tools)",
    sourceUrl: `${REPO_URL}/blob/${COMMIT}/.github/workflows/ci.yml`,
  },
  run: {
    runId: "25698962181",
    headSha: COMMIT,
    startedAt: "2026-05-11T21:40:50Z",
    completedAt: "2026-05-11T21:42:15Z",
    conclusion: "failure",
    url: `${REPO_URL}/actions/runs/25698962181`,
  },
  job: {
    name: "Build (tools)",
    headSha: COMMIT,
    completedAt: "2026-05-11T21:41:18Z",
    conclusion: "success",
    url: `${REPO_URL}/actions/runs/25698962181`,
  },
  serviceBuild: {
    provider: "cloudflare",
    service: "websites-tools",
    environmentLabel: "production",
    headSha: COMMIT,
    status: "success",
    timestamp: "2026-05-11T21:41:31Z",
    url: `${REPO_URL}/runs/75454451577`,
    checkRunId: "75454451577",
  },
  historyComplete: true,
  serviceEvidenceComplete: true,
};
