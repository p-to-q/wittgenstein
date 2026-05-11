const promptTokens = ["Create", "a", "traceable", "PNG", "artifact", "from", "text"];
const responseTokens = ["semantic", "seedCode", "decoder", "PNG", "manifest"];

export default function AttributionSection() {
  return (
    <section className="py-20 px-4 bg-background" id="s-thesis">
      <div className="max-w-5xl mx-auto">
        <span className="section-number">01</span>
        <h2 className="text-4xl md:text-5xl font-serif mt-2 mb-4 lowercase">thesis</h2>
        <p className="text-muted-foreground text-sm max-w-xl mb-10 leading-relaxed">
          Agent = model + harness, with modality codecs at the file boundary. The LLM remains the
          planner; the harness owns schema injection, validation, retries, budgets, sandboxing,
          telemetry, and artifact traces.
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="card-border p-6">
            <div className="text-xs font-mono text-muted-foreground mb-4">prompt / intent</div>
            <div className="flex flex-wrap gap-1.5 mb-6">
              {promptTokens.map((token, i) => (
                <span
                  key={i}
                  className={`px-2 py-1 text-sm rounded-md border shadow-[0_0_0_1px_hsl(var(--ring))] ${
                    token === "traceable" || token === "PNG" || token === "artifact"
                      ? "bg-primary/15 text-foreground border-primary/35"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {token}
                </span>
              ))}
            </div>
            <div className="flex justify-center mb-6 text-muted-foreground">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 5v14M5 12l7 7 7-7" />
              </svg>
            </div>
            <div className="text-xs font-mono text-muted-foreground mb-4">structured contract</div>
            <div className="flex flex-wrap gap-1.5">
              {responseTokens.map((token, i) => (
                <span
                  key={i}
                  className={`px-2 py-1 text-sm rounded-md border shadow-[0_0_0_1px_hsl(var(--ring))] ${
                    ["semantic", "seedCode", "decoder", "manifest"].includes(token)
                      ? "bg-primary/15 text-foreground border-primary/35"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {token}
                </span>
              ))}
            </div>
          </div>

          <div className="card-border p-6">
            <div className="text-xs font-mono text-muted-foreground mb-4">why it scales</div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Modern harnesses usually stop at tools and control flow. Wittgenstein adds a stricter
              seam:{" "}
              <strong className="text-foreground font-semibold">
                code-bearing contracts, codec boundaries, frozen decoders,
              </strong>{" "}
              and optional tiny seed expanders. When the trade-off is right, post-training moves to
              the harness bundle instead of the base model. Every run leaves artifacts under{" "}
              <span className="font-mono text-xs text-secondary-foreground">artifacts/runs/</span>.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed mt-4">
              That keeps the project legible to both researchers and builders: you can inspect the
              contract, replay the run, and improve one modality without pretending the whole stack
              changed shape.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
