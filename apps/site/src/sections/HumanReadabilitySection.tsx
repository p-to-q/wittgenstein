import { lazy, Suspense } from "react";

const PipelineGargantua = lazy(() => import("../components/PipelineGargantua"));

export default function HumanReadabilitySection() {
  return (
    <section
      className="py-20 px-4 bg-[hsl(var(--deep-dark))] text-[hsl(var(--ivory))] border-y border-[hsl(var(--dark-surface))]"
      id="s-pipeline"
    >
      <div className="max-w-5xl mx-auto">
        <span className="section-number text-[hsl(var(--warm-silver))]">03</span>
        <h2 className="text-4xl md:text-5xl font-serif mt-2 mb-4 lowercase text-[hsl(var(--ivory))]">
          pipeline
        </h2>
        <p className="text-[hsl(var(--warm-silver))] text-sm max-w-2xl mb-10 leading-relaxed">
          The locked image pipeline stays narrow: Visual Seed Code-bearing contract → seed expander
          / adapter → frozen decoder → PNG. Semantic IR still helps with model-side organization and
          user inspection, but it no longer owns the path. Decoder ≠ generator, and every run writes
          a trace under <span className="font-mono text-xs">artifacts/runs/</span>. Audio, sensor,
          and video follow the same philosophy: modality-specific code first, local runtime second,
          file output last.
        </p>

        <div className="relative mb-8 rounded-xl overflow-hidden border border-[hsl(var(--dark-surface))] bg-black shadow-[0_0_0_1px_rgba(0,0,0,0.4)]">
          <Suspense
            fallback={
              <div
                className="w-full h-[min(22rem,50vh)] md:h-[26rem] animate-pulse bg-[#0a0a0a]"
                aria-hidden
              />
            }
          >
            <PipelineGargantua className="relative w-full h-[min(22rem,50vh)] md:h-[26rem] touch-none [&_canvas]:cursor-grab [&_canvas:active]:cursor-grabbing" />
          </Suspense>
          <div className="pointer-events-none absolute left-4 top-4 z-10 text-left">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-white/80 drop-shadow-md">
              Gargantua
            </p>
            <p className="mt-1 text-[0.6rem] uppercase tracking-[0.15em] text-white/40 drop-shadow-md">
              drag to orbit · WebGL
            </p>
          </div>
        </div>

        <div className="card-border p-0 overflow-hidden border-[hsl(var(--dark-surface))] bg-[hsl(var(--dark-surface))]">
          <pre
            className="font-mono text-[0.7rem] leading-[1.85] p-5 overflow-x-auto whitespace-pre text-[hsl(var(--warm-silver))]"
            aria-hidden
          >
            <span className="text-[hsl(var(--coral))]">User prompt</span>
            {"\n    →  schema preamble + image contract"}
            {"\n          →  "}
            <span className="text-[hsl(var(--coral))]">LLM</span>
            {" (planner)"}
            {"\n                →  "}
            <span className="text-[hsl(var(--coral))]">parse</span>
            {" (zod)"}
            {"\n                      →  "}
            <span className="text-[hsl(var(--coral))]">inspect</span>
            {" (semantic, optional)"}
            {"\n                            →  "}
            <span className="text-[hsl(var(--coral))]">expand</span>
            {" (seedCode / coarse code)"}
            {"\n                                  →  "}
            <span className="text-[hsl(var(--coral))]">adapter</span>
            {" (seed expander)"}
            {"\n                                        →  "}
            <span className="text-[hsl(var(--coral))]">decoder</span>
            {" (frozen)"}
            {"\n                                              →  "}
            <span className="text-[hsl(var(--coral))]">packageRasterAsPng</span>
            {"\n                                                    →  artifact + manifest"}
          </pre>
        </div>

        <div className="mt-6 p-6 rounded-xl border border-[hsl(var(--dark-surface))] bg-[rgba(48,48,46,0.55)]">
          <div className="text-xs font-medium tracking-[0.06em] uppercase text-[hsl(var(--warm-silver))] mb-4">
            coverage · scaffold depth
          </div>
          <div className="flex items-center gap-3 mb-3">
            <span className="font-mono text-[0.7rem] text-[hsl(var(--warm-silver))] w-14 shrink-0">
              runtime
            </span>
            <div className="flex-1 h-[1.35rem] rounded-md overflow-hidden border border-[hsl(var(--dark-surface))] bg-[rgba(20,20,19,0.5)]">
              <div className="h-full w-[88%] rounded-md bg-primary" />
            </div>
            <span className="font-mono text-[0.7rem] text-[hsl(var(--warm-silver))] w-10 text-right shrink-0">
              88%
            </span>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <span className="font-mono text-[0.7rem] text-[hsl(var(--warm-silver))] w-14 shrink-0">
              codecs
            </span>
            <div className="flex-1 h-[1.35rem] rounded-md overflow-hidden border border-[hsl(var(--dark-surface))] bg-[rgba(20,20,19,0.5)]">
              <div className="h-full w-[42%] rounded-md bg-[hsl(var(--muted-green))]" />
            </div>
            <span className="font-mono text-[0.7rem] text-[hsl(var(--warm-silver))] w-10 text-right shrink-0">
              42%
            </span>
          </div>
          <p className="text-[0.8125rem] text-[hsl(var(--warm-silver))] leading-relaxed">
            Illustrative only: these bars show relative scaffold depth, not benchmarked release
            scores. Runtime and shared contracts are ahead of some finished renderers. Image already
            centers on Visual Seed Code plus frozen-decoder wiring; sensor expands deterministic
            operators; audio renders local WAV artifacts; video still waits on the fuller MP4 branch
            to be merged back into the main flow.
          </p>
        </div>
      </div>
    </section>
  );
}
