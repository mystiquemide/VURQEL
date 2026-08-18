"use client";

import { useEffect } from "react";

const SECTIONS = new Set([
  "top",
  "introduction",
  "manifesto",
  "mechanism",
  "hydradb",
  "investigate",
  "proof",
  "intermission",
  "difference",
  "cta",
]);

/**
 * Clean in-page URLs. Clicking a section link shows /section in the address bar
 * (not /#section) while still scrolling smoothly and keeping keyboard focus.
 * Deep links like /introduction are rewritten to / by next.config and scrolled
 * into view here on mount. Falls back to ordinary anchors if JS is unavailable.
 */
export function CleanUrl() {
  useEffect(() => {
    // Reload / shared-link support: /section -> scroll that section into view.
    const seg = decodeURIComponent(location.pathname.replace(/^\/+/, "").replace(/\/+$/, ""));
    if (seg && SECTIONS.has(seg)) {
      const t = document.getElementById(seg);
      if (t) requestAnimationFrame(() => t.scrollIntoView({ behavior: "auto", block: "start" }));
    }

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const link = (e.target as HTMLElement | null)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null;
      if (!link) return;

      const href = link.getAttribute("href");
      if (!href || href === "#") return;

      const id = decodeURIComponent(href.slice(1));
      const target = document.getElementById(id);
      if (!target) return;

      e.preventDefault();
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });

      // Keep skip-link / keyboard accessibility: move focus to the destination.
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });

      // Clean path in the address bar: /section, no #.
      history.replaceState(null, "", "/" + id);
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
