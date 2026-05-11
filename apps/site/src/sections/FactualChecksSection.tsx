const codecs = [
  {
    label: "Image",
    body: "Single raster path: Visual Seed Code-bearing contract, optional semantic layer, seed expander seam, frozen decoder, and PNG packaging. This is the research path, not a fallback tier.",
  },
  {
    label: "Audio",
    body: "Typed routes for speech, soundscape, and music, with local WAV rendering, ambient layering, and one shared harness contract.",
  },
  {
    label: "Video",
    body: "Composition-first IR plus a HyperFrames-shaped render seam. The structure is in place; the fuller MP4 path is still being merged.",
  },
  {
    label: "Sensor",
    body: "Deterministic operator specs expand into time-series outputs, then ship as JSON, CSV, and a loupe-friendly HTML view.",
  },
];

export default function FactualChecksSection() {
  return (
    <section className="py-20 px-4 bg-background" id="s-codecs">
      <div className="max-w-5xl mx-auto">
        <span className="section-number">04</span>
        <h2 className="text-4xl md:text-5xl font-serif mt-2 mb-4 lowercase">codecs</h2>
        <p className="text-muted-foreground text-sm max-w-xl mb-10 leading-relaxed">
          Each modality is an isolated package sharing the{" "}
          <strong className="text-foreground font-semibold">WittgensteinCodec</strong>-shaped
          contract through shared schemas, manifests, and runtime conventions.
        </p>
        <p className="text-muted-foreground text-sm max-w-2xl mb-10 leading-relaxed">
          In practice, that means each codec can move at its own speed while still fitting the same
          harness. Image is the strictest and most research-shaped path; audio and sensor already
          produce useful local outputs; video is waiting for the fuller MP4 path to land.
        </p>

        <div className="grid sm:grid-cols-2 gap-4">
          {codecs.map((c) => (
            <div key={c.label} className="card-border p-6">
              <p className="text-xs font-medium tracking-[0.08em] uppercase text-muted-foreground mb-2">
                {c.label}
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
