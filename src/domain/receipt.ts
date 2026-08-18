/**
 * Build the machine-readable receipt from a request, its evidence, the
 * deterministic evaluation, and (when available) the HydraDB snapshot bookmark.
 * Every classification-bearing field points to a source URL (BR-008); the claim
 * boundary is always attached (BR-007, NFR-001). The requestId is derived from
 * the request so identical inputs produce identical receipts apart from
 * retrieval metadata (NFR-002).
 */
import type { Evaluation } from "./evaluate.js";
import { fnv1a32Hex } from "./ids.js";
import {
  CLAIM_BOUNDARY,
  RULE_VERSION,
  type EvidenceBundle,
  type InvestigationRequest,
  type Receipt,
  type ReceiptSnapshot,
  type ReceiptSource,
} from "./schema.js";

export interface BuildReceiptOptions {
  snapshot?: ReceiptSnapshot;
  generatedAt?: string;
  mode?: "online" | "cached-replay";
}

export function deriveRequestId(request: InvestigationRequest): string {
  const canonical = JSON.stringify({
    repository: `${request.repository.owner}/${request.repository.name}`,
    lockfilePath: request.lockfilePath,
    packageName: request.packageName,
    version: request.version,
    from: request.interval.from,
    to: request.interval.to,
    service: request.serviceNameFilter ?? null,
    ruleVersion: RULE_VERSION,
  });
  return `vq_${fnv1a32Hex(canonical)}`;
}

export function buildReceipt(
  request: InvestigationRequest,
  evidence: EvidenceBundle,
  evaluation: Evaluation,
  options: BuildReceiptOptions = {},
): Receipt {
  const sources: ReceiptSource[] = [];
  const addSource = (label: string, url: string | undefined): void => {
    if (url && !sources.some((s) => s.url === url)) sources.push({ label, url });
  };
  addSource("incident", request.incidentSourceUrl);
  addSource("incident-record", evidence.incident.sourceUrl);
  addSource("package-version", evidence.packageVersion.sourceUrl);
  addSource("lockfile", evidence.lockfile?.sourceUrl);
  addSource("commit", evidence.commit?.url);
  addSource("workflow", evidence.workflow?.sourceUrl);
  addSource("workflow-run", evidence.run?.url);
  addSource("ci-job", evidence.job?.url);
  addSource("service-build", evidence.serviceBuild?.url);

  const limitations: string[] = [];
  if (evidence.workflow && evidence.workflow.frozenInstall) {
    limitations.push("Frozen-install proof is the immutable workflow definition plus the named job result; raw step logs are not used.");
  }
  if (!evidence.historyComplete) {
    limitations.push("Lockfile history was not fully retrieved.");
  }
  if (!evidence.serviceEvidenceComplete) {
    limitations.push("Service-build evidence was not fully retrieved.");
  }

  const receipt: Receipt = {
    requestId: deriveRequestId(request),
    ruleVersion: RULE_VERSION,
    state: evaluation.state,
    reasonCode: evaluation.reasonCode,
    reason: evaluation.reason,
    package: {
      ecosystem: evidence.packageVersion.ecosystem,
      name: request.packageName,
      version: request.version,
    },
    interval: { from: request.interval.from, to: request.interval.to },
    repository: `${request.repository.owner}/${request.repository.name}`,
    sources,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    limitations,
    claimBoundary: CLAIM_BOUNDARY,
  };

  if (evidence.commit) receipt.commitSha = evidence.commit.sha;
  if (evidence.lockfile) {
    receipt.lockfile = { path: evidence.lockfile.path, contentHash: evidence.lockfile.contentHash };
  }
  if (evidence.run) receipt.workflowRunId = evidence.run.runId;
  if (evidence.job) receipt.ciJob = { name: evidence.job.name, conclusion: evidence.job.conclusion };
  if (evidence.serviceBuild) {
    receipt.serviceBuild = {
      provider: evidence.serviceBuild.provider,
      service: evidence.serviceBuild.service,
      environmentLabel: evidence.serviceBuild.environmentLabel,
      ...(evidence.serviceBuild.checkRunId ? { checkRunId: evidence.serviceBuild.checkRunId } : {}),
    };
  }
  if (options.snapshot) receipt.snapshot = options.snapshot;
  if (options.mode) receipt.mode = options.mode;

  return receipt;
}
