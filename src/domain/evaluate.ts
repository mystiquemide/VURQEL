/**
 * Deterministic evaluation of the winning invariant. Walks the provenance chain
 * hop by hop against one evidence bundle and returns the result state, a reason
 * code, and per-hop verification flags. Pure and side-effect free (NFR-002).
 *
 * Key rules (PROJECT_PLAN.md BR-001..BR-008):
 *  - All time comparisons use UTC and the half-open interval [from, to) (BR-006).
 *  - The same commit SHA must join lockfile, commit, run, job, and build (BR-001).
 *  - A lockfile entry alone is not proof; a frozen-install workflow and a
 *    successful named job are required (BR-002).
 *  - The named job's own conclusion decides, not the overall run (BR-003).
 *  - NOT_EXPOSED needs complete evidence and no eligible path (BR-004).
 *  - Missing / ambiguous / contradictory evidence is UNPROVEN (BR-005).
 */
import type {
  EvidenceBundle,
  InvestigationRequest,
  ReasonCode,
  ResultState,
} from "./schema.js";

export interface HopResult {
  name: string;
  ok: boolean;
  detail: string;
}

export interface VerifiedHops {
  affects: boolean;
  resolvedBy: boolean;
  atCommit: boolean;
  triggers: boolean;
  hasJob: boolean;
  produces: boolean;
  targets: boolean;
}

export interface Evaluation {
  state: ResultState;
  reasonCode: ReasonCode;
  reason: string;
  hops: HopResult[];
  verified: VerifiedHops;
}

const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Parse a strict UTC/offset ISO-8601 instant to epoch ms, or null if ambiguous. */
export function parseInstant(value: string): number | null {
  if (!UTC_INSTANT.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function sameSha(a: string, b: string): boolean {
  return a.length > 0 && a.toLowerCase() === b.toLowerCase();
}

function isProductionLabel(label: string): boolean {
  return /^prod(uction)?$/i.test(label.trim());
}

export function evaluateInvestigation(
  request: InvestigationRequest,
  evidence: EvidenceBundle,
): Evaluation {
  const hops: HopResult[] = [];
  const verified: VerifiedHops = {
    affects: false,
    resolvedBy: false,
    atCommit: false,
    triggers: false,
    hasJob: false,
    produces: false,
    targets: false,
  };

  const finish = (state: ResultState, reasonCode: ReasonCode, reason: string): Evaluation => ({
    state,
    reasonCode,
    reason,
    hops,
    verified,
  });

  // Interval must be a valid, non-empty half-open UTC window.
  const from = parseInstant(request.interval.from);
  const to = parseInstant(request.interval.to);
  if (from === null || to === null) {
    return finish("UNPROVEN", "UNPROVEN_AMBIGUOUS_TIMESTAMP", "Investigation interval is not a valid UTC instant.");
  }
  if (from >= to) {
    return finish("UNPROVEN", "UNPROVEN_AMBIGUOUS_TIMESTAMP", "Interval is empty or inverted; expected [from, to) with from < to.");
  }

  // Hop 1: AFFECTS — incident/package records match the requested package/version.
  const affects =
    evidence.incident.packageName === request.packageName &&
    evidence.incident.version === request.version &&
    evidence.packageVersion.name === request.packageName &&
    evidence.packageVersion.version === request.version;
  hops.push({
    name: "AFFECTS",
    ok: affects,
    detail: affects
      ? `Incident affects ${request.packageName}@${request.version}`
      : "Incident/package records do not match the requested package/version",
  });
  if (!affects) {
    return finish("UNPROVEN", "UNPROVEN_INCONSISTENT_EVIDENCE", "Incident/package evidence does not match the requested package/version.");
  }
  verified.affects = true;

  // Hop 2: RESOLVED_BY — a lockfile snapshot resolves the exact affected version.
  if (!evidence.lockfile) {
    hops.push({ name: "RESOLVED_BY", ok: false, detail: "No lockfile snapshot present" });
    return evidence.historyComplete
      ? finish("NOT_EXPOSED", "NOT_EXPOSED_NO_RESOLUTION_IN_WINDOW", "No lockfile snapshot resolves the affected version in the requested scope.")
      : finish("UNPROVEN", "UNPROVEN_INCOMPLETE_HISTORY", "Lockfile history was not fully retrieved; cannot conclude a negative.");
  }
  const resolvesAffected =
    evidence.lockfile.resolvedName === request.packageName &&
    evidence.lockfile.resolvedVersion === request.version;
  hops.push({
    name: "RESOLVED_BY",
    ok: resolvesAffected,
    detail: resolvesAffected
      ? `Lockfile ${evidence.lockfile.path} resolves ${request.packageName}@${request.version}`
      : `Lockfile resolves ${evidence.lockfile.resolvedName}@${evidence.lockfile.resolvedVersion}, not the affected version`,
  });
  if (!resolvesAffected) {
    return evidence.historyComplete
      ? finish("NOT_EXPOSED", "NOT_EXPOSED_NO_RESOLUTION_IN_WINDOW", "The lockfile does not resolve the affected version.")
      : finish("UNPROVEN", "UNPROVEN_INCOMPLETE_HISTORY", "Lockfile history was not fully retrieved; cannot conclude a negative.");
  }
  verified.resolvedBy = true;

  // Hop 3: AT_COMMIT — lockfile is at an immutable commit inside the window.
  if (!evidence.commit) {
    hops.push({ name: "AT_COMMIT", ok: false, detail: "No commit evidence present" });
    return finish("UNPROVEN", "UNPROVEN_MISSING_COMMIT_EVIDENCE", "No immutable commit is linked to the lockfile snapshot.");
  }
  const committedAt = parseInstant(evidence.commit.committedAt);
  if (committedAt === null) {
    hops.push({ name: "AT_COMMIT", ok: false, detail: "Commit timestamp is not a valid UTC instant" });
    return finish("UNPROVEN", "UNPROVEN_AMBIGUOUS_TIMESTAMP", "Commit timestamp is not a valid UTC instant.");
  }
  if (!sameSha(evidence.lockfile.commitSha, evidence.commit.sha)) {
    hops.push({ name: "AT_COMMIT", ok: false, detail: "Lockfile commit SHA does not match the commit record" });
    return finish("UNPROVEN", "UNPROVEN_SHA_MISMATCH", "Lockfile snapshot SHA does not match the commit SHA.");
  }
  const inWindow = committedAt >= from && committedAt < to;
  hops.push({
    name: "AT_COMMIT",
    ok: inWindow,
    detail: inWindow
      ? `Commit ${evidence.commit.sha.slice(0, 12)} is within [from, to)`
      : `Commit ${evidence.commit.sha.slice(0, 12)} is outside the incident window`,
  });
  if (!inWindow) {
    return finish("NOT_EXPOSED", "NOT_EXPOSED_RESOLUTION_OUTSIDE_WINDOW", "The affected version was resolved, but not during the incident window.");
  }
  verified.atCommit = true;

  // Hop 4: TRIGGERS — a workflow run exists on the same SHA (overall conclusion is not used, BR-003).
  if (!evidence.run) {
    hops.push({ name: "TRIGGERS", ok: false, detail: "No workflow run evidence present" });
    return finish("UNPROVEN", "UNPROVEN_MISSING_CI_EVIDENCE", "No workflow run is recorded for the commit.");
  }
  if (!sameSha(evidence.run.headSha, evidence.commit.sha)) {
    hops.push({ name: "TRIGGERS", ok: false, detail: "Run head SHA does not match the commit" });
    return finish("UNPROVEN", "UNPROVEN_SHA_MISMATCH", "Workflow run head SHA does not match the commit SHA.");
  }
  verified.triggers = true;
  hops.push({ name: "TRIGGERS", ok: true, detail: `Run ${evidence.run.runId} is on the same SHA` });

  // Hop 5: HAS_JOB — a frozen-install workflow and a successful named job on the same SHA.
  if (!evidence.workflow || !sameSha(evidence.workflow.commitSha, evidence.commit.sha)) {
    hops.push({ name: "HAS_JOB", ok: false, detail: "No frozen-install workflow evidence at the commit" });
    return finish("UNPROVEN", "UNPROVEN_MISSING_FROZEN_INSTALL", "No frozen-install workflow evidence at the commit.");
  }
  if (!evidence.workflow.frozenInstall) {
    hops.push({ name: "HAS_JOB", ok: false, detail: "Workflow does not run a frozen-lockfile install" });
    return finish("UNPROVEN", "UNPROVEN_MISSING_FROZEN_INSTALL", "Workflow does not perform a frozen-lockfile install; a lockfile entry alone is not proof.");
  }
  if (!evidence.job) {
    hops.push({ name: "HAS_JOB", ok: false, detail: "No CI job evidence present" });
    return finish("UNPROVEN", "UNPROVEN_MISSING_CI_EVIDENCE", "No named CI job is recorded for the run.");
  }
  if (!sameSha(evidence.job.headSha, evidence.commit.sha)) {
    hops.push({ name: "HAS_JOB", ok: false, detail: "Job head SHA does not match the commit" });
    return finish("UNPROVEN", "UNPROVEN_SHA_MISMATCH", "CI job head SHA does not match the commit SHA.");
  }
  const jobConclusion = evidence.job.conclusion.toLowerCase();
  if (jobConclusion !== "success") {
    const known = new Set(["failure", "cancelled", "canceled", "timed_out", "skipped", "neutral", "action_required", "stale"]);
    hops.push({ name: "HAS_JOB", ok: false, detail: `Named job "${evidence.job.name}" concluded ${evidence.job.conclusion}` });
    return known.has(jobConclusion)
      ? finish("NOT_EXPOSED", "NOT_EXPOSED_BUILD_NOT_SUCCESSFUL", `The named frozen-install job did not succeed (${evidence.job.conclusion}).`)
      : finish("UNPROVEN", "UNPROVEN_MISSING_CI_EVIDENCE", `The named job conclusion is not conclusive (${evidence.job.conclusion}).`);
  }
  verified.hasJob = true;
  hops.push({ name: "HAS_JOB", ok: true, detail: `Named job "${evidence.job.name}" succeeded on the same SHA` });

  // Hop 6: PRODUCES — a same-SHA service build with a successful status.
  if (!evidence.serviceBuild) {
    hops.push({ name: "PRODUCES", ok: false, detail: "No service-build evidence present" });
    return evidence.serviceEvidenceComplete
      ? finish("NOT_EXPOSED", "NOT_EXPOSED_NO_PRODUCTION_BUILD", "No production-labelled service build exists on this SHA.")
      : finish("UNPROVEN", "UNPROVEN_MISSING_SERVICE_EVIDENCE", "Service-build evidence was not fully retrieved; cannot conclude a negative.");
  }
  if (!sameSha(evidence.serviceBuild.headSha, evidence.commit.sha)) {
    hops.push({ name: "PRODUCES", ok: false, detail: "Service build points to a different SHA" });
    return finish("UNPROVEN", "UNPROVEN_SHA_MISMATCH", "The service build head SHA does not match the commit SHA.");
  }
  if (evidence.serviceBuild.status.toLowerCase() !== "success") {
    hops.push({ name: "PRODUCES", ok: false, detail: `Service build status is ${evidence.serviceBuild.status}` });
    return finish("NOT_EXPOSED", "NOT_EXPOSED_BUILD_NOT_SUCCESSFUL", `The same-SHA service build did not succeed (${evidence.serviceBuild.status}).`);
  }
  verified.produces = true;
  hops.push({ name: "PRODUCES", ok: true, detail: `Service build succeeded on the same SHA` });

  // Hop 7: TARGETS — the service build is production-labelled.
  if (!isProductionLabel(evidence.serviceBuild.environmentLabel)) {
    hops.push({ name: "TARGETS", ok: false, detail: `Service build environment is "${evidence.serviceBuild.environmentLabel}", not production` });
    return finish("NOT_EXPOSED", "NOT_EXPOSED_NO_PRODUCTION_BUILD", "The same-SHA build is not production-labelled.");
  }
  verified.targets = true;
  hops.push({ name: "TARGETS", ok: true, detail: `Production-labelled build targets ${evidence.serviceBuild.service}` });

  return finish("EXPOSED", "EXPOSED_SAME_SHA_PATH", "A complete same-SHA provenance path proves this build resolved the affected package during its live window.");
}
