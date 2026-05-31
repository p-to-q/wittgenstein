---
date: 2026-05-31
status: validation note
labels: [research-derived, m4-video, receipts, eval]
tracks: [#476, #359, #456]
---

# Video MP4 receipt portability sweep

## Question

#476 asks whether the repo-owned MP4 renderer's structural receipt floor travels
across machines and toolchain versions. The policy under test is:

- same-platform MP4 bytes must be stable for a fixed backend;
- cross-platform MP4 bytes are informational, not a release promise;
- cross-platform ffprobe structure and portable `videoRender` receipt fields
  are the acceptance floor.

The sweep used the existing validation script:

```bash
node --import tsx research/validation/video_mp4_renderer_validate.ts
```

MP4 mode was enabled with `WITTGENSTEIN_VALIDATE_VIDEO_MP4=1`.

## Environments

| Environment                 | OS / arch                    |  Node.js | FFmpeg / ffprobe                  | Chrome / Chromium     |
| --------------------------- | ---------------------------- | -------: | --------------------------------- | --------------------- |
| `macos-local-arm64`         | Darwin 25.0.0 arm64          |  v25.6.1 | 8.0.1 / 8.0.1                     | Chrome/148.0.7778.181 |
| `linux-docker-arm64-node22` | Linux 6.12.54-linuxkit arm64 | v22.22.3 | 5.1.9-0+deb12u1 / 5.1.9-0+deb12u1 | Chrome/148.0.7778.178 |

Both runs used the `distilled-internal` backend and the fixed 3 second,
72-frame inline-SVG fixture from
`research/validation/video_mp4_renderer_validate.ts`.

## Results

| Field                         |                                                                                                                  macOS local |                                                       Linux Docker | Cross-environment result |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------: | -----------------------------------------------------------------: | ------------------------ |
| HTML SHA-256                  |                                                           `e8cc3f665892ca0152c63bef568543cf2dfa972d8bcbe07829e82f30f84c14b1` | `e8cc3f665892ca0152c63bef568543cf2dfa972d8bcbe07829e82f30f84c14b1` | byte parity              |
| MP4 SHA-256                   |                                                           `4b28221cfe49cf76b7fc3789d86c66d5885875c1b0e4f1c3d8aa33e42f834c0d` | `fa59cb32596aa2d9c19ca5bc784729fc6706d028b013ea3bc8a47fb98acf0879` | byte drift, expected     |
| MP4 bytes                     |                                                                                                                       17,471 |                                                             17,249 | byte drift, expected     |
| Same-platform backend verdict |                                                                                                    `byte-parity-on-platform` |                                          `byte-parity-on-platform` | pass                     |
| ffprobe structure             |                                                                             H.264, 1920x1080, 24/1 fps, 3.000000s, 72 frames |                   H.264, 1920x1080, 24/1 fps, 3.000000s, 72 frames | structural parity        |
| Portable receipt fields       | `hyperframes-mp4`, `distilled-internal`, `structural-parity-cross-platform`, 24 fps, standard, 72 frames, 1920x1080, 3s, MP4 |                                                               same | receipt parity           |

The observed MP4 byte drift matches the prior policy: Chrome and FFmpeg
versions differ, and MP4 bytes are not a portable invariant. The stable
invariants are the ffprobe structure and the portable receipt signature.

## Implementation feedback

The sweep found one validation-path bug and one receipt fidelity weakness:

1. `WITTGENSTEIN_VIDEO_VALIDATION_DIR` failed when set to a relative path,
   because FFmpeg received a frame path that was later reinterpreted relative
   to the encode cwd. The validation script now resolves that base directory
   before creating the temporary run directory.
2. The Linux run proved that `ffmpeg -version` can exceed the 1 second default
   version-probe budget while still returning useful data under a 5 second
   probe. The MP4 renderer now gives FFmpeg version receipts that 5 second
   ceiling instead of falling back prematurely to the literal `ffmpeg`.

The validation script now emits an `environment` object and a `portability`
summary so future machine-to-machine sweeps can compare the policy fields
directly instead of hand-copying from nested receipt JSON.

## Verdict

#476 can close on the current policy. Same-platform byte parity passed on both
machines for the default backend. Cross-machine MP4 bytes differed, as expected,
while cross-machine structure and portable receipt fields matched. No new
implementation issue is needed for structural parity failure.
