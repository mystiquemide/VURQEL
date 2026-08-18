"use client";

import { useRef, createElement, type ElementType } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { reduceMotion } from "@/lib/motion/env";

type Props = {
  text: string;
  as?: ElementType;
  by?: "word" | "char";
  className?: string;
  stagger?: number;
  duration?: number;
  /** Animate on mount (hero) instead of on scroll-in. */
  onLoad?: boolean;
  delay?: number;
  start?: string;
};

/**
 * Splits a heading into words or characters and reveals each from behind a clip
 * with a controlled stagger. The accessible name is preserved via aria-label;
 * the visual tokens are aria-hidden. Progressive: renders visible; the clip is
 * JS-applied only when motion is allowed and cleared on completion so display
 * type with tight leading is never clipped at rest.
 */
export function SplitReveal({
  text,
  as = "h2",
  by = "word",
  className = "",
  stagger = 0.055,
  duration = 0.9,
  onLoad = false,
  delay = 0,
  start = "top 86%",
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const tokens = by === "char" ? Array.from(text) : text.split(" ");

  useGSAP(
    () => {
      const root = ref.current;
      if (!root || reduceMotion()) return;
      gsap.registerPlugin(ScrollTrigger);

      const wraps = gsap.utils.toArray<HTMLElement>("[data-sw]", root);
      const inners = wraps.map((w) => w.firstElementChild as HTMLElement);
      wraps.forEach((w) => (w.style.overflow = "hidden"));
      const clear = () => wraps.forEach((w) => (w.style.overflow = "visible"));

      const vars: gsap.TweenVars = { yPercent: 118, duration, ease: "expo.out", stagger, delay, onComplete: clear };
      if (onLoad) gsap.from(inners, vars);
      else gsap.from(inners, { ...vars, scrollTrigger: { trigger: root, start, toggleActions: "play none none none" } });
    },
    { scope: ref },
  );

  const visual = tokens.map((t, i) => (
    <span key={i} data-sw className="inline-block align-baseline">
      <span className="inline-block">
        {by === "char" ? (t === " " ? "\u00A0" : t) : `${t}${i < tokens.length - 1 ? "\u00A0" : ""}`}
      </span>
    </span>
  ));

  return createElement(
    as,
    { ref, className, "aria-label": text },
    <span aria-hidden="true">{visual}</span>,
  );
}
