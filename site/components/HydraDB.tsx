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
      </div>
    </section>
  );
}
