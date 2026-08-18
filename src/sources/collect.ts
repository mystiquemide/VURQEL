/**
 * Full evidence collection from public GitHub (Vurqel Phase 2, CP-003.3).
 *
 * Assembles the same `EvidenceBundle` the domain already consumes, but sourced
 * live (or from cache) instead of a hand-authored fixture: incident/package
 * records are derived from the request; commit + lockfile, workflow run + named
 * job, workflow frozen-install, and the production check-run come from the
 * GitHub adapters. Completeness flags (`historyComplete`,
 * `serviceEvidenceComplete`) let the evaluator tell a genuine negative from
 * unretrieved evidence (FR-014). Retryable source errors propagate so the
 * caller can surface a retryable outcome; nothing is fabricated.
 */
import type { EvidenceBundle, IncidentRecord, InvestigationRequest, PackageVersionRecord } from "../domain/schema.js";
import { GitHubClient, type SourceMode } from "./github.js";
import { collectCommitLockfile } from "./commit-lockfile.js";
import { collectRunAndJob, collectServiceBuild, collectWorkflowFile } from "./actions.js";

export interface CollectResult {
  evidence: EvidenceBundle;
  mode: SourceMode;
}

function combineMode(a: SourceMode, b: SourceMode): SourceMode {
  return a === "online" || b === "online" ? "online" : "cached-replay";
}

function purl(name: string, version: string): string {
  return `pkg:npm/${name.replace("@", "%40")}@${version}`;
}

export async function collectEvidence(
  client: GitHubClient,
  request: InvestigationRequest,
): Promise<CollectResult> {
  // Incident + package records are operator-supplied context (from the request),
  // not fetched from GitHub.
  const incident: IncidentRecord = {
    packageName: request.packageName,
    version: request.version,
    liveFrom: request.interval.from,
    liveUntil: request.interval.to,
    sourceUrl: request.incidentSourceUrl,
    observedAt: new Date().toISOString(),
  };
  const packageVersion: PackageVersionRecord = {
    ecosystem: "npm",
    name: request.packageName,
    version: request.version,
    purl: purl(request.packageName, request.version),
    sourceUrl: request.incidentSourceUrl,
  };

  const cl = await collectCommitLockfile(client, request);
  let mode: SourceMode = cl.mode;

  const evidence: EvidenceBundle = {
    incident,
    packageVersion,
    historyComplete: cl.historyComplete,
    serviceEvidenceComplete: false,
  };
  if (cl.commit) evidence.commit = cl.commit;
  if (cl.lockfile) evidence.lockfile = cl.lockfile;

  if (cl.commit) {
    const sha = cl.commit.sha;

    const rj = await collectRunAndJob(client, request, sha);
    mode = combineMode(mode, rj.mode);
    if (rj.run) evidence.run = rj.run;
    if (rj.job) evidence.job = rj.job;
    if (rj.workflowPath) {
      const wf = await collectWorkflowFile(client, request, sha, rj.workflowPath);
      mode = combineMode(mode, wf.mode);
      if (wf.workflow) evidence.workflow = wf.workflow;
    }

    const sb = await collectServiceBuild(client, request, sha);
    mode = combineMode(mode, sb.mode);
    evidence.serviceEvidenceComplete = sb.serviceEvidenceComplete;
    if (sb.serviceBuild) evidence.serviceBuild = sb.serviceBuild;
  }

  return { evidence, mode };
}
