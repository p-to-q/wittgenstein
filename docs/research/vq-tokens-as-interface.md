# VQ Tokens as the LLM–Decoder Interface

**Type:** Long-form theory note.

## The Interface Problem

When a text LLM is asked to produce an image, something has to cross the boundary between
"language model output" and "renderer input." The design of that boundary is the central
architectural decision in Wittgenstein's image path. The wrong interface makes the system
expensive, brittle, or unreproducible. The right one preserves the LLM's strengths, the
renderer's guarantees, and the harness's inspectability invariant.

The spectrum of options, from coarsest to finest:

```
 structured scene spec    →    discrete VQ tokens    →    continuous latents    →    raw pixels
       (60 tokens)                (~1024 tokens)         (~16×16 float grid)       (~3M values)
  ◄── LLM territory ──────────────────────────────────────────────────────── renderer territory ──►
```

Wittgenstein places the interface at discrete VQ tokens, with the scene spec as the upstream
LLM contract and the frozen decoder as the downstream renderer. This document explains why.

---

## Why Not Raw Pixels

A 512×512 RGB image contains 786,432 scalar values. A 1024×1024 image contains 3,145,728.
Language models operate on token sequences; a tokenizer that maps each byte to a token would
require millions of tokens per image. Even with an efficient pixel encoding, the sequence
length is far beyond the practical context window of any current model.

More fundamentally, raw pixels are not a domain the LLM has been trained to reason in.
The joint distribution of pixel values encodes low-level spatial statistics — edge frequencies,
color transitions — that are not represented in text training data. Asking a text LLM to emit
pixel values is asking it to hallucinate in a domain it has no statistical model for.

---

## Why Not Continuous Latents

A VAE or diffusion model encoder compresses an image to a continuous latent vector or grid
of floats. This is a compact representation, but it is not directly compatible with an
autoregressive text model for two reasons.

First, continuous values cannot be represented faithfully in a discrete token vocabulary.
A float32 value requires 32 bits; a standard BPE vocabulary of 50,000 tokens represents
only about 15.6 bits per token. Continuous latents would need special numerical encoding
that breaks the model's normal operation.

Second, and more importantly, autoregressive prediction is not well-suited to continuous
regression targets. Next-token prediction is a classification problem over a fixed vocabulary.
Predicting the next floating-point value is a regression problem with a potentially
multi-modal distribution. Language models are not trained for this.

---

## Why Discrete VQ Tokens Are the Right Interface

VQ (vector quantization) maps a continuous latent to the nearest entry in a learned codebook
of K discrete vectors. The result is an index in {0, …, K−1}. This is directly analogous to
BPE tokenization:

| Text tokenization                      | Image VQ tokenization                |
| -------------------------------------- | ------------------------------------ |
| Character sequence → BPE token indices | Image patches → codebook indices     |
| Vocabulary size: ~50,000 tokens        | Codebook size: 1,024–16,384 codes    |
| Sequence: ~256–2048 tokens per prompt  | Sequence: 256–1024 tokens per image  |
| Autoregressive prediction: next token  | Autoregressive prediction: next code |

The key property is that an autoregressive language model can be trained or prompted to
predict the next VQ code in a sequence using the same objective it uses for text. DALL-E 1
(2021) demonstrated this at 12B parameters; LlamaGen (2024) demonstrated it with a standard
LLaMA architecture at competitive FID without any diffusion. The vocabulary is different but
the mechanism is identical.

---

## The Adapter's Role in This Geometry

The LLM emits a structured scene spec: subject, composition, palette, style cues. This is
~60 tokens of semantically rich JSON. The decoder expects a sequence of ~1024 VQ indices.

The adapter bridges these two spaces. Its input is a text embedding of the scene fields
(computed via the same hashed bag-of-words embedding used for retrieval). Its output is a
distribution over codebook indices for each position in the token grid.

The adapter does not learn image generation. The frozen decoder already knows how to
reconstruct an image from a code sequence — that knowledge is baked into its weights. The
adapter only needs to learn the _projection_ between the LLM's semantic representation and
the decoder's code vocabulary. Because both spaces are semantically structured (text embeddings
carry semantic content; VQ codes are trained to encode image semantics), the projection is a
low-dimensional problem. This is why a small MLP suffices.

---

## Why Determinism Follows from VQ Decoding

Given a sequence of VQ indices, the decoder's reconstruction is deterministic: each index
maps to a specific codebook entry, and the decoder is a fixed neural network with no stochastic
components at inference time. The same token sequence → identical pixel array, every time.

This is in direct contrast to diffusion models, which reconstruct by iteratively denoising a
random noise vector. The noise seed affects the output, and API providers may change their
noise sampling procedure across versions, breaking reproducibility even with a fixed seed.

For Wittgenstein's manifest spine — where every run is logged with its inputs, its IR, and
a SHA-256 of the artifact — deterministic decoding is not a nice-to-have. It is a requirement.
A manifest is only meaningful if replaying the same inputs produces the same artifact.

---

## Token Efficiency: The TiTok Direction

Standard VQ decoders (VQGAN, LlamaGen) use a 2D spatial grid: 16×16 = 256 tokens for a
256×256 image, or 32×32 = 1024 tokens for higher resolution. The number of tokens scales
with the square of the spatial resolution.

TiTok (Yu et al., 2024) demonstrated that 32 tokens are sufficient to reconstruct a 256×256
image with rFID below 2.0, using a transformer encoder that learns to pack information into
a 1D sequence rather than preserving spatial layout. Fewer tokens means:

- shorter prediction target for the adapter
- lower LLM inference cost if the LLM is involved in token prediction
- faster decoder forward pass

The 32-token representation is the current frontier for token efficiency and is the likely
long-term direction for Wittgenstein's image decoder backend.

---

## Summary

The VQ token interface is chosen because:

1. it is compatible with autoregressive prediction (same mechanism as text tokens)
2. it is compact (~1024 tokens vs. ~3M pixels)
3. it is deterministic at decoding time (reproducibility)
4. the adapter problem is low-dimensional (semantic space → codebook space)
5. the decoder can be frozen and swapped without touching the LLM
6. the sequence length is trending toward 32–256 tokens (TiTok direction)

The scene spec sits upstream of the VQ tokens. The LLM is never asked to predict raw VQ
indices directly — it emits semantic structure that the adapter translates. The two-stage
design (scene spec → adapter → VQ tokens → frozen decoder) separates concerns cleanly:
the LLM does semantic planning, the adapter does vocabulary alignment, the decoder does
reconstruction.
