#!/usr/bin/env node
/**
 * Vurqel CLI entry (CP-002.3): `vurqel investigate ...`.
 *
 * Validates a bounded request (FR-001), resolves evidence as a labelled cached
 * replay (FR-012) — the built-in verified TanStack case, or a caller-supplied
 * `--evidence <file>` bundle — writes the typed graph to HydraDB, runs the
 * snapshot-scoped proof read, and prints the structured JSON receipt (FR-011).
 *
 * The equivalent local HTTP endpoint is a thin wrapper over `investigate()`
 * (src/investigate.ts); this command is the primary interaction surface.
 *
 * Secret safety (NFR-005): the HydraDB token/auth header is never printed.
 */
import { readFileSync } from "node:fs";

import { loadGitHubConfig, loadHydraDbConfig } from "./config.js";
import { HydraDbClient } from "./hydradb/client.js";
import { HydraDbError } from "./hydradb/types.js";
import { GitHubClient, SourceError } from "./sources/github.js";
import { collectEvidence } from "./sources/collect.js";
import { investigate } from "./investigate.js";
import { parseInstant } from "./domain/evaluate.js";
import type { EvidenceBundle, InvestigationRequest } from "./domain/schema.js";
import { tanstackEvidence, tanstackRequest } from "./fixtures/tanstack.js";
import { computeBlastRadius } from "./blast-radius.js";
import { ILLUSTRATIVE_REQUEST, ILLUSTRATIVE_BUNDLES } from "./fixtures/blast-radius.js";

const USAGE = `Usage: vurqel investigate [options]

Runs one supply-chain exposure investigation and prints a JSON receipt.

Options:
  --repo <owner/name>     Repository (e.g. RelativeSure/websites)
  --lockfile <path>       Lockfile path (default: tools/pnpm-lock.yaml)
  --package <name>        Affected package (e.g. @tanstack/react-router)
  --version <version>     Affected version (e.g. 1.169.8)
  --from <iso-utc>        Incident interval start (inclusive), UTC
  --to <iso-utc>          Incident interval end (exclusive), UTC
  --service <name>        Service-name filter (e.g. websites-tools)
  --job <name>            Named CI job whose conclusion decides (e.g. "Build (tools)")
  --service-check <name>  Service-build check-run name (e.g. "Workers Builds: websites-tools")
  --env <label>           Service environment label (default: production)
  --incident-url <url>    Incident source URL
  --live                  Fetch evidence live from public GitHub (cached under .vurqel-cache)
  --evidence <file>       Labelled replay evidence bundle (JSON); for non-live custom cases
  --pretty                Pretty-print the receipt JSON
  -h, --help              Show this help

With no request flags, the built-in verified TanStack case is used. Add --live to
fetch that case's evidence from GitHub instead of the bundled replay.

vurqel blast-radius [--pretty]
  Runs an ILLUSTRATIVE multi-service blast-radius traversal (a synthetic scenario,
  not the verified case) and prints the confirmed exposed set of services.`;

interface Args {
  flags: Map<string, string>;
  bools: Set<string>;
}

function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string>();
  const bools = new Set<string>();
  const boolNames = new Set(["pretty", "help", "h", "live"]);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (token === "--") continue; // ignore the `pnpm run x -- args` separator
    if (!token.startsWith("--") && token !== "-h") continue;
    const name = token.replace(/^--?/, "");
    if (boolNames.has(name)) {
      bools.add(name === "h" ? "help" : name);
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("-")) {
      throw new UsageError(`Missing value for --${name}`);
    }
    flags.set(name, value);
    i += 1;
  }
  return { flags, bools };
}

class UsageError extends Error {}

function requestFromFlags(flags: Map<string, string>): InvestigationRequest {
  const repo = flags.get("repo");
  const pkg = flags.get("package");
  const version = flags.get("version");
  const from = flags.get("from");
  const to = flags.get("to");

  const missing = [
    ["--repo", repo],
    ["--package", pkg],
    ["--version", version],
    ["--from", from],
    ["--to", to],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    throw new UsageError(`Missing required option(s): ${missing.join(", ")}`);
  }

  const [owner, name] = repo!.split("/");
  if (!owner || !name) {
    throw new UsageError(`--repo must be <owner>/<name>, got "${repo}"`);
  }
  if (parseInstant(from!) === null) {
    throw new UsageError(`--from must be a UTC instant (e.g. 2026-05-11T19:26:14Z), got "${from}"`);
  }
  if (parseInstant(to!) === null) {
    throw new UsageError(`--to must be a UTC instant (e.g. 2026-05-11T22:13:38Z), got "${to}"`);
  }

  return {
    repository: { owner, name },
    lockfilePath: flags.get("lockfile") ?? "pnpm-lock.yaml",
    packageName: pkg!,
    version: version!,
    interval: { from: from!, to: to! },
    incidentSourceUrl: flags.get("incident-url") ?? "",
    ...(flags.get("service") ? { serviceNameFilter: flags.get("service") } : {}),
    ...(flags.get("job") ? { jobSelector: flags.get("job") } : {}),
    ...(flags.get("service-check") ? { serviceCheckName: flags.get("service-check") } : {}),
    ...(flags.get("env") ? { serviceEnvironmentLabel: flags.get("env") } : {}),
    mode: "cached-replay",
  };
}

function sameRequest(a: InvestigationRequest, b: InvestigationRequest): boolean {
  return (
    a.repository.owner === b.repository.owner &&
    a.repository.name === b.repository.name &&
    a.lockfilePath === b.lockfilePath &&
    a.packageName === b.packageName &&
    a.version === b.version &&
    a.interval.from === b.interval.from &&
    a.interval.to === b.interval.to
  );
}

/** Minimal structural validation of an untrusted `--evidence` bundle (Phase 6 boundary). */
function loadEvidenceFile(path: string): EvidenceBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new UsageError(`Could not read --evidence file "${path}": ${reason}`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new UsageError("--evidence must be a JSON object (EvidenceBundle).");
  }
  const e = parsed as Record<string, unknown>;
  if (typeof e.incident !== "object" || e.incident === null) {
    throw new UsageError("--evidence.incident is required.");
  }
  if (typeof e.packageVersion !== "object" || e.packageVersion === null) {
    throw new UsageError("--evidence.packageVersion is required.");
  }
  if (typeof e.historyComplete !== "boolean" || typeof e.serviceEvidenceComplete !== "boolean") {
    throw new UsageError("--evidence.historyComplete and .serviceEvidenceComplete (boolean) are required.");
  }
  return parsed as EvidenceBundle;
}

type Resolved =
  | { request: InvestigationRequest; live: true }
  | { request: InvestigationRequest; evidence: EvidenceBundle; live: false };

function resolve(args: Args): Resolved {
  const { flags, bools } = args;
  const hasRequestFlags = ["repo", "package", "version", "from", "to"].some((k) => flags.has(k));

  if (bools.has("live")) {
    const request = hasRequestFlags ? requestFromFlags(flags) : tanstackRequest;
    return { request, live: true };
  }

  const evidencePath = flags.get("evidence");
  if (evidencePath) {
    return { request: requestFromFlags(flags), evidence: loadEvidenceFile(evidencePath), live: false };
  }
  if (!hasRequestFlags) {
    return { request: tanstackRequest, evidence: tanstackEvidence, live: false };
  }
  const request = requestFromFlags(flags);
  if (sameRequest(request, tanstackRequest)) {
    return { request: { ...tanstackRequest, ...request }, evidence: tanstackEvidence, live: false };
  }
  throw new UsageError(
    "Without --live this build ships only the verified TanStack case as a built-in replay. " +
      "Pass --live to fetch evidence from GitHub, or --evidence <file.json> for a labelled bundle.",
  );
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const subcommand = argv[0];
  const args = parseArgs(argv);

  if (args.bools.has("help") || subcommand === undefined) {
    process.stdout.write(`${USAGE}\n`);
    return subcommand === undefined ? 2 : 0;
  }
  if (subcommand === "blast-radius") {
    const config = loadHydraDbConfig();
    const client = new HydraDbClient(config);
    if (!(await client.ready())) {
      process.stderr.write(`HydraDB is not reachable at ${config.adminUrl}. Run \`pnpm hydradb:up\` first.\n`);
      return 1;
    }
    const radius = await computeBlastRadius(client, ILLUSTRATIVE_REQUEST, ILLUSTRATIVE_BUNDLES);
    process.stderr.write(
      `[vurqel] blast-radius: ILLUSTRATIVE multi-service scenario (synthetic, not the verified TanStack case). ` +
        `exposed=${radius.exposed.length}/${radius.candidates} db=${config.httpUrl}\n`,
    );
    process.stdout.write(`${JSON.stringify(radius, null, args.bools.has("pretty") ? 2 : 0)}\n`);
    return 0;
  }
  if (subcommand !== "investigate") {
    process.stderr.write(`Unknown command "${subcommand}".\n\n${USAGE}\n`);
    return 2;
  }

  const resolved = resolve(args);
  const config = loadHydraDbConfig();
  const client = new HydraDbClient(config);

  if (!(await client.ready())) {
    process.stderr.write(
      `HydraDB is not reachable at ${config.adminUrl}. Run \`pnpm hydradb:up\` first.\n`,
    );
    return 1;
  }

  let evidence: EvidenceBundle;
  let mode: "online" | "cached-replay";
  if (resolved.live) {
    const collected = await collectEvidence(new GitHubClient(loadGitHubConfig()), resolved.request);
    evidence = collected.evidence;
    mode = collected.mode;
  } else {
    evidence = resolved.evidence;
    mode = "cached-replay";
  }

  const startedAt = Date.now();
  const result = await investigate(client, resolved.request, evidence, { mode });
  const durationMs = Date.now() - startedAt;

  // Observability (NFR-008): request id, state, reason, mode, timing — no secrets.
  process.stderr.write(
    `[vurqel] request=${result.receipt.requestId} state=${result.receipt.state} ` +
      `reason=${result.receipt.reasonCode} mode=${mode} pathNodes=${result.path?.nodes.length ?? 0} ` +
      `durationMs=${durationMs} db=${config.httpUrl}\n`,
  );

  const pretty = args.bools.has("pretty");
  process.stdout.write(`${JSON.stringify(result.receipt, null, pretty ? 2 : 0)}\n`);
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    if (err instanceof UsageError) {
      process.stderr.write(`${err.message}\n\n${USAGE}\n`);
      process.exitCode = 2;
      return;
    }
    if (err instanceof SourceError) {
      const tag = err.retryable ? "Retryable source error" : "Source error";
      process.stderr.write(`${tag} [${err.code}]: ${err.message}\n`);
      process.exitCode = 1;
      return;
    }
    if (err instanceof HydraDbError) {
      process.stderr.write(`HydraDB error [${err.code}]: ${err.message}\n`);
      process.exitCode = 1;
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Investigation failed: ${message}\n`);
    process.exitCode = 1;
  });
