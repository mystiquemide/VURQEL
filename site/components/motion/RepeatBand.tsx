"use client";

import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { reduceMotion } from "@/lib/motion/env";

/**
 * Oversized repeated product name used as a section transition / visual anchor.
 * Rows travel in alternating directions tied to scroll progress. Decorative
 * (aria-hidden), faint, and overflow-clipped so it never creates horizontal
 * page scroll. Static and harmless under reduced motion.
 */
export function RepeatBand({ word = "VURQEL", rows = 3 }: { word?: string; rows?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || reduceMotion()) return;
      gsap.registerPlugin(ScrollTrigger);
      const lines = gsap.utils.toArray<HTMLElement>("[data-band-row]", el);
      lines.forEach((line, i) => {
        const leftward = i % 2 === 0;
        const travel = i === 2 ? 10 : 18;
        gsap.fromTo(
          line,
          { xPercent: leftward ? travel * 0.35 : -travel },
          {
            xPercent: leftward ? -travel : travel * 0.35,
            ease: "none",
            scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true },
          },
        );
      });
    },
    { scope: ref },
  );

  const content = `${word}\u2003`.repeat(8);
  return (
    <div ref={ref} aria-hidden="true" className="relative overflow-hidden rule-t rule-b py-[7vh]">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          data-band-row
          className="display whitespace-nowrap text-[clamp(3rem,12vw,11rem)] leading-[0.92] will-change-transform"
          style={{ color: "#F4F2EC", opacity: 0.06 }}
        >
          {content}
        </div>
      ))}
    </div>
  );
}
