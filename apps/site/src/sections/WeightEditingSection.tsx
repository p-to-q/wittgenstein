const packagingNotes = [
  {
    name: "CLI & install",
    pct: "L5",
    description:
      "Ships the command surface, install conventions, and smoke checks so contributors land in the right package quickly.",
  },
  {
    name: "RunManifest",
    pct: "IR",
    description:
      "Shared trace schema for codec id, route, adapter version, artifact hashes, and replay handles.",
  },
  {
    name: "docs & skills",
    pct: "DX",
    description:
      "Architecture docs plus per-codec READMEs keep image, audio, sensor, and video responsibilities explicit.",
  },
  {
    name: "distribution",
    pct: "pkg",
    description:
      "Versioned harness bundles let tiny adapters and modality-specific logic ship beside the runtime rather than inside the base model.",
  },
];

export default function WeightEditingSection() {
  const layerSignals = [5, 8, 12, 18, 25, 35, 48, 62, 78, 85, 90, 90.4, 85, 72, 55, 40];

  return (
    <section className="py-20 px-4 border-t border-border bg-card" id="packaging">
      <div className="max-w-5xl mx-auto">
        <span className="section-number">07</span>
        <h2 className="text-4xl md:text-5xl font-serif mt-2 mb-4 lowercase">packaging</h2>
        <p className="text-muted-foreground text-sm max-w-xl mb-10 leading-relaxed">
          Layer five turns the architecture into something people can actually use: CLI, install,
          shared schemas, docs, agent primers, and distribution conventions.
        </p>

        <div className="card-border p-6">
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-xs font-mono text-muted-foreground">
              manifest depth · 16 surfaced checkpoints
            </div>
            <div className="text-xs font-mono text-muted-foreground">target harness</div>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            Runtime and contracts are ahead of a few renderers; packaging is where that progress
            becomes legible, installable, and reusable.
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            For a project like this, release hygiene is not an afterthought. The packaging layer is
            what turns a clever architecture into something teammates, judges, contributors, and
            future users can actually pick up.
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            The percentages below are directional packaging signals, not release-gating numbers.
            They show where the shared runtime is already stable and where some modality surfaces
            are still catching up.
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-4 gap-1">
                {layerSignals.map((signal, i) => (
                  <div key={i} className="flex flex-col items-center">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center border-2"
                      style={{
                        borderColor: signal > 40 ? "hsl(var(--primary))" : "hsl(var(--border))",
                        backgroundColor:
                          i === 11 ? "hsl(var(--primary) / 0.12)" : "hsl(var(--card))",
                      }}
                    >
                      <span className="text-xs font-mono text-muted-foreground">{i}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-8 mt-6">
                <div className="text-center">
                  <div className="text-3xl font-light text-muted-foreground">42%</div>
                  <div className="text-xs text-muted-foreground">codecs</div>
                </div>
                <div className="flex-1 h-px bg-border" />
                <div className="text-center">
                  <div className="text-3xl font-light text-foreground">88%</div>
                  <div className="text-xs text-muted-foreground">runtime</div>
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs font-mono text-muted-foreground mb-4">release</div>
              <div className="space-y-2">
                {["scaffold", "manifest", "publish", "tag"].map((step, idx) => (
                  <div key={step} className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${idx < 3 ? "bg-[hsl(var(--muted-green))]" : "bg-muted-foreground/40"}`}
                    />
                    <span
                      className={`text-sm ${idx < 3 ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      {step}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-6">
                <span className="px-3 py-1 bg-secondary rounded-full text-xs font-mono text-muted-foreground border border-border">
                  RunManifest
                </span>
              </div>

              <div className="mt-4 flex items-center gap-2 text-sm">
                <span className="text-[hsl(var(--muted-green))] font-mono">pnpm ok</span>
                <span className="text-border">|</span>
                <span className="text-primary font-mono">benchmark</span>
              </div>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-border">
            <div className="text-xs font-mono text-muted-foreground mb-4">what ships</div>
            <div className="grid sm:grid-cols-2 gap-4">
              {packagingNotes.map((finding) => (
                <div key={finding.name} className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-full border-2 border-primary/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-mono text-primary">{finding.pct}</span>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">{finding.name}</div>
                    <div className="text-xs text-muted-foreground">{finding.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between pt-4 border-t border-border">
            <div className="text-xs text-muted-foreground">
              Apache-2.0 · traceable artifacts · contributor-ready CLI
            </div>
            <a
              href="#s-thesis"
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              read the thesis
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
