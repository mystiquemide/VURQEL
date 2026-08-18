"use client";

import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { reduceMotion } from "@/lib/motion/env";

const PHRASE = "EXPOSED — NOT_EXPOSED — UNPROVEN — ";
const LETTERS: [string, boolean][] = [
  ["V", false],
  ["u", false],
  ["r", false],
  ["q", true],
  ["e", false],
  ["l", false],
];

export function Hero() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = root.current;
      if (!el || reduceMotion()) return;
      gsap.registerPlugin(ScrollTrigger);

      const wraps = gsap.utils.toArray<HTMLElement>("[data-hchar]", el);
      const inners = wraps.map((w) => w.firstElementChild as HTMLElement);
      wraps.forEach((w) => (w.style.overflow = "hidden"));

      // Fast, deliberate intro: characters clip-reveal with stagger, then meta.
      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
      tl.from(inners, {
        yPercent: 125,
        duration: 1.0,
        stagger: 0.07,
        onComplete: () => wraps.forEach((w) => (w.style.overflow = "visible")),
      })
        .from("[data-hmeta]", { yPercent: 40, autoAlpha: 0, duration: 0.7 }, "-=0.5")
        .from("[data-hcta]", { yPercent: 24, autoAlpha: 0, duration: 0.7 }, "-=0.35");

      // Scroll = timeline: the wordmark lifts and compresses as the hero leaves.
      gsap.to("[data-hword]", {
        yPercent: -26,
        scale: 0.9,
        ease: "none",
        scrollTrigger: { trigger: el, start: "top top", end: "bottom top", scrub: true },
      });
      gsap.to("[data-hmarq]", {
        xPercent: -12,
        ease: "none",
        scrollTrigger: { trigger: el, start: "top top", end: "bottom top", scrub: true },
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} id="top" className="gutter relative flex min-h-[100svh] flex-col justify-between pb-8 pt-16">
      <div className="rule-b flex items-start justify-end gap-6 pb-4">
        <span
          data-hmeta
          className="label label-faint max-w-[26ch] text-right normal-case tracking-normal"
        >
          Prove which build actually resolved a compromised package while it was live.
        </span>
      </div>

      <div className="relative flex-1 py-6">
        <div
          data-hmarq
          className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 overflow-hidden opacity-[0.05] motion-reduce:hidden"
          aria-hidden="true"
        >
          <div className="marquee">
            <span className="whitespace-nowrap font-mono text-[9vw] uppercase tracking-[0.06em]">
              {PHRASE.repeat(4)}
            </span>
            <span className="whitespace-nowrap font-mono text-[9vw] uppercase tracking-[0.06em]">
              {PHRASE.repeat(4)}
            </span>
          </div>
        </div>

        <div className="flex h-full items-center">
          <h1 data-hword className="display relative text-[clamp(4.5rem,23vw,21rem)]" aria-label="Vurqel">
            <span aria-hidden="true">
              {LETTERS.map(([ch, ital], i) => (
                <span key={i} data-hchar className="inline-block align-baseline">
                  <span className={`inline-block ${ital ? "font-light italic" : ""}`}>{ch}</span>
                </span>
              ))}
            </span>
          </h1>
        </div>
      </div>

      <div data-hcta className="flex flex-col gap-5 pt-6 sm:flex-row sm:items-end sm:justify-between">
        <span className="label label-faint max-w-[40ch] normal-case tracking-normal">
          Live, interactive replay of the verified case — break a link and watch the verdict change.
        </span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <a
            href="#investigate"
            className="inline-flex items-center gap-2 border border-paper/60 px-4 py-2.5 font-mono text-xs uppercase tracking-[0.14em] transition-colors hover:bg-paper hover:text-ink"
            data-cursor
          >
            Investigate the case →
          </a>
          <a
            href="#cta"
            className="label border-b border-paper/40 pb-1 transition-colors hover:border-paper"
            data-cursor
          >
            Read the receipt
          </a>
        </div>
      </div>
    </section>
  );
}
