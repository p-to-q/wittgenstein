# Wittgenstein — polyglot-mini

> *Die Grenzen meiner Sprache bedeuten die Grenzen meiner Welt.*
> — Wittgenstein, Tractatus 5.6

**polyglot-mini** is the Python rapid-prototype surface of the Wittgenstein harness. It
demonstrates the five-layer thesis end-to-end — LLM planning, schema-validated IR, codec
rendering, optional small adapter, CLI distribution — without requiring the TypeScript
monorepo to be running.

Every codec layer produces a real file. No cloud image APIs. No diffusion. No fused
multimodal model. The base LLM stays text-only throughout.

---

## The Architectural Bet

Most "multimodal AI" demos hide the hard parts in one of three places:

- a massive fused model trained on everything at once (GPT-4V, DALL-E 3)
- a paid cloud API call (ElevenLabs, Runway, Midjourney)
- hand-waving in the slide deck

None of that is portable, inspectable, or reproducible.

Wittgenstein makes a different bet: a text-first LLM paired with **modality-specific codec
layers** and **small learned adapters** can cover the same ground with traceable, deterministic,
locally-running pipelines. The claim is not that the output quality matches frontier models
today. The claim is that the *architecture* is correct: separating semantic planning (LLM)
from file production (codec) makes each component independently inspectable, swappable, and
trainable without touching the rest.

---

## What Ships

| Modality | Route | Output |
|---|---|---|
| **Image** | LLM → Python painter code → sandboxed subprocess | `.png` |
| **Image (no-LLM)** | MLP adapter → procedural painter | `.png` |
| **TTS** (macOS-only) | macOS `say` → `afconvert` | `.m4a` (zero deps) |
| **TTS + Ambient** (TTS macOS-only; ambient cross-platform) | text → AudioMLP → procedural synth → mix | `.m4a` |
| **Sensor** | operator spec JSON → numpy expand → loupe dashboard | `.html` + `.csv` + `.png` |

---

## Install

```bash
pip install numpy scipy Pillow matplotlib
```

For LLM-powered routes, set a provider key:

```bash
export MOONSHOT_API_KEY=sk-...     # Kimi K2 (recommended)
export OPENAI_API_KEY=sk-...       # any OpenAI-compatible endpoint
```

---

## CLI

```bash
# Image via LLM code-as-painter
python3 -m polyglot.cli image "stormy ocean at midnight" --out out.png

# Image via adapter only (no LLM)
python3 -m polyglot.cli image "warm golden desert" --no-llm --out out.png

# TTS, no ambient (zero deps)
python3 -m polyglot.cli tts "Hello from Wittgenstein." --raw --out speech.m4a

# TTS + auto-detected ambient from prompt
python3 -m polyglot.cli tts "Late night coding session, focused." --out coded.m4a

# TTS + explicit ambient category
python3 -m polyglot.cli tts "Calm presentation voice." --ambient forest --out forest.m4a

# Sensor dry-run (no LLM, built-in ECG spec)
python3 -m polyglot.cli sensor "ECG 72 bpm resting" --dry-run --out ecg.json
# → ecg.json  ecg.csv  ecg.png  ecg.html (interactive loupe dashboard)
```

---

## Five-Layer Mapping

The same five layers that structure the TypeScript monorepo are explicit here in Python:

| Layer | Role | Where in polyglot-mini |
|---|---|---|
| **L1 Runtime** | LLM plans, harness routes + retries | `polyglot/llm.py` — provider routing, retry, token tracking |
| **L2 IR / Schema** | LLM emits structured JSON, validated | `polyglot/image.py` / `sensor.py` — JSON extraction + schema check |
| **L3 Renderer** | JSON → real file | `polyglot/sandbox.py` (image), `polyglot/audio_ambient.py` (audio), `polyglot/sensor.py` (signal expand + loupe) |
| **L4 Adapter** | Tiny trained MLP: text → renderer params | `train/train.py` (image style MLP), `train/train_audio.py` (audio classifier) |
| **L5 Distribution** | CLI, reproducible outputs | `polyglot/cli.py` — argparse entry point; all outputs are real files |

The LLM is always at L1: it plans, it emits IR, it does not render. Rendering is always at
L3, deterministic given the same IR and seed.

---

## Image: Code-as-Painter

```
User prompt
  → LLM emits Python painter program
    (PIL + NumPy + SciPy + Matplotlib pre-injected as globals;
     OUT_PATH / W / H / SEED available as env vars)
  → sandboxed subprocess (20 s timeout)
  → real PNG

Fallback (--no-llm or LLM failure):
  → MLP adapter predicts palette + layout from hashed-BoW text embedding
  → deterministic procedural painter
  → real PNG
```

The image style MLP was trained on **781 real COCO images**: captions → k-means palette
extraction + gradient-magnitude noise\_scale + high-frequency grain + variance-based
composition. Pure numpy, Adam optimiser, 600 epochs, **val BCE 0.7698**, trains in 9 seconds.

Architecture: 3-layer MLP (512 → 256 → 128 → 21 outputs). Embedding: hashed bag-of-words
with double hashing + bigrams, L2-normalised to dim 512. Outputs encode 5 palette RGB
triplets, noise scale, grain level, composition (one-hot 3), accent count.

---

## Audio: TTS + Procedural Ambient

```
User prompt
  → AudioMLP classifier (256 → 96 → 7 categories + 1 volume)
    + keyword-override layer (fires when MLP confidence < 0.75)
  → category: rain / wind / city / forest / electronic / white_noise / silence
  → procedural synthesiser (pure NumPy + SciPy, zero downloads):
       rain       → pink noise + gaussian drip pulses
       wind       → low-pass noise + gust envelope
       city       → traffic rumble + tonal honks
       forest     → wind base + random bird chirps
       electronic → 50/60 Hz hum + harmonics
  → mix with TTS speech via stdlib wave (speech: 1.0, ambient: 0.2–0.5)
  → M4A via afconvert
```

The audio ambient classifier was trained on **369 examples** (41 seed phrases × 9 suffix
augmentations). Trains in < 5 seconds. The keyword-override layer patches the most common
failure mode — low-confidence MLP predictions on short prompts — with a deterministic
lexical fallback. Spot-check accuracy on 5 held-out prompts: 5/5 correct.

---

## Sensor: Operator Specs + Loupe

```
User prompt
  → LLM emits operator spec JSON
    (signal: ecg | accelerometer | temperature | gyro;
     operators: oscillator / noise / drift / pulse / step / ecgTemplate)
  → deterministic numpy expansion
  → CSV (timeSec, value) + NPY + matplotlib PNG
  → loupe.py → self-contained interactive HTML dashboard (117 KB, zero deps)
```

Dry-run mode uses built-in specs for ECG (72 bpm + mild noise), accelerometer (3-axis
walk), and temperature (slow drift + step event). No LLM required.

---

## Adapters: Training

```bash
# Build COCO dataset (~800 images, ~5 min download + extract)
python3 train/build_dataset_coco.py -n 800

# Train image style MLP (600 epochs, ~9 s)
python3 train/train.py --epochs 600

# Train audio ambient classifier (300 epochs, <5 s)
python3 train/train_audio.py

# Inference
python3 train/train.py predict "misty mountain at dawn"
python3 train/train_audio.py predict "cozy rainy afternoon"
```

`train/coco/*.json` (large annotation files) are gitignored. The trained weights
(`train/adapter.npz`, `train/audio_adapter.npz`) are committed and load automatically.

---

## Decoder ≠ Generator

The procedural painter and the ambient synthesiser are **decoders**: given the same inputs
and seed they produce the same outputs. They are not generative models. This is why the
manifest spine is meaningful — every output is reproducible from the logged IR and seed.

The image path in the TypeScript harness makes the same bet at a higher level: LLM → JSON
scene spec → adapter → **frozen VQ decoder** → PNG. No diffusion. No sampling noise. The
codec layer is deterministic by architecture, not by policy.

---

## Provider Routing

`polyglot/llm.py` auto-detects the active provider from environment variables:

| Env var | Provider | Model |
|---|---|---|
| `MOONSHOT_API_KEY` | Kimi (Moonshot) | `moonshot-v1-8k` |
| `MINIMAX_API_KEY` | MiniMax | `abab6.5s-chat` |
| `OPENAI_API_KEY` | OpenAI-compatible | `gpt-4o-mini` |
| `ANTHROPIC_API_KEY` | Anthropic | `claude-3-5-haiku-20241022` |

All API calls use stdlib `urllib` — no openai SDK, no httpx, no requests.

---

## Dependencies

```
numpy>=1.24
scipy>=1.11
Pillow>=10.0
matplotlib>=3.7
```

That is the entire runtime dependency list. No torch, no torchaudio, no soundfile, no ffmpeg.
TTS uses macOS `say` + `afconvert` (pre-installed on macOS). All audio mixing is done with
stdlib `wave` + numpy arrays.

---

## License

Apache 2.0
