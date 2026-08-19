# Vurqel Design

Vurqel proves which historical builds actually resolved a compromised package during its live window, down to the commit, the frozen-lockfile CI job, and the production-labelled service build. This document is the public technical design; it defines the business rules (`BR-*`) and feature requirements (`FR-*`) that the source code comments reference.

## Problem and invariant

Generic dependency tooling answers closure ("is this package present or flagged?"). It does not prove that a specific historical build installed the malicious version while it was live. Vurqel answers that exact question and refuses to guess.

Winning invariant: **`EXPOSED` requires one complete, same-SHA provenance path from the incident to a production-labelled build. A complete evaluation with no eligible path is `NOT_EXPOSED`. Missing, ambiguous, or contradictory evidence is `UNPROVEN`.**

## Result states and reason codes

| State | Meaning |
|---|---|
| `EXPOSED` | The complete same-SHA path exists (see reason `EXPOSED_SAME_SHA_PATH`). |
| `NOT_EXPOSED` | Evidence is complete and no eligible path exists (no in-window resolution, resolution outside window, build not successful, or no production build). |
| `UNPROVEN` | Evidence is missing, unretrieved, ambiguous, or contradictory (SHA mismatch, missing frozen install, missing commit/CI/service evidence, incomplete history, ambiguous timestamp). |

Reason codes are enumerated in `src/domain/schema.ts` (`ReasonCode`).

## Domain model

Typed nodes: `Incident`, `PackageVersion`, `LockfileSnapshot`, `GitCommit`, `WorkflowRun`, `CIJob`, `ServiceBuild`, `Service`.

The provenance chain (each edge is written only when the hop is verified):

```
Incident -AFFECTS-> PackageVersion -RESOLVED_BY-> LockfileSnapshot -AT_COMMIT-> GitCommit
  -TRIGGERS-> WorkflowRun -HAS_JOB-> CIJob -PRODUCES-> ServiceBuild -TARGETS-> Service
```

A complete `Incident -> Service` path therefore exists in the graph only when the result is `EXPOSED`.

## Business rules

- **BR-001 — Same-SHA join.** The same commit SHA must join the lockfile snapshot, commit, workflow run, CI job, and service build. SHA comparison is case-insensitive.
- **BR-002 — Frozen install required.** A lockfile entry alone is not proof. A frozen-lockfile install (e.g. `pnpm install --frozen-lockfile`, `npm ci`, `yarn --immutable`) in the relevant workflow plus a successful named job is required.
- **BR-003 — Named job decides.** The named CI job's own conclusion decides `HAS_JOB`, not the overall workflow-run conclusion. A red matrix cannot override a green named job, and vice versa.
- **BR-004 — Negatives need complete evidence.** `NOT_EXPOSED` requires complete evaluation with no eligible path. Completeness flags (`historyComplete`, `serviceEvidenceComplete`) distinguish a genuine negative from unretrieved evidence.
- **BR-005 — Fail closed.** Missing, ambiguous, or contradictory evidence yields `UNPROVEN`, never a false `EXPOSED` or a false `NOT_EXPOSED`.
- **BR-006 — UTC, half-open interval.** All timestamps are UTC. Incident-window overlap uses the half-open interval `[from, to)`; ambiguous (non-UTC) timestamps yield `UNPROVEN`.
- **BR-007 — Claim boundary.** Every receipt attaches the claim boundary: Vurqel proves build provenance only, not malware execution, credential theft, or end-user traffic.
- **BR-008 — Source-linked.** Every classification-bearing field points to a source URL, with content hashes and timestamps retained.

## Requirements traceability

Source comments carry `BR-*`, `FR-*`, `DEC-*`, and `NFR-*` tags. `BR-*` map to the business rules above. Key `FR-*`: `FR-001` bounded request validation; `FR-008` typed graph ingest; `FR-009` full proof-path read; `FR-010` result-state enforcement; `FR-011` inspectable receipt; `FR-012` labelled replay vs live; `FR-013` idempotent ingest; `FR-014` provider-failure handling (retryable vs `UNPROVEN`). `NFR-002` is determinism; `NFR-005` secret safety; `NFR-008` observability.

## Architecture

```
Public GitHub (commits, lockfile blob, workflow, runs, jobs, check-runs)
  -> GitHub adapters (src/sources): response cache, online/cached-replay labelling, typed SourceError
  -> Deterministic evaluator + graph builder (src/domain): the same-SHA invariant, pure and side-effect free
  -> HydraDB (src/hydradb): typed node/edge writes via UNWIND, bounded algo.SPpaths read under a strong snapshot
  -> Source-linked receipt (src/domain/receipt): state, reason, URLs, hashes, snapshot bookmark, claim boundary
  -> vurqel investigate CLI (src/cli.ts): bundled replay or --live ingestion, JSON output
```

The domain layer is pure and independently unit-tested; the HydraDB and GitHub layers are integration-tested against a live node and live/cached GitHub.

## Why HydraDB, specifically

The proof is a graph path, not an in-memory boolean. Writes go through the documented HTTP client boundary as a batched `UNWIND` upsert (`MERGE` by non-negative integer id, then `SET` one label and scalar properties), and the receipt comes from a single bounded, snapshot-consistent traversal:

```cypher
CALL algo.SPpaths({ sourceNode: <incidentId>, targetNode: <serviceId>,
  relTypes: ['AFFECTS','RESOLVED_BY','AT_COMMIT','TRIGGERS','HAS_JOB','PRODUCES','TARGETS'],
  maxLen: 8, relDirection: 'outgoing', pathCount: 1 }) YIELD path RETURN path   // consistency: strong
```

Because an edge exists only when its hop was verified, a complete path is returned only when every hop holds — and the `EXPOSED` verdict is **issued from that path read**, not from an in-process boolean. If HydraDB does not return the complete path, the verdict falls to `UNPROVEN` (`UNPROVEN_INCOMPLETE_PROOF_PATH`): remove the graph read and no `EXPOSED` can be produced. The receipt records the snapshot bookmark and read epoch. A vector store cannot answer this: the question is exact same-SHA path completeness on one snapshot, not similarity.

## Evidence and determinism

Deterministic non-negative integer node ids (FNV-1a-32 over a canonical key) make ingestion idempotent (`NFR-002`, `FR-013`): re-ingesting the same graph writes no new nodes or edges. Node id collisions between distinct keys are detected rather than silently merged. Receipts are deterministic apart from retrieval metadata (snapshot bookmark, generated timestamp, online/replay mode).

## Testing

`pnpm test` runs unit tests (evaluator branches, interval boundaries, case-insensitive SHA, lockfile parsing, graph/receipt construction) plus integration tests against a live HydraDB node and live/cached GitHub, including a live-equals-fixture parity check. `pnpm run typecheck` is strict; there are zero runtime dependencies.

## Limitations

Unaudited. Vurqel proves build provenance only (BR-007). One incident is fully wired end to end; other public repos need explicit manifest selectors (named CI job and service check-run). HydraDB's local object store cannot update flushed objects, so the dev runtime clean-starts each session; durable persistence needs an S3-compatible object store. Anonymous GitHub is rate-limited (60/hour); responses are cached and an optional token raises the limit.
