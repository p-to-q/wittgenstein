# Hard Constraints

Non-negotiables for Wittgenstein v0.2. If a change violates one of these,
it needs an RFC + ADR before it lands — not a PR comment.

## Architecture

- **Five layers, named.** L1 Harness · L2 Codec/Spec · L3 IR/Decoder ·
  L4 Adapter (optional) · L5 Packaging. Use the locked vocabulary
  (`docs/glossary.md`, ADR-0011). Do not introduce alternatives like
  "Loom" / "Transducer" / "Score" / "Handoff" — those names were
  rejected (RFC-0003 ⛔).
- **Image has exactly one shipping path.**
  `LLM → structured JSON scene → adapter → frozen decoder → PNG`. No
  SVG-as-PNG, HTML, Canvas, painter tier, or "temporary fallback".
- **`svg` is a separate modality**, not an image escape hatch. It targets
  vector output via the grammar-constrained engine in
  `research/chat2svg-lora/`.
- **Decoder ≠ generator.** Frozen pretrained decoders are allowed
  (ADR-0005). Diffusion / text-to-image generators are out of scope.
- **Path C rejected through v0.4.** No Chameleon-style full-multimodal
  retrain (ADR-0007).

## Runtime contracts

- **TypeScript + Node 20.19+ + pnpm workspaces.**
- **Schema-first.** Every external boundary (LLM I/O, CLI, codec request)
  has a zod schema in `@wittgenstein/schemas`. Validate at the boundary,
  not three layers in.
- **Codec primitive is `Codec<Req, Art>.produce`** (RFC-0001 / ADR-0008).
  Harness routes; harness does not branch on modality.
- **Codec owns its manifest rows.** The harness must not post-hoc
  override codec metadata. If the codec didn't write it, it doesn't
  exist.
- **No silent fallbacks.** Failures surface as structured errors with
  `quality.partial: { reason }`. Never swallow.
- **Every run writes a manifest** under `artifacts/runs/<run-id>/` —
  git SHA, seed, LLM I/O, artifact SHA-256. Manifests are evidence,
  not telemetry; the manifest spine is the reproducibility contract
  (`docs/reproducibility.md`).
- **Goldens are the regression baseline.** Byte-for-byte for
  deterministic decoders; structural + manifest for LLM-driven paths.

## Package boundaries

- **`@wittgenstein/schemas` has no runtime logic.** Pure types and zod
  schemas only.
- **Codec packages depend on schemas, not each other.**
  `codec-image` does not import from `codec-audio`.
- **Codecs do not own harness code.** Routing, retry, budget, telemetry,
  seed control live in `@wittgenstein/core`.
- **`packages/sandbox/` is the untrusted-code boundary.** Code that
  executes LLM-emitted programs goes through it (see `SECURITY.md`).

## Process

- **Doctrine changes need an ADR or RFC.** Do not bury architectural
  decisions in PR descriptions or commit messages.
- **Soft-warn → hard-warn → removed** is the deprecation lifecycle for
  any externally observable behaviour.
- **Two-hats review** on every doctrine PR: one Researcher pass, one
  Hacker pass (`docs/tracks.md`).
- **No second image path, new operator, or new modality without an RFC.**

## Out of scope (v0.2)

- Trained model weights of any kind we author ourselves (frozen
  pretrained decoders are fine).
- Diffusion stacks, RL training loops, embodied / robotics modalities.
- Multi-tenant production hosting (the sandbox is local-dev grade —
  see `SECURITY.md`).
