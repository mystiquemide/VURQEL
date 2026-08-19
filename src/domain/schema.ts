/**
 * Vurqel domain schema: canonical evidence records, the typed provenance graph,
 * result states, reason codes, and the receipt. Mirrors the graph model and the
 * winning invariant in docs/DESIGN.md (BR-001..BR-008).
 *
 * The invariant, in short:
 *   EXPOSED requires one complete same-SHA path:
 *     Incident -AFFECTS-> PackageVersion -RESOLVED_BY-> LockfileSnapshot
 *       -AT_COMMIT-> GitCommit -TRIGGERS-> WorkflowRun -HAS_JOB-> CIJob
 *       -PRODUCES-> ServiceBuild -TARGETS-> Service
 *   Complete evaluation with no eligible path => NOT_EXPOSED.
 *   Missing / ambiguous / contradictory evidence => UNPROVEN.
 */

export type ResultState = "EXPOSED" | "NOT_EXPOSED" | "UNPROVEN";

export type ReasonCode =
  | "EXPOSED_SAME_SHA_PATH"
  | "NOT_EXPOSED_NO_RESOLUTION_IN_WINDOW"
  | "NOT_EXPOSED_RESOLUTION_OUTSIDE_WINDOW"
  | "NOT_EXPOSED_BUILD_NOT_SUCCESSFUL"
  | "NOT_EXPOSED_NO_PRODUCTION_BUILD"
  | "UNPROVEN_INCONSISTENT_EVIDENCE"
  | "UNPROVEN_INCOMPLETE_HISTORY"
  | "UNPROVEN_MISSING_COMMIT_EVIDENCE"
  | "UNPROVEN_SHA_MISMATCH"
  | "UNPROVEN_MISSING_FROZEN_INSTALL"
  | "UNPROVEN_MISSING_CI_EVIDENCE"
  | "UNPROVEN_MISSING_SERVICE_EVIDENCE"
  | "UNPROVEN_AMBIGUOUS_TIMESTAMP"
  | "UNPROVEN_INCOMPLETE_PROOF_PATH";

export const RULE_VERSION = "vurqel-eligibility-v1";

/** The claim boundary that must accompany every EXPOSED result (BR-007, NFR-001). */
export const CLAIM_BOUNDARY =
  "Proves build provenance only: a compromised package was resolved in the incident window and a same-SHA production-labelled build succeeded. Does NOT prove malware execution, credential theft, or end-user traffic.";

export interface Repository {
  owner: string;
  name: string;
}

export interface InvestigationRequest {
  repository: Repository;
  lockfilePath: string;
  packageName: string;
  version: string;
  /** Half-open UTC interval [from, to). */
  interval: { from: string; to: string };
  incidentSourceUrl: string;
  serviceNameFilter?: string;
  /** Named CI job whose own conclusion decides HAS_JOB (BR-003), e.g. "Build (tools)". */
  jobSelector?: string;
  /** Service-build check-run name to correlate (DEC-003 explicit manifest), e.g. "Workers Builds: websites-tools". */
  serviceCheckName?: string;
  /** Declared production environment label for the service build (default "production"). */
  serviceEnvironmentLabel?: string;
  mode?: "online" | "cached-replay";
}

export interface IncidentRecord {
  packageName: string;
  version: string;
  liveFrom: string;
  liveUntil: string;
  sourceUrl: string;
  observedAt: string;
}

export interface PackageVersionRecord {
  ecosystem: string;
  name: string;
  version: string;
  purl?: string;
  sourceUrl: string;
}

export interface GitCommitRecord {
  sha: string;
  committedAt: string;
  url: string;
  message?: string;
}

export interface LockfileSnapshotRecord {
  path: string;
  commitSha: string;
  contentHash: string;
  resolvedName: string;
  resolvedVersion: string;
  sourceUrl: string;
}

export interface WorkflowFileRecord {
  path: string;
  commitSha: string;
  frozenInstall: boolean;
  jobSelector: string;
  sourceUrl: string;
}

export interface WorkflowRunRecord {
  runId: string;
  headSha: string;
  startedAt: string;
  completedAt: string;
  conclusion: string;
  url: string;
}

export interface CIJobRecord {
  jobId?: string;
  name: string;
  headSha: string;
  completedAt: string;
  conclusion: string;
  url: string;
}

export interface ServiceBuildRecord {
  provider: string;
  service: string;
  environmentLabel: string;
  headSha: string;
  status: string;
  timestamp: string;
  url: string;
  checkRunId?: string;
}

/**
 * All evidence for one investigation. Optional records are absent when a source
 * yielded nothing; the completeness flags distinguish "checked and genuinely
 * absent" (can support NOT_EXPOSED) from "not retrieved" (forces UNPROVEN).
 */
export interface EvidenceBundle {
  incident: IncidentRecord;
  packageVersion: PackageVersionRecord;
  commit?: GitCommitRecord;
  lockfile?: LockfileSnapshotRecord;
  workflow?: WorkflowFileRecord;
  run?: WorkflowRunRecord;
  job?: CIJobRecord;
  serviceBuild?: ServiceBuildRecord;
  historyComplete: boolean;
  serviceEvidenceComplete: boolean;
}

export type ProvenanceKind =
  | "Incident"
  | "PackageVersion"
  | "LockfileSnapshot"
  | "GitCommit"
  | "WorkflowRun"
  | "CIJob"
  | "ServiceBuild"
  | "Service";

export type ProvenanceEdgeType =
  | "AFFECTS"
  | "RESOLVED_BY"
  | "AT_COMMIT"
  | "TRIGGERS"
  | "HAS_JOB"
  | "PRODUCES"
  | "TARGETS";

/** The provenance chain in order: Incident -> ... -> Service (used for the bounded path query). */
export const PROVENANCE_EDGE_ORDER: readonly ProvenanceEdgeType[] = [
  "AFFECTS",
  "RESOLVED_BY",
  "AT_COMMIT",
  "TRIGGERS",
  "HAS_JOB",
  "PRODUCES",
  "TARGETS",
];

export type PropertyValue = string | number | boolean;

export interface ProvenanceNode {
  id: number;
  kind: ProvenanceKind;
  key: string;
  properties: Record<string, PropertyValue>;
}

export interface ProvenanceEdge {
  type: ProvenanceEdgeType;
  sourceId: number;
  targetId: number;
  properties: Record<string, PropertyValue>;
}

export interface ProvenanceGraph {
  nodes: ProvenanceNode[];
  edges: ProvenanceEdge[];
}

export interface ReceiptSnapshot {
  bookmark: string;
  readEpoch: number | null;
}

export interface ReceiptSource {
  label: string;
  url: string;
}

export interface Receipt {
  requestId: string;
  ruleVersion: string;
  state: ResultState;
  reasonCode: ReasonCode;
  reason: string;
  package: { ecosystem: string; name: string; version: string };
  interval: { from: string; to: string };
  repository: string;
  commitSha?: string;
  lockfile?: { path: string; contentHash: string };
  workflowRunId?: string;
  ciJob?: { name: string; conclusion: string };
  serviceBuild?: {
    provider: string;
    service: string;
    environmentLabel: string;
    checkRunId?: string;
  };
  sources: ReceiptSource[];
  snapshot?: ReceiptSnapshot;
  generatedAt: string;
  /** Whether the evidence was fetched live or served from cache (FR-012). */
  mode?: "online" | "cached-replay";
  limitations: string[];
  claimBoundary: string;
}
