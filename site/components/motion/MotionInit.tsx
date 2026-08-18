"use client";

import { useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Registers ScrollTrigger once and refreshes measurements after fonts load and
 * on full window load, so pinned/scrubbed typography scenes measure against the
 * final rendered type. Native scroll is used (no scroll hijacking).
 */
export function MotionInit() {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const refresh = () => ScrollTrigger.refresh();

    const fonts = (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts;
    if (fonts?.ready) fonts.ready.then(refresh).catch(() => {});
    window.addEventListener("load", refresh);
    const t = window.setTimeout(refresh, 600);

    return () => {
      window.removeEventListener("load", refresh);
      window.clearTimeout(t);
    };
  }, []);

  return null;
}
