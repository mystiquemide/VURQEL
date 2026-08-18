/**
 * Deterministic pnpm-lockfile inspection (Vurqel Phase 2).
 *
 * The lockfile is treated as untrusted text and is never executed. pnpm v9
 * lockfiles key each resolved package as a top-level entry under `packages:`
 * / `snapshots:` of the form:
 *
 *     '@tanstack/react-router@1.169.8':
 *
 * The presence of that exact `name@version:` key is a precise signal that the
 * affected version is resolved in this lockfile. We scan for it line by line
 * (rather than a full YAML parse) so the check is dependency-free, fast on
 * large lockfiles, and reports the exact source line as evidence.
 */

export interface ResolvedVersionHit {
  resolved: boolean;
  /** 1-based line of the resolved package key, or null when not resolved. */
  line: number | null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Detect whether `name@version` is resolved as a package key in the lockfile.
 * Matches an optionally single-quoted key at any indentation, tolerating a
 * trailing peer-dependency suffix (e.g. `pkg@1.2.3(react@18)`).
 */
export function detectResolvedVersion(lockfileText: string, name: string, version: string): ResolvedVersionHit {
  const key = `${name}@${version}`;
  // e.g.  '@tanstack/react-router@1.169.8':   or   pkg@1.2.3(peer@1):
  const pattern = new RegExp(`^\\s*'?${escapeRegExp(key)}'?(\\([^)]*\\))*:`);
  const lines = lockfileText.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (pattern.test(lines[i]!)) return { resolved: true, line: i + 1 };
  }
  return { resolved: false, line: null };
}
