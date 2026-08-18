"use client";

import { useRef, type ReactNode } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { reduceMotion } from "@/lib/motion/env";

/**
 * Masked reveal: the block rises from behind a clip on scroll-in. Progressive
 * enhancement — content is visible by default; the clip + transform are applied
 * only when motion is allowed, and the clip is cleared once the reveal finishes
 * so nothing is ever clipped at rest. Replaces uniform fade-up across sections.
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || reduceMotion()) return;
      const inner = el.firstElementChild as HTMLElement | null;
      if (!inner) return;

      gsap.registerPlugin(ScrollTrigger);
      gsap.set(el, { overflow: "hidden" });
      gsap.from(inner, {
        yPercent: 100,
        duration: 0.95,
        ease: "expo.out",
        delay,
        scrollTrigger: { trigger: el, start: "top 88%", toggleActions: "play none none none" },
        onComplete: () => gsap.set(el, { overflow: "visible" }),
      });
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className={className}>
      <div>{children}</div>
    </div>
  );
}
