import { HeroAnimatedTitle } from "@/components/HeroAnimatedTitle";

const GITHUB_REPO_HREF = "https://github.com/p-to-q/wittgenstein";

function GitHubMarkIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={className}
      fill="currentColor"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.5 7.5 0 0 1 8 4.84c.68 0 1.37.09 2.01.27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

export default function HeroSection() {
  return (
    <section className="pt-32 pb-16 text-center px-4 relative" id="top">
      <HeroAnimatedTitle className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-serif mb-10 tracking-tight text-foreground leading-[1.12] max-w-5xl mx-auto animate-fade-in-up" />
      <p className="text-base text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed">
        A <strong className="text-foreground font-semibold">harness-first modality layer</strong>{" "}
        for text-first LLMs. The model stays a planner; modality contracts, codecs, seed expanders,
        frozen decoders, and deterministic runtimes turn structured outputs into real files such as{" "}
        <strong className="text-foreground font-semibold">PNG, WAV, HTML, JSON,</strong> and, on
        machines with the local video renderer installed,{" "}
        <strong className="text-foreground font-semibold">MP4</strong>.
      </p>
      <p className="text-sm text-muted-foreground max-w-xl mx-auto mb-8 leading-relaxed">
        The point is not to pretend a text model is already a native multimodal stack. The point is
        to give it narrow, inspectable code paths: Visual Seed Code for image, local render routes
        for audio and sensor, and traceable artifact receipts at every step.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <a href="#s-layers" className="yellow-btn inline-flex items-center justify-center">
          Inspect the five layers
        </a>
        <a
          href={GITHUB_REPO_HREF}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-[#020408] bg-[#020408] px-6 py-3 text-sm font-medium text-[#FAF9F5] shadow-[0_0_0_1px_#020408] transition-colors hover:bg-[#0a0d14]"
        >
          <GitHubMarkIcon className="h-4 w-4 shrink-0 opacity-90" />
          GitHub
        </a>
      </div>
    </section>
  );
}
