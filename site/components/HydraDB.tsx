import { Reveal } from "./Reveal";

const QUERY = `CALL algo.SPpaths({
  sourceNode: <incident>, targetNode: <service>,
  relTypes: ['AFFECTS','RESOLVED_BY','AT_COMMIT','TRIGGERS',
             'HAS_JOB','PRODUCES','TARGETS'],
  maxLen: 8, relDirection: 'outgoing', pathCount: 1
}) YIELD path RETURN path   // consistency: strong`;

export function HydraDB() {
  return (
    <section id="hydradb" className="panel-paper rule-t bg-paper text-ink">
      <div className="gutter py-[13vh]">
        <span className="label label-faint">04 / Graph-native</span>
        <Reveal>
          <h2 className="display mt-10 text-[clamp(2.6rem,11vw,9.5rem)]">
            Built on <span className="text-accent">HydraDB</span>.
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-12 lg:grid-cols-12">
          <Reveal className="lg:col-span-5">
            <p className="text-xl leading-relaxed">
              The proof is a graph path, not a boolean. Vurqel writes typed nodes and edges through
              HydraDB, then reads the receipt from one bounded, snapshot-consistent traversal. An edge
              exists only when its hop was verified, so a complete Incident to Service path comes back
              only when the result is EXPOSED.
            </p>
            <p className="mt-6 text-base leading-relaxed text-graytone">
              A vector store cannot answer this. The question is exact same-SHA path completeness on one
              snapshot, not similarity.
            </p>
          </Reveal>
          <Reveal className="lg:col-span-7">
            <pre className="overflow-auto border border-white/15 bg-ink p-6 font-mono text-[12px] leading-relaxed text-paper md:text-sm">
{QUERY}
            </pre>
          </Reveal>
        </div>

        <Reveal>
          <div className="mt-12 grid gap-px border border-[color:var(--hairline)] bg-[color:var(--hairline)] md:grid-cols-2">
            <div className="bg-paper p-6 md:p-8">
              <div className="flex items-baseline justify-between">
                <span className="label label-faint">Returns · verified case</span>
                <span className="label text-accent">EXPOSED</span>
              </div>
              <p className="mt-4 font-mono text-sm">path · 8 nodes / 7 edges · complete</p>
              <p className="mt-2 break-all font-mono text-xs text-graytone">
                Incident → PackageVersion → LockfileSnapshot → GitCommit → WorkflowRun → CIJob → ServiceBuild → Service
              </p>
              <p className="mt-3 font-mono text-xs text-graytone">
                snapshot <span className="text-ink">sgk:1:…:15</span> · every node on SHA <span className="text-ink">939d3bd1</span>
              </p>
            </div>
            <div className="bg-paper p-6 md:p-8">
              <div className="flex items-baseline justify-between">
                <span className="label label-faint">Returns · one broken SHA</span>
                <span className="label">UNPROVEN</span>
              </div>
              <p className="mt-4 font-mono text-sm">
                path · <span className="font-semibold">null</span> · only 4 of 7 edges written
              </p>
              <p className="mt-2 font-mono text-xs text-graytone">
                The HAS_JOB hop fails the same-SHA join, so that edge is never written and no complete path
                exists. The graph will not return a path it cannot verify.
              </p>
              <p className="mt-3 font-mono text-xs text-graytone">
                reason <span className="text-ink">UNPROVEN_SHA_MISMATCH</span>
              </p>
            </div>
          </div>
          <p className="mt-4 font-mono text-xs text-graytone">
            Real HydraDB output, reproducible in the repo under{" "}
            <a
              href="https://github.com/mystiquemide/VURQEL/tree/main/proof"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-[color:var(--hairline)] underline-offset-4 hover:decoration-ink"
              data-cursor
            >
              proof/ ↗
            </a>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
