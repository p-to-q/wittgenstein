import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const TITLE = "text-first LLMs, real files out.";

function readPrefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function HeroAnimatedTitle({ className }: { className?: string }) {
  const [reduced, setReduced] = useState(readPrefersReducedMotion);
  const [pulseActive, setPulseActive] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reduced) return;

    let cancelled = false;
    let pulseTimer = 0;
    let releaseTimer = 0;

    const schedulePulse = () => {
      if (cancelled) return;
      const waitMs = 2800 + Math.random() * 2200;
      pulseTimer = window.setTimeout(() => {
        if (cancelled) return;
        setPulseActive(true);

        const dwellMs = 1200 + Math.random() * 800;
        releaseTimer = window.setTimeout(() => {
          if (cancelled) return;
          setPulseActive(false);
          schedulePulse();
        }, dwellMs);
      }, waitMs);
    };

    schedulePulse();

    return () => {
      cancelled = true;
      window.clearTimeout(pulseTimer);
      window.clearTimeout(releaseTimer);
    };
  }, [reduced]);

  return (
    <h1 className={cn("hero-headline", className)}>
      <span
        className="hero-headline__text"
        data-pulse={!reduced && pulseActive ? "active" : "idle"}
      >
        {TITLE}
      </span>
    </h1>
  );
}
