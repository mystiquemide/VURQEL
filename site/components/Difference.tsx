import { Reveal } from "./Reveal";

const ROWS: { alt: string; does: string; diff: string }[] = [
  {
    alt: "npm audit / Dependabot",
    does: "Flags that a version is present or vulnerable.",
    diff: "Proves a specific historical build resolved it during the window, or says UNPROVEN.",
  },
  {
    alt: "CVE / advisory dashboards",
    does: "Track advisories and package metadata.",
    diff: "Ties one incident to one repository's commit, CI job, and production build, with source links.",
  },
  {
    alt: "SBOM scanners",
    does: "Enumerate the dependencies inside an artifact.",
    diff: "Correlates lockfile, frozen-install CI, and a same-SHA production build into one path.",
  },
  {
    alt: "Reading the CI badge",
    does: "Trusts the overall run's colour.",
    diff: "Uses the named job's own conclusion, so a red matrix cannot hide a green build.",
  },
];

export function Difference() {
  return (
    <section id="difference" className="gutter rule-t py-[13vh]">
      <span className="label label-faint">08 / Difference</span>
      <Reveal>
        <h2 className="display mt-10 max-w-[16ch] text-[clamp(2.2rem,7vw,6rem)]">What this is not.</h2>
      </Reveal>

      <div className="mt-14 border-t border-[color:var(--hairline)]">
        {ROWS.map((r) => (
          <Reveal key={r.alt}>
            <div className="grid grid-cols-12 items-baseline gap-x-4 gap-y-2 border-b border-[color:var(--hairline)] py-6 md:py-8">
              <h3 className="col-span-12 font-mono text-sm tracking-tight md:col-span-3 md:text-base">
                {r.alt}
              </h3>
              <p className="col-span-12 text-paper/70 md:col-span-4">{r.does}</p>
              <p className="col-span-12 text-lg leading-snug md:col-span-5 md:text-xl">{r.diff}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
