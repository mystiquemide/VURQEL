# Vurqel

Temporal supply-chain exposure proof. Given a compromised package, a repository, and the incident's live window, Vurqel proves whether a build actually resolved the malicious version, down to the commit, the frozen-lockfile CI job, and the production-labelled service build - and returns a source-linked receipt backed by a graph path in HydraDB.

## The story

In May 2026 the TanStack npm packages were compromised for a few hours. Every responder asked the same question: "did any of our builds actually pull the bad version, or are we just seeing the package name in a lockfile?"

Existing tools answer the wrong question. `npm audit` and Dependabot flag that a version is *mentioned*; they do not prove a specific historical build *installed* it during the live window. So teams either over-report (every repo that ever referenced the package) or under-report (a red CI run gets dismissed even though the one job that mattered went green).

Real, verifiable receipt: commit [`939d3bd1`](https://github.com/RelativeSure/websites/commit/939d3bd1b05ee09f0f4c2585a492f98da0fd066d) of `RelativeSure/websites` pinned `@tanstack/react-router@1.169.8` (an affected version) inside the incident window, its `Build (tools)` job [succeeded](https://github.com/RelativeSure/websites/actions/runs/25698962181) with a frozen install even though the overall run was red, and the Cloudflare `Workers Builds: websites-tools` production check-run succeeded on the same SHA. Vurqel returns `EXPOSED` for that case and refuses to for anything that does not complete the chain.

## One-liner

I did not build another vulnerability scanner, a CVE dashboard, or a malware sandbox. I built a provenance prover with one rule: **`EXPOSED` requires a complete same-SHA path from the incident to a production build; anything less is `NOT_EXPOSED` or `UNPROVEN`, never a guess.**

## How it works

A lockfile mention is not proof. Vurqel only concludes exposure when every hop is verified on the same commit SHA, and it writes those hops as a typed graph so the proof is a real path query, not an in-memory boolean.

```
Incident -AFFECTS-> PackageVersion -RESOLVED_BY-> LockfileSnapshot -AT_COMMIT-> GitCommit
  -TRIGGERS-> WorkflowRun -HAS_JOB-> CIJob -PRODUCES-> ServiceBuild -TARGETS-> Service
```

| Situation | Result |
|---|---|
| Complete same-SHA chain to a production build | `EXPOSED` |
| Complete evidence, lockfile never resolved the affected version in the window | `NOT_EXPOSED` |
| Complete evidence, no production build on that SHA | `NOT_EXPOSED` |
| Named CI job did not succeed | `NOT_EXPOSED` |
| SHA mismatch between any two hops | `UNPROVEN` |
| No frozen-lockfile install (a lockfile entry alone) | `UNPROVEN` |
| History or service evidence not fully retrieved | `UNPROVEN` |

The graph makes this literal: edges are written only for verified hops, so HydraDB's bounded `algo.SPpaths` returns a complete Incident to Service path only when the result is `EXPOSED`.

## Try it in 2 minutes

Requirements: Node >= 22, pnpm, Docker (for the pinned HydraDB image).

```bash
pnpm install
pnpm run hydradb:up          # pulls the pinned digest, clean-starts a local node
pnpm run investigate         # bundled replay of the verified TanStack case
```

Expected: a JSON receipt with `"state": "EXPOSED"`, `"reasonCode": "EXPOSED_SAME_SHA_PATH"`, the commit SHA, lockfile content hash, workflow run id, named job, Cloudflare check-run id, and a HydraDB snapshot bookmark.

Prove it is not hard-coded - fetch the same evidence live from public GitHub:

```bash
pnpm run investigate -- --live --pretty
```

This resolves the commit, lockfile blob, workflow run, named job, and check-run from GitHub, ingests them into HydraDB, and returns the same `EXPOSED` proof. The observability line reports `mode=online` on the first run and `mode=cached-replay` afterwards (responses are cached under `.vurqel-cache`). No token is required (anonymous GitHub is enough for one case).

## How I tried to break it

Every row below is an executed test (`pnpm test`, 39/39, 0 skipped).

| Case | Outcome | Proof |
|---|---|---|
| Verified TanStack case | `EXPOSED`, complete 8-node / 7-edge path | `test/investigate.integration.test.ts` |
| Live GitHub evidence vs bundled fixture | Identical proof fields | `test/live-investigate.integration.test.ts` |
| Overall CI run is red, named job is green | Keys off the named job (`EXPOSED`) | `test/actions.integration.test.ts` (BR-003) |
| Lockfile entry but no frozen install | `UNPROVEN_MISSING_FROZEN_INSTALL` | `test/investigate.integration.test.ts` (BR-002) |
| SHA mismatch between hops | `UNPROVEN_SHA_MISMATCH`, no path | `test/investigate.integration.test.ts` |
| Same-SHA build not production-labelled | `NOT_EXPOSED_NO_PRODUCTION_BUILD` | `test/investigate.integration.test.ts` |
| Non-existent version, live | `NOT_EXPOSED_NO_RESOLUTION_IN_WINDOW` | `test/github.integration.test.ts` |
| Repeated investigation | Idempotent, byte-identical apart from retrieval metadata | `test/investigate.integration.test.ts` |
| Interval boundary `[from, to)`, case-insensitive SHA | Correct | `test/evaluate.test.ts` |
| Truncated version `1.169.8` vs `1.169.80` | No false match | `test/pnpm-lock.test.ts` |

## Live proof (the verified case)

These are real, clickable public artifacts, not deployments of mine:

- Incident window: `[2026-05-11T19:26:14Z, 2026-05-11T22:13:38Z)` (TanStack postmortem / StepSecurity advisory)
- Commit: https://github.com/RelativeSure/websites/commit/939d3bd1b05ee09f0f4c2585a492f98da0fd066d
- Lockfile at that commit: https://github.com/RelativeSure/websites/blob/939d3bd1b05ee09f0f4c2585a492f98da0fd066d/tools/pnpm-lock.yaml (sha256 `04916898507a414af7e59f9083ade5f604a0358ae676ad216e50d0f605330f6d`, resolves `@tanstack/react-router@1.169.8` at line 1595)
- Workflow run (overall `failure`): https://github.com/RelativeSure/websites/actions/runs/25698962181
- Named job `Build (tools)`: `success` on the same SHA
- Cloudflare production check-run `Workers Builds: websites-tools`: `success`, id `75454451577`
- HydraDB (sponsor): `ghcr.io/hydra-db/hydradb@sha256:db78309a233be54662db29744047e985a39b51c45a270d1a1f47c31a62cdb709` (server 0.1.0), does the graph write and the snapshot-scoped path read that produce the receipt.

## How this differs

| Alternative | What it does | Why Vurqel is different |
|---|---|---|
| `npm audit` / Dependabot | Flags that a version is present or vulnerable | Proves a *specific historical build* installed it during the live window, or says `UNPROVEN` |
| CVE / advisory dashboards | Track advisories and package metadata | Ties one incident to one repository's commit, CI job, and production build with source links |
| SBOM scanners | Enumerate dependencies in an artifact | Correlates lockfile, frozen-install CI, and same-SHA production check-run into one path |
| Reading the CI status badge | Trusts the overall run color | Uses the named job's own conclusion, so a red matrix does not hide a green build (and vice versa) |

## Honest limitations

- This is a hackathon build, unaudited. Do not treat a receipt as a security clearance.
- Vurqel proves **build provenance only**. It does NOT prove malware execution, credential theft, or end-user traffic. That claim boundary is attached to every receipt.
- One incident is fully wired end to end (the TanStack case). `--live` works for other public repos when you supply the manifest selectors (`--job`, `--service-check`, `--service`, `--env`); without them the CI/service hops stay `UNPROVEN`.
- Named CI job and production check-run are selected by explicit name (an explicit manifest), not inferred. This is deliberate - Vurqel will not guess which job is authoritative.
- HydraDB's local object store cannot update flushed objects, so `hydradb:up` clean-starts the ephemeral store each run. Durable multi-session persistence needs an S3-compatible object store.
- Anonymous GitHub is 60 requests/hour. Responses are cached under `.vurqel-cache`; set `GITHUB_TOKEN` for 5000/hour, or run `VURQEL_GH_CACHE=readonly` fully offline.
- Interaction surface is the CLI. The equivalent local HTTP endpoint and a browser evidence card are planned, not built.
- License is pending (see below).

## What's real

Everything in the shipped path is real. There are no mocked values in this repository: the round trip runs against the pinned HydraDB image, and `--live` fetches from public GitHub. The "brain" is deterministic - a rules-based evaluator owns the verdict; there is no LLM deciding truth.

- Tests: 39/39 (`pnpm test`), 0 skipped, run against a live HydraDB node and live/cached GitHub.
- Typecheck: `pnpm run typecheck` (strict TypeScript, zero runtime dependencies).
- Pending: hosted UI / HTTP endpoint, browser evidence card, additional incidents and service providers, an OSS `LICENSE` file.

## Run locally

```bash
git clone https://github.com/mystiquemide/VURQEL.git && cd VURQEL
pnpm install
pnpm run hydradb:up
pnpm test
pnpm run investigate -- --live --pretty
```

Secrets stay local: copy `.env.example` to `.env` and set `GITHUB_TOKEN` only if you want the higher GitHub rate limit. Never commit `.env`.
