/**
 * CP-003.1 unit tests for the deterministic pnpm-lockfile resolved-version
 * detector. Pure text logic, no network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { detectResolvedVersion } from "../src/sources/pnpm-lock.js";

const LOCK = [
  "packages:", // 1
  "  '@tanstack/react-router@1.169.8':", // 2 (affected)
  "    resolution: {integrity: sha512-aaa}", // 3
  "  '@tanstack/react-router@1.170.0':", // 4 (fixed)
  "    resolution: {integrity: sha512-bbb}", // 5
  "  react@18.3.1(redux@5.0.0):", // 6 (peer suffix, unquoted)
  "    resolution: {integrity: sha512-ccc}", // 7
].join("\n");

test("detects the exact affected version and reports its 1-based line", () => {
  const hit = detectResolvedVersion(LOCK, "@tanstack/react-router", "1.169.8");
  assert.equal(hit.resolved, true);
  assert.equal(hit.line, 2);
});

test("does not match a different (fixed) version", () => {
  assert.deepEqual(detectResolvedVersion(LOCK, "@tanstack/react-router", "9.9.9"), { resolved: false, line: null });
  // 1.170.0 is present but is not the affected version, so a query for it matches its own key only.
  assert.equal(detectResolvedVersion(LOCK, "@tanstack/react-router", "1.170.0").line, 4);
});

test("tolerates a peer-dependency suffix and unquoted keys", () => {
  const hit = detectResolvedVersion(LOCK, "react", "18.3.1");
  assert.equal(hit.resolved, true);
  assert.equal(hit.line, 6);
});

test("does not partial-match a longer version (1.169.8 vs 1.169.80)", () => {
  const text = "  '@tanstack/react-router@1.169.80':\n";
  assert.equal(detectResolvedVersion(text, "@tanstack/react-router", "1.169.8").resolved, false);
});
