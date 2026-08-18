"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { reduceMotion } from "@/lib/motion/env";
import { Logo } from "./Logo";

const ITEMS: readonly [string, string, string][] = [
  ["01", "Introduction", "#introduction"],
  ["02", "Manifesto", "#manifesto"],
  ["03", "Mechanism", "#mechanism"],
  ["04", "Graph-native", "#hydradb"],
  ["05", "Investigate", "#investigate"],
  ["06", "Proof", "#proof"],
  ["07", "Intermission", "#intermission"],
  ["08", "Difference", "#difference"],
  ["09", "Read the receipt", "#cta"],
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("Temporal supply-chain exposure proof");
  const headerRef = useRef<HTMLElement>(null);
  const indexBtnRef = useRef<HTMLButtonElement>(null);

  const openIndex = () => {
    indexBtnRef.current?.setAttribute("aria-expanded", "true");
    setOpen(true);
  };
  const closeIndex = () => {
    indexBtnRef.current?.setAttribute("aria-expanded", "false");
    setOpen(false);
  };

  useGSAP(
    () => {
      if (reduceMotion() || !headerRef.current) return;
      gsap.from(headerRef.current, { yPercent: -100, autoAlpha: 0, duration: 0.7, ease: "expo.out", delay: 0.9 });
    },
    { scope: headerRef },
  );

  useEffect(() => {
    const sections = ITEMS.map((i) => document.querySelector(i[2])).filter(Boolean) as Element[];
    if (!sections.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const item = ITEMS.find((i) => i[2] === `#${e.target.id}`);
            if (item) setCurrent(item[1]);
          }
        });
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      indexBtnRef.current?.setAttribute("aria-expanded", "false");
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <header ref={headerRef} className="fixed inset-x-0 top-0 z-50 bg-ink rule-b">
        <div className="gutter flex h-12 items-center justify-between">
          <a href="#top" className="flex items-center gap-2" aria-label="Vurqel, back to top" data-cursor>
            <Logo className="h-3.5 w-auto" />
            <span className="label">
              Vurqel<sup className="ml-0.5 text-[0.6em]">®</sup>
            </span>
          </a>
          <span className="label label-faint hidden truncate px-4 md:block">{current}</span>
          <div className="flex items-center gap-5">
            <a
              href="https://github.com/mystiquemide/VURQEL"
              className="label hidden sm:inline"
              target="_blank"
              rel="noopener noreferrer"
              data-cursor
            >
              GitHub ↗
            </a>
            <button
              ref={indexBtnRef}
              type="button"
              onClick={openIndex}
              className="label"
              data-cursor
              aria-expanded={open}
              aria-controls="section-index"
            >
              Index +
            </button>
          </div>
        </div>
      </header>

      <div
        id="section-index"
        className={`fixed inset-0 z-[60] bg-ink text-paper transition-opacity duration-500 ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!open}
        role="dialog"
        aria-modal="true"
        aria-label="Table of contents"
      >
        <div className="gutter flex h-12 items-center justify-between border-b border-white/15">
          <span className="label text-paper">Index</span>
          <button type="button" onClick={closeIndex} className="label text-paper" data-cursor>
            Close ×
          </button>
        </div>
        <nav className="gutter">
          {ITEMS.map(([num, label, href]) => (
            <a
              key={href}
              href={href}
              onClick={closeIndex}
              data-cursor
              className="group flex items-baseline gap-6 border-b border-white/12 py-4 md:py-5"
            >
              <span className="label w-8 shrink-0 text-white/50">{num}</span>
              <span className="display text-[clamp(2rem,7vw,5rem)] leading-none transition-opacity duration-300 group-hover:opacity-55">
                {label}
              </span>
            </a>
          ))}
        </nav>
      </div>
    </>
  );
}
