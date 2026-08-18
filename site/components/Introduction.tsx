import { Reveal } from "./Reveal";

const META: [string, string][] = [
  ["Incident window (UTC)", "[2026-05-11T19:26:14Z, 22:13:38Z)"],
  ["Package", "@tanstack/react-router@1.169.8"],
  ["Retrieved", "2026-08-18"],
];

export function Introduction() {
  return (
    <section id="introduction" className="gutter rule-t py-[13vh]">
      <span className="label label-faint">01 / Introduction</span>
      <div className="mt-10 grid gap-12 lg:grid-cols-12">
        <Reveal className="lg:col-span-8">
          <h2 className="display text-[clamp(2.4rem,8vw,7.5rem)]">
            A dependency list is not a blast radius.
          </h2>
        </Reveal>
        <Reveal className="lg:col-span-4 lg:pt-4" delay={120}>
          <p className="max-w-[42ch] text-lg leading-relaxed">
            In May 2026 the TanStack npm packages were compromised for a few hours. Every responder
            asked the same thing: did any of our builds actually install the bad version, or is it
            just a name in a lockfile? A scanner flags the mention. Vurqel proves the resolution.
          </p>
          <dl className="mt-10 space-y-3 border-t border-[color:var(--hairline)] pt-5">
            {META.map(([k, v]) => (
              <div key={k} className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-6">
                <dt className="label label-faint">{k}</dt>
                <dd className="font-mono text-xs sm:text-right">{v}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}
