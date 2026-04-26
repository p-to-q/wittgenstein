# Frozen LLM Multimodality

**Type:** Long-form theory note.

## Core Argument

A frozen text LLM paired with modality-specific codecs and small adapter heads is a better architecture for Wittgenstein's use case than an end-to-end trained multimodal giant. This is not a resource constraint — it is a principled design choice with implications for cost, reproducibility, debuggability, and modularity.

## The Alternative and Its Problems

The obvious alternative is to use a large end-to-end multimodal model: GPT-4V, Gemini 1.5, DALL-E 3, or a similar system. These models are impressive but carry structural costs that compound over a project's lifetime.

First, training cost. End-to-end multimodal models require co-training vision and language representations at scale, typically on tens of billions of image-text pairs. This is beyond the reach of almost any research team without dedicated infrastructure. The result is provider lock-in: the capability is rented rather than owned.

Second, opacity. When a multimodal model generates an image, the intermediate representation is inaccessible. There is no scene spec, no codebook index sequence, no intermediate artifact that can be inspected or logged. Debugging a failure means looking at inputs and outputs with no view of the middle. Manifests — structured logs of what the model decided — are impossible when the model is a black box.

Third, non-determinism. Diffusion-based generators (DALL-E 3, Stable Diffusion, Midjourney) sample from a stochastic process. The same prompt with the same seed may produce different outputs across API versions. Reproducibility across runs is not guaranteed by the interface contract.

## The Frozen Backbone + Lightweight Head Pattern

The alternative has a long history in vision. CLIP (Radford et al., 2021) showed that a contrastively trained vision-language model learns rich cross-modal representations. Linear probes on frozen CLIP features achieve strong performance on downstream classification without any fine-tuning of the backbone. The adapter teaches the interface; the backbone already contains the knowledge.

LLaVA (Liu et al., 2023) is the clearest demonstration of this principle applied to the generation direction. A two-layer MLP trained for approximately six hours on 150,000 image-text examples connects a frozen CLIP visual encoder to a frozen LLaMA language model. The adapter maps visual tokens from CLIP's embedding space into the token space LLaMA expects. The result achieves strong visual question-answering performance. Neither the vision encoder nor the language model is updated during adapter training. The adapter is the seam, not the knowledge source.

The core insight is that large pretrained models already contain cross-modal grounding through their training data. A language model trained on image-captioning datasets has internalized the relationship between words like "cerulean" or "chiaroscuro" and what those words denote visually. The adapter does not need to teach this. It only needs to learn the projection between two representation spaces that already share semantic structure.

## Applied to Wittgenstein

The image adapter in Wittgenstein is 781 COCO captions trained in approximately nine seconds. It maps text embeddings (from the scene spec fields) to VQ codebook logits that the frozen decoder expects. The audio ambient classifier is 369 examples trained in under five seconds. Neither component learns image or audio semantics from scratch. The LLM backbone already encodes the semantic content. The adapters learn only the interface geometry.

This has three immediate practical consequences.

**Codec swaps.** The decoder can be replaced — swap a LlamaGen decoder for a SEED tokenizer, or a VQGAN for a TiTok decoder — without touching the LLM or retraining the adapter beyond a short re-calibration on the new codebook. The LLM's semantic representation does not change.

**Provider swaps.** The LLM can be replaced — swap Kimi for Claude, or GPT-4o for a local Llama 3 instance — without retraining the adapters. The scene JSON schema is the stable interface contract.

**Independent debugging.** If the output image is wrong, the failure can be localized: is the scene spec malformed (LLM problem)? Are the VQ indices plausible (adapter problem)? Is the reconstruction faithful (decoder problem)? Each component is inspectable in isolation.

## The Locality Principle

Modality-specific representation belongs in the codec; cross-modal semantic grounding belongs in the text model. This separation is the key architectural invariant. Breaking it — by training the LLM end-to-end on raw pixels — destroys the separation of concerns and requires retraining the entire system when any component changes.

## Reproducibility

A frozen pipeline with a deterministic decoder produces identical output for identical inputs and seed. Diffusion models do not offer this guarantee. For a system that logs manifests and supports replay, determinism is not optional — it is a correctness requirement.

## References

- Radford, A. et al. (2021). "Learning Transferable Visual Models From Natural Language Supervision." _ICML 2021_ (CLIP).
- Liu, H. et al. (2023). "Visual Instruction Tuning." _NeurIPS 2023_ (LLaVA).
- Li, J. et al. (2023). "BLIP-2: Bootstrapping Language-Image Pre-training with Frozen Image Encoders and Large Language Models." _ICML 2023_.
- Jia, C. et al. (2021). "Scaling Up Visual and Vision-Language Representation Learning With Noisy Text Supervision." _ICML 2021_ (ALIGN).
