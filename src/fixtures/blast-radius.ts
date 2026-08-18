/**
 * ILLUSTRATIVE (synthetic) multi-service scenario for the blast-radius traversal.
 *
 * THIS IS NOT THE VERIFIED TANSTACK CASE. It is a clearly-labelled synthetic
 * fixture whose only purpose is to demonstrate the graph-native "blast radius"
 * question at fan-out > 1: given one compromised package, which production
 * services actually resolved AND shipped it on their own SHA. The real, publicly
 * sourced case remains the single-path proof in `src/fixtures/tanstack.ts`.
 *
 * Four candidate apps share the compromised Incident/PackageVersion; each has its
 * own resolution chain. Expected outcomes exercise all three verdicts:
 *   acme-web       -> EXPOSED       (resolved, prod, success, same SHA)
 *   acme-api       -> EXPOSED       (resolved, prod, success, same SHA)
 *   acme-marketing -> NOT_EXPOSED   (built, but staging-labelled, not production)
 *   acme-legacy    -> UNPROVEN      (CI job head SHA does not match the commit)
 * So the confirmed blast radius is {acme-web, acme-api}, not "everything that built".
 */
import type { EvidenceBundle, InvestigationRequest } from "../domain/schema.js";

const PKG = "@acme/ui-kit";
const VER = "2.4.0";
const FROM = "2026-07-01T09:00:00Z";
const TO = "2026-07-01T09:06:00Z";
const INCIDENT_URL = "https://example.com/illustrative/acme-ui-kit-advisory";

const incident = {
  packageName: PKG,
  version: VER,
  liveFrom: FROM,
  liveUntil: TO,
  sourceUrl: INCIDENT_URL,
  observedAt: "2026-07-01T10:00:00Z",
};

const packageVersion = {
  ecosystem: "npm",
  name: PKG,
  version: VER,
  purl: `pkg:npm/%40acme/ui-kit@${VER}`,
  sourceUrl: INCIDENT_URL,
};

interface AppSpec {
  repo: string;
  service: string;
  sha: string;
  resolvedVersion?: string;
  environmentLabel?: string;
  jobConclusion?: string;
  buildStatus?: string;
  /** Set different from `sha` to force an UNPROVEN_SHA_MISMATCH on HAS_JOB. */
  jobSha?: string;
}

function bundle(a: AppSpec): EvidenceBundle {
  const base = `https://example.com/${a.repo}`;
  return {
    incident,
    packageVersion,
    commit: {
      sha: a.sha,
      committedAt: "2026-07-01T09:02:00Z",
      url: `${base}/commit/${a.sha}`,
      message: `chore(deps): bump ${PKG} to ${VER}`,
    },
    lockfile: {
      path: "pnpm-lock.yaml",
      commitSha: a.sha,
      contentHash: `sha256:${a.sha}${a.sha.slice(0, 24)}`,
      resolvedName: PKG,
      resolvedVersion: a.resolvedVersion ?? VER,
      sourceUrl: `${base}/blob/${a.sha}/pnpm-lock.yaml`,
    },
    workflow: {
      path: ".github/workflows/ci.yml",
      commitSha: a.sha,
      frozenInstall: true,
      jobSelector: "Build",
      sourceUrl: `${base}/blob/${a.sha}/.github/workflows/ci.yml`,
    },
    run: {
      runId: `run-${a.service}`,
      headSha: a.sha,
      startedAt: "2026-07-01T09:03:00Z",
      completedAt: "2026-07-01T09:04:00Z",
      conclusion: "success",
      url: `${base}/actions/runs/${a.service}`,
    },
    job: {
      name: "Build",
      headSha: a.jobSha ?? a.sha,
      completedAt: "2026-07-01T09:03:30Z",
      conclusion: a.jobConclusion ?? "success",
      url: `${base}/actions/runs/${a.service}`,
    },
    serviceBuild: {
      provider: "cloudflare",
      service: a.service,
      environmentLabel: a.environmentLabel ?? "production",
      headSha: a.sha,
      status: a.buildStatus ?? "success",
      timestamp: "2026-07-01T09:04:30Z",
      url: `${base}/deploy/${a.service}`,
      checkRunId: `chk-${a.service}`,
    },
    historyComplete: true,
    serviceEvidenceComplete: true,
  };
}

export const ILLUSTRATIVE_REQUEST: InvestigationRequest = {
  repository: { owner: "acme", name: "platform" },
  lockfilePath: "pnpm-lock.yaml",
  packageName: PKG,
  version: VER,
  interval: { from: FROM, to: TO },
  incidentSourceUrl: INCIDENT_URL,
  mode: "cached-replay",
};

export const ILLUSTRATIVE_BUNDLES: EvidenceBundle[] = [
  bundle({ repo: "acme/web", service: "acme-web", sha: "1111111111111111111111111111111111111111" }),
  bundle({ repo: "acme/api", service: "acme-api", sha: "2222222222222222222222222222222222222222" }),
  bundle({
    repo: "acme/marketing",
    service: "acme-marketing",
    sha: "3333333333333333333333333333333333333333",
    environmentLabel: "staging",
  }),
  bundle({
    repo: "acme/legacy",
    service: "acme-legacy",
    sha: "4444444444444444444444444444444444444444",
    jobSha: "9999999999999999999999999999999999999999",
  }),
];
