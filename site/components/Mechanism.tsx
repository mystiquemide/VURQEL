"use client";

import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { HOPS } from "@/lib/chain";
import { isDesktop, reduceMotion } from "@/lib/motion/env";

export function Mechanism() {
  const outer = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = outer.current;
      if (!el || !isDesktop() || reduceMotion()) return;
      gsap.registerPlugin(ScrollTrigger);

      const inner = el.querySelector("[data-mech-inner]");
      inner?.classList.add("is-armed");
      const rows = gsap.utils.toArray<HTMLElement>(".mech-row", el);
      const rail = el.querySelector<HTMLElement>("[data-rail]");
      let active = -1;
      if (rows[0]) {
        rows[0].classList.add("is-active");
        active = 0;
      }

      ScrollTrigger.create({
        trigger: el,
        start: "top top",
        end: "bottom bottom",
        scrub: true,
        onUpdate: (self) => {
          if (rail) gsap.set(rail, { scaleY: self.progress });
          const idx = Math.min(rows.length - 1, Math.floor(self.progress * rows.length));
          if (idx !== active && rows[idx]) {
            rows[active]?.classList.remove("is-active");
            rows[idx].classList.add("is-active");
            active = idx;
          }
        },
      });
    },
    { scope: outer },
  );

  return (
    <section id="mechanism" className="rule-t">
      <div ref={outer} className="md:h-[300vh]">
        <div
          data-mech-inner
          className="gutter flex flex-col justify-center py-[13vh] md:sticky md:top-0 md:min-h-screen md:py-0"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <span className="label label-faint">03 / Mechanism</span>
            <span className="label label-faint">Incident → Service · 7 hops</span>
          </div>

          <h2 className="display mt-8 max-w-[18ch] text-[clamp(2rem,5.5vw,4.5rem)]">
            The chain only holds on one SHA.
          </h2>

          <div className="mt-10 grid grid-cols-[10px_1fr] gap-x-5 md:gap-x-8">
            <div className="relative w-px justify-self-center bg-[color:var(--hairline)]">
              <div
                data-rail
                className="absolute left-0 top-0 h-full w-px origin-top bg-paper"
                style={{ transform: "scaleY(0)" }}
              />
            </div>

            <ol>
              {HOPS.map((h) => (
                <li
                  key={h.index}
                  className="mech-row grid grid-cols-12 items-baseline gap-x-3 gap-y-1 border-b border-[color:var(--hairline)] py-3 last:border-b-0"
                >
                  <span className="mech-num display col-span-2 text-[clamp(1.4rem,3.4vw,2.6rem)] md:col-span-1">
                    {h.index}
                  </span>
                  <span className="col-span-10 font-mono text-xs tracking-tight md:col-span-3 md:text-sm">
                    {h.edge}
                  </span>
                  <p className="col-span-12 text-base leading-snug md:col-span-6 md:text-lg">{h.rule}</p>
                  <span className="label label-faint col-span-12 md:col-span-2 md:text-right">{h.note}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
