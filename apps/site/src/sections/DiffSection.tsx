const layers = [
  {
    num: "L1",
    title: "Harness / runtime",
    desc: "Routing, retry, seed, budget, telemetry, sandbox, and replayable run invariants.",
  },
  {
    num: "L2",
    title: "IR / codec",
    desc: "Typed schemas, modality contracts, and structured parse boundaries at every external edge.",
  },
  {
    num: "L3",
    title: "Renderer / decoder",
    desc: "IR to bytes on disk; frozen decoders are in-bounds, general generators are not the default path.",
  },
  {
    num: "L4",
    title: "Optional adapter",
    desc: "Small learned bridges such as seed expanders or local code aligners, shipped beside codecs instead of inside the base model.",
  },
  {
    num: "L5",
    title: "Packaging",
    desc: "CLI, installation, shared schemas, docs, agent primers, and distribution conventions that make the stack usable.",
  },
];

export default function DiffSection() {
  return (
    <section className="py-20 px-4 border-y border-border bg-card" id="s-layers">
      <div className="max-w-5xl mx-auto">
        <span className="section-number">02</span>
        <h2 className="text-4xl md:text-5xl font-serif mt-2 mb-4 lowercase">layers</h2>
        <p className="text-muted-foreground text-sm max-w-xl mb-10 leading-relaxed">
          Five explicit layers map the idea to packages, responsibilities, and failure boundaries so
          contributors do not accidentally solve the right problem in the wrong place.
        </p>

        <div className="card-border p-6 space-y-3">
          {layers.map((row) => (
            <div
              key={row.num}
              className="flex gap-4 items-start p-4 rounded-md border border-border bg-background shadow-[0_0_0_1px_rgba(240,238,230,0.8)]"
            >
              <span className="font-mono text-xs font-semibold tabular-nums text-muted-foreground min-w-[2rem] pt-0.5">
                {row.num}
              </span>
              <p className="text-sm text-muted-foreground leading-relaxed">
                <strong className="text-foreground font-semibold">{row.title}</strong>
                {" — "}
                {row.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
