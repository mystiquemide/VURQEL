"use client";

import { useEffect, useRef } from "react";

/** A subtle blended cursor dot (desktop, motion-allowed only). Grows over interactive targets. */
export function Cursor() {
  const wrap = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(hover: none)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const el = wrap.current;
    const d = dot.current;
    if (!el || !d) return;

    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let cx = x;
    let cy = y;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      el.style.opacity = "1";
    };
    const onOver = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      const big = !!(t && t.closest("a,button,[data-cursor]"));
      d.style.width = big ? "42px" : "10px";
      d.style.height = big ? "42px" : "10px";
      d.style.background = big ? "transparent" : "#F4F2EC";
      d.style.border = big ? "1px solid #F4F2EC" : "0";
    };
    const tick = () => {
      cx += (x - cx) * 0.18;
      cy += (y - cy) * 0.18;
      el.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
      raf = requestAnimationFrame(tick);
    };

    el.style.opacity = "0";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerover", onOver);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerover", onOver);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={wrap} className="cursor-dot" aria-hidden="true">
      <div
        ref={dot}
        className="rounded-full transition-[width,height] duration-200"
        style={{ width: "10px", height: "10px", background: "#F4F2EC", transform: "translate(-50%, -50%)" }}
      />
    </div>
  );
}
