# Quickstart

Three paths to a real file in under a minute. None of them need an API key — they all run
against the deterministic codec paths.

---

## The fastest demo: 30 seconds, no API key

Produces a real interactive ECG dashboard as a single self-contained HTML file.

```bash
cd polyglot-mini
pip install -r requirements.txt
python3 -m polyglot.cli sensor "ECG 72 bpm resting" --dry-run --out /tmp/ecg.json
open /tmp/ecg.html     # macOS; or xdg-open on Linux
```

What you get: `/tmp/ecg.json` (operator spec) + `/tmp/ecg.csv` (2,500 samples)
+ `/tmp/ecg.png` (matplotlib chart) + `/tmp/ecg.html` (~117 KB interactive loupe dashboard,
zero external dependencies).

The dashboard has sortable tables, summary stats, and dark/light mode. The whole thing is
one HTML file with no CDN calls, no analytics, no JavaScript imports.

---

## Hear the audio pipeline (macOS)

Produces an M4A combining macOS TTS with procedural rain ambient, all synthesised in pure
NumPy + SciPy.

```bash
cd polyglot-mini
python3 -m polyglot.cli tts "Cozy rainy afternoon, working on Wittgenstein." --out /tmp/voice.m4a
open /tmp/voice.m4a
```

The prompt is classified by the audio ambient MLP (keyword override fires for "rainy"),
which routes to the `rain` procedural synthesiser (pink noise + gaussian drip pulses),
which is mixed with the TTS track via stdlib `wave`, and finalised through `afconvert`.
No ffmpeg, no sox, no cloud API.

On non-macOS systems, use `--raw` to skip TTS and generate an ambient-only WAV:

```bash
python3 -m polyglot.cli tts "forest at dawn" --raw --ambient forest --out /tmp/forest.wav
```

---

## See the image adapter fire (no LLM)

Produces a PNG using only the trained MLP adapter — no LLM call, no API key, reproducible
from the text prompt alone.

```bash
cd polyglot-mini
python3 -m polyglot.cli image "warm golden desert at sunset" --no-llm --out /tmp/desert.png
open /tmp/desert.png
```

The prompt is hashed-BoW embedded, fed through the 3-layer MLP (512 → 256 → 128 → 21),
and the output palette + noise scale + grain + composition + accent count drive a
deterministic procedural painter. Same prompt + same seed → identical PNG, every time.

---

## Run the TypeScript harness

If you want the production codec surface with typed contracts, manifest spine, and benchmark
hooks:

```bash
pnpm install
pnpm typecheck
pnpm benchmark     # runs all four codecs in dry-run mode
```

Results land in `artifacts/benchmarks/latest.json`. Each run writes a full manifest under
`artifacts/runs/<id>/manifest.json` with git SHA, lockfile hash, seed, prompt, IR, LLM
output, and artifact SHA-256.

Individual commands:

```bash
pnpm --filter @wittgenstein/cli exec wittgenstein sensor \
  "stable ECG with mild baseline noise" --dry-run --out artifacts/demo/ecg.json

pnpm --filter @wittgenstein/cli exec wittgenstein audio \
  "lightweight launch soundtrack" --route music --dry-run --out artifacts/demo/music.wav

pnpm --filter @wittgenstein/cli exec wittgenstein doctor
```

---

## Going live: using a real LLM

Set one of these env vars:

```bash
export MOONSHOT_API_KEY=sk-...       # Kimi K2 (recommended, cheap, capable)
export MINIMAX_API_KEY=sk-api-...
export OPENAI_API_KEY=sk-...         # or any OpenAI-compatible endpoint
export ANTHROPIC_API_KEY=sk-ant-...
```

Then drop `--dry-run` / `--no-llm` from any command. The LLM will emit structured JSON IR,
which the codec validates and renders.

```bash
python3 -m polyglot.cli image "stormy ocean at midnight" --out /tmp/ocean.png
python3 -m polyglot.cli sensor "treadmill walk, 3-axis accelerometer" --out /tmp/walk.json
```

---

## What ran

Every command above produces a real file. No mocks, no placeholders, no "I'll implement this
later." If a command fails, it fails loudly with a structured error and a manifest recording
the failure.

For the full status of what's a real renderer vs what's a typed stub, see
[`implementation-status.md`](implementation-status.md).

For the five-layer architecture see [`architecture.md`](architecture.md).

For the research direction see [`research/vq-tokens-as-interface.md`](research/vq-tokens-as-interface.md).
