# Brief G — Image-network clues (LLM → image pipeline, pre-port)

**Date:** 2026-04-24
**Last amended:** 2026-04-25 (stub → draft v0.1; G1/G2/G3 each carry a steelman / red team / kill criteria / verdict)
**Author:** research (max.zhuang.yan@gmail.com)
**Status:** 🟡 Draft v0.1 — G1 has a concrete pick; G2 has a v0.2 path and a v0.3 escalation; G3 has a release-train recommendation
**Feeds from:** `docs/v02-alignment-review.md` §2.5, Brief A (VQ/VLM lineage), Brief B (compression vs world models), `docs/exec-plans/active/codec-v2-port.md` (M1 image port)

**Summary:** The user's stated v0.2 priority is the LLM-to-image pipeline. Brief A locked the discrete-token family; Brief B locked the layered IR stance; neither named a concrete decoder, training-data path, or shipping form for M1. Brief G fills that gap. With this draft, M1 has a defensible default for each of the three open questions, and a clear escalation path if the default fails its kill criterion.

---

## Why this brief exists now

Earlier P2 work produced Briefs A–F. None of them answered "what does the image decoder actually look like after M1." Brief A pressure-tested the discrete-token VQ lineage; Brief B locked the IR layering; neither specified the concrete decoder choice for the first real image port. The alignment review on 2026-04-24 identified this as a gap: the exec plan schedules `codec-image` at M1, but the design space for the decoder has not been surveyed since Brief A.

The 2026-04-25 final audit (`docs/v02-final-audit.md` Tier 3) flagged this brief's stub status as the only research blocker for M1. This draft closes that gap with a default-and-fallback for each sub-question.

---

## G1 — Discrete-token vs diffusion decoder

### Question

Is the first image decoder we integrate a discrete-token decoder (LFQ / FSQ family, per Brief A) or a diffusion decoder (SDXL-class) with a constrained prompt path?

### Steelman (default: discrete-token)

The discrete-token path is the only path consistent with three already-locked decisions:

1. **ADR-0005 — Decoder ≠ generator.** A frozen tokenizer + frozen decoder transformer is decisively a _decoder_: given the tokens, the output is deterministic up to floating-point noise. A diffusion model, sampling from a learned image distribution conditional on a prompt, is a _generator_. ADR-0005 binds the core path to the former.
2. **Brief A — VQ/VLM lineage.** Brief A surveyed VQGAN → MAGVIT-v2 → LFQ → FSQ and concluded the LFQ-family is the v0.2 vocabulary. Picking diffusion at M1 would silently reverse Brief A.
3. **Brief B — Layered IR.** The `IR.Text` slot maps cleanly onto a token sequence ("emit these K codebook indices"). An `IR.Latent` slot, currently uninhabited, is the natural future home for direct latent-prediction. Diffusion's latent space (the noise schedule) is not the same shape and would force an awkward third slot.

The concrete pick: **a VQGAN-class decoder, frozen at a pinned checkpoint, with LlamaGen's tokenizer as the codebook authority for the v0.2 demo path.** Both are publicly available with permissive licenses, both have been integrated by independent third parties, and both produce a single PNG per token grid without sampling noise.

### Red team

- **"VQGAN's quality is dated. Modern outputs come from diffusion."** True at the absolute frontier. The repo's job at v0.2 is not to ship state-of-the-art image quality; it is to ship a _protocol shape_ that survives a frozen-decoder swap. When MAGVIT-v2 weights become permissively licensed, or when an FSQ-trained successor lands, the codec swaps the decoder behind the same `Codec<ImageRequest, ImageArtifact>` interface and the rest of the system does not change. Quality is a v0.3 concern; protocol fit is the v0.2 concern.
- **"Emu3 is closer to the thesis: pure NTP over a unified tokenizer kills the scene-spec layer."** Possibly true as a v0.4 vision; not as a v0.2 ship. Emu3's released artifacts are research weights, not a hardened decoder pipeline; the integration cost is large enough that it would push M1 past v0.2. We name Emu3 explicitly as the kill-criterion target for G1's default — see below.
- **"GPT-4o native image generation already does this end-to-end."** Closed model; no decoder to integrate. Useful as a capability target, not as an implementation reference.
- **"Diffusion-as-opt-in adapter satisfies ADR-0005 because the _core_ path stays VQ."** Allowed by ADR-0005's wording. Out of scope for v0.2 — see G1 verdict, "future opt-in" line.

### Kill criteria

- **If a permissively-licensed MAGVIT-v2 / FSQ checkpoint lands before M1 ships,** swap the decoder pick to that checkpoint inside the same brief; the protocol shape is unchanged.
- **If VQGAN-class outputs fail a CLIPScore floor of 0.20** on the v0.2 eval set's curated 8-tile slice, fall back to LlamaGen's full decoder (heavier, slower, but stronger) and document the swap in an ADR-0005 addendum.
- **If a downstream user demands diffusion at M1**, escalate to a `codec-image-sdxl` opt-in adapter under the existing ADR-0005 carve-out for non-default adapters. Do not change the core path.

### Verdict

**G1 = VQGAN-class frozen decoder + LlamaGen tokenizer for the v0.2 demo path.** This is the default M1 ships against. The kill criteria above are the named escape hatches; none of them require a brief revision unless triggered.

---

## G2 — Training data for the L4 adapter

### Question

When `codec-image` grows a real L4 adapter (scene-spec → tokenizer-codebook bridge), what data does it train on?

### Steelman (default: synthetic-pair v0.2 demo, licensed-pair v0.3)

The L4 adapter is the only trainable component in the image stack. Its job is small: map a scene-spec JSON object to a sequence of K codebook indices for the frozen decoder. This is _not_ "train another image model"; it is "train a small bridge", in the LoRA-or-MLP class.

For v0.2 the right training data is **synthetic scene-spec pairs generated from the existing 35-tile showcase**, expanded ~1000× via captioner re-prompting against the locked spec schema. This produces ~30k–60k pairs, enough to train an MLP-class bridge to convergence on a single GPU in hours, not days. The bias of the captioner is a known cost; in exchange we get a dataset that is in-repo, license-clean, and reproducible from a recorded seed.

For v0.3 the path is **licensed caption-image subsets** (CC12M + a curated DataComp-1B slice) re-tokenized through the frozen tokenizer to produce target codebook indices. This is the boring, safe, scalable option; it lands once the protocol survives v0.2.

### Red team

- **"Synthetic pairs collapse the codec into the captioner's biases."** Confirmed and accepted. The v0.2 demo path is explicitly not a quality claim; it is a protocol-shape claim. The synthetic-pair adapter ships with `quality.partial: { reason: "synthetic-trained" }` in its manifest row, and the v0.3 plan replaces it with a licensed-pair adapter without changing any user-facing surface.
- **"LAION-5B is the obvious move and you skipped it."** Skipped on purpose. LAION-5B's licensing posture is unstable enough that depending on it would expose the project to a v0.3 retraction risk we cannot afford. CC12M is the cleaner subset; DataComp-1B has a defensible curation pipeline. Both are reachable in v0.3; LAION-5B is documented as out-of-bounds in `docs/hard-constraints.md` (to be added in the v0.3 doc train).
- **"Self-play training (`produce` → re-captioner → produce') closes the loop in-repo."** Real but mode-collapse-prone (CycleGAN-class failure). Not the v0.2 default. Useful as a v0.3+ experiment under controlled-distillation literature.

### Kill criteria

- **If the synthetic-pair adapter cannot beat a deterministic-mapping baseline** on the v0.2 eval set's structural-quality dimension, the data path is wrong; reopen G2 with a forced licensed-pair v0.3 escalation.
- **If license review of CC12M flags a real risk** before v0.3 ships, escalate to "frozen decoder + paid clean dataset" — the boring-safe option in the brief stub — and document in an ADR.
- **If `IR.Latent` becomes inhabited** (Brief B kill criterion 1 fires), the L4 adapter shape changes and G2 needs to be re-derived against latent-prediction targets, not codebook indices.

### Verdict

**G2 = synthetic-pair training for v0.2 (in-repo, license-clean, ships with `quality.partial`); licensed-pair (CC12M + DataComp-1B slice) for v0.3.** No self-play, no LAION-5B at v0.2 or v0.3.

---

## G3 — Packaging form (MCP / npx / Skill / curl)

### Question

How does `codec-image` ship to users who are not cloning the repo — MCP server, `npx` one-liner, Claude Skill, or `curl | sh`?

### Steelman (default: npx now, MCP next, curl-install last)

The packaging matrix has a natural release-train ordering:

| Form            | When  | Why                                                                                                                                            |
| --------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx` one-liner | v0.2  | Matches RFC-0002's CLI ergonomics. Zero-install. Same binary as `wittgenstein` from a clone. Highest leverage per hour.                        |
| MCP server      | v0.3  | The `Codec<Req, Art>.produce` signature is _already_ a tool definition; an MCP wrapper is a thin shell. Natural fit, premature for v0.2.       |
| Claude Skill    | v0.3  | Skill = AGENTS.md-shaped primer + the MCP server it points at. Lands with the MCP form, not before.                                            |
| `curl \| sh`    | v0.4+ | Matches `rustup` / `gh`. Highest trust cost (users must trust `wittgenstein.wtf`). Worth doing once the site has real content per RFC-0004 M4. |

### Red team

- **"You're sequencing this without the user asking."** The user's explicit guidance is "packaging is not urgent" (Brief G stub). The release-train ordering above does not move work earlier than the user requested; it just names the order so the question does not resurface as an undocumented decision later.
- **"MCP-first beats npx-first because it captures the agent market."** Plausible. The counter is that MCP requires a host (Claude Desktop / Cursor) and a configuration round-trip; `npx` runs from any terminal with Node. For v0.2 reach, npx wins; MCP is right behind it.
- **"`curl | sh` is irresponsible at any release stage."** It's standard practice for `rustup`, `gh`, Homebrew's bootstrap, and Anthropic's own CLI. The trust cost is real but bounded by the domain's reputation; we land it after the site does, not before.

### Kill criteria

- **If RFC-0002 (CLI ergonomics) ratifies a packaging mode other than npx**, G3 follows the ratified mode.
- **If the user assigns a hard date to MCP shipping**, MCP gets promoted to v0.2 and G3 splits into its own brief.
- **If the site (RFC-0004) does not ship by v0.3**, the `curl | sh` form is deferred again; the trust precondition has not been met.

### Verdict

**G3 = npx for v0.2; MCP + Claude Skill for v0.3; `curl | sh` for v0.4+ once the site lands.** Documented in this order in `docs/exec-plans/active/codec-v2-port.md` M5+ as a non-blocker for the codec port itself.

---

## Steelman (overall)

Image-first is the correct priority. The text-to-image pipeline is the demo surface a reader sees first in `docs/showcase.md`, the modality that stresses L4 and L5 hardest, and the capability target that "modality harness for text-first LLMs" is most clearly evaluated against. Getting G1–G3 right is load-bearing for v0.2 landing in a form a senior reviewer would not immediately pick apart. With the verdicts above, M1 has a defensible default for every open decision.

## Red team (overall)

- **"Three sub-briefs in one is bloat."** Counter: each sub-question has its own steelman / red team / kill criteria / verdict, and each verdict is separately reversible without touching the others. A reader who only cares about decoder choice reads §G1 and stops.
- **"You picked VQGAN, which is yesterday's frontier."** Acknowledged in §G1 red team. The protocol shape is the v0.2 product, not the visual quality. Quality is a v0.3+ concern.
- **"Synthetic-pair training is a v0.2 quality lie."** It is, and it ships with `quality.partial: { reason: "synthetic-trained" }`, which is the same invariant that protects every other default-tier metric in the system. Honest partial > silent fallback.

## Kill criteria (overall)

- **If Brief A is updated with a specific M1-decoder recommendation** that contradicts §G1, G1 collapses into Brief A.b and §G1 here is retired.
- **If exec-plan M1 ships without an L4 adapter** (the base-codec's `adapt` being a no-op in `codec-image` too, as it already is in `codec-sensor`), G2 is moot for v0.2 and the L4 work moves to v0.3.
- **If a user-facing surface (CLI / SDK) demands a different packaging form before MCP is ready,** G3 promotes that form in-place.

## Verdict

**Brief G is now Draft v0.1 with three concrete defaults.** It promotes to 🟢 Locked when:

1. M1 ships against the §G1 default and the codec passes its golden-parity gate (`docs/exec-plans/active/codec-v2-port.md` M1 gate);
2. the §G2 synthetic-pair adapter is trained, recorded, and reproduces its own training run from seed;
3. the §G3 npx form publishes against `npm` and is independently invoked by at least one outside reader.

Anything below that bar leaves Brief G at Draft v0.1; anything above promotes it.
