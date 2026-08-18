/**
 * Build the typed provenance graph for one investigation. Nodes are created for
 * every present evidence record; typed edges are created only for hops the
 * evaluator verified. A complete Incident->Service path therefore exists in the
 * graph only when the result is EXPOSED, so HydraDB's `algo.SPpaths` returning a
 * full path is the graph-native realization of the invariant (CP-002.3).
 */
import type { Evaluation } from "./evaluate.js";
import { NodeIdRegistry } from "./ids.js";
import {
  RULE_VERSION,
  type EvidenceBundle,
  type InvestigationRequest,
  type ProvenanceEdge,
  type ProvenanceEdgeType,
  type ProvenanceGraph,
  type ProvenanceKind,
  type ProvenanceNode,
  type PropertyValue,
} from "./schema.js";

export interface BuiltGraph extends ProvenanceGraph {
  /** Path endpoints for the receipt query: Incident source and (if present) Service target. */
  incidentId: number;
  serviceId: number | null;
}

export function buildProvenanceGraph(
  request: InvestigationRequest,
  evidence: EvidenceBundle,
  evaluation: Evaluation,
): BuiltGraph {
  const registry = new NodeIdRegistry();
  const nodes = new Map<number, ProvenanceNode>();
  const edges: ProvenanceEdge[] = [];

  const addNode = (kind: ProvenanceKind, key: string, properties: Record<string, PropertyValue>): number => {
    const id = registry.idFor(key);
    if (!nodes.has(id)) {
      nodes.set(id, { id, kind, key, properties });
    }
    return id;
  };
  const addEdge = (
    type: ProvenanceEdgeType,
    sourceId: number,
    targetId: number,
    properties: Record<string, PropertyValue> = {},
  ): void => {
    edges.push({ type, sourceId, targetId, properties: { ruleVersion: RULE_VERSION, ...properties } });
  };

  const incident = evidence.incident;
  const incidentId = addNode("Incident", `incident:${incident.packageName}@${incident.version}`, {
    packageName: incident.packageName,
    version: incident.version,
    liveFrom: incident.liveFrom,
    liveUntil: incident.liveUntil,
    sourceUrl: incident.sourceUrl,
  });

  const pv = evidence.packageVersion;
  const packageId = addNode("PackageVersion", `pkg:${pv.ecosystem}:${pv.name}@${pv.version}`, {
    ecosystem: pv.ecosystem,
    name: pv.name,
    version: pv.version,
    sourceUrl: pv.sourceUrl,
    ...(pv.purl ? { purl: pv.purl } : {}),
  });
  if (evaluation.verified.affects) addEdge("AFFECTS", incidentId, packageId);

  let lockfileId: number | null = null;
  if (evidence.lockfile) {
    const lf = evidence.lockfile;
    lockfileId = addNode("LockfileSnapshot", `lockfile:${lf.commitSha}:${lf.path}`, {
      path: lf.path,
      commitSha: lf.commitSha,
      contentHash: lf.contentHash,
      resolvedName: lf.resolvedName,
      resolvedVersion: lf.resolvedVersion,
      sourceUrl: lf.sourceUrl,
    });
    if (evaluation.verified.resolvedBy) {
      addEdge("RESOLVED_BY", packageId, lockfileId, {
        eligible: true,
        overlapFrom: request.interval.from,
        overlapTo: request.interval.to,
      });
    }
  }

  let commitId: number | null = null;
  if (evidence.commit) {
    const c = evidence.commit;
    commitId = addNode("GitCommit", `commit:${c.sha}`, {
      sha: c.sha,
      committedAt: c.committedAt,
      url: c.url,
      ...(c.message ? { message: c.message } : {}),
    });
    if (lockfileId !== null && evaluation.verified.atCommit) addEdge("AT_COMMIT", lockfileId, commitId);
  }

  let runId: number | null = null;
  if (evidence.run) {
    const r = evidence.run;
    runId = addNode("WorkflowRun", `run:${r.runId}`, {
      runId: r.runId,
      headSha: r.headSha,
      conclusion: r.conclusion,
      url: r.url,
    });
    if (commitId !== null && evaluation.verified.triggers) addEdge("TRIGGERS", commitId, runId);
  }

  let jobId: number | null = null;
  if (evidence.job) {
    const j = evidence.job;
    const runKey = evidence.run ? evidence.run.runId : j.headSha;
    jobId = addNode("CIJob", `job:${runKey}:${j.name}`, {
      name: j.name,
      headSha: j.headSha,
      conclusion: j.conclusion,
      url: j.url,
    });
    if (runId !== null && evaluation.verified.hasJob) addEdge("HAS_JOB", runId, jobId);
  }

  let buildId: number | null = null;
  let serviceId: number | null = null;
  if (evidence.serviceBuild) {
    const b = evidence.serviceBuild;
    const buildKey = `build:${b.provider}:${b.checkRunId ?? b.service}:${b.headSha}`;
    buildId = addNode("ServiceBuild", buildKey, {
      provider: b.provider,
      service: b.service,
      environmentLabel: b.environmentLabel,
      headSha: b.headSha,
      status: b.status,
      url: b.url,
      ...(b.checkRunId ? { checkRunId: b.checkRunId } : {}),
    });
    if (jobId !== null && evaluation.verified.produces) addEdge("PRODUCES", jobId, buildId);

    serviceId = addNode("Service", `service:${b.provider}:${b.service}:${b.environmentLabel}`, {
      provider: b.provider,
      service: b.service,
      environmentLabel: b.environmentLabel,
    });
    if (buildId !== null && evaluation.verified.targets) addEdge("TARGETS", buildId, serviceId);
  }

  return { nodes: [...nodes.values()], edges, incidentId, serviceId };
}
