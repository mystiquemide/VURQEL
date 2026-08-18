/**
 * GitHub Actions + Checks source adapters (Vurqel Phase 2, CP-003.2).
 *
 * Correlates a commit SHA to CI evidence:
 *  - the workflow run and the *named* CI job whose own conclusion decides
 *    HAS_JOB (BR-003: a red overall run cannot override a green named job);
 *  - the workflow file at the commit, to confirm a frozen-lockfile install
 *    (BR-002);
 *  - the production-labelled service-build check-run (DEC-003 explicit
 *    manifest: matched by check-run name).
 *
 * Selection uses explicit request selectors; nothing is fabricated. All fetches
 * are read-only; no workflow or package script is executed.
 */
import type {
  CIJobRecord,
  InvestigationRequest,
  ServiceBuildRecord,
  WorkflowFileRecord,
  WorkflowRunRecord,
} from "../domain/schema.js";
import { GitHubClient, SourceError, type SourceMode } from "./github.js";
import { detectFrozenInstall } from "./workflow.js";

interface RunItem {
  id: number;
  name?: string;
  head_sha: string;
  path?: string;
  conclusion: string | null;
  status?: string;
  html_url: string;
  run_started_at?: string;
  created_at?: string;
  updated_at?: string;
}
interface RunsResponse {
  total_count: number;
  workflow_runs: RunItem[];
}
interface JobItem {
  id: number;
  name: string;
  head_sha: string;
  conclusion: string | null;
  status?: string;
  completed_at: string | null;
  html_url: string;
}
interface JobsResponse {
  total_count: number;
  jobs: JobItem[];
}
interface CheckRunItem {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  completed_at: string | null;
  html_url: string;
  app?: { slug?: string };
}
interface CheckRunsResponse {
  total_count: number;
  check_runs: CheckRunItem[];
}

const MAX_RUNS = 20;

function combineMode(a: SourceMode, b: SourceMode): SourceMode {
  return a === "online" || b === "online" ? "online" : "cached-replay";
}

function appSlugToProvider(slug: string | undefined): string {
  if (!slug) return "unknown";
  if (slug === "cloudflare-workers-and-pages") return "cloudflare";
  return slug;
}

export interface RunJobEvidence {
  run?: WorkflowRunRecord;
  job?: CIJobRecord;
  /** Workflow file path of the run that owns the named job (feeds the workflow fetch). */
  workflowPath?: string;
  mode: SourceMode;
}

/**
 * Find the workflow run + named CI job for `sha`. Iterates runs on the SHA and
 * selects the run whose jobs include `request.jobSelector`; that job's own
 * conclusion is the HAS_JOB signal (BR-003).
 */
export async function collectRunAndJob(
  client: GitHubClient,
  request: InvestigationRequest,
  sha: string,
): Promise<RunJobEvidence> {
  const { owner, name } = request.repository;
  const runsRes = await client.getJson<RunsResponse>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/actions/runs?head_sha=${sha}&per_page=${MAX_RUNS}`,
  );
  let mode: SourceMode = runsRes.mode;
  const runs = runsRes.data.workflow_runs ?? [];
  if (!request.jobSelector) return { mode };

  for (const run of runs) {
    const jobsRes = await client.getJson<JobsResponse>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/actions/runs/${run.id}/jobs?per_page=100`,
    );
    mode = combineMode(mode, jobsRes.mode);
    const job = (jobsRes.data.jobs ?? []).find((j) => j.name === request.jobSelector);
    if (!job) continue;

    const runRecord: WorkflowRunRecord = {
      runId: String(run.id),
      headSha: run.head_sha,
      startedAt: run.run_started_at ?? run.created_at ?? "",
      completedAt: run.updated_at ?? "",
      conclusion: run.conclusion ?? run.status ?? "",
      url: run.html_url,
    };
    const jobRecord: CIJobRecord = {
      jobId: String(job.id),
      name: job.name,
      headSha: job.head_sha,
      completedAt: job.completed_at ?? "",
      conclusion: job.conclusion ?? job.status ?? "",
      url: job.html_url,
    };
    return { run: runRecord, job: jobRecord, ...(run.path ? { workflowPath: run.path } : {}), mode };
  }
  return { mode };
}

export interface WorkflowFileEvidence {
  workflow?: WorkflowFileRecord;
  mode: SourceMode;
}

/** Fetch the workflow file at `sha` and detect a frozen-lockfile install (BR-002). */
export async function collectWorkflowFile(
  client: GitHubClient,
  request: InvestigationRequest,
  sha: string,
  workflowPath: string,
): Promise<WorkflowFileEvidence> {
  const { owner, name } = request.repository;
  const rawUrl = `${client.rawBaseUrl}/${owner}/${name}/${sha}/${workflowPath}`;
  let text: { data: string; mode: SourceMode };
  try {
    text = await client.getText(rawUrl);
  } catch (err) {
    if (err instanceof SourceError && err.code === "not_found") return { mode: "online" };
    throw err;
  }
  const workflow: WorkflowFileRecord = {
    path: workflowPath,
    commitSha: sha,
    frozenInstall: detectFrozenInstall(text.data),
    jobSelector: request.jobSelector ?? "",
    sourceUrl: `${client.htmlBaseUrl}/${owner}/${name}/blob/${sha}/${workflowPath}`,
  };
  return { workflow, mode: text.mode };
}

export interface ServiceBuildEvidence {
  serviceBuild?: ServiceBuildRecord;
  /** True when the check-run list was retrieved (lets the evaluator conclude a negative). */
  serviceEvidenceComplete: boolean;
  mode: SourceMode;
}

/** Correlate the production-labelled service-build check-run by name (DEC-003). */
export async function collectServiceBuild(
  client: GitHubClient,
  request: InvestigationRequest,
  sha: string,
): Promise<ServiceBuildEvidence> {
  const { owner, name } = request.repository;
  const res = await client.getJson<CheckRunsResponse>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits/${sha}/check-runs?per_page=100`,
  );
  const checks = res.data.check_runs ?? [];
  if (!request.serviceCheckName) return { serviceEvidenceComplete: true, mode: res.mode };

  const check = checks.find((c) => c.name === request.serviceCheckName);
  if (!check) return { serviceEvidenceComplete: true, mode: res.mode };

  const serviceBuild: ServiceBuildRecord = {
    provider: appSlugToProvider(check.app?.slug),
    service: request.serviceNameFilter ?? check.name,
    environmentLabel: request.serviceEnvironmentLabel ?? "production",
    headSha: sha,
    status: check.conclusion ?? check.status ?? "",
    timestamp: check.completed_at ?? "",
    url: check.html_url,
    checkRunId: String(check.id),
  };
  return { serviceBuild, serviceEvidenceComplete: true, mode: res.mode };
}
