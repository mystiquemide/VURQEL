/**
 * Vurqel interactive mode — a zero-dependency full-screen TUI.
 *
 * This is the "takes over the terminal" experience: it enters the alternate
 * screen buffer, reads keystrokes in raw mode, and drives the same domain logic
 * the scriptable commands use (investigate / computeBlastRadius). On exit it
 * restores the terminal exactly as it was, so nothing pollutes scrollback.
 *
 * It shares the design tokens in ./index.ts (colours, symbols, wordmark) so the
 * interactive and single-shot experiences look like one product. It runs ONLY on
 * an interactive TTY; piped / CI / non-TTY invocations are refused so the machine
 * output contract is never touched.
 */
import { loadHydraDbConfig } from "../config.js";
import { HydraDbClient } from "../hydradb/client.js";
import { investigate } from "../investigate.js";
import { computeBlastRadius, type ServiceOutcome } from "../blast-radius.js";
import { tanstackRequest, tanstackEvidence } from "../fixtures/tanstack.js";
import { ILLUSTRATIVE_REQUEST, ILLUSTRATIVE_BUNDLES } from "../fixtures/blast-radius.js";
import { makeStyle, makeSymbols, unicodeEnabled, colorEnabled } from "./index.js";
import { WORDMARK_LINES, WORDMARK_WIDTH } from "./wordmark.js";

const OUT = process.stdout;
const UNICODE = unicodeEnabled();
const s = makeStyle(colorEnabled(OUT));
const sym = makeSymbols(UNICODE);
const MARK = UNICODE ? "◦──◦──◉" : "o--o--O";

// --- terminal control -------------------------------------------------------

function enterAlt(): void {
  OUT.write("\x1b[?1049h\x1b[?25l\x1b[2J\x1b[H"); // alt screen, hide cursor, clear, home
}
function leaveAlt(): void {
  OUT.write("\x1b[?25h\x1b[?1049l"); // show cursor, leave alt screen
}
function clear(): void {
  OUT.write("\x1b[2J\x1b[H");
}
function w(line = ""): void {
  OUT.write(`${line}\n`);
}

// --- key input --------------------------------------------------------------

type Key = "up" | "down" | "enter" | "quit" | "other";

function decodeKey(data: string): Key {
  if (data === "\x03" || data === "q" || data === "\x1b") return "quit"; // Ctrl-C / q / Esc
  if (data === "\x1b[A" || data === "k") return "up";
  if (data === "\x1b[B" || data === "j") return "down";
  if (data === "\r" || data === "\n") return "enter";
  return "other";
}

function readKey(): Promise<Key> {
  return new Promise((resolve) => {
    const onData = (chunk: string): void => {
      process.stdin.off("data", onData);
      resolve(decodeKey(chunk));
    };
    process.stdin.on("data", onData);
  });
}

// --- shared chrome ----------------------------------------------------------

function header(subtitle: string): void {
  w();
  w(`  ${s.brand(MARK)}  ${s.bold("vurqel")}  ${s.dim("v0.1.0")}`);
  w(`  ${" ".repeat(MARK.length)}  ${s.dim(subtitle)}`);
}

/** The splash logo for the home menu: full block wordmark, or the compact line when narrow / no Unicode. */
function heroHeader(subtitle: string): void {
  const width = typeof OUT.columns === "number" && OUT.columns > 0 ? OUT.columns : 80;
  if (!UNICODE || width < WORDMARK_WIDTH + 4) {
    header(subtitle);
    return;
  }
  w();
  for (const line of WORDMARK_LINES) w(`  ${s.brand(line)}`);
  w();
  w(`  ${s.dim(subtitle)}   ${s.dim("·")}   ${s.dim("v0.1.0")}`);
}

function footer(hint: string): void {
  w();
  w(`  ${s.dim(hint)}`);
}

function verdictBlock(state: string, reason: string): void {
  let symbol = sym.info;
  let paint = (x: string): string => x;
  if (state === "EXPOSED") { symbol = sym.err; paint = (x) => s.bold(s.red(x)); }
  else if (state === "NOT_EXPOSED") { symbol = sym.ok; paint = (x) => s.bold(s.green(x)); }
  else if (state === "UNPROVEN") { symbol = sym.warn; paint = (x) => s.bold(s.yellow(x)); }
  w();
  w(`  ${paint(`${symbol}  ${state}`)}`);
  w(`     ${s.dim(reason)}`);
}

function kvBlock(rows: ReadonlyArray<readonly [string, string]>, indent = "     "): void {
  if (rows.length === 0) return;
  const keyW = Math.max(...rows.map(([k]) => k.length));
  w();
  for (const [k, v] of rows) {
    w(`${indent}${s.gray(k.padEnd(keyW))}   ${v}`);
  }
}

function tableBlock(headers: readonly string[], rows: ReadonlyArray<readonly string[]>): void {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const line = (cells: readonly string[], paint: (x: string) => string): void => {
    const rendered = cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ");
    w(`  ${paint(rendered)}`);
  };
  line(headers, (x) => s.gray(x));
  for (const r of rows) line(r, (x) => x);
}

/** A spinner that redraws a single-line "working" screen until stopped. */
function startWorking(label: string): () => void {
  let i = 0;
  const draw = (): void => {
    clear();
    header("temporal supply-chain exposure proof");
    const frame = sym.spinner[i % sym.spinner.length] ?? sym.bullet;
    w();
    w(`  ${s.cyan(frame)} ${label}`);
  };
  draw();
  const timer = setInterval(() => { i += 1; draw(); }, 80);
  return () => clearInterval(timer);
}

async function pause(hint = `press any key to return  ${sym.bullet}  q to quit`): Promise<Key> {
  footer(hint);
  return readKey();
}

// --- screens ----------------------------------------------------------------

async function runInvestigate(): Promise<void> {
  const client = new HydraDbClient(loadHydraDbConfig());
  const working = startWorking("Connecting to HydraDB…");
  if (!(await client.ready())) {
    working();
    await dbDownScreen();
    return;
  }
  const startedAt = Date.now();
  let receipt;
  let nodes = 0;
  let total = 0;
  try {
    const result = await investigate(client, tanstackRequest, tanstackEvidence, { mode: "cached-replay" });
    receipt = result.receipt;
    nodes = result.path?.nodes.length ?? 0;
    total = result.graph.nodes.length;
  } catch (err) {
    working();
    await exceptionScreen("Graph proof failed", err);
    return;
  } finally {
    working();
  }
  const durationMs = Date.now() - startedAt;

  clear();
  header("verified TanStack case  ·  cached replay");
  w();
  w(`  ${s.green(sym.ok)} Path read (${nodes}/${total} nodes)`);
  verdictBlock(receipt.state, receipt.reason);
  const facts: Array<[string, string]> = [];
  if (receipt.commitSha) facts.push(["Commit", receipt.commitSha.slice(0, 12)]);
  if (receipt.ciJob) facts.push(["CI job", `${receipt.ciJob.name} = ${receipt.ciJob.conclusion}`]);
  if (receipt.serviceBuild) facts.push(["Service", `${receipt.serviceBuild.service} · ${receipt.serviceBuild.environmentLabel}`]);
  facts.push(["Sources", `${receipt.sources.length} public links`]);
  facts.push(["Elapsed", `${durationMs} ms`]);
  if (receipt.snapshot) facts.push(["Snapshot", receipt.snapshot.bookmark]);
  kvBlock(facts);
  w();
  w(`  ${s.dim(receipt.claimBoundary)}`);
  await pause();
}

async function runBlastRadius(): Promise<void> {
  const client = new HydraDbClient(loadHydraDbConfig());
  const working = startWorking("Connecting to HydraDB…");
  if (!(await client.ready())) {
    working();
    await dbDownScreen();
    return;
  }
  let radius;
  try {
    radius = await computeBlastRadius(client, ILLUSTRATIVE_REQUEST, ILLUSTRATIVE_BUNDLES);
  } catch (err) {
    working();
    await exceptionScreen("Blast-radius evaluation failed", err);
    return;
  } finally {
    working();
  }

  clear();
  header("blast radius  ·  illustrative synthetic scenario");
  w();
  w(`  ${s.yellow(sym.warn)} ${s.yellow("Illustrative scenario — not the verified TanStack case")}`);
  const toRow = (o: ServiceOutcome): string[] => [o.service, o.state, o.reasonCode];
  const rows: string[][] = [
    ...radius.exposed.map(toRow),
    ...radius.notExposed.map(toRow),
    ...radius.unproven.map(toRow),
  ];
  w();
  tableBlock(["SERVICE", "VERDICT", "REASON"], rows);
  w();
  w(`  ${s.cyan(sym.info)} Confirmed exposed: ${s.bold(String(radius.exposed.length))} of ${radius.candidates}`);
  await pause();
}

async function aboutScreen(): Promise<void> {
  clear();
  header("temporal supply-chain exposure proof");
  w();
  w(`  Vurqel proves which historical builds shipped a compromised package while it`);
  w(`  was live — down to the commit, the frozen-lockfile CI job, and the`);
  w(`  production-labelled service build.`);
  w();
  w(`  ${s.bold(s.red(`${sym.err} EXPOSED`))}      a complete same-SHA path from incident to a production build`);
  w(`  ${s.bold(s.green(`${sym.ok} NOT_EXPOSED`))}  a complete chain with no matching path`);
  w(`  ${s.bold(s.yellow(`${sym.warn} UNPROVEN`))}     missing or contradictory evidence — never a guess`);
  w();
  w(`  ${s.gray("Claim boundary")}`);
  w(`  Proves build provenance only. Does NOT prove malware execution, credential`);
  w(`  theft, or end-user traffic.`);
  await pause();
}

async function dbDownScreen(): Promise<void> {
  const config = loadHydraDbConfig();
  clear();
  header("temporal supply-chain exposure proof");
  w();
  w(`  ${s.red(`${sym.err} ${s.bold("HydraDB is not running")}`)}`);
  w();
  w(`  ${s.gray("Why")}`);
  w(`  The graph database could not be reached at ${config.adminUrl}.`);
  w();
  w(`  ${s.gray("Fix")}`);
  w(`  ${s.cyan("pnpm run hydradb:up")}   ${s.dim("(run in another terminal, then retry)")}`);
  await pause();
}

async function exceptionScreen(title: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  clear();
  header("temporal supply-chain exposure proof");
  w();
  w(`  ${s.red(`${sym.err} ${s.bold(title)}`)}`);
  w();
  w(`  ${s.gray("Why")}`);
  w(`  ${message}`);
  await pause();
}

// --- menu loop --------------------------------------------------------------

interface MenuItem {
  label: string;
  desc: string;
  run?: () => Promise<void>;
}

const MENU: MenuItem[] = [
  {
    label: "Investigate the verified case",
    desc: "Replay the real TanStack incident and prove its exposure on the graph.",
    run: runInvestigate,
  },
  {
    label: "Blast radius across services",
    desc: "Illustrative scan — which of several services provably shipped the package.",
    run: runBlastRadius,
  },
  {
    label: "About & claim boundary",
    desc: "What Vurqel proves, and what it deliberately does not.",
    run: aboutScreen,
  },
  {
    label: "Quit",
    desc: "Leave the interactive session.",
  },
];

type DbStatus = "checking" | "ready" | "down";

async function probeDb(): Promise<DbStatus> {
  try {
    return (await new HydraDbClient(loadHydraDbConfig()).ready()) ? "ready" : "down";
  } catch {
    return "down";
  }
}

function renderMenu(index: number, db: DbStatus): void {
  clear();
  heroHeader("temporal supply-chain exposure proof");
  w();
  // HydraDB is the one prerequisite — say so plainly so a first-timer knows what to do.
  if (db === "ready") {
    w(`  ${s.gray("HydraDB")}   ${s.green(sym.active)} ${s.dim("ready")}`);
  } else if (db === "down") {
    w(`  ${s.gray("HydraDB")}   ${s.yellow(`${sym.warn} not running`)}   ${s.gray("start it:")} ${s.cyan("pnpm run hydradb:up")}`);
  } else {
    w(`  ${s.gray("HydraDB")}   ${s.dim(`${sym.bullet} checking…`)}`);
  }
  w();
  w(`  ${s.bold("What do you want to prove?")}`);
  w();
  MENU.forEach((item, i) => {
    const active = i === index;
    const pointer = active ? s.brand(sym.arrow) : " ";
    const dot = active ? s.brand(sym.active) : s.dim(sym.inactive);
    const label = active ? s.bold(item.label) : item.label;
    w(`  ${pointer} ${dot} ${label}`);
  });
  // One-line explanation of the highlighted item — orientation for a new user.
  const current = MENU[index];
  w();
  w(`  ${s.dim(current ? current.desc : "")}`);
  const move = UNICODE ? "↑/↓" : "up/down";
  footer(`${move} move  ${sym.bullet}  enter select  ${sym.bullet}  q quit`);
}

async function menuLoop(): Promise<void> {
  let index = 0;
  renderMenu(index, "checking"); // paint immediately, then resolve the probe
  let db = await probeDb();
  for (;;) {
    renderMenu(index, db);
    const key = await readKey();
    if (key === "quit") return;
    if (key === "up") index = (index - 1 + MENU.length) % MENU.length;
    else if (key === "down") index = (index + 1) % MENU.length;
    else if (key === "enter") {
      const item = MENU[index];
      if (!item || !item.run) return; // Quit
      await item.run();
      db = await probeDb(); // they may have started HydraDB in another terminal
    }
  }
}

// --- entry point ------------------------------------------------------------

export async function runTui(): Promise<number> {
  if (!process.stdin.isTTY || !OUT.isTTY) {
    process.stderr.write(
      "vurqel tui needs an interactive terminal. For scriptable output use `vurqel investigate`.\n",
    );
    return 1;
  }
  const stdin = process.stdin;
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  enterAlt();
  try {
    await menuLoop();
    return 0;
  } finally {
    try { stdin.setRawMode(false); } catch { /* stream may already be closed */ }
    stdin.pause();
    leaveAlt();
  }
}
