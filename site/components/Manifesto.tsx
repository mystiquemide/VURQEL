"use client";

import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { isDesktop, reduceMotion } from "@/lib/motion/env";

const STATES: { word: string; accent?: boolean; def: string }[] = [
  { word: "EXPOSED", accent: true, def: "A complete, same-SHA path runs from the incident to a production-labelled build." },
  { word: "NOT_EXPOSED", def: "The evidence is complete and no such path exists. Absence, proven." },
  { word: "UNPROVEN", def: "The evidence is missing, ambiguous, or contradictory. Vurqel refuses to conclude." },
];

export function Manifesto() {
  const outer = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = outer.current;
      if (!el || !isDesktop() || reduceMotion()) return;
      gsap.registerPlugin(ScrollTrigger);

      const tl = gsap.timeline({
        scrollTrigger: { trigger: el, start: "top top", end: "bottom bottom", scrub: 0.6 },
      });
      tl.fromTo(
        "[data-line]",
        { scale: 0.96, letterSpacing: "-0.01em", transformOrigin: "left center" },
        { scale: 1.05, letterSpacing: "0.03em", ease: "none" },
        0,
      );
      tl.fromTo(
        "[data-state]",
        { autoAlpha: 0, yPercent: 60 },
        { autoAlpha: 1, yPercent: 0, ease: "none", stagger: 0.16 },
        0.28,
      );
      tl.fromTo("[data-close]", { autoAlpha: 0, yPercent: 40 }, { autoAlpha: 1, yPercent: 0, ease: "none" }, 0.72);
    },
    { scope: outer },
  );

  return (
    <section id="manifesto" className="rule-t">
      <div ref={outer} className="md:h-[210vh]">
        <div className="gutter flex flex-col justify-center py-[13vh] md:sticky md:top-0 md:min-h-screen md:py-0">
          <span className="label label-faint">02 / Manifesto</span>
          <h2 data-line className="display mt-8 max-w-[16ch] text-[clamp(2rem,6vw,5rem)] leading-[1.02]">
            Three verdicts. Never a guess.
          </h2>

          <div className="panel-paper mt-12 grid gap-px border border-[color:var(--hairline)] bg-[color:var(--hairline)] md:grid-cols-3">
            {STATES.map((s) => (
              <div key={s.word} data-state className="bg-paper">
                <div className="h-full p-6 md:p-8">
                  <h3 className={`font-mono text-lg tracking-tight md:text-xl ${s.accent ? "text-accent" : "text-ink"}`}>
                    {s.word}
                  </h3>
                  <p className="mt-4 max-w-[34ch] text-base leading-relaxed text-graytone">{s.def}</p>
                </div>
              </div>
            ))}
          </div>

          <p data-close className="mt-12 max-w-[70ch] text-xl leading-relaxed md:text-2xl">
            It proves build provenance. It does not prove malware execution, credential theft, or
            end-user traffic. Every conclusion links to a public artifact, so anyone can check it.
          </p>
        </div>
      </div>
    </section>
  );
}
