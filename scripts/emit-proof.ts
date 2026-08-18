/**
 * Emit reproducible HydraDB proof artifacts for the verified TanStack case.
 *
 * Run ONE mode per clean start. HydraDB's MERGE is idempotent but never deletes
 * an edge, so the EXPOSED and BROKEN graphs must not share a node — clean-start
 * between them:
 *
 *   pnpm run hydradb:up && node --import tsx scripts/emit-proof.ts exposed
 *   pnpm run hydradb:up && node --import tsx scripts/emit-proof.ts broken
 *
 * exposed : the complete same-SHA incident->service path HydraDB returns (EXPOSED).
 * broken  : the same ingest with ONE mismatched CI-job SHA. The HAS_JOB hop fails
 *           the same-SHA join (BR-001/BR-003), that edge is never written, and
 *           algo.SPpaths returns no complete incident->service path -> UNPROVEN.
 *           This is the enforced refusal: the graph will not hand back a path it
 *           cannot verify.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadHydraDbConfig } from "../src/config.js";
import { HydraDbClient } from "../src/hydradb/client.js";
import { investigate } from "../src/investigate.js";
import { tanstackRequest, tanstackEvidence } from "../src/fixtures/tanstack.js";
import type { EvidenceBundle } from "../src/domain/schema.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "proof");
const GENERATED_AT = "2026-08-18T00:00:00Z";

const SPPATHS_QUERY = [
  "CALL algo.SPpaths({",
  "  sourceNode: <incidentId>, targetNode: <serviceId>,",
  "  relTypes: ['AFFECTS','RESOLVED_BY','AT_COMMIT','TRIGGERS','HAS_JOB','PRODUCES','TARGETS'],",
  "  maxLen: 8, relDirection: 'outgoing', pathCount: 1",
  "}) YIELD path, pathWeight, pathCost RETURN path, pathWeight, pathCost   // consistency: strong",
].join("\n");

function write(rel: string, data: unknown): void {
  const p = join(OUT, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, typeof data === "string" ? data : `${JSON.stringify(data, null, 2)}\n`);
  process.stdout.write(`wrote proof/${rel}\n`);
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode !== "exposed" && mode !== "broken") {
    process.stderr.write("Usage: emit-proof.ts <exposed|broken>\n");
    process.exitCode = 2;
    return;
  }

  const client = new HydraDbClient(loadHydraDbConfig());
  if (!(await client.ready())) {
    process.stderr.write("HydraDB not reachable. Run `pnpm run hydradb:up` first.\n");
    process.exitCode = 1;
    return;
  }

  let evidence: EvidenceBundle = tanstackEvidence;
  if (mode === "broken") {
    const cloned: EvidenceBundle = structuredClone(tanstackEvidence);
    if (!cloned.job) throw new Error("fixture has no CI job to mutate");
    cloned.job = { ...cloned.job, headSha: "0000000000000000000000000000000000000000" };
    evidence = cloned;
  }

  const result = await investigate(client, tanstackRequest, evidence, {
    mode: "cached-replay",
    generatedAt: GENERATED_AT,
  });

  const nodeCount = result.path?.nodes.length ?? 0;
  const relCount = result.path?.relationships.length ?? 0;
  const bookmark = result.receipt.snapshot?.bookmark ?? null;

  write(`${mode}/receipt.json`, result.receipt);
  write(`${mode}/hydradb-path.json`, {
    mode,
    verdict: result.receipt.state,
    reasonCode: result.receipt.reasonCode,
    query: SPPATHS_QUERY,
    incidentId: result.graph.incidentId,
    serviceId: result.graph.serviceId,
    snapshot: result.receipt.snapshot,
    pathComplete: nodeCount === result.graph.nodes.length && relCount === 7,
    pathNodeCount: nodeCount,
    pathRelCount: relCount,
    graphNodeCount: result.graph.nodes.length,
    graphEdgeCount: result.graph.edges.length,
    ...(mode === "broken"
      ? {
          note:
            "One CI-job SHA was mismatched. The HAS_JOB hop fails the same-SHA join (BR-001/BR-003), " +
            "so the edge is never written and no complete incident->service path exists. HydraDB returns no path.",
        }
      : {}),
    path: result.path,
  });

  process.stdout.write(
    `\n${mode.toUpperCase()}  state=${result.receipt.state} reason=${result.receipt.reasonCode} ` +
      `pathNodes=${nodeCount}/${result.graph.nodes.length} pathRels=${relCount}/7 bookmark=${bookmark ?? "-"}\n`,
  );
}

main().catch((err: unknown) => {
  process.stderr.write(`emit-proof failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
