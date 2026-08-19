/**
 * CLI output-contract regression tests.
 *
 * These guard the presentation redesign: the human UI (branding, spinners,
 * verdict, tables) must never leak into the machine channel. The contract:
 *   - STDOUT is the JSON artefact only — parseable, never carrying ANSI.
 *   - STDERR carries the human UI, gated on colour / --json / --quiet / --no-color.
 *   - The error path writes nothing to STDOUT.
 *
 * They spawn the real CLI (`node --import tsx src/cli.ts ...`) so the whole
 * stdout/stderr split and the terminal-detection logic are exercised end to end.
 * Requires a running HydraDB (integration suite): `pnpm run hydradb:up`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ANSI = /\x1b\[[0-9;?]*[a-zA-Z]/;

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

async function cli(args: string[], env: Record<string, string> = {}): Promise<Run> {
  try {
    const { stdout, stderr } = await run("node", ["--import", "tsx", "src/cli.ts", ...args], {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      maxBuffer: 8 * 1024 * 1024,
    });
    return { code: 0, stdout, stderr };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return {
      code: typeof err.code === "number" ? err.code : 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
    };
  }
}

test("cli --version prints the bare version to stdout, nothing to stderr", async () => {
  const { code, stdout, stderr } = await cli(["--version"]);
  assert.equal(code, 0);
  assert.equal(stdout, "vurqel 0.1.0\n");
  assert.equal(stderr, "");
});

test("cli investigate: stdout is a clean JSON receipt; the UI lands on stderr", async () => {
  const { code, stdout, stderr } = await cli(["investigate"]);
  assert.equal(code, 0);
  assert.doesNotMatch(stdout, ANSI, "stdout must never carry ANSI");
  const receipt = JSON.parse(stdout);
  assert.equal(receipt.state, "EXPOSED");
  assert.equal(receipt.reasonCode, "EXPOSED_SAME_SHA_PATH");
  assert.match(stderr, /vurqel/);
  assert.match(stderr, /EXPOSED/);
});

test("cli investigate --json: stderr is silent and stdout is JSON only", async () => {
  const { code, stdout, stderr } = await cli(["investigate", "--json"]);
  assert.equal(code, 0);
  assert.equal(stderr, "", "--json must silence the human channel");
  assert.doesNotMatch(stdout, ANSI);
  assert.equal(JSON.parse(stdout).state, "EXPOSED");
});

test("cli investigate --quiet: stderr is silent, stdout is still the receipt", async () => {
  const { code, stdout, stderr } = await cli(["investigate", "--quiet"]);
  assert.equal(code, 0);
  assert.equal(stderr, "");
  assert.equal(JSON.parse(stdout).state, "EXPOSED");
});

test("cli investigate --pretty: stdout is indented JSON that round-trips", async () => {
  const { code, stdout } = await cli(["investigate", "--pretty"]);
  assert.equal(code, 0);
  assert.match(stdout, /\n {2}"state": "EXPOSED"/);
  assert.equal(JSON.parse(stdout).state, "EXPOSED");
});

test("cli FORCE_COLOR colours stderr but never stdout", async () => {
  const { code, stdout, stderr } = await cli(["investigate"], { FORCE_COLOR: "1" });
  assert.equal(code, 0);
  assert.doesNotMatch(stdout, ANSI, "the machine channel must stay clean under FORCE_COLOR");
  assert.match(stderr, ANSI, "the human channel should carry colour under FORCE_COLOR");
  assert.equal(JSON.parse(stdout).state, "EXPOSED");
});

test("cli --no-color overrides FORCE_COLOR on both channels", async () => {
  const { code, stdout, stderr } = await cli(["investigate", "--no-color"], { FORCE_COLOR: "1" });
  assert.equal(code, 0);
  assert.doesNotMatch(stdout, ANSI);
  assert.doesNotMatch(stderr, ANSI, "--no-color must win over FORCE_COLOR");
  assert.equal(JSON.parse(stdout).state, "EXPOSED");
});

test("cli blast-radius --json: stdout parses, stderr silent (illustrative warning suppressed)", async () => {
  const { code, stdout, stderr } = await cli(["blast-radius", "--json"]);
  assert.equal(code, 0);
  assert.equal(stderr, "");
  const radius = JSON.parse(stdout);
  assert.equal(radius.candidates, 4);
  assert.equal(radius.exposed.length, 2);
});

test("cli surfaces a structured error when HydraDB is unreachable, with an empty stdout", async () => {
  // Point at a closed port so client.ready() fails fast rather than hitting the live node.
  const { code, stdout, stderr } = await cli(["investigate"], {
    HYDRADB_ADMIN_URL: "http://127.0.0.1:1",
    HYDRADB_HTTP_URL: "http://127.0.0.1:1",
  });
  assert.equal(code, 1);
  assert.equal(stdout, "", "the error path must not emit JSON");
  assert.match(stderr, /HydraDB is not running/);
  assert.match(stderr, /pnpm run hydradb:up/, "the error must tell the user how to fix it");
});

test("cli rejects an unknown command with a usage exit code", async () => {
  const { code, stdout, stderr } = await cli(["frobnicate"]);
  assert.equal(code, 2);
  assert.equal(stdout, "");
  assert.match(stderr, /Unknown command/);
});
