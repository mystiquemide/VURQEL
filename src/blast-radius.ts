/**
 * Graph-native "blast radius" (Track 02A): given one compromised package and a
 * set of candidate services, return the confirmed exposed set.
 *
 * Each candidate is decided by the SAME fail-closed mechanism as a single
 * investigation: it is in the blast radius only when HydraDB returns a complete
 * same-SHA `Incident -> ... -> Service` path for it. Services that merely built,
 * built on a non-production label, or whose SHA does not line up are excluded
 * (NOT_EXPOSED) or flagged (UNPROVEN) rather than silently included. The blast
 * radius is therefore "which services provably shipped the bad version", not
 * "which services mention the package".
 *
 * All candidates share the Incident/PackageVersion nodes (deterministic ids), so
 * ingesting them builds one graph that fans out to N service branches.
 */
import type { HydraDbClient } from "./hydradb/client.js";
import { investigate } from "./investigate.js";
import type { EvidenceBundle, InvestigationRequest, ReceiptSnapshot, ResultState } from "./domain/schema.js";

export interface ServiceOutcome {
  service: string;
  provider: string;
  environmentLabel: string;
  state: ResultState;
  reasonCode: string;
  /** True only when HydraDB returned a complete same-SHA path for this service. */
  pathComplete: boolean;
}

export interface BlastRadius {
  package: { name: string; version: string };
  interval: { from: string; to: string };
  candidates: number;
  /** Confirmed blast radius: services with a complete same-SHA production path. */
  exposed: ServiceOutcome[];
  /** Complete evaluation, no eligible path (e.g. non-production, failed build). */
  notExposed: ServiceOutcome[];
  /** Cannot rule out: missing/contradictory evidence. Needs investigation. */
  unproven: ServiceOutcome[];
  snapshot?: ReceiptSnapshot;
  generatedAt: string;
}

/**
 * Ingest every candidate's provenance chain into HydraDB and classify each by the
 * completeness of its bounded path read. Returns the exposed/not-exposed/unproven
 * partition plus the last snapshot bookmark that answered.
 */
export async function computeBlastRadius(
  client: HydraDbClient,
  request: InvestigationRequest,
  bundles: EvidenceBundle[],
  options: { generatedAt?: string; cell?: string } = {},
): Promise<BlastRadius> {
  const outcomes: ServiceOutcome[] = [];
  let snapshot: ReceiptSnapshot | undefined;

  for (const bundle of bundles) {
    const result = await investigate(client, request, bundle, {
      mode: "cached-replay",
      ...(options.generatedAt ? { generatedAt: options.generatedAt } : {}),
      ...(options.cell ? { cell: options.cell } : {}),
    });
    const sb = bundle.serviceBuild;
    outcomes.push({
      service: sb?.service ?? "(no service build)",
      provider: sb?.provider ?? "(none)",
      environmentLabel: sb?.environmentLabel ?? "(none)",
      state: result.receipt.state,
      reasonCode: result.receipt.reasonCode,
      pathComplete: result.path !== null && result.path.nodes.length === result.graph.nodes.length,
    });
    if (result.receipt.snapshot) snapshot = result.receipt.snapshot;
  }

  const pv = bundles[0]?.packageVersion;
  return {
    package: { name: pv?.name ?? "", version: pv?.version ?? "" },
    interval: request.interval,
    candidates: bundles.length,
    exposed: outcomes.filter((o) => o.state === "EXPOSED"),
    notExposed: outcomes.filter((o) => o.state === "NOT_EXPOSED"),
    unproven: outcomes.filter((o) => o.state === "UNPROVEN"),
    ...(snapshot ? { snapshot } : {}),
    generatedAt: options.generatedAt ?? new Date().toISOString(),
  };
}
