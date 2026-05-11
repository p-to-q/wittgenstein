export default function Footer() {
  return (
    <footer className="py-12 px-4 border-t border-border bg-[hsl(var(--deep-dark))] text-[hsl(var(--warm-silver))]">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap justify-center gap-6 mb-8 text-sm">
          <a href="#top" className="hover:text-[hsl(var(--ivory))] transition-colors">
            Status
          </a>
          <a href="#s-layers" className="hover:text-[hsl(var(--ivory))] transition-colors">
            Layers
          </a>
          <a href="#s-thesis" className="hover:text-[hsl(var(--ivory))] transition-colors">
            Research
          </a>
        </div>
        <div className="text-center text-xs text-muted-foreground mb-12 text-[hsl(var(--stone))]">
          &copy; 2026 Wittgenstein. The modality harness for text-first LLMs. Apache-2.0.
        </div>
        <div className="text-center">
          <span
            className="text-[120px] md:text-[200px] font-serif leading-none select-none pointer-events-none"
            style={{ color: 'rgba(176, 174, 165, 0.22)' }}
          >
            Wittgenstein
          </span>
        </div>
      </div>
    </footer>
  );
}
