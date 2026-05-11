const modalityChecks = [
  {
    name: "Contract posture",
    subtitle: "schema & parse",
    description:
      "Structured success paths are validated up front so malformed output never silently becomes an artifact.",
    metrics: [
      { label: "parse guard", value: 94, tone: "primary" as const },
      { label: "replay surface", value: 91, tone: "primary" as const },
      { label: "manifest spine", value: 88, tone: "primary" as const },
    ],
  },
  {
    name: "Decoder posture",
    subtitle: "visual seed code",
    description:
      "Frozen decoders are in-bounds for image reconstruction; the repo is not trying to smuggle in a local diffusion stack.",
    metrics: [
      { label: "decoder lock", value: 100, tone: "green" as const },
      { label: "seed-expander seam", value: 76, tone: "green" as const },
      { label: "PNG packaging", value: 89, tone: "green" as const },
    ],
  },
  {
    name: "Runnable surfaces",
    subtitle: "image · audio · sensor",
    description:
      "Lightweight smoke checks track the currently runnable local paths while video catches up.",
    metrics: [
      { label: "image editorial", value: 85, tone: "accent" as const },
      { label: "tts launch", value: 85, tone: "accent" as const },
      { label: "sensor ecg", value: 85, tone: "accent" as const },
    ],
  },
];

const runHistory = [
  { run: "image-editorial", ir: 94, dec: 100, vec: 85, delta: "+5 avg" },
  { run: "tts-launch", ir: 93, dec: 100, vec: 85, delta: "+4 avg" },
  { run: "audio-music", ir: 92, dec: 100, vec: 85, delta: "+3 avg" },
  { run: "sensor-ecg", ir: 95, dec: 100, vec: 85, delta: "+6 avg" },
  { run: "video-seam", ir: 90, dec: 100, vec: 62, delta: "-2 avg" },
];

const barTone = {
  primary: "bg-primary",
  green: "bg-[hsl(var(--muted-green))]",
  accent: "bg-primary/80",
};

export default function EvalsSection() {
  return (
    <section className="py-20 px-4 border-y border-border bg-card" id="evals">
      <div className="max-w-5xl mx-auto">
        <span className="section-number">05</span>
        <h2 className="text-4xl md:text-5xl font-serif mt-2 mb-4 lowercase">checks</h2>
        <p className="text-muted-foreground text-sm max-w-xl mb-10 leading-relaxed">
          Contract-shaped checks for schemas, decoders, and runnable artifact paths. Every real run
          still leaves traces under <span className="font-mono text-xs">artifacts/runs/</span>. The
          percentages below are directional product surfaces, not release receipts; the ground truth
          still lives in manifests, tests, and docs.
        </p>

        <div className="grid md:grid-cols-3 gap-6 mb-10">
          {modalityChecks.map((suite) => (
            <div key={suite.name} className="card-border p-6">
              <div className="flex items-baseline gap-2 mb-1">
                <h3 className="text-base font-medium text-foreground">{suite.name}</h3>
                <span className="text-xs font-mono text-muted-foreground">{suite.subtitle}</span>
              </div>
              <p className="text-sm text-muted-foreground mb-4">{suite.description}</p>
              <div className="space-y-3">
                {suite.metrics.map((m) => (
                  <div key={m.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">{m.label}</span>
                      <span className="font-mono text-muted-foreground">{m.value}%</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden border border-border">
                      <div
                        className={`h-full rounded-full ${barTone[m.tone]}`}
                        style={{ width: `${m.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="card-border p-6">
          <div className="text-xs font-mono text-muted-foreground mb-4">mode snapshots</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-2 font-mono font-normal">surface</th>
                  <th className="pb-2 font-mono font-normal">contract</th>
                  <th className="pb-2 font-mono font-normal">decoder</th>
                  <th className="pb-2 font-mono font-normal">runnable</th>
                  <th className="pb-2 font-mono font-normal">trend</th>
                </tr>
              </thead>
              <tbody>
                {runHistory.map((rh, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-2 font-mono text-muted-foreground">{rh.run}</td>
                    <td className="py-2 font-mono text-muted-foreground">{rh.ir}</td>
                    <td className="py-2 font-mono text-muted-foreground">{rh.dec}</td>
                    <td className="py-2 font-mono text-muted-foreground">{rh.vec}</td>
                    <td className="py-2">
                      {rh.delta && (
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-mono ${
                            rh.delta.startsWith("+")
                              ? "bg-primary/15 text-primary"
                              : "bg-destructive/15 text-destructive"
                          }`}
                        >
                          {rh.delta}
                        </span>
                      )}
                      {!rh.delta && <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
