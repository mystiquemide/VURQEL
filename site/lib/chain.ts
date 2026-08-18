import type { EvidenceBundle } from "./schema";
import type { VerifiedHops } from "./evaluate";

/** The eight provenance nodes, in order. */
export const CHAIN_NODES = [
  "Incident",
  "Package",
  "Lockfile",
  "Commit",
  "Workflow Run",
  "CI Job",
  "Service Build",
  "Service",
] as const;

export interface Hop {
  index: string;
  edge: string;
  rule: string;
  note: string;
  key: keyof VerifiedHops;
}

/** The seven typed hops. Each maps to a verified flag from the evaluator. */
export const HOPS: Hop[] = [
  { index: "01", edge: "AFFECTS", rule: "The incident names the exact affected package and version.", note: "same package @ version", key: "affects" },
  { index: "02", edge: "RESOLVED_BY", rule: "A lockfile snapshot resolves that exact version.", note: "lockfile entry alone is not proof", key: "resolvedBy" },
  { index: "03", edge: "AT_COMMIT", rule: "The lockfile sits at an immutable commit inside the live window.", note: "same-SHA join · half-open [from, to)", key: "atCommit" },
  { index: "04", edge: "TRIGGERS", rule: "A workflow run exists on that same commit.", note: "run head SHA = commit SHA", key: "triggers" },
  { index: "05", edge: "HAS_JOB", rule: "A frozen-lockfile install and a successful named job on that SHA.", note: "the named job decides, not the run", key: "hasJob" },
  { index: "06", edge: "PRODUCES", rule: "A same-SHA service build succeeded.", note: "check-run success on the SHA", key: "produces" },
  { index: "07", edge: "TARGETS", rule: "That build is production-labelled.", note: "environment = production", key: "targets" },
];

export interface BreakToggle {
  id: string;
  label: string;
  hint: string;
  /** Mutate a cloned evidence bundle into its broken state. */
  apply: (e: EvidenceBundle) => void;
}

/** Real conditions a visitor can break on the verified case. Default = all intact = EXPOSED. */
export const BREAK_TOGGLES: BreakToggle[] = [
  {
    id: "sha",
    label: "Named job on the same commit SHA",
    hint: "Break it → SHA mismatch → UNPROVEN",
    apply: (e) => {
      if (e.job) e.job.headSha = "0000000000000000000000000000000000000000";
    },
  },
  {
    id: "frozen",
    label: "Frozen-lockfile install in CI",
    hint: "Break it → a lockfile entry alone is not proof → UNPROVEN",
    apply: (e) => {
      if (e.workflow) e.workflow.frozenInstall = false;
    },
  },
  {
    id: "jobok",
    label: "Named job succeeded",
    hint: "Break it → the build did not succeed → NOT_EXPOSED",
    apply: (e) => {
      if (e.job) e.job.conclusion = "failure";
    },
  },
  {
    id: "prod",
    label: "Production-labelled service build",
    hint: "Break it → not production → NOT_EXPOSED",
    apply: (e) => {
      if (e.serviceBuild) e.serviceBuild.environmentLabel = "preview";
    },
  },
];
