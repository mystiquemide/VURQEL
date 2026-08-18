/**
 * Commit + lockfile source adapter (Vurqel Phase 2, CP-003.1).
 *
 * Given an investigation request, this discovers the commit(s) that changed the
 * configured lockfile path inside the incident window, retrieves each candidate
 * lockfile blob at its immutable commit, hashes it, and detects whether it
 * resolves the exact affected package version. It returns the first resolving
 * commit as typed `GitCommitRecord` + `LockfileSnapshotRecord` evidence, plus a
 * `historyComplete` flag so the evaluator can distinguish a genuine negative
 * (complete history, no match) from unretrieved history (UNPROVEN).
 */
import { createHash } from "node:crypto";

import type { GitCommitRecord, InvestigationRequest, LockfileSnapshotRecord } from "../domain/schema.js";
import { detectResolvedVersion } from "./pnpm-lock.js";
import { GitHubClient, SourceError, type SourceMode } from "./github.js";

/** Subset of the GitHub commit list item we rely on. */
interface CommitListItem {
  sha: string;
  html_url: string;
  commit: { message?: string; committer?: { date?: string }; author?: { date?: string } };
}

export interface CommitLockfileEvidence {
  commit?: GitCommitRecord;
  lockfile?: LockfileSnapshotRecord;
  /** True when the full in-window lockfile history was retrieved (no pagination remained). */
  historyComplete: boolean;
  mode: SourceMode;
  candidatesChecked: number;
}

const MAX_CANDIDATES = 10;

function combineMode(a: SourceMode, b: SourceMode): SourceMode {
  return a === "online" || b === "online" ? "online" : "cached-replay";
}

export async function collectCommitLockfile(
  client: GitHubClient,
  request: InvestigationRequest,
): Promise<CommitLockfileEvidence> {
  const { owner, name } = request.repository;
  const path = request.lockfilePath;
  const perPage = MAX_CANDIDATES;
  const query =
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits` +
    `?path=${encodeURIComponent(path)}` +
    `&since=${encodeURIComponent(request.interval.from)}` +
    `&until=${encodeURIComponent(request.interval.to)}` +
    `&per_page=${perPage}`;

  const commits = await client.getJson<CommitListItem[]>(query);
  let mode: SourceMode = commits.mode;
  const items = Array.isArray(commits.data) ? commits.data : [];
  // A full page implies more history may exist beyond the window slice.
  const historyComplete = items.length < perPage;

  let candidatesChecked = 0;
  for (const item of items) {
    if (!item?.sha) continue;
    candidatesChecked += 1;

    const rawUrl = `${client.rawBaseUrl}/${owner}/${name}/${item.sha}/${path}`;
    let blob: { data: string; mode: SourceMode; url: string };
    try {
      blob = await client.getText(rawUrl);
    } catch (err) {
      // A missing blob at one candidate (e.g. GC'd after a force-push) must not
      // abort the investigation; skip it. Retryable errors still propagate.
      if (err instanceof SourceError && err.code === "not_found") continue;
      throw err;
    }
    mode = combineMode(mode, blob.mode);

    const hit = detectResolvedVersion(blob.data, request.packageName, request.version);
    if (!hit.resolved) continue;

    const contentHash = `sha256:${createHash("sha256").update(Buffer.from(blob.data, "utf8")).digest("hex")}`;
    const committedAt = item.commit?.committer?.date ?? item.commit?.author?.date;
    if (!committedAt) continue; // cannot place the commit in time; skip as evidence

    const commit: GitCommitRecord = {
      sha: item.sha,
      committedAt,
      url: item.html_url || `${client.htmlBaseUrl}/${owner}/${name}/commit/${item.sha}`,
      ...(item.commit?.message ? { message: item.commit.message.split("\n")[0]! } : {}),
    };
    const lockfile: LockfileSnapshotRecord = {
      path,
      commitSha: item.sha,
      contentHash,
      resolvedName: request.packageName,
      resolvedVersion: request.version,
      sourceUrl: `${client.htmlBaseUrl}/${owner}/${name}/blob/${item.sha}/${path}`,
    };
    return { commit, lockfile, historyComplete, mode, candidatesChecked };
  }

  return { historyComplete, mode, candidatesChecked };
}
