# Prior work map for Wittgenstein

Status: draft research map  
Last reviewed: 2026-05-28

## Thesis

Wittgenstein should not be framed as only a multimodal generation project. It sits at the intersection of:

- LLM-as-controller;
- typed codec protocols;
- discrete visual/audio tokens;
- frozen decoders;
- masked visual modeling;
- structured video rendering;
- artifact reproducibility.

## A. LLM as controller / tool user

Relevant works: ReAct, Toolformer, PAL, VisProg.

Why it matters: Wittgenstein's LLM emits structured plans/code contracts; external codecs/renderers execute.

## B. Codec protocol and typed interfaces

Relevant ideas: schema-first outputs, parser boundaries, renderer-owned artifacts, manifests.

Why it matters: Codec v2 is the central engineering object and prevents modality-specific prompt hacks.

## C. Discrete visual tokens

Relevant works: VQ-VAE, VQGAN, DALL·E, LlamaGen, SEED, TokenFlow.

Why it matters: M1B depends on visual code/token interfaces and frozen decoder seams.

## D. Masked visual modeling

Relevant works: MaskGIT, Muse, MaskBit-like routes.

Why it matters: A masked iterative adapter may be more plausible than left-to-right visual token generation.

## E. Frozen decoder / adapter split

Relevant comparisons: LlamaGen, SEED, Chameleon, Transfusion.

Why it matters: Wittgenstein's claim is not that the base LLM becomes multimodal, but that a text-first model can plan through a typed interface into frozen/learned modality machinery.

## F. Structured video rendering

Relevant lines: programmatic rendering, Remotion/Motion Canvas-style systems, HyperFrames-shaped HTML/MP4 rendering, MAGVIT/Phenaki/VideoPoet as neural-video comparisons.

Why it matters: current M4 is structured rendering, not neural video generation.

## G. Reproducibility

Relevant works: Model Cards, Datasheets for Datasets, ML Reproducibility Checklist.

Why it matters: manifest, hash, replay, doctor, and failure receipts are the repo's differentiator.

## Source anchors

This draft pack was written from a GitHub-only static review on 2026-05-28. Recheck referenced issues/PRs before merge.

- Repository / README: https://github.com/p-to-q/wittgenstein
- README.md: https://github.com/p-to-q/wittgenstein/blob/main/README.md
- CHANGELOG.md: https://github.com/p-to-q/wittgenstein/blob/main/CHANGELOG.md
- docs/implementation-status.md: https://github.com/p-to-q/wittgenstein/blob/main/docs/implementation-status.md
- docs/exec-plans/active/codec-v2-port.md: https://github.com/p-to-q/wittgenstein/blob/main/docs/exec-plans/active/codec-v2-port.md
- Issue #507: https://github.com/p-to-q/wittgenstein/issues/507
- Issue #402: https://github.com/p-to-q/wittgenstein/issues/402
- PR #457: https://github.com/p-to-q/wittgenstein/pull/457
- PR #491: https://github.com/p-to-q/wittgenstein/pull/491
- PR #492: https://github.com/p-to-q/wittgenstein/pull/492
- PR #493: https://github.com/p-to-q/wittgenstein/pull/493
- PR #455: https://github.com/p-to-q/wittgenstein/pull/455
