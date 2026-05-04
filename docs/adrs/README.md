# ADRs

Architecture Decision Records capture decisions that should survive chat history, PR context, and memory drift.

## Current ADRs

- 0001 record ADR practice
- 0002 TypeScript + pnpm monorepo
- 0003 five-layer harness foundation
- 0004 sole neural image path
- 0005 decoder not generator
- 0006 layered epistemology — compression for rendering, world-models for planning (ratifies Brief B)
- 0007 Path C rejected — no full multimodal retrain
- 0008 Codec Protocol v2 adoption (ratifies RFC-0001)
- 0009 CLI ergonomics v2 (ratifies RFC-0002)
- 0010 naming locked — Loom / Transducer / Score / Handoff (ratifies RFC-0003) — **superseded by 0011**
- 0011 naming v2 locked — Harness / Codec / Spec / IR / Decoder / Adapter / Packaging (ratifies RFC-0005; supersedes 0010)
- 0012 issue / PR label taxonomy (ratifies `docs/labels.md` introduced via PR #71)
- 0013 independent ratification for doctrine-bearing PRs (ratifies the rule introduced via PR #75)
- 0014 governance lane for meta-process doctrine — defines `(Governance Note →) ADR → inline summary` as the legal path for review / archive / labels / agency / surface-classification decisions
- 0015 audio decoder family — ratifies Brief I (Kokoro-82M-family default, Piper fallback, no tokenizer at v0.3, procedural soundscape/music, CPU byte-parity / GPU structural-parity)
- 0016 untrusted-code execution boundary — locks `polyglot-mini`'s subprocess+timeout+safe-globals as research-grade only; names `@wittgenstein/sandbox` (nsjail / bubblewrap / Pyodide-WASM) as the production-path entrypoint; production engagement of the painter path is a hard error until that lands

## Lanes

Two separate decision lanes feed into ADRs:

- **Engineering lane** — `Brief → RFC → ADR → exec-plan → code`. Used for codec / modality / protocol / runtime decisions (e.g. ADR-0008 ratifying RFC-0001 from Briefs A+G+H).
- **Governance lane** — `(optional) Governance Note → ADR → inline summary in the canonical operating doc`. Used for review / archive / labels / agency / research-surface / contributor-map decisions (e.g. ADRs 0012–0014). See ADR-0014 for the rules.

Doctrine that lives inline in `docs/engineering-discipline.md` should be a summary of a ratifying ADR, not the doctrine itself.
