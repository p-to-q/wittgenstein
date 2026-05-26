# v0.2 Alignment Review — self-audit against original intent

**Date:** 2026-04-25
**Author:** review (@Jah-yee @Moapacha)
**Status:** Decisions merged into this PR
**Scope:** P1–P5 of the v0.2 restructuring vs. the original hackathon-era PPT deck and repeated product statements.

This document is the self-audit the user asked for: re-read P1–P5 against the original
intent, identify drift, and make decisions rather than just flag problems. Outputs that
follow from each decision are named at the end of every row.

---

## 1. What is well-aligned (keep as-is)

The bulk of the doc stack does what it was commissioned to do. In particular:

- **Compression ↔ world-models position (Brief B, ADR-0006).** Matches the deck's Ilya
  quote ("a good enough LLM is a system approximating Kolmogorov-optimal compression")
  and its "Text LLM 已经在参数里压缩了大量图像的结构信息" frame. The _Layered_ position
  - _Agnostic_ engineering contract (only `Text` inhabited today) is the right posture.
    Keep.
- **VQ / LFQ lineage audit (Brief A, feeds ADR-0008).** Matches the timeline slide
  (Wittgenstein 1921 → van den Oord 2017 → Brown/Sutskever 2020 → Rombach/Esser 2021–22
  → Ge/Zhao/Shan 2023–24 → Wittgenstein 2026). The "VQ decoder → LFQ-family discrete-token
  decoder" vocabulary bump is correct.
- **Path C rejection (ADR-0007).** Matches the deck's "过去十年业界以为多模态必须依赖
  VQ-VAE + fusion training，必须重训整个 model … 我们通过极小的后训练成本以及规则编解码".
  The formal ADR makes the implicit stance explicit. Keep.
- **L1–L5 (ADR-0003, now reinforced by ADR-0008).** The five layers match the
  "Architecture" slide (User/CLI → Core Runtime → Codec → per-modality → Artifacts +
  Manifest). Good.
- **Strict image path (ADR-0005).** The "Strict, strict image path" slide is literally
  the rule: Text LLM → Scene Spec JSON → Adapter → Frozen Decoder → PNG, with an
  optional `providerLatents` bypass. The repo's sole-image-path stance is the slide,
  word-for-word. Keep.
- **Research → RFC → ADR → exec-plan governance (Tracks, P5).** The two-track contract
  is correct and agent-friendly. Keep.
- **Reproducibility spine (RunManifest).** Locked in THESIS and AGENTS.md. Keep.

## 2. Where P1–P5 drifted (what to fix)

Six drift points. Each has a named decision and a named output.

### 2.1. "text-first models" vs "text-first LLMs"

**Drift.** P1's THESIS.md locked _"the modality harness for text-first models."_ The PPT
deck, `AGENTS.md`, and the root `README.md:5` all say _"text-first LLMs."_ The user's
follow-up message also says _"Text-First LLMs."_ Inside THESIS.md itself the two forms
co-exist (§Master says "models", §Extension says "text-only LLMs"). Brief F caught a
README↔THESIS mismatch and chose "models" as canonical — that choice was the drift, not
the fix.

**Decision.** Revert to _"text-first LLMs"_ everywhere. The PPT is the source of truth;
"LLMs" is the word the user actually uses; and LLMs is already the word `AGENTS.md`
sends first-contact agents home with.

**Output.** Edit `docs/THESIS.md`, `docs/SYNTHESIS_v0.2.md`, `docs/inheritance-audit.md`
and any stray "text-first models" occurrence. Root README stays on "LLMs" (already correct).

### 2.2. Naming pass over-engineered the middleware layer

**Drift.** RFC-0003 / ADR-0010 introduced four new names: **Loom** (middleware layer),
**Transducer** (Adapter+Decoder pair), **Score** (Build Artifact primitive), **Handoff**
(IR sum type). The architecture slide uses exactly _one_ word for the middleware
layer — **Codec** — and one word for the middle artifact — **Scene Spec JSON** (or per
modality: "audio plan", "algorithm spec"). The intermediate type is literally labelled
**Modality IR**.

"Loom" invents a layer that doesn't exist as a separate thing in the slide or in
`AGENTS.md` (where L2 is called "IR / Codec" directly). "Transducer" adds a wrapping
name for two concepts (Adapter, Decoder) that are already clearly separable. "Score"
replaces the existing "Spec" vocabulary with a musical metaphor that doesn't translate
to sensor / audio. "Handoff" replaces "IR" — a word compiler people already understand
— with a business metaphor.

The user's bar, restated: _"像 Senior 研究员、工程师或 Hacker 做出来的东西"_ (should look
like a senior researcher / engineer / hacker made this). Four creative-writing names in
place of industry-standard ones fails that bar.

**Decision.** Supersede RFC-0003 with RFC-0005 (v0.2 naming revision) and paired
ADR-0011. Retire Loom, Transducer, Score, Handoff. Lock the PPT-native vocabulary:

| What                       | Name                                     | Source                                                 |
| -------------------------- | ---------------------------------------- | ------------------------------------------------------ |
| L1 runtime + dispatch      | **Harness**                              | already canonical                                      |
| L2 middleware layer        | **Codec**                                | PPT architecture slide, AGENTS.md §Thesis              |
| L3 byte producer           | **Decoder**                              | PPT strict-image-path slide                            |
| L4 optional learned bridge | **Adapter**                              | PPT strict-image-path slide                            |
| L5 packaging / CLI surface | **Packaging**                            | AGENTS.md §Thesis                                      |
| middle structured artifact | **Spec**                                 | PPT: "Scene Spec JSON", "audio plan", "algorithm spec" |
| IR sum type                | **IR** (`IR = Text \| Latent \| Hybrid`) | PPT: "Modality IR"                                     |

No new invented words. Future readers (human or agent) read the PPT, AGENTS.md, or any
paper in the VQ lineage and can map to our code directly.

**Output.** `docs/rfcs/0005-naming-v0.2.md` supersedes RFC-0003. `docs/adrs/0011-naming-v0.2.md`
ratifies. RFC-0003 status flips to ⚫ Superseded. ADR-0010 amended with supersession note.

### 2.3. Two-round LLM pipeline was over-specified as default

**Drift.** RFC-0001 § Interface recommended _two_ LLM rounds (round 1 free-form expansion,
round 2 schema-constrained JSON) as the default. The strict-image-path slide shows _one_
call producing Scene Spec JSON directly. Two rounds doubles price and latency for a
quality claim we haven't measured on Wittgenstein's own prompts; the XGrammar/Outlines
evidence is strong but is not the same thing as "our prompts need this."

**Decision.** Make **one round** the default; two rounds is a `--expansion=on` opt-in
per codec that the quality benchmarks in Brief E can motivate. This matches:

- the PPT image path (one structured-output call),
- the "目标要收敛" (goals should converge) constraint from the user's message,
- Brief E's three-dimension rule (Latency / Price / Quality) — two rounds regresses two
  dimensions without a measured Quality win.

**Output.** Amend RFC-0001 §Interface + ADR-0008 §Decision to make one-round default.
Two-round stays as an opt-in documented in RFC-0001 §Appendix.

### 2.4. Exec plan ordered migration sensor → audio → image

**Drift.** `docs/exec-plans/active/codec-v2-port.md` phased the codec-v2 port as
M1 sensor → M2 audio → M3 image. The argument was "cheapest first" (sensor is a trivial
three-function dispatch). But the user's explicit priority is _"我们要先实现的是 LLM to
Image 这条管线"_ — image first. The product story, the showcase images, the strict image
path that makes the repo distinctive all live on the image codec. Shipping sensor v2
first delivers zero demoable progress against the LLM→Image goal.

**Decision.** Reorder to **image first**. Sensor and audio follow after the image path
has landed and the interface is proven on the hardest case.

New order: **M0 types → M1 image → M2 audio → M3 sensor → M4 harness cleanup → M5 benchmarks v2.**

Rationale: if the `Codec<Req, Art>` interface can hold the image path (with adapter + frozen
decoder + packaging), it can hold sensor (which is pure DSP). The reverse is not true — a
sensor-first port risks under-specifying the L4 adapter station because sensor doesn't have
one, and we'd discover the hole when we hit image.

**Output.** Rewrite the phase table in `docs/exec-plans/active/codec-v2-port.md`.

### 2.5. Image-network research for next-round plan not yet captured

**Drift.** The user wants a research doc on (a) what network to build for the image
codec's learned adapter, (b) training strategy, (c) data sources, (d) GPT-4o image-gen
prior art including partial-redraw, (e) package form (npx, MCP, Claude skill, curl). None
of P1–P5 captured this. Brief A audited the _decoder_ family (VQGAN, LFQ, etc.); no brief
surveyed the _adapter_ training story or the end-user packaging story.

**Decision.** Open **Brief G — Image Network Clues** as a starter/clues document, not a
full four-station brief yet. Its purpose is to capture the threads the user named so the
next round of research (Brief G v0.2 / Brief H full research) has a running start.
Mark as 🔴 Starter (not 🟡 Draft).

Scope for the clues doc:

- GPT-4o image generation: what is publicly documented about its tokenizer, its
  adapter-or-lack-thereof, its partial-redraw / inpainting mechanism;
- The open-weights candidates from Brief A (LlamaGen, MAGVIT-v2, Emu3, TA-TiTok, SEED-LLaMA)
  reread for _what we would train against_, not just _what we would decode with_;
- Post-training cost frame (LoRA / adapter-size sweet spot for scene-spec → latent);
- Data source options (LAION subsets, SAM masks for spatial grounding, synthetic
  scene-spec data generated from our own pipeline for bootstrapping);
- Package-form survey (npx, MCP server, Anthropic Claude skill, curl one-liner) and
  how they constrain the network / runtime shape;
- Kill criteria for Brief G v0.2: what would make "small learned adapter over frozen
  decoder" infeasible and push us back to "rules only" or forward to "full decoder fine-tune."

**Output.** `docs/research/briefs/G_image_network_clues.md` — starter doc, ~2k words,
enough to prime the next-round plan.

### 2.6. lark CLI reference not actually cited

**Drift.** The user named `larksuite/cli` as a CLI reference in both the original plan
context and again in this review's driving message. Brief D surveyed Claude Code / Codex
/ Gemini / Kimi / Cursor / gh / npm / OpenAI Agents SDK / Anthropic SDK — 9 tools — but
did not actually cite lark. The omission is on me.

**Decision.** Add a lark CLI citation block to Brief D and surface its conventions in
RFC-0002 and ADR-0009.

**Output.** Amend `docs/research/briefs/D_cli_and_sdk_conventions.md` with a lark entry.
Cross-reference from RFC-0002.

## 3. Where the bar was already right (confirming, not changing)

The user said _"合理把控东西的边界，不要被我的话吓到"_ (reasonably control scope; don't
be frightened by the ask). These items look like drift-candidates but are actually fine:

- **Five layers (L1–L5)** — matches the architecture slide. Keep.
- **`IR = Text | Latent | Hybrid`** — Brief B's Position (iii)+(iv) contract. The slot
  exists to make the JEPA kill-criterion falsifiable, not because JEPA is being built
  now. Keep.
- **Two-hats review (Researcher + Hacker)** — makes the agent-first ethos enforceable
  at review time. Keep.
- **35-artifact showcase as v0.1 receipt** — frozen. Keep.
- **Price ≈ 0 in dry-run** — keeps local-first. Keep.

## 4. Agent-friendliness — audit

The user asked for agent-friendly to be the #1 priority, not user-friendly. Current
state:

- ✅ `AGENTS.md` at the repo root, loaded early, contains the thesis + L1–L5 + repo map
  - read order. Good.
- ✅ All doc layers are grep-able (THESIS / briefs / RFCs / ADRs / exec-plans have
  headings designed for agent retrieval).
- ✅ Structured errors, schemas at every boundary, manifest-per-run. Agents get
  traceable failures.
- ⚠️ Agent read order in `AGENTS.md` doesn't mention `docs/tracks.md` (P5 new),
  `docs/rfcs/`, or `docs/adrs/` beyond implication. Fix: extend the read order.
- ⚠️ `CONTRIBUTING.md` currently frames architectural proposals as _"update both code
  and an ADR"_ — the P5 update clarified this as brief → RFC → ADR → code, which is
  the agent-friendly chain. Already queued (CONTRIBUTING was updated in P5 but reverted
  on main; P5 PR #36 carries the fix). No new action here.

**Output.** Small edit to `AGENTS.md` §Read Order to add tracks / RFCs / ADRs and the
`docs/research/briefs/README.md` entry point.

## 5. Packaging form — recorded, not decided

The user explicitly said the npx / MCP / skill / curl external packaging is _"目前也不
急"_ (not urgent). Captured in Brief G §Package form so it isn't forgotten when the next
round comes back to it. No decision this round.

## 6. Summary of decisions

| #   | Drift                               | Decision                                                                             | New / changed artifact                                         |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| 2.1 | "text-first models" vs "LLMs"       | Revert to **LLMs**                                                                   | THESIS.md, SYNTHESIS_v0.2.md, inheritance-audit.md edits       |
| 2.2 | Naming over-engineered              | Retire Loom/Transducer/Score/Handoff; lock **Codec / Decoder / Adapter / Spec / IR** | RFC-0005 supersedes RFC-0003; ADR-0011 ratifies; RFC-0003 → ⚫ |
| 2.3 | Two-round LLM default               | **One round** default; two rounds opt-in                                             | RFC-0001 §Interface + ADR-0008 §Decision amended               |
| 2.4 | Exec plan ordered wrong             | **Image first**, then audio, sensor, cleanup                                         | codec-v2-port.md phase table rewritten                         |
| 2.5 | Image-network research not captured | Open **Brief G** as starter/clues                                                    | docs/research/briefs/G_image_network_clues.md                  |
| 2.6 | Lark CLI not cited                  | Add lark citation + cross-refs                                                       | Brief D + RFC-0002 amended                                     |
| 4   | Agent read-order incomplete         | Extend AGENTS.md §Read Order                                                         | AGENTS.md edit                                                 |

## 7. What this review explicitly does _not_ touch

- The master statement ("the modality harness for text-first LLMs") and the L1–L5
  architecture stay locked.
- ADR-0006 / ADR-0007 / ADR-0008 / ADR-0009 decisions stay in force (ADR-0008 gets a
  one-line amendment for the two-round → one-round flip; ADR-0010 gets a supersession
  note; rest is untouched).
- No code changes. All edits are in docs and exec-plan markdown.
- Path C (full multimodal retrain) stays rejected.
- `wittgenstein.wtf` rewrite (RFC-0004) stays on Posture B — no action this round.

## 8. Next round (after this PR lands)

- **Brief G v0.2 / Brief H** — promote the clues doc into a full four-station research
  brief covering: training target for the scene-spec → latent adapter, concrete data
  pipeline, GPT-4o-style partial-redraw feasibility, and a decision between
  "train-a-small-adapter" vs "RAG-style retrieval over a fixed-codebook lookup."
- **Exec plan M1 (image codec v2 port)** kicks off once Brief G v0.2 names a concrete
  decoder + adapter target. Until then, M0 (types only) is the only safe work.
- **Package-form RFC** (npx, MCP, Claude skill, curl) — separate RFC, post-M1.

---

**Reviewed by:** research hat (Brief B evidence ✓, Brief A evidence ✓); hacker hat
(agent-read-order ✓, grep-ability ✓). The PR carrying this review also carries the
7 edits named above so decisions and outputs land atomically.
