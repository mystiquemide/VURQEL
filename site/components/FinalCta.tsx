"use client";

import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { reduceMotion } from "@/lib/motion/env";

const dim = (o: number) => ({ color: `rgba(14,14,12,${o})` });

export function FinalCta() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = root.current;
      if (!el || reduceMotion()) return;
      gsap.registerPlugin(ScrollTrigger);

      gsap.fromTo(
        "[data-cta-line]",
        { scale: 0.9, yPercent: 6, transformOrigin: "left center", letterSpacing: "-0.02em" },
        {
          scale: 1,
          yPercent: 0,
          letterSpacing: "-0.045em",
          ease: "none",
          scrollTrigger: { trigger: el, start: "top 92%", end: "top 30%", scrub: true },
        },
      );
      gsap.from("[data-cta-link]", {
        yPercent: 120,
        autoAlpha: 0,
        duration: 0.8,
        ease: "expo.out",
        stagger: 0.12,
        scrollTrigger: { trigger: el, start: "top 60%", toggleActions: "play none none none" },
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} id="cta" className="panel-paper rule-t bg-paper text-ink">
      <div className="gutter flex min-h-[80svh] flex-col justify-between py-16">
        <span className="label" style={dim(0.6)}>
          09 / Read the receipt
        </span>

        <div className="py-10">
          <h2 data-cta-line className="display text-[clamp(3rem,15vw,14rem)] leading-[0.88]">
            Read the{" "}
            <br />
            receipt<span className="text-accent">.</span>
          </h2>
          <div className="mt-10 flex flex-wrap gap-x-10 gap-y-4 overflow-hidden">
            <a
              data-cta-link
              href="https://github.com/mystiquemide/vurqel/blob/main/examples/receipts/tanstack-exposed.json"
              target="_blank"
              rel="noopener noreferrer"
              className="label border-b border-ink/40 pb-1 hover:border-ink"
              data-cursor
              data-cursor-label="VIEW"
            >
              View the EXPOSED receipt ↗
            </a>
            <a
              data-cta-link
              href="https://github.com/mystiquemide/vurqel"
              target="_blank"
              rel="noopener noreferrer"
              className="label border-b border-ink/40 pb-1 hover:border-ink"
              data-cursor
              data-cursor-label="CODE"
            >
              Code on GitHub ↗
            </a>
          </div>
        </div>

        <footer className="grid grid-cols-2 gap-x-6 gap-y-6 border-t border-[color:var(--hairline)] pt-8 md:grid-cols-4">
          <div>
            <span className="label" style={dim(0.55)}>
              Project
            </span>
            <p className="mt-2 font-mono text-sm">Vurqel</p>
            <p className="mt-1 font-mono text-xs" style={dim(0.45)}>© 2026 Vurqel</p>
          </div>
          <div>
            <span className="label" style={dim(0.55)}>
              Sponsor
            </span>
            <p className="mt-2 font-mono text-sm">HydraDB</p>
          </div>
          <div>
            <span className="label" style={dim(0.55)}>
              Sources
            </span>
            <p className="mt-2 font-mono text-sm leading-relaxed">
              <a
                href="https://tanstack.com/blog/npm-supply-chain-compromise-postmortem"
                target="_blank"
                rel="noopener noreferrer"
                data-cursor
              >
                TanStack postmortem ↗
              </a>
              <br />
              <a
                href="https://www.stepsecurity.io/blog/mini-shai-hulud-is-back-a-self-spreading-supply-chain-attack-hits-the-npm-ecosystem"
                target="_blank"
                rel="noopener noreferrer"
                data-cursor
              >
                StepSecurity advisory ↗
              </a>
            </p>
          </div>
          <div className="flex items-end justify-start md:justify-end">
            <a href="#top" className="label" style={dim(0.72)} data-cursor>
              Back to top ↑
            </a>
          </div>
        </footer>
      </div>
    </section>
  );
}
