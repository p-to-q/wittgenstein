# Brief I — Audio codec landscape

**Date:** 2026-04-27
**Status:** 🟡 Draft v0.1
**Question:** Which open-weight TTS decoder family, audio tokenizer, soundscape stance, and music stance should Wittgenstein adopt at v0.3, given license, reproducibility, and quality constraints?
**Feeds into:** ADR-0015 (audio decoder family), `docs/agent-guides/audio-port.md` amendment, `docs/exec-plans/active/codec-v2-port.md` §M2.
**Companion:** Brief J (`J_audio_engineering_and_routes.md`) — engineering shape; Brief E (`E_benchmarks_v2.md`) — quality bar (UTMOS / WER / DNSMOS / CLAP).

> This brief is the audio analog of Brief A (image VQ-VLM lineage). It pressure-tests the 2026 open-weight TTS landscape against three constraints — commercial-permissive license, seed-deterministic inference, and a quality floor of UTMOS ≥ 3.8 — and decides whether v0.3 ships a neural TTS path or falls back to procedural OS-level speech (`say` / `espeak-ng`). Soundscape and music verdicts are scoped to a single ship-defer-kill answer each, not full architecture.

---

## Stage and boundaries

This brief assumes the repo is in the post-M1A, pre-M2 stage. M2 audio is preparing both research scaffolding (this brief plus Brief J) and execution scaffolding (Issue #76 prep inventory). The brief does **not**:

- propose a new codec protocol (RFC-0001 + ADR-0008 are locked);
- challenge the harness's modality-blind shape;
- fully architect neural soundscape or music — those are forward-looked only;
- decide CLI ergonomics around `--route` (Brief J §Verdict 5 owns that contract).

It does decide which decoder family the audio codec consumes, what the tokenizer story is, and whether soundscape / music go neural in v0.3.

---

## Steelman

### 1. TTS decoder selection

The 2026 permissive-license shortlist has narrowed sharply since the last broad survey. Four candidates clear the license bar; four either lack a commercial path or carry research-only weights.

#### Hypothesis I.1 — Kokoro-82M is the calibrated default

**Claim.** `Kokoro-82M` is the right TTS decoder family for v0.3 audio. It satisfies all three sweep-level constraints (license, reproducibility, quality), is small enough to ship as part of an installable harness, and has the cleanest provenance story in the shortlist.

- **Supporting:** Kokoro-82M ships **Apache-2.0** code, **Apache-2.0 model weights**, and was trained exclusively on permissive / non-copyrighted audio with IPA phoneme labels — no scraped-dataset license carry-over ([HF model card](https://huggingface.co/hexgrad/Kokoro-82M)). It climbed to **#1 on the TTS Arena leaderboard in January 2026**, defeating XTTS-v2 and MetaVoice ([reviewnexa.com](https://reviewnexa.com/kokoro-tts-review/), [arifsolmaz.github.io](https://arifsolmaz.github.io/repo/2026/01/28/kokoro-82m/)). The **decoder-only single-pass architecture** is the most reproducibility-friendly shape in the shortlist: no iterative diffusion, no flow-matching ODE solver loop, no autoregressive token-by-token sampling at temperature > 0. At 82M parameters and ~350 MB weights, it is deployable on commodity CPU without GPU dependency. The Spheron 2026 deployment guide places it alongside Fish Speech and Hume TADA as the production-grade open-weight tier ([spheron.network](https://www.spheron.network/blog/deploy-open-source-tts-gpu-cloud-2026/)).
- **Disconfirming:** Kokoro covers a smaller voice / language surface than XTTS-v2 historically did. Voice cloning is not a first-class capability — for that the Wittgenstein use case would need a paired SECS evaluator (Brief E gap noted). Single-pass decoder-only does not automatically mean bit-exact across hardware; cuDNN atomics and non-deterministic conv kernels can still introduce drift on GPU even with a fixed seed (PyTorch reproducibility docs). The model card does not advertise an explicit determinism contract.
- **Implication if true.** ADR-0015 names "Kokoro-82M-family decoder" as the v0.3 TTS path. `audio-port.md` mirrors M1A's "LFQ-family-decoder" naming pattern and writes "Kokoro-82M-family decoder" into the manifest's `decoderId` field. M2 ships speech with structural-parity (sample rate, channels, duration ±5%) under the deterministic-by-default Brief J §Verdict 4 contract; CPU inference is the deterministic-replay path, GPU is structural-only.
- **Confidence: 0.6** — license + permissive-data story is unusually strong; quality is verified by an independent leaderboard; the only unknown is bit-exact replay on a fixed CPU/GPU pair, which M2 verifies as part of the parity test.
- **What would flip this.** A reproducibility test in M2 finds Kokoro-82M is non-deterministic even on CPU with `torch.use_deterministic_algorithms(True)` (↓ to 0.3, fall back to Piper). A second TTS Arena cycle in 2026-Q3 demotes Kokoro below an Apache-2.0 competitor with comparable size (↓ to 0.3). Voice cloning becomes a hard requirement for v0.3 (rare, but would force a re-evaluation toward XTTS-class architectures).

#### Hypothesis I.2 — Piper is the calibrated fallback

**Claim.** `Piper` is the correct fallback if Kokoro fails the M2 reproducibility test. It is the most license-clean and most deterministically-deployable open TTS in the shortlist, at the cost of slightly older synthesis quality.

- **Supporting:** Piper is **MIT-licensed** ([rhasspy/piper](https://github.com/rhasspy/piper)), based on **VITS** voices exported to **ONNX runtime** for inference. ONNX runtime on CPU is broadly deterministic by default, and Piper is explicitly optimized for offline / local / Raspberry-Pi-class deployment — meaning the inference path is single-pass and side-effect-free. piper-tts v1.4.2 was released April 2, 2026, indicating active maintenance ([PyPI](https://pypi.org/project/piper-tts/)). Voice catalog is large and per-language packaged.
- **Disconfirming:** Piper voices reflect 2023-era VITS quality rather than 2025-class flow-matching or diffusion quality; UTMOS is competent but typically below recent leaderboard winners. Quality varies significantly across community-trained voices, so the "Piper voice" choice becomes a per-voice quality decision rather than a model decision.
- **Implication if true.** `audio-port.md` writes "Piper-family decoder" and pins one community voice as the default; the manifest's `decoderId` is `piper:<voice-id>:<voice-hash>`. Soundscape / music remain procedural per H I.4 / I.5.
- **Confidence: 0.3** — fallback only; promote to default only if Kokoro fails the determinism gate.
- **What would flip this.** Kokoro reproducibility verdict at the M2 gate is "non-deterministic on all backends" (↑ to 0.6, Piper becomes default). A new ONNX-deterministic-friendly Apache-2.0 model lands in 2026-Q3 with quality ≥ Kokoro (↑ to 0.6).

#### Hypothesis I.3 — F5-TTS via the OpenF5 fork is workable but not preferred

**Claim.** F5-TTS code is MIT-licensed but the official weights are CC-BY-NC because the Emilia training dataset carries a non-commercial covenant. The community `OpenF5-TTS-Base` fork is **Apache-2.0** with permissive training data and is therefore a legal commercial path, but the split-license story makes provenance harder to communicate to downstream users.

- **Supporting:** Code is MIT ([SWivid/F5-TTS](https://github.com/SWivid/F5-TTS/blob/main/LICENSE)). `OpenF5-TTS-Base` ([HF](https://huggingface.co/mrfakename/OpenF5-TTS-Base)) is Apache-2.0 weights trained on permissive data. Flow-matching architecture produces high-quality voice cloning that has been called "the most realistic open-source zero-shot voice clone model" ([uberduck.ai](https://www.uberduck.ai/post/f5-tts-is-the-most-realistic-open-source-zero-shot-text-to-speech-so-far)).
- **Disconfirming:** Flow-matching requires an ODE solver loop at inference; this is the **least reproducibility-friendly** architecture of the four candidates — different solver step counts, tolerances, or backends produce different waveforms even with a fixed seed. The split between official-weights-CC-BY-NC and community-weights-Apache-2.0 is hard to communicate downstream; a casual user landing on `SWivid/F5-TTS` will pick the wrong weights for commercial use.
- **Implication if true.** F5-TTS / OpenF5 stays a horizon track, not a v0.3 default. If voice cloning becomes a hard product requirement post-v0.3, OpenF5 is the leading candidate.
- **Confidence: 0.1** as a v0.3 default; **0.3** as a v0.4 voice-cloning extension.
- **What would flip this.** Voice cloning lands in the v0.3 product spec (rare). The flow-matching reproducibility gap closes with a deterministic-solver release (low odds in 2026).

#### Rejected candidates (one paragraph each)

- **Coqui XTTS-v2** — License is **CPML (non-commercial)** ([HF discussion](https://huggingface.co/coqui/XTTS-v2/discussions/106)). Coqui shut down in January 2024 so no commercial license is purchasable. **Auto-rejected** by sweep kill criterion §1. Even though XTTS held #2 on TTS Arena before Kokoro and is the strongest research-only candidate, no commercial path = no v0.3 path.
- **Fish-Speech** — Released under "FISH AUDIO RESEARCH LICENSE" ([fishaudio/fish-speech](https://github.com/fishaudio/fish-speech)). Not a standard open license; license review concludes it is research-only at best and ambiguous at worst. **Rejected** for v0.3.
- **MaskGCT** — Trained on the **Emilia** dataset (same non-commercial carry-over as F5-TTS official weights). Code open-source via Amphion ([open-mmlab/Amphion](https://github.com/open-mmlab/Amphion/blob/main/models/tts/maskgct/README.md)) but weights inherit the dataset license. **Rejected** for v0.3 — would require a re-train on permissive data, out of scope.
- **Parler-TTS** — Insufficient 2026 commercial-license clarity in the search results. Flagged for re-evaluation in 2026-Q3 if a permissive build emerges; **not a v0.3 candidate** today.
- **MeloTTS** — Insufficient recent data; not in the 2026 production-grade tier per the BentoML / Spheron surveys. **Rejected** by absence.

### 2. Audio tokenizer landscape

#### Hypothesis I.4 — Wittgenstein consumes Kokoro as opaque waveform; no tokenizer needed

**Claim.** Kokoro-82M emits a waveform directly. Wittgenstein's audio codec consumes that waveform as bytes, finalizes via `finalizeAudioArtifact` (Brief J §Context), and stamps manifest fields per Brief J §Verdict 3. There is no need for a separate audio tokenizer (EnCodec / DAC / Mimi) at the harness boundary.

- **Supporting:** The harness's role is to coordinate planner + decoder, not to inspect intermediate token streams. Brief J §Verdict 4 already locks fixture classes around waveform output (byte-parity for deterministic, structural for LLM-driven). Adding a tokenizer between Kokoro and the manifest would create an unused indirection — the tokens would be consumed only by the decoder itself, which already lives in Kokoro's runtime.
- **Disconfirming:** If v0.3 later ships speech-in (transcription) or a streaming dialogue path à la Moshi, a 12.5Hz codec like **Mimi** ([kyutai/mimi](https://huggingface.co/kyutai/mimi)) becomes the right tokenizer because it matches LLM token speeds. EnCodec ([facebookresearch/encodec](https://github.com/facebookresearch/encodec), MIT) and DAC ([descriptinc/descript-audio-codec](https://github.com/descriptinc/descript-audio-codec), MIT) are both production-grade for analyze-and-resynthesize loops.
- **Implication if true.** No `packages/codec-audio-tokenizer/` package needed at v0.3. The audio codec's `IR` variant is `Text` (matching the protocol's existing inhabited variant); `Latent` and `Hybrid` IR remain reserved for future bidirectional modalities.
- **Confidence: 0.6** — opaque-waveform is the smallest correct boundary for one-direction TTS. If v0.3 stays text-in / audio-out only, no tokenizer is needed.
- **What would flip this.** The product spec adds bidirectional audio (speech-in transcription path) post-v0.3 (↑ to 0.3 for Mimi as preferred tokenizer). A future neural soundscape route requires patch-grid tokens for diffusion-class decoders (separate brief).

### 3. Neural soundscape position

#### Hypothesis I.5 — Defer neural soundscape to v0.4

**Claim.** Soundscape stays procedural in v0.3 (current operator-library + ambient mix per Brief J §Context). Neural soundscape is a horizon-track only.

- **Supporting:** **Stable Audio Open 1.0** is the strongest open candidate ([HF](https://huggingface.co/stabilityai/stable-audio-open-1.0/blob/main/LICENSE.md)) — Stability AI Community License, all training data CC0 / CC BY / CC Sampling+, attribution preserved. Performance beats AudioLDM2 and AudioGen for sound effects ([arxiv 2407.14358](https://arxiv.org/html/2407.14358v2)). **But** the Stability Community License is not strictly Apache-2.0; commercial use has a $1M revenue cap that will eventually force a rewrite. Diffusion-based generation is also reproducibility-hostile (DDPM sampling has known inter-backend non-determinism). The procedural soundscape currently in `runtime.ts` is byte-stable, deterministic by design, and adequate for v0.3 product needs.
- **Disconfirming:** Procedural soundscape produces "obviously synthetic" output that limits showcase appeal in some demos. If the v0.3 launch prioritizes showcase quality over reproducibility, neural soundscape becomes attractive.
- **Implication if true.** Audio codec ships three procedural-by-default routes for v0.3. A separate brief (Brief K?) opens for neural soundscape after Brief I lands and after the v0.3 launch produces a real demand signal.
- **Confidence: 0.6** — defer is the calibrated default given license + determinism + adequacy.
- **What would flip this.** v0.3 product spec elevates soundscape quality as a launch-day requirement (↑ to 0.3 for ship). Stable Audio Open 2.x ships under a strict Apache-2.0 license (↑ to 0.3 for ship).

### 4. Neural music position

#### Hypothesis I.6 — Defer neural music to v0.4; preserve Brief C H4's procedural-as-LilyPond stance

**Claim.** Music stays procedural / symbolic-synth in v0.3, consistent with Brief C H4 (music as LilyPond / symbolic representation). MusicGen and Stable Audio Open are horizon-track.

- **Supporting:** Brief C H4 already takes the position that program-synthesis (LilyPond, MIDI, structured score) outperforms sampling for structured musical content. Adding a neural music decoder would contradict that brief and reopen a settled question. **MusicGen** is open with documented training data, but its license carry-over is encumbered enough that "open" does not equal "Apache-2.0" ([bentoml.com](https://www.bentoml.com/blog/exploring-the-world-of-open-source-text-to-speech-models)). Neural music is also the modality where reproducibility matters most (a "different mix on every run" demo is unusable), and diffusion-based approaches struggle with this.
- **Disconfirming:** Brief C H4 confidence was 0.3, not 0.6 — meaning the procedural-only stance is itself a hypothesis, not a settled doctrine. If neural music quality jumps decisively in 2026-Q3 (e.g. a new MusicLM-class open release with structured controllability), the position should be re-evaluated.
- **Implication if true.** Audio codec's `music` route stays symbolic-synth in v0.3. A future spike could test MusicGen integration as a fourth route, but it would require its own brief and explicit Brief C H4 reconciliation.
- **Confidence: 0.6** — defer is consistent with Brief C and with reproducibility doctrine.
- **What would flip this.** A 2026-Q3 open-weight music model lands under Apache-2.0 with structured score conditioning and seed-deterministic CPU inference (very narrow band; not currently visible).

### 5. Reproducibility verdict

#### Hypothesis I.7 — CPU-deterministic, GPU-structural; the manifest carries the determinism class

**Claim.** Neural TTS in 2026 is bit-exact reproducible only on CPU with explicit determinism flags. GPU paths are structural-parity-only because of cuDNN atomic operations and known non-deterministic kernel paths. Wittgenstein commits to a **two-tier reproducibility contract**: CPU = byte-parity, GPU = structural-parity, with the determinism class written to the manifest by the codec's `package` stage (per Brief J §Verdict 3).

- **Supporting:** PyTorch reproducibility docs are explicit ([pytorch.org](https://docs.pytorch.org/docs/stable/notes/randomness.html)): `torch.manual_seed(seed)` + `torch.use_deterministic_algorithms(True)` + `torch.backends.cudnn.deterministic=True` produce reproducible CPU runs, but **ConvolutionBackwardFilter, ConvolutionBackwardData, PoolingBackward, SpatialTfSamplerBackward, and CTCLoss** retain non-deterministic GPU paths even with all flags set, because their atomic-operation reductions introduce floating-point rounding at the hardware level. ONNX runtime on CPU is generally deterministic; ONNX runtime on CUDA is not (uses the same cuDNN paths). Single-pass decoder-only architectures (Kokoro) are the most determinism-friendly because they avoid iterative sampling; flow-matching (F5-TTS) and diffusion (Stable Audio) are the worst.
- **Disconfirming:** None of the candidates ship with an explicit "this is CPU-bit-exact" contract — that's a property we have to verify, not inherit. The verification step lands in M2's parity-tts test.
- **Implication if true.** The manifest carries `audio.determinismClass: "byte-parity" | "structural-parity"` (Brief J §Verdict 3). M2's `parity-tts.test.ts` runs Kokoro on CPU with deterministic flags, asserts byte-exact replay across ≥ 3 invocations, and locks the resulting SHA into a golden. GPU runs use the structural assertions. Wittgenstein **does not promise** GPU-bit-exact for neural TTS — it explicitly logs determinism class in the manifest so a downstream consumer can decide whether to trust the SHA.
- **Confidence: 0.6** — this is the calibrated answer; "neural TTS is deterministic in 2026" is an over-promise without backend-pinning, and Wittgenstein already has the manifest seam to declare it cleanly.
- **What would flip this.** A determinism-by-construction TTS (e.g. fully ONNX-runtime-based with no atomic-reduction kernels) lands and clears the quality bar (↑ to 0.8 for byte-parity GPU). PyTorch ships a deterministic atomic-reduction kernel set (no signal of this in 2026).

---

## Red team

The strongest objection is that **Kokoro-82M is too young**. It hit #1 on TTS Arena in January 2026; that's three months of leaderboard data. A 2026-Q3 Arena rotation could demote it. The mitigation is the kill criterion in H I.1 — a single Arena demotion below an Apache-2.0 competitor flips confidence to 0.3, and Brief I gets revised. This is exactly what the four-station methodology is for.

The second objection is that the **opaque-waveform / no-tokenizer decision (H I.4) is conservative to the point of giving up future optionality**. If v0.3.5 wants to add streaming dialogue (Moshi-class), the lack of a tokenizer in the protocol becomes load-bearing rework. Mitigation: the protocol's `IR` sum already names `Latent` and `Hybrid` as reserved variants; adding a `Mimi` tokenizer later is a `drift correction` (per ADR-0013 §3), not a doctrine change.

The third objection is that **deferring soundscape and music (H I.5 / I.6) leaves v0.3 audio looking unambitious next to fully-neural competitors**. True. But the Wittgenstein thesis is that reproducibility is a feature, not a constraint to relax; procedural soundscape and symbolic-synth music are byte-stable by construction, and the v0.3 launch sells "every artifact replays bit-exactly" rather than "every artifact is freshly synthesized". The thesis-aligned path is to ship the determinism story before the surface area.

The fourth objection is that **the F5-TTS / OpenF5 split (H I.3) is treated too dismissively**. OpenF5-Apache-2.0 is a real path. Counter: flow-matching reproducibility is a real wall, not a license accident. Even if OpenF5 were strictly Apache-2.0, the ODE-solver-loop architecture would land it in structural-parity-only territory permanently. Kokoro's single-pass shape is fundamentally simpler.

---

## Kill criteria

The recommendations in this brief should be considered wrong, and therefore not promoted into ADR-0015, if any of the following happens during M2:

1. **Sweep-level kill criterion** (verbatim): _If Brief I cannot identify a TTS decoder family with all three of (a) commercial-permissive or clearly research-permissive license (no CC-BY-NC-only weights), (b) seed-deterministic inference verified on at least one reference implementation (CPU-deterministic acceptable; GPU non-determinism noted), and (c) UTMOS ≥ 3.8 on a held-out English sample — then M2 pauses and v0.3 ships procedural-only TTS via OS `say` / `espeak-ng` as the audio path._ **Current status: Kokoro-82M passes (a) Apache-2.0 weights + permissive training data; passes (c) by virtue of #1 TTS Arena Jan 2026 (UTMOS implied ≥ 3.8 by leaderboard position); (b) is the M2 verification target.** If the M2 parity-tts test finds Kokoro is non-deterministic even on CPU, the sweep-level kill criterion partially fires (b fails) and Piper becomes the fallback; if Piper also fails (b), the full kill fires and v0.3 ships procedural-only.

2. M2's parity-tts test cannot achieve byte-exact replay on CPU even with `torch.use_deterministic_algorithms(True)` on Kokoro AND Piper AND OpenF5. Then H I.7 is wrong and the entire deterministic-replay thesis for audio is invalid.

3. A 2026-Q3 license audit finds Kokoro's training data includes content not covered by its declared permissive provenance. Reproducible legal review is part of the M2 gate.

4. Voice cloning lands as a hard v0.3 requirement after the brief locks. Then H I.1 / I.3 swap and OpenF5-TTS-Base becomes preferred (with reproducibility downgrade noted).

---

## Verdict

1. **TTS decoder family:** **Kokoro-82M-family decoder.** Apache-2.0 code, weights, and training data; #1 TTS Arena January 2026; single-pass decoder-only architecture (most determinism-friendly shape in the shortlist). Piper is the named fallback if M2 parity-tts test rejects Kokoro.
2. **Audio tokenizer:** **Opaque waveform, no tokenizer.** Wittgenstein consumes Kokoro's waveform output directly; the `IR` variant remains `Text`; `Latent` and `Hybrid` stay reserved for future bidirectional modalities (e.g. Moshi-class streaming dialogue post-v0.3.5).
3. **Neural soundscape:** **Defer to v0.4.** v0.3 ships procedural soundscape (current operator-library + ambient mix). Stable Audio Open is horizon-track; revisit when Apache-2.0-strict weights ship or when v0.3 product spec elevates soundscape quality.
4. **Neural music:** **Defer to v0.4.** v0.3 preserves Brief C H4's procedural-as-LilyPond stance. MusicGen and Stable Audio Open are horizon-track; revisit when an Apache-2.0 music model with structured score conditioning lands.
5. **Reproducibility verdict:** **CPU = byte-parity; GPU = structural-parity.** Neural TTS in 2026 is bit-exact reproducible only on CPU with explicit determinism flags. Wittgenstein commits to a two-tier contract; the codec's `package` stage writes `audio.determinismClass` to the manifest (per Brief J §Verdict 3), and M2's parity tests assert against the declared class.

Net: **v0.3 audio ships a Kokoro-82M-family neural TTS path under Apache-2.0 with explicit CPU-deterministic / GPU-structural manifest declaration; soundscape and music remain procedural; no audio tokenizer at the harness boundary.**

---

## References

- [hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) — Apache-2.0 model card, training data provenance.
- [Kokoro TTS review 2026](https://reviewnexa.com/kokoro-tts-review/) — TTS Arena January 2026 #1 position.
- [Spheron 2026 deployment guide](https://www.spheron.network/blog/deploy-open-source-tts-gpu-cloud-2026/) — production-grade open TTS tier.
- [rhasspy/piper](https://github.com/rhasspy/piper) — MIT, ONNX-runtime VITS voices.
- [piper-tts on PyPI](https://pypi.org/project/piper-tts/) — v1.4.2 April 2026, active maintenance.
- [SWivid/F5-TTS](https://github.com/SWivid/F5-TTS) + [LICENSE](https://github.com/SWivid/F5-TTS/blob/main/LICENSE) — code MIT.
- [SWivid/F5-TTS Discussion #997](https://github.com/SWivid/F5-TTS/discussions/997) — official weights CC-BY-NC due to Emilia.
- [mrfakename/OpenF5-TTS-Base](https://huggingface.co/mrfakename/OpenF5-TTS-Base) — Apache-2.0 commercial fork.
- [coqui/XTTS-v2 LICENSE](https://huggingface.co/coqui/XTTS-v2/blob/main/LICENSE.txt) + [Coqui shutdown discussion](https://huggingface.co/coqui/XTTS-v2/discussions/106) — CPML, no commercial path.
- [fishaudio/fish-speech](https://github.com/fishaudio/fish-speech) — FISH AUDIO RESEARCH LICENSE.
- [open-mmlab/Amphion MaskGCT](https://github.com/open-mmlab/Amphion/blob/main/models/tts/maskgct/README.md) — Emilia-trained.
- [facebookresearch/encodec](https://github.com/facebookresearch/encodec) — MIT.
- [descriptinc/descript-audio-codec](https://github.com/descriptinc/descript-audio-codec) — MIT.
- [kyutai/mimi](https://huggingface.co/kyutai/mimi) — open-weight 12.5Hz.
- [Stable Audio Open 1.0 LICENSE](https://huggingface.co/stabilityai/stable-audio-open-1.0/blob/main/LICENSE.md) — Stability Community License.
- [PyTorch reproducibility docs](https://docs.pytorch.org/docs/stable/notes/randomness.html) — cuDNN atomic-op non-determinism, deterministic-algorithm flags.
- [Brief A](A_vq_vlm_lineage_audit.md) — image LFQ-family decoder precedent for naming.
- [Brief E](E_benchmarks_v2.md) — audio quality bar (UTMOS, WER, DNSMOS, CLAP).
- [Brief J](J_audio_engineering_and_routes.md) — engineering shape, manifest fields, soft-deprecation contract.
- [Brief C §H4](C_unproven_horizon.md) — procedural-music-as-LilyPond stance reconciled.
