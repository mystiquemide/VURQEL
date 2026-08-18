"use client";

import { useMemo, useState } from "react";
import { evaluateInvestigation } from "@/lib/evaluate";
import { tanstackRequest, tanstackEvidence } from "@/lib/fixture";
import { HOPS, BREAK_TOGGLES } from "@/lib/chain";
import type { EvidenceBundle } from "@/lib/schema";
import { Reveal } from "./Reveal";

function clone(e: EvidenceBundle): EvidenceBundle {
  return typeof structuredClone === "function"
    ? structuredClone(e)
    : (JSON.parse(JSON.stringify(e)) as EvidenceBundle);
}

export function Investigate() {
  const [intact, setIntact] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(BREAK_TOGGLES.map((t) => [t.id, true])),
  );

  const evaluation = useMemo(() => {
    const ev = clone(tanstackEvidence);
    for (const t of BREAK_TOGGLES) if (!intact[t.id]) t.apply(ev);
    return evaluateInvestigation(tanstackRequest, ev);
  }, [intact]);

  const flags = HOPS.map((h) => evaluation.verified[h.key]);
  const breakAt = flags.indexOf(false);
  const isExposed = evaluation.state === "EXPOSED";
  const allIntact = BREAK_TOGGLES.every((t) => intact[t.id]);

  return (
    <section id="investigate" className="gutter rule-t py-[13vh]">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <span className="label label-faint">05 / Investigate</span>
      </div>

      <Reveal>
        <h2 className="display mt-10 max-w-[16ch] text-[clamp(2.2rem,7vw,6rem)]">Break the chain.</h2>
      </Reveal>

      <div className="panel-paper mt-14 grid gap-px border border-[color:var(--hairline)] bg-[color:var(--hairline)] lg:grid-cols-12">
        {/* Controls */}
        <div className="bg-paper p-6 md:p-8 lg:col-span-5">
          <div className="flex items-center justify-between">
            <span className="label">Conditions</span>
            <button
              type="button"
              onClick={() => setIntact(Object.fromEntries(BREAK_TOGGLES.map((t) => [t.id, true])))}
              className="label label-faint disabled:opacity-40"
              disabled={allIntact}
              data-cursor
            >
              Reset ↺
            </button>
          </div>
          <ul className="mt-6 space-y-5">
            {BREAK_TOGGLES.map((t) => {
              const on = intact[t.id];
              return (
                <li key={t.id} className="border-b border-[color:var(--hairline)] pb-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-base leading-snug">{t.label}</p>
                      <p className="mt-2 text-sm leading-snug text-graytone">{t.hint}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIntact((s) => ({ ...s, [t.id]: !s[t.id] }))}
                      aria-pressed={!on}
                      data-cursor
                      className={`shrink-0 border px-3 py-1.5 font-mono text-xs uppercase tracking-[0.14em] transition-colors ${
                        on
                          ? "border-ink text-ink hover:bg-ink hover:text-paper"
                          : "border-accent bg-accent text-paper"
                      }`}
                    >
                      {on ? "Intact" : "Broken"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Verdict + live chain */}
        <div className="bg-paper p-6 md:p-8 lg:col-span-7">
          <span className="label label-faint">Verdict</span>
          <p
            className={`display mt-3 text-[clamp(2.2rem,6vw,4.5rem)] leading-none ${
              isExposed ? "text-accent" : "text-ink"
            }`}
          >
            {evaluation.state}
          </p>
          <p className="mt-4 font-mono text-xs text-graytone">{evaluation.reasonCode}</p>
          <p className="mt-3 max-w-[52ch] text-base leading-relaxed">{evaluation.reason}</p>

          <ol className="mt-8 border-t border-[color:var(--hairline)]">
            {HOPS.map((h, i) => {
              const status = flags[i] ? "verified" : i === breakAt ? "broken" : "skipped";
              const color =
                status === "verified" ? "text-ink" : status === "broken" ? "text-accent" : "text-faint";
              const mark = status === "verified" ? "→" : status === "broken" ? "×" : "·";
              return (
                <li
                  key={h.index}
                  className="flex items-baseline justify-between gap-4 border-b border-[color:var(--hairline)] py-3"
                >
                  <span className={`font-mono text-xs md:text-sm ${color}`}>
                    <span className="inline-block w-5">{mark}</span>
                    {h.edge}
                  </span>
                  <span className={`label ${status === "broken" ? "text-accent" : "label-faint"}`}>
                    {status}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
