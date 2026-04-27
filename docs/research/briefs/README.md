# Research Briefs

First-pass research briefs produced under **Phase P2** of the v0.2 Restructuring Action Outline. Each brief is a self-contained document that pressure-tests one claim, lineage, or engineering convention relevant to the Wittgenstein thesis.

## Brief index

| ID  | Title                                                                          | Question                                                                                                     | Status        |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------- |
| A   | [VQ / VLM lineage 2026 refresh](A_vq_vlm_lineage_audit.md)                     | Does the VQ-token / frozen-decoder path still look like the right bet in April 2026?                         | 🟡 Draft v0.1 |
| B   | [Compression vs world models — Ilya ↔ LeCun](B_compression_vs_world_models.md) | Where does Wittgenstein stand on the Ilya/LeCun tension? _(critical-path brief)_                             | 🟡 Draft v0.1 |
| C   | [Unproven-but-interesting horizon scan](C_unproven_horizon.md)                 | Which 6–8 unvalidated hypotheses should shape the 18-month roadmap?                                          | 🟡 Draft v0.1 |
| D   | [CLI / SDK / harness conventions](D_cli_and_sdk_conventions.md)                | How do modern AI CLIs and SDKs look; where is Wittgenstein off the grid?                                     | 🟡 Draft v0.1 |
| E   | [Per-modality quality benchmarks](E_benchmarks_v2.md)                          | What's the smallest set of real (non-structural) quality metrics per modality?                               | 🟡 Draft v0.1 |
| F   | [Site ↔ repo reconciliation](F_site_reconciliation.md)                         | Which `wittgenstein.wtf` claims contradict v0.1.0-alpha.2?                                                   | 🟡 Draft v0.1 |
| G   | [Image-network clues](G_image_network_clues.md)                                | Which decoder / data / packaging form ships for `codec-image` at exec-plan M1?                               | 🟡 Draft v0.1 |
| H   | [Codec engineering prior art](H_codec_engineering_prior_art.md)                | Which production-validated TS projects share our `Codec<Req, Art>` shape, and what to copy at M1A?           | 🟡 Draft v0.1 |
| I   | [Audio codec landscape](I_audio_codec_landscape.md)                            | Which open-weight TTS decoder, audio tokenizer, and soundscape/music stance should v0.3 audio adopt?         | 🟡 Draft v0.1 |
| J   | [Audio engineering and routes](J_audio_engineering_and_routes.md)              | What is the smallest honest M2 engineering shape for audio routes, manifest rows, fixtures, and deprecation? | 🟡 Draft v0.1 |

## Where briefs land (map)

```mermaid
flowchart LR
  A["Brief A: VQ / VLM lineage"] -->|updates decoder vocabulary| ADR["ADR(s): decoder ≠ generator, image path"]
  B["Brief B: Ilya ↔ LeCun stance"] -->|pins stance + kill criteria| ADR
  C["Brief C: horizon hypotheses"] -->|prices bets| RFC["RFC(s): protocol + IR boundaries"]
  D["Brief D: CLI/SDK conventions"] -->|aligns UX surface| RFC
  E["Brief E: benchmarks v2"] -->|defines metrics| RFC
  F["Brief F: site↔repo diff"] -->|reconciles public narrative| RFC
  H["Brief H: codec engineering prior art"] -->|amends protocol typing + warnings| RFC
  I["Brief I: audio codec landscape"] -->|pins M2 decoder family + reproducibility verdict| ADR
  J["Brief J: audio engineering + routes"] -->|pins M2 route/manifest/deprecation shape| Code

  RFC --> Code["Code changes\npackages/*, docs/*"]
  ADR --> Code
  Code --> Runs["Artifacts + manifests\nartifacts/runs/<id>/"]
```

## Brief shape (required)

Every brief ships with the four-station loop as grep-able headings:

```
## Steelman
## Red team
## Kill criteria
## Verdict
```

Plus a dated header and a version tag (`v0.1`, `v0.2`, …) so iteration is visible.

## Status legend

- 🟢 Merged (verdict final, cited by an ADR)
- 🟡 Draft (first pass complete; invites review)
- 🔴 Not started

## Review process

Each brief gets two reviews before its verdict is promoted to final:

1. **Researcher hat** — does this survive contact with 2024–2026 literature?
2. **Hacker hat** — if an agent read this at 2 a.m., would it write the right code?

If either hat dissents, the brief iterates; otherwise the verdict lands in an ADR and the brief is marked 🟢.

## Companion docs

- `docs/THESIS.md` — master statement these briefs pressure-test (lands in PR #6)
- `docs/inheritance-audit.md` — Keep/Promote/Revise/Retire table (lands in PR #6)
- `docs/rfcs/` — engineering decisions that ratify brief verdicts
- `docs/adrs/` — permanent record of accepted verdicts
- `docs/agent-guides/` — prompt-ready recipes for phase-specific implementation work

If `docs/THESIS.md` and `docs/inheritance-audit.md` are not present in your checkout yet,
merge PR #6 first, then treat this folder as Phase P2.
