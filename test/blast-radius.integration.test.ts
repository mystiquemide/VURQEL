import { test } from "node:test";
import assert from "node:assert/strict";

import { loadHydraDbConfig } from "../src/config.js";
import { HydraDbClient } from "../src/hydradb/client.js";
import { computeBlastRadius, type ServiceOutcome } from "../src/blast-radius.js";
import { ILLUSTRATIVE_REQUEST, ILLUSTRATIVE_BUNDLES } from "../src/fixtures/blast-radius.js";

const names = (list: ServiceOutcome[]): string[] => list.map((o) => o.service).sort();

test("blast radius: confirmed exposed set is graph-native and excludes staging + unproven", async () => {
  const client = new HydraDbClient(loadHydraDbConfig());
  assert.ok(
    await client.ready(),
    "HydraDB is not reachable at HYDRADB_ADMIN_URL. Run `pnpm hydradb:up` first.",
  );

  const radius = await computeBlastRadius(client, ILLUSTRATIVE_REQUEST, ILLUSTRATIVE_BUNDLES, {
    generatedAt: "2026-07-01T10:00:00Z",
  });

  assert.equal(radius.candidates, 4);
  // Confirmed blast radius = only services with a complete same-SHA production path.
  assert.deepEqual(names(radius.exposed), ["acme-api", "acme-web"]);
  assert.deepEqual(names(radius.notExposed), ["acme-marketing"]);
  assert.deepEqual(names(radius.unproven), ["acme-legacy"]);

  // Every exposed service must be backed by a complete HydraDB path (fail-closed).
  assert.ok(radius.exposed.every((o) => o.pathComplete));
  assert.equal(radius.exposed.every((o) => o.state === "EXPOSED"), true);

  // The excluded ones carry the right reasons.
  assert.equal(radius.notExposed[0]?.reasonCode, "NOT_EXPOSED_NO_PRODUCTION_BUILD");
  assert.equal(radius.unproven[0]?.reasonCode, "UNPROVEN_SHA_MISMATCH");
  assert.equal(radius.unproven[0]?.pathComplete, false);
});
