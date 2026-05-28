const LAUNCH_DOC_HREF =
  "https://github.com/p-to-q/wittgenstein/blob/main/docs/modality-launch-surface.md";

export default function FooterCTA() {
  return (
    <section className="py-20 px-4 border-t border-border bg-secondary" id="footer-cta">
      <div className="max-w-5xl mx-auto text-center">
        <h2 className="text-2xl md:text-3xl font-serif mb-6 text-foreground">Want the shortest useful path?</h2>
        <div className="flex flex-wrap justify-center gap-3 mb-12">
          <a
            href="#top"
            className="inline-flex items-center px-5 py-2.5 rounded-md text-sm font-medium bg-card text-secondary-foreground border border-transparent shadow-[0_0_0_1px_hsl(var(--ring))] hover:bg-background hover:shadow-[0_0_0_1px_hsl(var(--stone))] transition-colors"
          >
            Back to overview
          </a>
          <a
            href={LAUNCH_DOC_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-5 py-2.5 rounded-md text-sm font-medium bg-card text-secondary-foreground border border-transparent shadow-[0_0_0_1px_hsl(var(--ring))] hover:bg-background hover:shadow-[0_0_0_1px_hsl(var(--stone))] transition-colors"
            title="Open the launch surface doc on GitHub"
          >
            docs/modality-launch-surface.md
          </a>
          <span className="inline-flex items-center px-5 py-2.5 rounded-md text-sm font-medium bg-card text-secondary-foreground border border-transparent shadow-[0_0_0_1px_hsl(var(--ring))]">
            pnpm launch:check
          </span>
        </div>

        <div className="flex justify-center gap-4 flex-wrap" aria-label="Section anchors">
          {[
            { href: '#s-thesis', label: 'T', title: 'Thesis' },
            { href: '#s-layers', label: 'L', title: 'Layers' },
            { href: '#s-pipeline', label: 'P', title: 'Pipeline' },
            { href: '#s-codecs', label: 'C', title: 'Codecs' },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              title={item.title}
              className="w-10 h-10 rounded-full bg-card flex items-center justify-center text-xs font-semibold text-muted-foreground shadow-[0_0_0_1px_hsl(var(--ring))] hover:bg-background hover:text-foreground transition-colors"
            >
              {item.label}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
