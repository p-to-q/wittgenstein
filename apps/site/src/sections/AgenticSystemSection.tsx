const toolChain = [
  {
    name: "harness.router",
    active: true,
    description:
      "Owns retries, seeds, budgets, sandbox, telemetry, and routing while the planner stays text-first.",
  },
  {
    name: "codec.registry",
    active: false,
    description:
      "Dispatches per-modality WittgensteinCodec implementations through one shared contract.",
  },
  {
    name: "artifacts.replay",
    active: false,
    description:
      "Replays modality contracts plus manifests from artifacts/runs/ without touching the base model weights.",
  },
];

export default function AgenticSystemSection() {
  return (
    <section className="py-20 px-4 bg-background" id="agentic">
      <div className="max-w-5xl mx-auto">
        <span className="section-number">06</span>
        <h2 className="text-4xl md:text-5xl font-serif mt-2 mb-4 lowercase">harness</h2>
        <p className="text-muted-foreground text-sm max-w-xl mb-10 leading-relaxed">
          The LLM plans; the harness owns routing, schema injection, validation, and traces.
          Modality codecs sit behind a shared contract surface so new file types can ship without
          pretending the backbone has become a giant native VLM.
        </p>

        <div className="card-border p-6">
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <div className="bg-secondary rounded-lg p-4 mb-4 border border-border">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 border border-primary/35">
                    <span className="text-xs font-medium text-primary">W</span>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Route this request through the right codec, validate the code-bearing
                      contract, and show the artifact and manifest path rather than a black-box
                      answer.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-card border border-border rounded-lg p-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Planner output is validated before any decoder or renderer runs. The harness
                  records seed, codec id, route, and artifact hashes so work can be replayed without
                  guessing what happened.
                </p>
              </div>
            </div>

            <div>
              <div className="text-xs font-mono text-muted-foreground mb-4">TOOL CHAIN</div>
              <div className="space-y-3">
                {toolChain.map((tool) => (
                  <div
                    key={tool.name}
                    className={`p-3 rounded-lg border ${
                      tool.active ? "border-primary/40 bg-primary/10" : "border-border bg-secondary"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className={`w-2 h-2 rounded-full ${tool.active ? "bg-primary" : "bg-muted-foreground/40"}`}
                      />
                      <span className="text-xs font-mono text-muted-foreground">{tool.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{tool.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-border text-xs text-muted-foreground">
            planner · harness routing · deterministic file paths
          </div>
        </div>
      </div>
    </section>
  );
}
