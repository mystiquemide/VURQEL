#!/usr/bin/env node
/**
 * Vurqel CLI entry: `vurqel investigate ...` and `vurqel blast-radius`.
 *
 * Validates a bounded request (FR-001), resolves evidence as a labelled cached
 * replay (FR-012) or live GitHub, writes the typed graph to HydraDB, runs the
 * snapshot-scoped proof read, and prints the structured JSON receipt (FR-011).
 *
 * Output contract:
 *   - STDOUT is the machine artefact only: the JSON receipt / blast-radius result.
 *     Compact by default, pretty with --pretty. Never carries ANSI or decorations,
 *     so `vurqel investigate | jq` and redirects are safe.
 *   - STDERR carries the human UI (branding, progress, verdict), gated on TTY and
 *     NO_COLOR / FORCE_COLOR / --no-color / --quiet / --json.
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
import * as ui from "./ui/index.js";
import { runTui } from "./ui/tui.js";

const DOCS = "https://github.com/mystiquemide/vurqel";

interface Args {
  flags: Map<string, string>;
  bools: Set<string>;
}

class UsageError extends Error {}

function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string>();
  const bools = new Set<string>();
  const boolNames = new Set([
    "pretty", "help", "h", "live", "version", "V", "json", "quiet", "verbose", "no-color",
  ]);
  const alias: Record<string, string> = { h: "help", V: "version" };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (token === "--") continue; // ignore the `pnpm run x -- args` separator
    if (!token.startsWith("-")) continue; // subcommand / positional
    const name = token.replace(/^--?/, "");
    if (boolNames.has(name)) {
      bools.add(alias[name] ?? name);
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

function stdoutJson(value: unknown, pretty: boolean): void {
  process.stdout.write(`${JSON.stringify(value, null, pretty ? 2 : 0)}\n`);
}

function printHelp(): void {
  ui.help(
    [
      { name: "investigate", summary: "Prove exposure for one incident (verified case by default)" },
      { name: "blast-radius", summary: "Confirmed exposed services across a multi-service scenario" },
      { name: "tui", summary: "Interactive full-screen mode" },
    ],
    [
      { flag: "--live", summary: "Fetch evidence live from public GitHub" },
      { flag: "--pretty", summary: "Pretty-print the JSON receipt" },
      { flag: "--json", summary: "Machine JSON only, no decorations" },
      { flag: "--quiet", summary: "Suppress progress output" },
      { flag: "--no-color", summary: "Disable ANSI colour" },
      { flag: "--verbose", summary: "Show stack traces on error" },
      { flag: "-h, --help", summary: "Show this help" },
      { flag: "-V, --version", summary: "Show version" },
      { flag: "--repo <owner/name>", summary: "Target repository (with --live)" },
      { flag: "--package <name>", summary: "Affected package" },
      { flag: "--version <v>", summary: "Affected version" },
      { flag: "--from / --to <iso>", summary: "Incident window (UTC, half-open)" },
      { flag: "--job <name>", summary: "Named CI job whose conclusion decides" },
      { flag: "--service-check <name>", summary: "Production service-build check-run" },
    ],
    [
      "pnpm run investigate -- --pretty",
      "pnpm run investigate -- --live",
      "pnpm run blast-radius -- --pretty",
    ],
  );
}

async function investigateFlow(args: Args, verbose: boolean): Promise<number> {
  const resolved = resolve(args);
  const config = loadHydraDbConfig();
  const client = new HydraDbClient(config);
  const pretty = args.bools.has("pretty");
  const jsonMode = args.bools.has("json");

  ui.blank();
  ui.logo("temporal supply-chain exposure proof");
  ui.blank();
  ui.kv([
    ["Package", `${resolved.request.packageName}@${resolved.request.version}`],
    ["Window", `${resolved.request.interval.from} .. ${resolved.request.interval.to}`],
    ["Repository", `${resolved.request.repository.owner}/${resolved.request.repository.name}`],
    ["Source", resolved.live ? "live GitHub" : "cached replay"],
  ]);
  ui.blank();

  const readySpin = ui.spinner("Connecting to HydraDB");
  if (!(await client.ready())) {
    readySpin.fail("HydraDB unreachable");
    ui.errorBlock({
      title: "HydraDB is not running",
      cause: `The graph database could not be reached at ${config.adminUrl}.`,
      fix: "pnpm run hydradb:up",
      docs: `${DOCS}#install-and-run`,
    });
    return 1;
  }
  readySpin.succeed("HydraDB ready", config.httpUrl);

  let evidence: EvidenceBundle;
  let mode: "online" | "cached-replay";
  if (resolved.live) {
    const collectSpin = ui.spinner("Collecting evidence from public GitHub");
    try {
      const collected = await collectEvidence(new GitHubClient(loadGitHubConfig()), resolved.request);
      evidence = collected.evidence;
      mode = collected.mode;
    } catch (err) {
      collectSpin.fail("Evidence collection failed");
      throw err;
    }
    collectSpin.succeed("Evidence collected", mode);
  } else {
    evidence = resolved.evidence;
    mode = "cached-replay";
  }

  const proveSpin = ui.spinner("Proving on the graph");
  const startedAt = Date.now();
  let result: Awaited<ReturnType<typeof investigate>>;
  try {
    result = await investigate(client, resolved.request, evidence, { mode });
  } catch (err) {
    proveSpin.fail("Graph proof failed");
    throw err;
  }
  const durationMs = Date.now() - startedAt;
  const nodes = result.path?.nodes.length ?? 0;
  proveSpin.succeed(
    nodes > 0 ? `Path read (${nodes}/${result.graph.nodes.length} nodes)` : "Path read (no complete path)",
    result.receipt.snapshot?.bookmark,
  );

  const r = result.receipt;
  ui.verdict(r.state, r.reason);
  const facts: Array<[string, string]> = [];
  if (r.commitSha) facts.push(["Commit", r.commitSha.slice(0, 12)]);
  if (r.ciJob) facts.push(["CI job", `${r.ciJob.name} = ${r.ciJob.conclusion}`]);
  if (r.serviceBuild) facts.push(["Service", `${r.serviceBuild.service} · ${r.serviceBuild.environmentLabel}`]);
  facts.push(["Sources", `${r.sources.length} public links`]);
  facts.push(["Elapsed", `${durationMs} ms`]);
  ui.blank();
  ui.kv(facts, "     ");
  if (r.claimBoundary) {
    ui.blank();
    ui.step(r.claimBoundary);
  }
  if (!jsonMode) {
    ui.info("Full receipt (JSON) on stdout", "pipe to jq, or add --pretty");
  }
  ui.blank();

  stdoutJson(r, pretty);
  return 0;
}

async function blastRadiusFlow(args: Args): Promise<number> {
  const config = loadHydraDbConfig();
  const client = new HydraDbClient(config);
  const pretty = args.bools.has("pretty");

  ui.blank();
  ui.logo("blast radius");
  ui.blank();
  ui.warn("Illustrative synthetic scenario", "not the verified TanStack case");
  ui.blank();

  const readySpin = ui.spinner("Connecting to HydraDB");
  if (!(await client.ready())) {
    readySpin.fail("HydraDB unreachable");
    ui.errorBlock({
      title: "HydraDB is not running",
      cause: `The graph database could not be reached at ${config.adminUrl}.`,
      fix: "pnpm run hydradb:up",
      docs: `${DOCS}#install-and-run`,
    });
    return 1;
  }
  readySpin.succeed("HydraDB ready", config.httpUrl);

  const spin = ui.spinner(`Evaluating ${ILLUSTRATIVE_BUNDLES.length} candidate services`);
  const radius = await computeBlastRadius(client, ILLUSTRATIVE_REQUEST, ILLUSTRATIVE_BUNDLES);
  spin.succeed(`Evaluated ${radius.candidates} candidate services`);

  ui.section("Blast radius");
  const rows: string[][] = [
    ...radius.exposed.map((o) => [o.service, o.state, o.reasonCode]),
    ...radius.notExposed.map((o) => [o.service, o.state, o.reasonCode]),
    ...radius.unproven.map((o) => [o.service, o.state, o.reasonCode]),
  ];
  ui.table(["SERVICE", "VERDICT", "REASON"], rows);
  ui.blank();
  ui.info(`Confirmed exposed: ${radius.exposed.length} of ${radius.candidates}`);
  ui.blank();

  stdoutJson(radius, pretty);
  return 0;
}

function reportError(err: unknown, verbose: boolean): number {
  ui.restoreCursor();
  if (err instanceof UsageError) {
    ui.errorBlock({ title: err.message, fix: "vurqel --help", docs: DOCS });
    return 2;
  }
  if (err instanceof SourceError) {
    const parts: ui.ErrorParts = {
      title: err.retryable ? "GitHub source error (retryable)" : "GitHub source error",
      cause: `[${err.code}] ${err.message}`,
      docs: DOCS,
    };
    if (err.code === "rate_limited") parts.fix = "Set GITHUB_TOKEN to raise the anonymous 60/hour limit.";
    ui.errorBlock(parts);
    if (verbose && err.stack) process.stderr.write(`\n${err.stack}\n`);
    return 1;
  }
  if (err instanceof HydraDbError) {
    ui.errorBlock({
      title: "HydraDB error",
      cause: `[${err.code}] ${err.message}`,
      fix: "pnpm run hydradb:up",
      docs: DOCS,
    });
    if (verbose && err.stack) process.stderr.write(`\n${err.stack}\n`);
    return 1;
  }
  const message = err instanceof Error ? err.message : String(err);
  ui.errorBlock({ title: "Investigation failed", cause: message, docs: DOCS });
  if (verbose && err instanceof Error && err.stack) process.stderr.write(`\n${err.stack}\n`);
  return 1;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const subcommand = argv[0] !== undefined && !argv[0].startsWith("-") ? argv[0] : undefined;
  let verbose = false;
  try {
    const args = parseArgs(argv);
    ui.setNoColor(args.bools.has("no-color"));
    ui.setQuiet(args.bools.has("quiet") || args.bools.has("json"));
    ui.setSilent(args.bools.has("json"));
    verbose = args.bools.has("verbose");

    if (args.bools.has("version")) { ui.version(); return 0; }
    if (args.bools.has("help")) { printHelp(); return 0; }
    if (subcommand === undefined) { ui.welcome(); return 0; }
    if (subcommand === "tui") return await runTui();
    if (subcommand === "blast-radius") return await blastRadiusFlow(args);
    if (subcommand === "investigate") return await investigateFlow(args, verbose);

    ui.errorBlock({ title: `Unknown command: "${subcommand}"`, fix: "vurqel --help", docs: DOCS });
    return 2;
  } catch (err) {
    return reportError(err, verbose);
  }
}

process.on("SIGINT", () => {
  ui.restoreCursor();
  process.exit(130);
});

main().then((code) => {
  process.exitCode = code;
});
