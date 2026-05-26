---
date: 2026-05-26
status: validation note
labels: [research-derived, m4-video]
tracks: [#282, #359, #360, #361, #362]
---

# Video MP4 renderer validation

## Context

The earlier video backend comparison (`docs/research/2026-05-08-video-backend-comparison.md`)
picked a HyperFrames-shaped path: JSON composition + inline SVG / scene timing,
browser-native HTML, and local Chrome + FFmpeg for MP4. The implementation constraint
was distillation, not vendoring: repo-owned code should carry the default path, while
upstream HyperFrames remains a useful reference and parity target.

## Horizontal comparison

The current implementation follows the same pattern used by the stronger local paths:

| Path | Useful precedent | Video application |
|---|---|---|
| Audio Kokoro / procedural routes | Renderer emits explicit `audioRender` receipts and marks determinism class honestly | Video now emits `videoRender` receipts with backend, FPS, quality, dimensions, duration, frame count, output kind, and tool versions when available |
| Sensor Loupe renderer | Deterministic local artifact plus optional richer HTML side surface | Video keeps deterministic HTML as the default artifact when MP4 is not requested |
| ProcessRunner extraction | Subprocess timeout + bounded stderr/stdout belongs in a leaf package, not codec/core cycles | Both the distilled FFmpeg encode path and upstream CLI path use `@wittgenstein/process-runner` |
| HyperFrames upstream | Agent-friendly HTML timeline + local Chrome/FFmpeg render | Retained as explicit `WITTGENSTEIN_HYPERFRAMES_BACKEND=npx-cli` parity backend, not the default |

## Practical features kept

- Default `distilled-internal` backend: Chrome screenshot frames + FFmpeg MP4 encode.
- Explicit `npx-cli` backend: local upstream HyperFrames path for parity checks and experiments. The npm package currently advertises Node.js >=22, so this backend is a Node-version-sensitive comparison path rather than the repo default.
- `?wittgensteinFrameTime=` hook: freezes the CSS timeline at a specific timestamp so screenshots do not depend on wall-clock animation timing.
- Validation script: `research/validation/video_mp4_renderer_validate.ts` validates HTML receipts by default and becomes a hard MP4 gate when local dependencies exist: each requested backend must pass same-platform byte parity and ffprobe structural checks.
- `doctor` now reports the selected backend and only checks the upstream CLI when the user selects it.

## Validation run

Ran locally on 2026-05-26:

```bash
node --import tsx research/validation/video_mp4_renderer_validate.ts
```

Result: HTML-only validation passed. The fixed three-slide inline-SVG fixture emitted
a byte-stable HTML artifact with a `videoRender` receipt and the frame-time hook present.

Then ran the local-compute MP4 gate on the same machine:

```bash
export WITTGENSTEIN_VALIDATE_VIDEO_MP4=1
export WITTGENSTEIN_HYPERFRAMES_RENDER=1
export WITTGENSTEIN_VALIDATE_VIDEO_BACKENDS=distilled-internal,npx-cli
export WITTGENSTEIN_KEEP_VIDEO_VALIDATION_ARTIFACTS=1
node --import tsx research/validation/video_mp4_renderer_validate.ts
```

Environment:

- Node.js: 22.20.0
- FFmpeg / ffprobe: 8.1.1
- Chrome: `Chrome/148.0.7778.179`
- HyperFrames CLI: 0.6.46

HTML fixture:

- SHA-256: `e8cc3f665892ca0152c63bef568543cf2dfa972d8bcbe07829e82f30f84c14b1`
- Receipt: `renderPath=hyperframes-html`, `backend=distilled-internal`, `outputKind=html`, `durationSec=3`, `fps=24`, `width=1920`, `height=1080`
- Frame-time hook: present

MP4 double-render results:

| Requested backend | Receipt backend | SHA-256 | Bytes | ffprobe structure | Verdict |
|---|---|---:|---:|---|---|
| `distilled-internal` | `distilled-internal` | `277c710281aa4b2474266fb2b86353294f93100a42b1cdcc207f7332168e7d94` | 17489 | H.264, 1920x1080, 24fps, 3.000000s, 72 frames | byte parity on platform |
| `npx-cli` | `npx-hyperframes-cli` | `9b7161a3b64dc6940d0ff9e49c9f909fbd4ca0302759b1aab844cfd08bf0a857` | 12093 | H.264, 1920x1080, 24fps, 3.000000s, 72 frames | byte parity on platform |

The two backends are structurally equivalent for the validation fixture but do not
produce byte-identical MP4s across backend implementations. That is expected: the
repo-owned renderer and upstream CLI have separate encode paths. The meaningful
floor is per-backend byte parity on the same platform plus matching structural
metadata across backends.

The validation script writes temporary run material under
`artifacts/tmp/video-mp4-renderer/` by default, or under
`WITTGENSTEIN_VIDEO_VALIDATION_DIR` when that environment variable is set.
By default it removes the run directory after success; set
`WITTGENSTEIN_KEEP_VIDEO_VALIDATION_ARTIFACTS=1` to retain the files for manual
inspection.

## Verdict

The practical wiring is now in place: HTML default, repo-owned MP4 as the default
opt-in backend, upstream CLI as an explicit parity backend, and receipts / doctor /
validation hooks to keep future changes honest. The empirical MP4 gate passed on
this machine for both the distilled internal renderer and the upstream CLI parity
backend. Future portability work should treat cross-machine MP4 bytes as unstable
unless measured again, but must preserve the manifest receipt and ffprobe
structural floor.
