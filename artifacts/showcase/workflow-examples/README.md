# Workflow Example Pack

35 real artifacts produced through the Wittgenstein harness — 5 per modality group,
plus 7 hand-picked samples mirrored under [`samples/`](samples/).

> **This is a reference pack.** It was generated using curated local JSON responses so
> the runs stay reproducible without hitting an external LLM, but every run still writes
> a full manifest under `artifacts/runs/<run-id>/manifest.json` (git SHA, seed, LLM
> input/output, artifact SHA-256). You can regenerate any of these bit-for-bit.
>
> For a nicer rendered gallery, see the top-level [`SHOWCASE.md`](../../../SHOWCASE.md).

---

## Groups (5 artifacts each)

| Group | Folder | Workflow |
|---|---|---|
| `image` | [`image/`](image/) | scene spec → adapter → frozen decoder → PNG |
| `tts` | [`tts/`](tts/) | audio codec, speech route |
| `music` | [`music/`](music/) | audio codec, music route |
| `soundscape` | [`soundscape/`](soundscape/) | audio codec, soundscape route |
| `sensor-ecg` | [`sensor/ecg/`](sensor/ecg/) | operator spec → JSON + CSV + Loupe HTML |
| `sensor-temperature` | [`sensor/temperature/`](sensor/temperature/) | operator spec → JSON + CSV + Loupe HTML |
| `sensor-gyro` | [`sensor/gyro/`](sensor/gyro/) | operator spec → JSON + CSV + Loupe HTML |

## Sample picks (one per group, also mirrored in [`samples/`](samples/))

| Group | Pick | File to open first |
|---|---|---|
| Image | `02-forest` | [`image/02-forest.png`](image/02-forest.png) |
| TTS | `02-harness` | [`tts/02-harness.wav`](tts/02-harness.wav) |
| Music | `01-launch-minimal` | [`music/01-launch-minimal.wav`](music/01-launch-minimal.wav) |
| Soundscape | `02-forest-morning` | [`soundscape/02-forest-morning.wav`](soundscape/02-forest-morning.wav) |
| Sensor ECG | `05-clinical` | [`sensor/ecg/05-clinical.html`](sensor/ecg/05-clinical.html) |
| Sensor Temperature | `02-greenhouse` | [`sensor/temperature/02-greenhouse.html`](sensor/temperature/02-greenhouse.html) |
| Sensor Gyro | `02-hover` | [`sensor/gyro/02-hover.html`](sensor/gyro/02-hover.html) |

Machine-readable index: [`summary.json`](summary.json).

---

## Notes

- **Image** uses the sole neural path: `scene spec → adapter → frozen decoder → PNG`.
  The showcase set routes through a narrow-domain reference decoder bridge inside that
  path so the demo looks less abstract while staying harness-compatible. The full VQ
  decoder bridge is still ⚠️ Partial; see
  [`../../../docs/implementation-status.md`](../../../docs/implementation-status.md).
- **TTS** uses the audio speech route. On macOS it upgrades to `say` + `afconvert`
  automatically; elsewhere it uses the stdlib WAV synth.
- **Music** and **soundscape** stay on the local audio runtime (pure stdlib + numpy).
- **Sensor** outputs always include JSON, CSV, and an interactive HTML dashboard
  (~117 KB, zero external deps) — open the `.html` directly, no build step.
- Every artifact has a corresponding run manifest under
  [`../../runs/`](../../runs/).

See also:

- [`../../../SHOWCASE.md`](../../../SHOWCASE.md) — top-level rendered gallery
- [`../../../docs/quickstart.md`](../../../docs/quickstart.md) — how to produce your own
- [`../../../docs/reproducibility.md`](../../../docs/reproducibility.md) — manifest spine
