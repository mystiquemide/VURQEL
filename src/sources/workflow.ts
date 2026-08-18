/**
 * Workflow frozen-install detection (Vurqel Phase 2, CP-003.2).
 *
 * The workflow file is untrusted text and is never executed. A "frozen install"
 * is the signal that CI resolved dependencies strictly from the committed
 * lockfile (so the lockfile entry is what actually got installed, BR-002).
 * We detect the common package-manager directives deterministically:
 *   - pnpm/yarn:  `--frozen-lockfile`
 *   - pnpm setup: `frozen-lockfile: true`
 *   - npm:        `npm ci`
 *   - yarn v2+:   `--immutable`
 */
const FROZEN_INSTALL = /--frozen-lockfile\b|frozen-lockfile:\s*true|npm\s+ci\b|--immutable\b/;

export function detectFrozenInstall(workflowText: string): boolean {
  return FROZEN_INSTALL.test(workflowText);
}
