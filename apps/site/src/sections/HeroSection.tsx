import { GitFork } from "lucide-react";

import { HeroAnimatedTitle } from "@/components/HeroAnimatedTitle";

const GITHUB_REPO_HREF = "https://github.com/wittgenstein-cli/wittgenstein";

export default function HeroSection() {
  return (
    <section className="pt-32 pb-16 text-center px-4 relative" id="top">
      <HeroAnimatedTitle className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-serif mb-10 tracking-tight text-foreground leading-[1.12] max-w-5xl mx-auto animate-fade-in-up" />
      <p className="text-base text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed">
        A <strong className="text-foreground font-semibold">harness-first modality layer</strong>{" "}
        for text-first LLMs. The model stays a planner; modality contracts, codecs, seed expanders,
        frozen decoders, and deterministic runtimes turn structured outputs into real files such as{" "}
        <strong className="text-foreground font-semibold">PNG, WAV, HTML, JSON,</strong> and, once
        the video branch is fully wired back in,{" "}
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
          <GitFork className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
          GitHub
        </a>
      </div>
    </section>
  );
}
