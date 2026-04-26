# Neural Codec References

**Type:** Reference sheet.

Annotated reference sheet for the image path's theoretical foundation. Organized by theme in the order the ideas build on each other.

---

## Theme 1: VQ and Discrete Image Tokens (The Foundational Bet)

The entire image path rests on one architectural bet: that images can be usefully represented as sequences of discrete indices drawn from a learned codebook, and that a language-model-style system operating on those indices can generate or transform images meaningfully. The two papers below established this bet and made it credible.

**van den Oord, A., Vinyals, O., and Kavukcuoglu, K. (2017). "Neural Discrete Representation Learning." _NeurIPS 2017._ (VQ-VAE)**

The foundational paper for discrete image tokenization. The encoder maps an image to a continuous latent; the nearest-neighbor lookup in a learned codebook of K vectors replaces that continuous vector with the closest codebook entry; the decoder reconstructs the image from the codebook entry. The key result is that the discrete bottleneck forces the model to learn a compressed, semantically meaningful representation rather than relying on continuous interpolation. The straight-through estimator makes the discrete lookup differentiable for training. Codebook size K and commitment loss weight are the primary hyperparameters. The paper also demonstrated the architecture on audio (WaveNet decoder), establishing the generality of the approach. VQ-VAE is the direct ancestor of every discrete-token image model that follows.

**Esser, P., Rombach, R., and Ommer, B. (2021). "Taming Transformers for High-Resolution Image Synthesis." _CVPR 2021._ (VQGAN)**

Extends VQ-VAE with two modifications that made it practical for high-fidelity generation. First, the decoder is augmented with an adversarial loss (patch-based GAN discriminator) and a perceptual loss (VGG feature matching), substantially improving reconstruction sharpness at 256×256 and above. Second, a GPT-2-style transformer is trained autoregressively on the resulting discrete token sequences, enabling conditional and unconditional image generation. VQGAN is the direct ancestor of DALL-E 1's image tokenizer and the decoder backend used in early LlamaGen experiments. The critical practical finding: the GAN discriminator on the decoder improves visual quality far more than increasing the encoder/codebook size alone.

---

## Theme 2: LLM-as-Image-Generator via Discrete Tokens

Once discrete tokenization produces image token sequences of manageable length, they can be fed into a standard language model. The papers below show this works at scale and motivates the frozen-decoder approach in Wittgenstein.

**Ramesh, A. et al. (2021). "Zero-Shot Text-to-Image Generation." _ICML 2021._ (DALL-E 1)**

The first large-scale demonstration that the discrete-token interface works for text-to-image generation. Images are discretized to 32×32 = 1,024 VQ tokens via a discrete VAE (dVAE). Text is encoded to up to 256 BPE tokens. A 12B-parameter autoregressive transformer is trained to predict the next token in the concatenated text + image sequence. At inference, the model samples image tokens conditioned on the text prefix, and the dVAE decoder reconstructs the image. The key result is that the model learns cross-modal alignment without any explicit alignment loss — the joint autoregressive objective is sufficient. The zero-shot generalization to unseen prompts (e.g., "an armchair in the shape of an avocado") demonstrated emergent compositional understanding.

**Sun, P. et al. (2024). "Autoregressive Model Beats Diffusion: Llama for Scalable Image Generation." _arXiv:2406.06525._ (LlamaGen)**

The most direct validation of the frozen-decoder approach. A standard LLaMA-architecture transformer (ranging from 111M to 3B parameters) is trained on VQ image tokens without any diffusion objective. The largest model achieves FID 2.18 on ImageNet 256×256 class-conditional generation, competitive with DiT-XL/2 (a strong diffusion baseline). The finding is significant: nothing in the LLaMA architecture is specific to language. The same autoregressive token-prediction objective that learns language also learns image generation when given discrete image tokens. This directly validates the architectural choice to use a standard LLM backbone with a VQ decoder.

**Ge, Y. et al. (2023). "Making LLaMA SEE and Draw with SEED Tokenizer." _arXiv:2310.01218._**

Introduces a tokenizer designed specifically for compatibility with autoregressive language models, in both directions (understanding and generation). Unlike VQ-VAE/VQGAN, whose codebooks are trained purely for reconstruction, the SEED tokenizer is trained with a BLIP-2 caption alignment loss, ensuring that the discrete tokens are semantically aligned with language. The same LLM can thus both predict the next image token (generation) and answer questions about an image (understanding) within a unified token sequence. Relevant to Wittgenstein's long-term direction: a SEED-style tokenizer would allow the same model backbone to handle image input and image output without switching codec stacks.

---

## Theme 3: Alternative Quantization Schemes

The VQ codebook is not the only option. Two alternatives are worth tracking as potential decoder backends.

**Mentzer, F. et al. (2023). "Finite Scalar Quantization: VQ-VAE Made Simple." _arXiv:2309.15505._ (FSQ)**

Replaces the learned codebook with bounded scalar quantization. Each latent dimension is independently quantized to a small set of integer levels (e.g., 5 levels per dimension). With d dimensions at 5 levels each, the effective codebook size is 5^d. The key advantages over VQ-VAE: no codebook collapse (a persistent failure mode in VQ training where many codebook entries are never used), simpler training (no commitment loss, no EMA codebook updates), and comparable reconstruction quality on standard benchmarks. The representation is fully deterministic given the latent, with no nearest-neighbor lookup ambiguity. Relevant as a lower-complexity alternative decoder backend that would simplify the adapter's training objective.

**Yu, Q. et al. (2024). "An Image is Worth 32 Tokens for Reconstruction and Generation." _ICLR 2024._ (TiTok)**

Proposes a 1D latent token sequence instead of the standard 2D spatial grid. A standard VQGAN downsamples a 256×256 image to a 16×16 = 256 token grid. TiTok uses a transformer-based encoder that produces a 1D sequence of as few as 32 tokens while maintaining competitive reconstruction quality (rFID 1.97 on ImageNet 256×256). The practical implication for Wittgenstein is direct: fewer tokens in the discrete sequence means a shorter prediction target for the LLM adapter, lower training cost, and lower inference latency. TiTok represents the current frontier for token efficiency in discrete image representation.

---

## Theme 4: Evaluation Metrics

Standard metrics used to assess image generation quality in the literature. Understanding what these measure is important for interpreting benchmark numbers and choosing evaluation strategies.

**FID — Fréchet Inception Distance (Heusel, M. et al., 2017. "GANs Trained by a Two Time-Scale Update Rule Converge to a Local Nash Equilibrium." _NeurIPS 2017._)**

The dominant metric for image generation quality in the literature. Computes the Fréchet distance between the distributions of Inception v3 features extracted from generated and reference images. Lower FID indicates the generated distribution is closer to the reference distribution in Inception feature space. FID captures both fidelity (do individual images look real?) and diversity (does the generated set cover the full distribution?). Limitations: sensitive to the reference set size, not directly interpretable as a perceptual quality score, and can be gamed by memorizing the training set. Despite these limitations, it remains the standard for fair cross-paper comparison.

**CLIPScore (Hessel, J. et al., 2021. "CLIPScore: A Reference-Free Evaluation Metric for Image Captioning." _EMNLP 2021._)**

Measures the cosine similarity between CLIP embeddings of a text prompt and the generated image. Higher CLIPScore indicates better prompt adherence. Unlike FID, CLIPScore is reference-free and evaluates a single image against its conditioning prompt. Particularly relevant for text-to-image systems where prompt fidelity is the primary concern. The metric is only as good as CLIP's cross-modal alignment, and can miss failures that CLIP itself cannot detect (e.g., fine-grained spatial relationships, counting).

**VQScore (Lin, Z. et al., 2024. "Evaluating Text-to-Visual Generation with Image-to-Text Generation." _arXiv:2404.01291._)**

A newer metric designed to correlate better with human preference judgments than FID alone. Combines visual quality assessment with prompt alignment in a single score. Relevant as a complement to FID and CLIPScore when evaluating adapter outputs against human preference baselines.

---

## Reading Order

For a new contributor to the image path, the recommended reading order is: VQ-VAE → VQGAN → DALL-E 1 → LlamaGen → TiTok. The first two establish the representation; the next two establish that LLMs can operate on it; TiTok establishes the current efficiency frontier. FSQ and SEED are sidebars depending on which failure modes or capabilities are most relevant to current work.
