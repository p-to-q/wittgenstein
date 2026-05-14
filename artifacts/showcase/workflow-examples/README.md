# Workflow Example Pack

35 real artifacts produced through the Wittgenstein harness — 5 per modality group,
plus 7 hand-picked samples mirrored under [`samples/`](samples/).

This directory is the preserved `v0.1.0-alpha.1` hackathon snapshot: the first bundled
artifact pack we used to show that Wittgenstein could emit real files across image,
audio, and sensor routes.

> **This is a reference pack.** It was generated using curated local JSON responses so
> the runs stay reproducible without hitting an external LLM, but every run still writes
> a full manifest under `artifacts/runs/<run-id>/manifest.json` (git SHA, seed, LLM
> input/output, artifact SHA-256). You can regenerate any of these bit-for-bit.
>
> Read it as a historical receipt, not as a statement that every file already reflects
> the exact post-lock `v0.2` implementation surface. As Codec v2 ports and decoder
> contracts land, newer curated packs will replace it as the active baseline.
>
> This directory is for human browsing and reproducibility receipts, not for agent task
> routing; active implementation guidance lives in the codec-v2 exec plan and agent guides.
>
> For a nicer rendered gallery, see [`docs/showcase.md`](../../../docs/showcase.md).

---

## Groups (5 artifacts each)

| Group                | Folder                                       | Workflow                                    |
| -------------------- | -------------------------------------------- | ------------------------------------------- |
| `image`              | [`image/`](image/)                           | scene spec → adapter → frozen decoder → PNG |
| `tts`                | [`tts/`](tts/)                               | audio codec, speech route                   |
| `music`              | [`music/`](music/)                           | audio codec, music route                    |
| `soundscape`         | [`soundscape/`](soundscape/)                 | audio codec, soundscape route               |
| `sensor-ecg`         | [`sensor/ecg/`](sensor/ecg/)                 | operator spec → JSON + CSV + Loupe HTML     |
| `sensor-temperature` | [`sensor/temperature/`](sensor/temperature/) | operator spec → JSON + CSV + Loupe HTML     |
| `sensor-gyro`        | [`sensor/gyro/`](sensor/gyro/)               | operator spec → JSON + CSV + Loupe HTML     |

## Sample picks (one per group, opened directly from [`samples/`](samples/))

| Group              | Pick                | File to open first                                                                               |
| ------------------ | ------------------- | ------------------------------------------------------------------------------------------------ |
| Image              | `02-forest`         | [`samples/image/02-forest.png`](samples/image/02-forest.png)                                     |
| Image 2            | `03-forest-alt`     | [`samples/image/03-forest-alt.png`](samples/image/03-forest-alt.png)                             |
| TTS                | `02-harness`        | [`samples/tts/02-harness.wav`](samples/tts/02-harness.wav)                                       |
| Music              | `01-launch-minimal` | [`samples/music/01-launch-minimal.wav`](samples/music/01-launch-minimal.wav)                     |
| Soundscape         | `02-forest-morning` | [`samples/soundscape/02-forest-morning.wav`](samples/soundscape/02-forest-morning.wav)           |
| Sensor ECG         | `05-clinical`       | [`samples/sensor-ecg/05-clinical.html`](samples/sensor-ecg/05-clinical.html)                     |
| Sensor Temperature | `02-greenhouse`     | [`samples/sensor-temperature/02-greenhouse.html`](samples/sensor-temperature/02-greenhouse.html) |
| Sensor Gyro        | `02-hover`          | [`samples/sensor-gyro/02-hover.html`](samples/sensor-gyro/02-hover.html)                         |

Machine-readable index: [`summary.json`](summary.json).

---

## Notes

- **Image** uses the sole neural path: `scene spec → adapter → frozen decoder → PNG`.
  The showcase set routes through a narrow-domain reference decoder bridge inside that
  path so the demo looks less abstract while staying harness-compatible. `02-forest`
  is now pinned to a verified prior-run workflow image, and
  `samples/image/03-forest-alt.png` is a second verified local example from the same
  workflow lineage. The full VQ decoder bridge is still ⚠️ Partial; see
  [`../../../docs/implementation-status.md`](../../../docs/implementation-status.md).
- **TTS** uses the audio speech route. On macOS it upgrades to `say` + `afconvert`
  automatically; elsewhere it uses the stdlib WAV synth.
- **Music** and **soundscape** stay on the local audio runtime (pure stdlib + numpy).
- **Sensor** outputs always include JSON, CSV, and an interactive HTML dashboard
  (~117 KB, zero external deps) — open the `.html` directly, no build step.
- Every artifact has a corresponding run manifest under
  [`../../runs/`](../../runs/).

See also:

- [`../../../docs/showcase.md`](../../../docs/showcase.md) — rendered gallery
- [`../../../docs/quickstart.md`](../../../docs/quickstart.md) — how to produce your own
- [`../../../docs/reproducibility.md`](../../../docs/reproducibility.md) — manifest spine
