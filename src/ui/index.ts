/**
 * Vurqel terminal UI — a zero-dependency presentation layer.
 *
 * Vurqel ships no runtime dependencies, so colours, symbols, spinners, panels
 * and tables are hand-rolled with ANSI/Unicode and degrade cleanly. Two hard
 * rules keep the CLI scriptable:
 *   1. This layer writes to STDERR only (the human channel). The machine
 *      artefact — the JSON receipt — is written to STDOUT by the CLI itself and
 *      is never touched here.
 *   2. Everything respects NO_COLOR / FORCE_COLOR / --no-color / --quiet / CI and
 *      non-TTY streams: no ANSI, no animation, no cursor codes when inappropriate.
 */

type WriteStream = NodeJS.WriteStream;

const ESC = "\x1b[";

let noColor = false;
let quiet = false;
let silent = false;

export function setNoColor(value: boolean): void {
  noColor = value;
}
export function setQuiet(value: boolean): void {
  quiet = value;
}
/** Machine mode (--json): suppress every human decoration on stderr, including warnings. Errors still surface. */
export function setSilent(value: boolean): void {
  silent = value;
}

function envTruthy(name: string): boolean {
  const v = process.env[name];
  return v !== undefined && v !== "" && v !== "0" && v.toLowerCase() !== "false";
}

export function colorEnabled(stream: WriteStream): boolean {
  if (noColor) return false;
  if (process.env.NO_COLOR !== undefined) return false;
  if (envTruthy("FORCE_COLOR")) return true;
  if (process.env.TERM === "dumb") return false;
  return Boolean(stream.isTTY);
}

function unicodeEnabled(): boolean {
  if (process.env.TERM === "linux" || process.env.TERM === "dumb") return false;
  const enc = `${process.env.LC_ALL ?? ""} ${process.env.LC_CTYPE ?? ""} ${process.env.LANG ?? ""}`.toUpperCase();
  if (enc.trim() !== "" && !enc.includes("UTF")) return false;
  return true;
}

function animatable(stream: WriteStream): boolean {
  if (!stream.isTTY) return false;
  if (process.env.CI !== undefined && !envTruthy("FORCE_COLOR")) return false;
  return colorEnabled(stream);
}

function widthOf(stream: WriteStream): number {
  return typeof stream.columns === "number" && stream.columns > 0 ? stream.columns : 80;
}

// --- style -----------------------------------------------------------------

interface Style {
  on: boolean;
  bold(s: string): string;
  dim(s: string): string;
  underline(s: string): string;
  red(s: string): string;
  green(s: string): string;
  yellow(s: string): string;
  cyan(s: string): string;
  gray(s: string): string;
  brand(s: string): string;
}

function makeStyle(on: boolean): Style {
  const wrap = (code: string) => (s: string): string => (on ? `${ESC}${code}m${s}${ESC}0m` : s);
  return {
    on,
    bold: wrap("1"),
    dim: wrap("2"),
    underline: wrap("4"),
    red: wrap("31"),
    green: wrap("32"),
    yellow: wrap("33"),
    cyan: wrap("36"),
    gray: wrap("90"),
    // Brand: bold + 256-colour rust (echoes the product accent); harmless on 16-colour terminals.
    brand: (s: string): string => (on ? `${ESC}1m${ESC}38;5;166m${s}${ESC}0m` : s),
  };
}

interface Symbols {
  ok: string;
  err: string;
  warn: string;
  info: string;
  active: string;
  inactive: string;
  arrow: string;
  bullet: string;
  spinner: readonly string[];
  box: { tl: string; tr: string; bl: string; br: string; h: string; v: string };
}

function makeSymbols(unicode: boolean): Symbols {
  if (unicode) {
    return {
      ok: "✓", err: "✗", warn: "!", info: "i", active: "●", inactive: "○",
      arrow: "❯", bullet: "·",
      spinner: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
      box: { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" },
    };
  }
  return {
    ok: "OK", err: "X", warn: "!", info: "i", active: "*", inactive: "o",
    arrow: ">", bullet: "-",
    spinner: ["-", "\\", "|", "/"],
    box: { tl: "+", tr: "+", bl: "+", br: "+", h: "-", v: "|" },
  };
}

// --- contexts (stderr for UI, stdout for docs) ------------------------------

interface Ctx {
  out: WriteStream;
  s: Style;
  sym: Symbols;
  width: number;
  anim: boolean;
}

const UNICODE = unicodeEnabled();

function ctxFor(stream: WriteStream): Ctx {
  return {
    out: stream,
    s: makeStyle(colorEnabled(stream)),
    sym: makeSymbols(UNICODE),
    width: widthOf(stream),
    anim: animatable(stream),
  };
}

const err = (): Ctx => ctxFor(process.stderr);
const out = (): Ctx => ctxFor(process.stdout);

/** Visible length of a string, ignoring ANSI escape codes. */
function vlen(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}
function padEnd(s: string, n: number): string {
  const pad = n - vlen(s);
  return pad > 0 ? s + " ".repeat(pad) : s;
}
function truncate(s: string, n: number): string {
  if (vlen(s) <= n) return s;
  if (n <= 1) return s.slice(0, Math.max(0, n));
  return `${s.slice(0, n - 1)}…`;
}

// --- primitives (STDERR) ----------------------------------------------------

export function blank(): void {
  if (quiet) return;
  process.stderr.write("\n");
}

/** Small branded wordmark: a provenance path resolving to a node. */
export function logo(subtitle?: string, version?: string): void {
  if (quiet) return;
  const c = err();
  const mark = UNICODE ? "◦──◦──◉" : "o--o--O";
  process.stderr.write(`  ${c.s.brand(mark)}  ${c.s.bold("vurqel")}\n`);
  if (subtitle) process.stderr.write(`  ${" ".repeat(vlen(mark))}  ${c.s.dim(subtitle)}\n`);
  if (version) process.stderr.write(`  ${" ".repeat(vlen(mark))}  ${c.s.dim(version)}\n`);
}

/** Aligned key/value block. */
export function kv(rows: ReadonlyArray<readonly [string, string]>, indent = "  "): void {
  if (quiet || rows.length === 0) return;
  const c = err();
  const keyW = Math.max(...rows.map(([k]) => k.length));
  for (const [k, v] of rows) {
    process.stderr.write(`${indent}${c.s.gray(padEnd(k, keyW))}   ${v}\n`);
  }
}

export function section(title: string): void {
  if (quiet) return;
  const c = err();
  process.stderr.write(`\n  ${c.s.bold(title)}\n`);
}

function statusLine(symbol: string, msg: string, detail?: string): void {
  const c = err();
  const tail = detail ? `  ${c.s.dim(detail)}` : "";
  process.stderr.write(`  ${symbol} ${msg}${tail}\n`);
}
export function step(msg: string, detail?: string): void {
  if (quiet) return;
  statusLine(err().s.dim(err().sym.bullet), msg, detail);
}
export function success(msg: string, detail?: string): void {
  if (quiet) return;
  const c = err();
  statusLine(c.s.green(c.sym.ok), msg, detail);
}
export function info(msg: string, detail?: string): void {
  if (quiet) return;
  const c = err();
  statusLine(c.s.cyan(c.sym.info), msg, detail);
}
export function warn(msg: string, detail?: string): void {
  // Warnings are shown even in --quiet (they carry meaning), but not in --json machine mode.
  if (silent) return;
  const c = err();
  statusLine(c.s.yellow(c.sym.warn), c.s.yellow(msg), detail);
}

/** A subtle bordered panel. Used sparingly. */
export function panel(title: string, rows: ReadonlyArray<readonly [string, string]>): void {
  if (quiet) return;
  const c = err();
  const keyW = Math.max(...rows.map(([k]) => k.length));
  const bodies = rows.map(([k, v]) => `${c.s.gray(padEnd(k, keyW))}   ${v}`);
  const inner = Math.min(
    Math.max(vlen(title) + 2, ...bodies.map(vlen)) + 2,
    Math.max(20, c.width - 4),
  );
  const b = c.sym.box;
  const top = `  ${b.tl}${b.h} ${c.s.bold(title)} ${b.h.repeat(Math.max(0, inner - vlen(title) - 3))}${b.tr}`;
  process.stderr.write(`${top}\n`);
  for (const body of bodies) {
    process.stderr.write(`  ${b.v} ${padEnd(body, inner - 1)}${b.v}\n`);
  }
  process.stderr.write(`  ${b.bl}${b.h.repeat(inner)}${b.br}\n`);
}

/** Verdict treatment: EXPOSED (alert) / NOT_EXPOSED (clear) / UNPROVEN (caution). */
export function verdict(state: string, reason: string): void {
  if (quiet) return;
  const c = err();
  let sym = c.sym.info;
  let paint = (s: string): string => s;
  if (state === "EXPOSED") { sym = c.sym.err; paint = (s) => c.s.bold(c.s.red(s)); }
  else if (state === "NOT_EXPOSED") { sym = c.sym.ok; paint = (s) => c.s.bold(c.s.green(s)); }
  else if (state === "UNPROVEN") { sym = c.sym.warn; paint = (s) => c.s.bold(c.s.yellow(s)); }
  process.stderr.write(`\n  ${paint(`${sym}  ${state}`)}\n`);
  process.stderr.write(`     ${c.s.dim(reason)}\n`);
}

/** Column table with responsive truncation. Readable without colour. */
export function table(
  headers: readonly string[],
  rows: ReadonlyArray<readonly string[]>,
): void {
  if (quiet) return;
  const c = err();
  const cols = headers.length;
  const widths = headers.map((h, i) =>
    Math.max(vlen(h), ...rows.map((r) => vlen(r[i] ?? ""))),
  );
  // Shrink to terminal width if needed.
  const gap = 2;
  const budget = c.width - 4 - gap * (cols - 1);
  let total = widths.reduce((a, b) => a + b, 0);
  while (total > budget && Math.max(...widths) > 6) {
    const idx = widths.indexOf(Math.max(...widths));
    widths[idx] = (widths[idx] ?? 0) - 1;
    total -= 1;
  }
  const render = (cells: readonly string[], paint: (s: string) => string): void => {
    const line = cells
      .map((cell, i) => padEnd(truncate(cell, widths[i] ?? 0), widths[i] ?? 0))
      .join(" ".repeat(gap));
    process.stderr.write(`  ${paint(line)}\n`);
  };
  render(headers, (s) => c.s.gray(s));
  for (const r of rows) render(r, (s) => s);
}

// --- spinner (STDERR) -------------------------------------------------------

export interface Spin {
  update(text: string): void;
  succeed(text?: string, detail?: string): void;
  fail(text?: string, detail?: string): void;
  stop(): void;
}

export function spinner(text: string): Spin {
  const c = err();
  let current = text;

  if (quiet) {
    return { update() {}, succeed() {}, fail() {}, stop() {} };
  }
  if (!c.anim) {
    // Non-animated: one line now, resolve with a symbol later.
    process.stderr.write(`  ${c.s.dim(c.sym.bullet)} ${current}\n`);
    return {
      update(t) { current = t; },
      succeed(t, d) { statusLine(c.s.green(c.sym.ok), t ?? current, d); },
      fail(t, d) { statusLine(c.s.red(c.sym.err), t ?? current, d); },
      stop() {},
    };
  }

  let i = 0;
  process.stderr.write("\x1b[?25l"); // hide cursor
  const draw = (): void => {
    const frame = c.sym.spinner[i % c.sym.spinner.length] ?? c.sym.bullet;
    process.stderr.write(`\r${ESC}2K  ${c.s.cyan(frame)} ${current}`);
  };
  draw();
  const timer = setInterval(() => { i += 1; draw(); }, 80);
  const clear = (): void => {
    clearInterval(timer);
    process.stderr.write(`\r${ESC}2K\x1b[?25h`);
  };
  return {
    update(t) { current = t; },
    succeed(t, d) { clear(); statusLine(c.s.green(c.sym.ok), t ?? current, d); },
    fail(t, d) { clear(); statusLine(c.s.red(c.sym.err), t ?? current, d); },
    stop() { clear(); },
  };
}

/** Restore the cursor if a spinner was interrupted (SIGINT). */
export function restoreCursor(): void {
  if (process.stderr.isTTY) process.stderr.write("\x1b[?25h");
}

// --- structured error (STDERR) ---------------------------------------------

export interface ErrorParts {
  title: string;
  cause?: string;
  fix?: string;
  docs?: string;
}

export function errorBlock(parts: ErrorParts): void {
  const c = err();
  process.stderr.write(`\n  ${c.s.red(`${c.sym.err} ${c.s.bold(parts.title)}`)}\n`);
  if (parts.cause) process.stderr.write(`\n  ${c.s.gray("Why")}\n  ${parts.cause}\n`);
  if (parts.fix) process.stderr.write(`\n  ${c.s.gray("Fix")}\n  ${c.s.cyan(parts.fix)}\n`);
  if (parts.docs) process.stderr.write(`\n  ${c.s.gray("Docs")}\n  ${c.s.underline(parts.docs)}\n`);
  process.stderr.write("\n");
}

// --- docs / help / version / welcome (STDOUT) -------------------------------

const DOCS = "https://github.com/mystiquemide/vurqel";
const VERSION = "0.1.0";

export function version(): void {
  process.stdout.write(`vurqel ${VERSION}\n`);
}

interface CommandDoc { name: string; summary: string }
interface OptionDoc { flag: string; summary: string }

export function help(commands: readonly CommandDoc[], options: readonly OptionDoc[], examples: readonly string[]): void {
  const c = out();
  const w = process.stdout;
  const mark = UNICODE ? "◦──◦──◉" : "o--o--O";
  w.write(`\n  ${c.s.brand(mark)}  ${c.s.bold("vurqel")}  ${c.s.dim(`v${VERSION}`)}\n`);
  w.write(`  ${" ".repeat(vlen(mark))}  ${c.s.dim("temporal supply-chain exposure proof")}\n\n`);
  w.write(`  ${c.s.bold("Usage")}\n    ${c.s.cyan("vurqel")} <command> [options]\n\n`);

  const cw = Math.max(...commands.map((x) => x.name.length));
  w.write(`  ${c.s.bold("Commands")}\n`);
  for (const cmd of commands) {
    w.write(`    ${c.s.cyan(padEndPlain(cmd.name, cw))}   ${cmd.summary}\n`);
  }
  const ow = Math.max(...options.map((x) => x.flag.length));
  w.write(`\n  ${c.s.bold("Options")}\n`);
  for (const opt of options) {
    w.write(`    ${padEndPlain(opt.flag, ow)}   ${c.s.dim(opt.summary)}\n`);
  }
  w.write(`\n  ${c.s.bold("Examples")}\n`);
  for (const ex of examples) {
    w.write(`    ${c.s.dim("$")} ${c.s.cyan(ex)}\n`);
  }
  w.write(`\n  ${c.s.bold("Learn more")}\n    ${c.s.underline(DOCS)}\n\n`);
}

export function welcome(): void {
  const c = out();
  const w = process.stdout;
  const mark = UNICODE ? "◦──◦──◉" : "o--o--O";
  w.write(`\n  ${c.s.brand(mark)}  ${c.s.bold("vurqel")}  ${c.s.dim(`v${VERSION}`)}\n`);
  w.write(`  ${" ".repeat(vlen(mark))}  ${c.s.dim("temporal supply-chain exposure proof")}\n\n`);
  w.write(`  Prove which historical builds shipped a compromised package while it was live —\n`);
  w.write(`  ${c.s.bold("EXPOSED")}, ${c.s.bold("NOT_EXPOSED")}, or ${c.s.bold("UNPROVEN")}. Never a guess.\n\n`);
  w.write(`  ${c.s.bold("Get started")}\n`);
  w.write(`    ${c.s.dim("$")} ${c.s.cyan("pnpm run hydradb:up")}                 ${c.s.dim("# start the pinned HydraDB node")}\n`);
  w.write(`    ${c.s.dim("$")} ${c.s.cyan("pnpm run investigate -- --pretty")}    ${c.s.dim("# prove the verified case")}\n`);
  w.write(`    ${c.s.dim("$")} ${c.s.cyan("vurqel --help")}                       ${c.s.dim("# all commands")}\n\n`);
  w.write(`  ${c.s.bold("Docs")}\n    ${c.s.underline(DOCS)}\n\n`);
}

// help/version/welcome build their own padding on plain (uncoloured) text.
function padEndPlain(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}
