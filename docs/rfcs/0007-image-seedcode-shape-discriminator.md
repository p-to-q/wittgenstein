# RFC-0007 — Image seed-code shape discriminator (1D | 2D)

**Date:** 2026-05-13
**Author:** Maintainer collective (opened via #352)
**Status:** 🟡 Draft v0.1 — pre-emptive; not active until a 1D candidate clears the radar.
**Feeds from:** [2026-05-08 image tokenizer radar](../research/2026-05-08-image-tokenizer-decoder-radar.md), [2026-05-13 per-candidate audits](../research/2026-05-13-audits-fsq-openmagvit2-titok-maskbit.md), Issue [#332](https://github.com/p-to-q/wittgenstein/issues/332) (TiTok)
**Ratified by:** ADR-00YY (pending)

**Summary:** Add a `shape: "1D" | "2D"` discriminator to `ImageLatentCodes` and the adapter contract so 1D-token tokenizers (TiTok and similar) can wire into M1B without rewriting the 2D-assuming pipeline. Stays below the Visual Seed Code abstraction (ADR-0018); does not pick a candidate.

---

## Context

The image codec schema today assumes a 2D token grid: `ImageLatentCodesSchema.tokenGrid: [width, height]` with `tokens.length === width * height` enforced in `superRefine` ([packages/codec-image/src/schema.ts](../../packages/codec-image/src/schema.ts)). Every adapter, every decoder bridge, every receipt assumes 2D.

The radar's Priority 4 candidate ([TiTok](https://arxiv.org/abs/2406.07550)) emits a **1D token sequence** rather than a 2D grid. The per-candidate audit ([#332](https://github.com/p-to-q/wittgenstein/issues/332)) confirms this. Even though TiTok is not the active M1B target (VQGAN-class is Priority 1, [#329](https://github.com/p-to-q/wittgenstein/issues/329)), the radar names eleven candidates and at least one — possibly more as the audit deepens — emits 1D codes.

The discriminator is **load-bearing**: without it, any 1D candidate that clears all four gates would force an emergency schema change under M1B time pressure. Drafting the RFC now is cheaper than discovering the question late.

This RFC is **doctrine pre-positioning**, not candidate selection.

## Proposal

Extend `ImageLatentCodes` with a `shape` discriminator. The 2D form carries `tokenGrid: [w, h]` as today. A new 1D form carries `sequenceLength: number`. Adapters and decoders branch on `shape`. The manifest receipt records which shape fired so cross-candidate comparisons stay honest.

The discriminator sits **below** Visual Seed Code (ADR-0018). VSC is the LLM-facing surface; `shape` is an implementation detail of the latent-codes layer. ADR-0018 does not need to change.

The change is additive and gated: 2D remains the default with no schema migration for current users. A 1D candidate only matters once one clears all four gates per the [radar audit plan](../research/2026-05-08-radar-audit-plan.md). Until then this RFC stays at `Draft v0.1`.

The decoder family enum stays as-is; instead, each decoder family declares its `tokenShape` capability tag inline at registration, so the same family name can support both shapes if its decoder evolves (rare but possible).

## Interface

```ts
// packages/codec-image/src/schema.ts

export const TokenShapeSchema = z.enum(["1D", "2D"]);
export type TokenShape = z.infer<typeof TokenShapeSchema>;

const TokenShape2DPayloadSchema = z.object({
  shape: z.literal("2D"),
  tokenGrid: z.tuple([z.number().int().positive(), z.number().int().positive()]),
});

const TokenShape1DPayloadSchema = z.object({
  shape: z.literal("1D"),
  sequenceLength: z.number().int().positive(),
});

const TokenShapePayloadSchema = z.discriminatedUnion("shape", [
  TokenShape2DPayloadSchema,
  TokenShape1DPayloadSchema,
]);

export const ImageLatentCodesSchema = z
  .object({
    schemaVersion: z.literal("witt.image.latents/v0.2"), // bumped
    family: DecoderFamilySchema,
    codebook: z.string().min(1),
    codebookVersion: z.string().min(1),
    tokens: z.array(z.number().int().nonnegative()),
  })
  .and(TokenShapePayloadSchema)
  .superRefine((value, ctx) => {
    if (value.shape === "2D") {
      const [w, h] = value.tokenGrid;
      if (value.tokens.length !== w * h) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["tokens"],
          message: "2D shape: tokens.length must equal tokenGrid area.",
        });
      }
    } else {
      if (value.tokens.length !== value.sequenceLength) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["tokens"],
          message: "1D shape: tokens.length must equal sequenceLength.",
        });
      }
    }
  });
```

Adapter contract (`packages/codec-image/src/adapters/seed-expander.ts`):

```ts
function expandSeedToLatents(seed: VisualSeedCode, family: DecoderFamily): ImageLatentCodes {
  const capability = decoderRegistry.get(family).tokenShape; // "1D" | "2D"
  return capability === "1D"
    ? expandToSequence(seed, family) // new path
    : expandToGrid(seed, family);    // existing path
}
```

Manifest receipt addition:

```ts
// packages/codec-image/src/codec.ts — within manifestRows()
{ key: "image.tokenShape", value: art.metadata.latents.shape }, // "1D" | "2D"
```

## Migration

The 2D path is unchanged. Existing manifests at `witt.image.latents/v0.1` continue to validate against the previous schema (which v0.2 supersedes; v0.1 stays parseable for receipt replay).

Phase 1 (this RFC ratified): land the schema discriminator, the receipt row, and a stub `expandToSequence` that throws `NotImplementedError`. No 1D candidate is wired. CI verifies the schema accepts both shapes and the 2D round-trip is byte-identical.

Phase 2 (first 1D candidate clears all four gates): implement `expandToSequence` for that candidate, mark the candidate as `decoder-shape: "1D"` in its registration, and add a 1D round-trip golden test alongside the existing 2D one.

There is no deprecation window for 2D — the discriminator is additive. The v0.1 → v0.2 rollout is gated on the full shape-aware compatibility surface: receipt field presence, the `shape` discriminator, and the per-shape token-count invariants (`tokens.length === w * h` for 2D, `=== sequenceLength` for 1D). Implementers must handle both the legacy 2D path and the new shape-discriminated cases during migration.

## Red team

**"Why not just always emit 2D and let 1D tokenizers reshape internally?"** — Tokenizer-specific reshape masks the real semantic of the latent codes (TiTok's positional ordering is not row-major; collapsing it to a fake grid loses information the decoder uses). Honest receipts require the discriminator.

**"This adds branching everywhere the adapter touches."** — One `if (shape === "1D")` at the adapter entry, one row in `manifestRows`. That's the entire visible surface. Decoder bridges already have per-family dispatch.

**"What if a future tokenizer is neither 1D nor 2D (e.g. graph / 3D)?"** — The discriminator is open: `z.enum(["1D", "2D"])` becomes `z.enum(["1D", "2D", "3D"])` in a future RFC. The branch structure scales the same way. Holding off on 3D until a candidate appears is the conservative call.

## Kill criteria

- If by 2027-01-01 no 1D candidate has cleared Gates A+B+C+D in the radar audit plan, the discriminator is dormant doctrine — consider whether to retire it or keep as forward-looking optionality.
- If a 1D candidate wires and the discriminator surfaces a recurring footgun (e.g. adapter branches keep getting it wrong; manifest receipts confuse downstream tooling), revise to a different shape (e.g. always 1D internally with an optional `display.gridHint`).
- If ADR-0018's Visual Seed Code framing absorbs the shape concept (e.g. VSC becomes inherently 1D and decoders carry the reshape), this RFC retires as redundant.

## Decision record

- **Accepted by:** ADR-00YY (pending; only when a 1D candidate becomes a serious M1B alternative).
- **Superseded by:** —
- **Related:** ADR-0018 (Visual Seed Code, the layer above this discriminator); RFC-0001 (Codec Protocol v2, the schema home).

## Refs

- Radar: [2026-05-08 image tokenizer radar](../research/2026-05-08-image-tokenizer-decoder-radar.md)
- Per-candidate audits: [2026-05-13](../research/2026-05-13-audits-fsq-openmagvit2-titok-maskbit.md)
- TiTok audit thread: [#332](https://github.com/p-to-q/wittgenstein/issues/332)
- M1B umbrella: [#70](https://github.com/p-to-q/wittgenstein/issues/70), audit slate: [#283](https://github.com/p-to-q/wittgenstein/issues/283)
- Schema home: [packages/codec-image/src/schema.ts](../../packages/codec-image/src/schema.ts)
