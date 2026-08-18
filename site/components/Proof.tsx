import { Reveal } from "./Reveal";
import receipt from "@/lib/receipt.json";

const REPO = "https://github.com/RelativeSure/websites";

const ROWS: { k: string; v: string; href?: string }[] = [
  { k: "Incident window (UTC)", v: "[2026-05-11T19:26:14Z, 22:13:38Z)", href: "https://tanstack.com/blog/npm-supply-chain-compromise-postmortem" },
  { k: "Affected package", v: "@tanstack/react-router@1.169.8" },
  { k: "Commit", v: "939d3bd1b05ee09f0f4c2585a492f98da0fd066d", href: `${REPO}/commit/939d3bd1b05ee09f0f4c2585a492f98da0fd066d` },
  { k: "Lockfile (sha256)", v: "04916898507a414af7e59f9083ade5f604a0358ae676ad216e50d0f605330f6d", href: `${REPO}/blob/939d3bd1b05ee09f0f4c2585a492f98da0fd066d/tools/pnpm-lock.yaml` },
  { k: "Workflow run (overall failure)", v: "25698962181", href: `${REPO}/actions/runs/25698962181` },
  { k: "Named job", v: "Build (tools) = success" },
  { k: "Service build (production)", v: "Workers Builds: websites-tools = success · 75454451577", href: `${REPO}/runs/75454451577` },
];

export function Proof() {
  return (
    <section id="proof" className="panel-paper gutter rule-t bg-paper text-ink py-[13vh]">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <span className="label label-faint">06 / Proof</span>
      </div>

      <Reveal>
        <h2 className="display mt-10 max-w-[20ch] text-[clamp(2.2rem,7vw,6rem)]">
          The verified case, on the record.
        </h2>
      </Reveal>

      <div className="mt-14 grid gap-12 lg:grid-cols-12">
        <Reveal className="lg:col-span-7">
          <dl className="border-t border-[color:var(--hairline)]">
            {ROWS.map((r) => (
              <div
                key={r.k}
                className="grid grid-cols-12 items-baseline gap-x-4 gap-y-1 border-b border-[color:var(--hairline)] py-4"
              >
                <dt className="label label-faint col-span-12 sm:col-span-4">{r.k}</dt>
                <dd className="col-span-12 break-all font-mono text-xs sm:col-span-8 sm:text-sm">
                  {r.href ? (
                    <a
                      href={r.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-[color:var(--hairline)] underline-offset-4 hover:decoration-ink"
                      data-cursor
                    >
                      {r.v} ↗
                    </a>
                  ) : (
                    r.v
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>

        <Reveal className="lg:col-span-5" delay={100}>
          <div className="flex items-baseline justify-between border-t border-[color:var(--hairline)] pt-4">
            <span className="label label-faint">Receipt</span>
            <span className="font-mono text-xs text-graytone">{receipt.requestId}</span>
          </div>
          <p className="display mt-4 text-[clamp(2rem,5vw,3.5rem)] leading-none text-accent">
            {receipt.state}
          </p>
          <p className="mt-3 font-mono text-xs text-graytone">{receipt.reasonCode}</p>
          <p className="mt-4 max-w-[46ch] text-sm leading-relaxed text-ink">{receipt.claimBoundary}</p>
          <pre className="mt-6 max-h-80 overflow-auto border border-[color:var(--hairline)] bg-ink p-4 font-mono text-[11px] leading-relaxed text-paper">
{JSON.stringify(receipt, null, 2)}
          </pre>
          <a
            href="https://raw.githubusercontent.com/mystiquemide/VURQEL/main/examples/receipts/tanstack-exposed.json"
            target="_blank"
            rel="noopener noreferrer"
            className="label mt-4 inline-block"
            data-cursor
          >
            Raw receipt ↗
          </a>
        </Reveal>
      </div>
    </section>
  );
}
