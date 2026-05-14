# Showcase — real files Wittgenstein produces

Thirty-five artifacts generated through the Wittgenstein harness, grouped by modality.
Every file here has a matching run manifest under `artifacts/runs/<run-id>/manifest.json`
(git SHA, seed, LLM input/output, artifact SHA-256), so anything you see is
reproducible bit-for-bit.

This pack is a preserved snapshot from the `v0.1.0-alpha.1` hackathon phase: the first
public 35-artifact receipt set that proved the workflow could emit real files across
image, audio, and sensor routes.

Keep reading it as a historical receipt, not as a claim that every artifact already
matches the fully post-lock `v0.2` architecture one-for-one. As Codec v2, decoder
contracts, and the manifest spine continue to harden, this gallery will be refreshed
with newer curated outputs instead of silently rewriting the original snapshot.
Use it as a human-browsable artifact gallery, not as the current execution brief for
agents; active implementation guidance lives in the codec-v2 plan and the agent guides.

- **Pack root** — [`artifacts/showcase/workflow-examples/`](artifacts/showcase/workflow-examples/)
- **Hand-picked samples** — [`artifacts/showcase/workflow-examples/samples/`](artifacts/showcase/workflow-examples/samples/)
- **Machine-readable index** — [`summary.json`](artifacts/showcase/workflow-examples/summary.json)

---

## One sample per modality (click to open)

| Modality       | Sample              | File                                                                                                                                  | Workflow                                    |
| -------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 🖼️ Image       | `02-forest`         | [`samples/image/02-forest.png`](artifacts/showcase/workflow-examples/samples/image/02-forest.png)                                     | scene spec → adapter → frozen decoder → PNG |
| 🖼️ Image 2     | `03-forest-alt`     | [`samples/image/03-forest-alt.png`](artifacts/showcase/workflow-examples/samples/image/03-forest-alt.png)                             | scene spec → adapter → frozen decoder → PNG |
| 🎙️ TTS         | `02-harness`        | [`samples/tts/02-harness.wav`](artifacts/showcase/workflow-examples/samples/tts/02-harness.wav)                                       | audio codec, speech route                   |
| 🎵 Music       | `01-launch-minimal` | [`samples/music/01-launch-minimal.wav`](artifacts/showcase/workflow-examples/samples/music/01-launch-minimal.wav)                     | audio codec, music route                    |
| 🌧️ Soundscape  | `02-forest-morning` | [`samples/soundscape/02-forest-morning.wav`](artifacts/showcase/workflow-examples/samples/soundscape/02-forest-morning.wav)           | audio codec, soundscape route               |
| ❤️ ECG         | `05-clinical`       | [`samples/sensor-ecg/05-clinical.html`](artifacts/showcase/workflow-examples/samples/sensor-ecg/05-clinical.html)                     | operator spec → JSON + CSV + Loupe HTML     |
| 🌡️ Temperature | `02-greenhouse`     | [`samples/sensor-temperature/02-greenhouse.html`](artifacts/showcase/workflow-examples/samples/sensor-temperature/02-greenhouse.html) | operator spec → JSON + CSV + Loupe HTML     |
| 🎛️ Gyro        | `02-hover`          | [`samples/sensor-gyro/02-hover.html`](artifacts/showcase/workflow-examples/samples/sensor-gyro/02-hover.html)                         | operator spec → JSON + CSV + Loupe HTML     |

The samples folder mirrors these picks as a self-contained subset:
[`artifacts/showcase/workflow-examples/samples/`](artifacts/showcase/workflow-examples/samples/).

---

## The full pack (5 per group, 35 total)

### 🖼️ Image — scene spec → adapter → frozen decoder → PNG

Locked pipeline: LLM emits a structured scene JSON, the MLP adapter maps it to latent
parameters, and a frozen reference decoder renders the raster. No diffusion, no SVG
fallback. See [`docs/codecs/image.md`](docs/codecs/image.md).

| #   | Artifact                                                                              |
| --- | ------------------------------------------------------------------------------------- |
| 01  | [`image/01-coastal.png`](artifacts/showcase/workflow-examples/image/01-coastal.png)   |
| 02  | [`image/02-forest.png`](artifacts/showcase/workflow-examples/image/02-forest.png) ⭐  |
| 03  | [`image/03-lake.png`](artifacts/showcase/workflow-examples/image/03-lake.png)         |
| 04  | [`image/04-mountain.png`](artifacts/showcase/workflow-examples/image/04-mountain.png) |
| 05  | [`image/05-meadow.png`](artifacts/showcase/workflow-examples/image/05-meadow.png)     |

> The showcase set uses a narrow-domain reference decoder bridge inside the neural path
> so the demo looks less abstract while staying harness-compatible. `02-forest` is a
> verified prior-run workflow image, and `samples/image/03-forest-alt.png` is a second
> verified local example from the same workflow lineage. The full VQ decoder bridge is
> still ⚠️ Partial — see [`docs/implementation-status.md`](docs/implementation-status.md).

### 🎙️ TTS — audio codec, speech route

On macOS, the speech route upgrades automatically to `say` + `afconvert`; elsewhere it
falls back to the stdlib WAV synth.

| #   | Artifact                                                                           |
| --- | ---------------------------------------------------------------------------------- |
| 01  | [`tts/01-thesis.wav`](artifacts/showcase/workflow-examples/tts/01-thesis.wav)      |
| 02  | [`tts/02-harness.wav`](artifacts/showcase/workflow-examples/tts/02-harness.wav) ⭐ |
| 03  | [`tts/03-codecs.wav`](artifacts/showcase/workflow-examples/tts/03-codecs.wav)      |
| 04  | [`tts/04-decoder.wav`](artifacts/showcase/workflow-examples/tts/04-decoder.wav)    |
| 05  | [`tts/05-launch.wav`](artifacts/showcase/workflow-examples/tts/05-launch.wav)      |

### 🎵 Music — audio codec, music route

| #   | Artifact                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------- |
| 01  | [`music/01-launch-minimal.wav`](artifacts/showcase/workflow-examples/music/01-launch-minimal.wav) ⭐ |
| 02  | [`music/02-editorial-glow.wav`](artifacts/showcase/workflow-examples/music/02-editorial-glow.wav)    |
| 03  | [`music/03-forest-bloom.wav`](artifacts/showcase/workflow-examples/music/03-forest-bloom.wav)        |
| 04  | [`music/04-rain-grid.wav`](artifacts/showcase/workflow-examples/music/04-rain-grid.wav)              |
| 05  | [`music/05-night-drive.wav`](artifacts/showcase/workflow-examples/music/05-night-drive.wav)          |

### 🌧️ Soundscape — audio codec, soundscape route

Procedural ambient synthesis (pink noise, gaussian pulses, tonal layers) in pure stdlib.

| #   | Artifact                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------- |
| 01  | [`soundscape/01-rain-glass.wav`](artifacts/showcase/workflow-examples/soundscape/01-rain-glass.wav)            |
| 02  | [`soundscape/02-forest-morning.wav`](artifacts/showcase/workflow-examples/soundscape/02-forest-morning.wav) ⭐ |
| 03  | [`soundscape/03-urban-night.wav`](artifacts/showcase/workflow-examples/soundscape/03-urban-night.wav)          |
| 04  | [`soundscape/04-open-ridge.wav`](artifacts/showcase/workflow-examples/soundscape/04-open-ridge.wav)            |
| 05  | [`soundscape/05-machine-room.wav`](artifacts/showcase/workflow-examples/soundscape/05-machine-room.wav)        |

### ❤️ Sensor — ECG

Each entry ships JSON (operator spec + samples) + CSV (`timeSec,value`) + an interactive
Loupe HTML dashboard (~117 KB, zero external deps).

| #   | JSON                                                                          | CSV                                                                         | HTML (interactive)                                                                           |
| --- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 01  | [`json`](artifacts/showcase/workflow-examples/sensor/ecg/01-resting.json)     | [`csv`](artifacts/showcase/workflow-examples/sensor/ecg/01-resting.csv)     | [`01-resting.html`](artifacts/showcase/workflow-examples/sensor/ecg/01-resting.html)         |
| 02  | [`json`](artifacts/showcase/workflow-examples/sensor/ecg/02-exercise.json)    | [`csv`](artifacts/showcase/workflow-examples/sensor/ecg/02-exercise.csv)    | [`02-exercise.html`](artifacts/showcase/workflow-examples/sensor/ecg/02-exercise.html)       |
| 03  | [`json`](artifacts/showcase/workflow-examples/sensor/ecg/03-recovery.json)    | [`csv`](artifacts/showcase/workflow-examples/sensor/ecg/03-recovery.csv)    | [`03-recovery.html`](artifacts/showcase/workflow-examples/sensor/ecg/03-recovery.html)       |
| 04  | [`json`](artifacts/showcase/workflow-examples/sensor/ecg/04-noisy-patch.json) | [`csv`](artifacts/showcase/workflow-examples/sensor/ecg/04-noisy-patch.csv) | [`04-noisy-patch.html`](artifacts/showcase/workflow-examples/sensor/ecg/04-noisy-patch.html) |
| 05  | [`json`](artifacts/showcase/workflow-examples/sensor/ecg/05-clinical.json)    | [`csv`](artifacts/showcase/workflow-examples/sensor/ecg/05-clinical.csv)    | [`05-clinical.html`](artifacts/showcase/workflow-examples/sensor/ecg/05-clinical.html) ⭐    |

### 🌡️ Sensor — Temperature

| #   | JSON                                                                                    | CSV                                                                                   | HTML (interactive)                                                                                       |
| --- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 01  | [`json`](artifacts/showcase/workflow-examples/sensor/temperature/01-office.json)        | [`csv`](artifacts/showcase/workflow-examples/sensor/temperature/01-office.csv)        | [`01-office.html`](artifacts/showcase/workflow-examples/sensor/temperature/01-office.html)               |
| 02  | [`json`](artifacts/showcase/workflow-examples/sensor/temperature/02-greenhouse.json)    | [`csv`](artifacts/showcase/workflow-examples/sensor/temperature/02-greenhouse.csv)    | [`02-greenhouse.html`](artifacts/showcase/workflow-examples/sensor/temperature/02-greenhouse.html) ⭐    |
| 03  | [`json`](artifacts/showcase/workflow-examples/sensor/temperature/03-cold-chain.json)    | [`csv`](artifacts/showcase/workflow-examples/sensor/temperature/03-cold-chain.csv)    | [`03-cold-chain.html`](artifacts/showcase/workflow-examples/sensor/temperature/03-cold-chain.html)       |
| 04  | [`json`](artifacts/showcase/workflow-examples/sensor/temperature/04-device-warmup.json) | [`csv`](artifacts/showcase/workflow-examples/sensor/temperature/04-device-warmup.csv) | [`04-device-warmup.html`](artifacts/showcase/workflow-examples/sensor/temperature/04-device-warmup.html) |
| 05  | [`json`](artifacts/showcase/workflow-examples/sensor/temperature/05-hvac.json)          | [`csv`](artifacts/showcase/workflow-examples/sensor/temperature/05-hvac.csv)          | [`05-hvac.html`](artifacts/showcase/workflow-examples/sensor/temperature/05-hvac.html)                   |

### 🎛️ Sensor — Gyro / IMU

| #   | JSON                                                                        | CSV                                                                       | HTML (interactive)                                                                      |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 01  | [`json`](artifacts/showcase/workflow-examples/sensor/gyro/01-handheld.json) | [`csv`](artifacts/showcase/workflow-examples/sensor/gyro/01-handheld.csv) | [`01-handheld.html`](artifacts/showcase/workflow-examples/sensor/gyro/01-handheld.html) |
| 02  | [`json`](artifacts/showcase/workflow-examples/sensor/gyro/02-hover.json)    | [`csv`](artifacts/showcase/workflow-examples/sensor/gyro/02-hover.csv)    | [`02-hover.html`](artifacts/showcase/workflow-examples/sensor/gyro/02-hover.html) ⭐    |
| 03  | [`json`](artifacts/showcase/workflow-examples/sensor/gyro/03-walk.json)     | [`csv`](artifacts/showcase/workflow-examples/sensor/gyro/03-walk.csv)     | [`03-walk.html`](artifacts/showcase/workflow-examples/sensor/gyro/03-walk.html)         |
| 04  | [`json`](artifacts/showcase/workflow-examples/sensor/gyro/04-vehicle.json)  | [`csv`](artifacts/showcase/workflow-examples/sensor/gyro/04-vehicle.csv)  | [`04-vehicle.html`](artifacts/showcase/workflow-examples/sensor/gyro/04-vehicle.html)   |
| 05  | [`json`](artifacts/showcase/workflow-examples/sensor/gyro/05-gimbal.json)   | [`csv`](artifacts/showcase/workflow-examples/sensor/gyro/05-gimbal.csv)   | [`05-gimbal.html`](artifacts/showcase/workflow-examples/sensor/gyro/05-gimbal.html)     |

---

## Reproducing these

Each artifact was written by a real harness run. To produce an equivalent one yourself:

```bash
# Sensor (no API key, no LLM call, <50 ms)
python3 -m polyglot.cli sensor "ECG 72 bpm resting" --dry-run --out /tmp/ecg.json

# TTS (macOS, no API key)
python3 -m polyglot.cli tts "Cozy rainy afternoon" --out /tmp/voice.m4a

# Image (runs without LLM by passing --no-llm)
python3 -m polyglot.cli image "warm desert at sunset" --no-llm --out /tmp/desert.png
```

Full 30-second tour: [`docs/quickstart.md`](docs/quickstart.md). Reproducibility spine:
[`docs/reproducibility.md`](docs/reproducibility.md).

---

## Legend

- ⭐ — sample pick (also mirrored under `samples/`)
- `.html` files are self-contained; open them directly in a browser, no build step
- `.wav` files play in any browser or QuickTime
- `.png` images are 1024×1024 unless otherwise noted
