# Proof — real HydraDB output

These are **real, reproducible** artifacts captured from a live pinned HydraDB node
(`ghcr.io/hydra-db/hydradb@sha256:db78309a…`), not mock data. They prove the one
claim a judge should not have to take on faith: **the verdict is a HydraDB graph‑path
read, and the graph refuses to return a path it cannot verify.**

Each file is the actual `algo.SPpaths` result for the verified TanStack case
(`@tanstack/react-router@1.169.8`, incident window `[2026‑05‑11T19:26:14Z, 22:13:38Z)`,
commit `939d3bd1b05ee09f0f4c2585a492f98da0fd066d`).

## What's here

| File | Verdict | HydraDB returned |
|---|---|---|
| [`exposed/hydradb-path.json`](exposed/hydradb-path.json) | `EXPOSED` | Complete path: **8 nodes / 7 edges**, every node on SHA `939d3bd1…` |
| [`exposed/receipt.json`](exposed/receipt.json) | `EXPOSED` | Source‑linked receipt + snapshot bookmark |
| [`broken/hydradb-path.json`](broken/hydradb-path.json) | `UNPROVEN` | **No path** (`path: null`, 0 nodes) — only 4 of 7 edges were written |
| [`broken/receipt.json`](broken/receipt.json) | `UNPROVEN` | `UNPROVEN_SHA_MISMATCH` |
| [`blast-radius/result.json`](blast-radius/result.json) | mixed | Illustrative multi-service fan-out (Track 02A): confirmed exposed set = 2 of 4 candidates |

> `blast-radius/result.json` is an **illustrative, synthetic** multi-service scenario (not the verified TanStack case). It runs the same per-service path check across four candidate apps and returns the confirmed exposed set `{acme-web, acme-api}`, excluding a staging build (`NOT_EXPOSED_NO_PRODUCTION_BUILD`) and a SHA mismatch (`UNPROVEN_SHA_MISMATCH`). Regenerate with `pnpm run hydradb:up && pnpm run blast-radius -- --pretty`.

## The 30‑second read

**EXPOSED** — `exposed/hydradb-path.json` shows HydraDB returning the whole chain,
`Incident -AFFECTS-> PackageVersion -RESOLVED_BY-> LockfileSnapshot -AT_COMMIT-> GitCommit
-TRIGGERS-> WorkflowRun -HAS_JOB-> CIJob -PRODUCES-> ServiceBuild -TARGETS-> Service`,
with `pathComplete: true`, `pathNodeCount: 8`, and a snapshot bookmark
(`sgk:1:…:15`) that records exactly which graph state answered.

**BROKEN** — `broken/hydradb-path.json` is the same ingest with **one** field changed:
the CI job's head SHA is set to `000…0`. That fails the same‑SHA join at the `HAS_JOB`
hop (BR‑001/BR‑003), so `HAS_JOB`, `PRODUCES`, and `TARGETS` are **never written**
(`graphEdgeCount: 4`, not 7). `algo.SPpaths(incident → service)` then returns
`path: null`. The verdict is `UNPROVEN`, never a false `EXPOSED`.

Same pipeline, same node ids, one broken SHA — and the graph will not complete the
path. That is the invariant enforced by the sponsor technology itself, not by
application code that could be talked out of it.

## Reproduce (needs Docker)

Run one mode per clean start — HydraDB's `MERGE` is idempotent but never deletes an
edge, so the two graphs must not share a node:

```bash
pnpm install
pnpm run hydradb:up && node --import tsx scripts/emit-proof.ts exposed
pnpm run hydradb:up && node --import tsx scripts/emit-proof.ts broken
```

The generator is [`scripts/emit-proof.ts`](../scripts/emit-proof.ts); it calls the
same `investigate()` orchestrator the CLI uses (`src/investigate.ts`).

## Notes

- The `snapshot.bookmark` and `readEpoch` are per‑run snapshot metadata and will
  differ between captures. The **path structure and the verdict are deterministic.**
- Node property values appear in HydraDB's native tagged form (e.g. `{"String": "…"}`);
  that is the database's own output, copied verbatim.
- The EXPOSED case is also emitted by `pnpm run investigate` (the CLI receipt), and
  the same evidence is fetchable from public GitHub with `--live`. Every SHA/URL in
  these files resolves to a public source (see the repo README's verified‑case table).
