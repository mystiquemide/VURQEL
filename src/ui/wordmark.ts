/**
 * VURQEL wordmark for the interactive TUI, in the figlet "ANSI Shadow" style.
 *
 * Generated once with pyfiglet and baked in as static strings — Vurqel ships no
 * runtime dependencies, so nothing generates this at run time. It uses Unicode
 * block-drawing glyphs; callers must fall back to the compact wordmark when the
 * terminal lacks Unicode or is narrower than WORDMARK_WIDTH.
 */
export const WORDMARK_WIDTH = 51;

export const WORDMARK_LINES: readonly string[] = [
  "██╗   ██╗██╗   ██╗██████╗  ██████╗ ███████╗██╗",
  "██║   ██║██║   ██║██╔══██╗██╔═══██╗██╔════╝██║",
  "██║   ██║██║   ██║██████╔╝██║   ██║█████╗  ██║",
  "╚██╗ ██╔╝██║   ██║██╔══██╗██║▄▄ ██║██╔══╝  ██║",
  " ╚████╔╝ ╚██████╔╝██║  ██║╚██████╔╝███████╗███████╗",
  "  ╚═══╝   ╚═════╝ ╚═╝  ╚═╝ ╚══▀▀═╝ ╚══════╝╚══════╝",
];
