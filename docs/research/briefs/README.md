# Research Briefs

First-pass research briefs produced under **Phase P2** of the v0.2 Restructuring Action Outline. Each brief is a self-contained document that pressure-tests one claim, lineage, or engineering convention relevant to the Wittgenstein thesis.

## Brief index

| ID  | Title                                                                          | Question                                                                                                     | Status                  |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ----------------------- |
| A   | [VQ / VLM lineage 2026 refresh](A_vq_vlm_lineage_audit.md)                     | Does the VQ-token / frozen-decoder path still look like the right bet in April 2026?                         | 🟡 Draft v0.1           |
| B   | [Compression vs world models — Ilya ↔ LeCun](B_compression_vs_world_models.md) | Where does Wittgenstein stand on the Ilya/LeCun tension? _(critical-path brief)_                             | 🟡 Draft v0.1           |
| C   | [Unproven-but-interesting horizon scan](C_unproven_horizon.md)                 | Which 6–8 unvalidated hypotheses should shape the 18-month roadmap?                                          | 🟡 Draft v0.1           |
| D   | [CLI / SDK / harness conventions](D_cli_and_sdk_conventions.md)                | How do modern AI CLIs and SDKs look; where is Wittgenstein off the grid?                                     | 🟡 Draft v0.1           |
| E   | [Per-modality quality benchmarks](E_benchmarks_v2.md)                          | What's the smallest set of real (non-structural) quality metrics per modality?                               | 🟡 Draft v0.1           |
| F   | [Site ↔ repo reconciliation](F_site_reconciliation.md)                         | Which `wittgenstein.wtf` claims contradict v0.1.0-alpha.2?                                                   | 🟡 Draft v0.1           |
| G   | [Image-network clues](G_image_network_clues.md)                                | Which decoder / data / packaging form ships for `codec-image` at exec-plan M1?                               | 🟡 Draft v0.1           |
| H   | [Codec engineering prior art](H_codec_engineering_prior_art.md)                | Which production-validated TS projects share our `Codec<Req, Art>` shape, and what to copy at M1A?           | 🟡 Draft v0.1           |
| I   | [Audio codec landscape](I_audio_codec_landscape.md)                            | Which open-weight TTS decoder, audio tokenizer, and soundscape/music stance should v0.3 audio adopt?         | 🟢 Ratified by ADR-0015 |
| J   | [Audio engineering and routes](J_audio_engineering_and_routes.md)              | What is the smallest honest M2 engineering shape for audio routes, manifest rows, fixtures, and deprecation? | 🟡 Draft v0.1           |
| K   | [Orchestration prior art](K_orchestration_prior_art.md)                        | Which 2026 orchestration / harness primitives (Symphony / Trellis / Anthropic) should Wittgenstein adopt?    | 🟡 Draft v0.1           |

## Where briefs land (map)

The full Brief → RFC → ADR → exec-plan → code lineage with explicit engineering vs governance lanes (per ADR-0014). When adding a new brief / RFC / ADR / exec-plan, edit [`lineage.mermaid`](lineage.mermaid) first (it is the canonical raw form for tooling) and then sync this embed.

```mermaid
flowchart LR
    %% ----- Briefs -----
    A["Brief A<br/>VQ / VLM lineage"]
    B["Brief B<br/>Compression vs world models"]
    C["Brief C<br/>Horizon hypotheses"]
    D["Brief D<br/>CLI / SDK conventions"]
    E["Brief E<br/>Per-modality benchmarks v2"]
    F["Brief F<br/>Site reconciliation"]
    G["Brief G<br/>Image-network clues"]
    H["Brief H<br/>Codec engineering prior art"]
    I["Brief I<br/>Audio codec landscape"]
    J["Brief J<br/>Audio engineering & routes"]
    Audit["Audit memo<br/>2026-04-27 + 2026-05-03"]

    %% ----- RFCs -----
    RFC1["RFC-0001<br/>Codec Protocol v2"]
    RFC2["RFC-0002<br/>CLI ergonomics"]
    RFC3["RFC-0003<br/>Naming (rejected)"]
    RFC4["RFC-0004<br/>Site reconciliation"]
    RFC5["RFC-0005<br/>Naming v2"]

    %% ----- ADRs -----
    ADR5["ADR-0005<br/>Decoder ≠ generator"]
    ADR6["ADR-0006<br/>Layered epistemology"]
    ADR7["ADR-0007<br/>Path C rejected"]
    ADR8["ADR-0008<br/>Codec v2 adoption"]
    ADR9["ADR-0009<br/>CLI v2"]
    ADR10["ADR-0010<br/>Naming v1 (superseded)"]
    ADR11["ADR-0011<br/>Naming v2 locked"]
    ADR12["ADR-0012<br/>Label taxonomy"]
    ADR13["ADR-0013<br/>Independent ratification"]
    ADR14["ADR-0014<br/>Governance lane"]
    ADR15["ADR-0015<br/>Audio decoder family"]
    ADR16["ADR-0016<br/>Untrusted code boundary"]
    ADR17(["ADR-0017<br/>Test-ratio thresholds (planned)"])

    %% ----- Execution + code -----
    M1A["exec §M1A<br/>image port (PR #68)"]
    M2["exec §M2<br/>audio port (PRs #93–96, #121)"]
    M3["exec §M3<br/>sensor port (planned)"]
    Goldens["fixtures/golden/<br/>(sensor ✅, audio C3 ✅)"]
    Code["packages/* code"]

    %% ----- Engineering lane -----
    A -->|VQ lineage refresh| ADR5
    A -->|LFQ-family naming| RFC1
    G -->|image clues| RFC1
    H -->|engineering prior art| RFC1
    RFC1 ==> ADR8
    ADR8 ==> M1A
    M1A ==> Code
    M1A -->|first golden surface| Goldens

    I -->|TTS decoder verdict| ADR15
    J -->|route shape + manifest| M2
    ADR15 ==> M2
    M2 ==> Code
    M2 -->|three-route fixtures| Goldens

    B -.->|stance grounding| ADR6
    B -.->|Path C rejection| ADR7

    D --> RFC2
    RFC2 ==> ADR9
    F --> RFC4

    C -.->|H9 patch-grid| RFC1
    C -.->|H10 long-code| M1A
    E -.->|UTMOS / WER bar| I
    E -.->|UTMOS / WER bar| J

    RFC3 -.x|rejected| ADR10
    RFC5 ==> ADR11
    ADR10 -.->|superseded by| ADR11

    %% ----- Governance lane (ADR-0014 introduces the pattern) -----
    Audit ==> ADR12
    Audit ==> ADR13
    Audit ==> ADR14
    ADR14 -->|governs future| ADR16
    ADR14 -->|governs future| ADR17

    %% ----- Style -----
    classDef brief fill:#e8f4ff,stroke:#3178c6,color:#000
    classDef rfc fill:#fff5e6,stroke:#d97706,color:#000
    classDef adr fill:#e6ffe6,stroke:#16a34a,color:#000
    classDef adrPlanned fill:#f3f4f6,stroke:#6b7280,color:#000,stroke-dasharray: 5 5
    classDef exec fill:#fce7f3,stroke:#be185d,color:#000
    classDef code fill:#f5f5f5,stroke:#000,color:#000

    class A,B,C,D,E,F,G,H,I,J,Audit brief
    class RFC1,RFC2,RFC3,RFC4,RFC5 rfc
    class ADR5,ADR6,ADR7,ADR8,ADR9,ADR10,ADR11,ADR12,ADR13,ADR14,ADR15,ADR16 adr
    class ADR17 adrPlanned
    class M1A,M2,M3 exec
    class Goldens,Code code
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

- 🟢 Ratified by ADR-NNNN (verdict final, cited by an ADR)
- 🟡 Draft (first pass complete; invites review)
- 🔴 Not started

## Review process

Each brief gets two reviews before its verdict is promoted to final:

1. **Researcher hat** — does this survive contact with 2024–2026 literature?
2. **Hacker hat** — if an agent read this at 2 a.m., would it write the right code?

If either hat dissents, the brief iterates; otherwise the verdict lands in an ADR and the brief is marked 🟢.

## Companion docs

- [`docs/research/program.md`](../program.md) — top-level map of engineering-borrow research, model/literature research, and pre-M2 closure status
- `docs/THESIS.md` — master statement these briefs pressure-test (lands in PR #6)
- `docs/inheritance-audit.md` — Keep/Promote/Revise/Retire table (lands in PR #6)
- `docs/rfcs/` — engineering decisions that ratify brief verdicts
- `docs/adrs/` — permanent record of accepted verdicts
- `docs/agent-guides/` — prompt-ready recipes for phase-specific implementation work
- `M2-route-deprecation-inventory.md` — bounded preflight inventory for `AudioRequest.route` / `--route` migration work before the M2 port opens

If `docs/THESIS.md` and `docs/inheritance-audit.md` are not present in your checkout yet,
merge PR #6 first, then treat this folder as Phase P2.
