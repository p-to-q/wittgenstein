# Video Codec

Video owns a composition-first JSON IR and a HyperFrames-shaped render seam.

## IR

The model emits scene blocks, timing, and composition metadata.

Optional `inlineSvgs` is an array of **full** `<svg>…</svg>` documents. When present, the renderer shows **one slide per SVG** on a black stage (no title cards). Timing:

- If `scenes.length` matches `inlineSvgs.length`, use each `scenes[i].durationSec`.
- Else if `durationSec` is set, split it evenly across slides.
- Else default **3 seconds per slide**.

## CLI: playable animation HTML

`wittgenstein animate-html` writes a **single HTML file** that plays in any browser: SVG slides cross-fade on a timer using **CSS `animation`**, default **`animation-iteration-count: infinite`**.

```bash
pnpm exec wittgenstein animate-html \
  --svg ./output/tree-a.svg --svg ./output/tree-b.svg \
  --duration-sec 6 \
  --title "Tree study" \
  --out ./output/play-animation.html
```

Use `--once` to play a single cycle instead of looping.

## CLI: SVG files → MP4 (no LLM)

When you pass `--svg` one or more times, the CLI reads those files into `VideoRequest.inlineSvgs` and the harness **skips the LLM** and feeds the video codec a composition JSON directly.

```bash
export WITTGENSTEIN_HYPERFRAMES_RENDER=1
pnpm exec wittgenstein video "unused" --svg ./output/a.svg --svg ./output/b.svg --duration-sec 6 --out ./output/slides.mp4
```

## Renderer

`packages/codec-video/src/hyperframes-wrapper.ts` is the integration seam for **HyperFrames-shaped** HTML compositions and optional local MP4 encoding.

> **HyperFrames-shaped, not HyperFrames-vendored.** Per PR #277 ratification + the #282 follow-up, the upstream `heygen-com/hyperframes` package is the inspiration / reference design, not a runtime dependency. The codec borrows the *spirit* (timeline + inline-SVG composition with `data-*` timing attributes; local FFmpeg + headless-Chrome render) but the implementation is **repo-owned**: no `heygen-com/hyperframes` import as a runtime dep, no wholesale vendoring of the package into this repo, no preserving upstream modules just because they exist.

### HTML (default)

The codec writes a deterministic HTML file using HyperFrames-style `data-*` timing attributes.

Note: the harness default output path for video is still `output.mp4`, but **without** local encode enabled the codec writes `output.hyperframes.html` next to that basename so the artifact type matches what was generated.

### MP4 (opt-in, repo-owned local renderer)

The default MP4 path renders the same HTML composition through `puppeteer-core` + a local Chrome/Chromium binary, captures one PNG per frame with a deterministic `?wittgensteinFrameTime=` hook, then encodes those frames with local `ffmpeg`. It does not call `npx hyperframes` or import upstream HyperFrames code.

For cross-checking and temporary upstream parity, an explicit CLI backend is available:

```bash
export WITTGENSTEIN_HYPERFRAMES_BACKEND=npx-cli
```

The default remains `distilled-internal` so M4 stays repo-owned. The `npx-cli` backend is useful for validation against upstream HyperFrames and for local experiments when the upstream CLI works better on a given machine.

Note: the upstream `hyperframes` npm package currently advertises Node.js >=22,
while Wittgenstein's repo baseline is Node 20.19+. `wittgenstein doctor` reports
that mismatch when `WITTGENSTEIN_HYPERFRAMES_BACKEND=npx-cli` is selected.

To emit a real `.mp4` artifact at the harness `outPath`, enable:

```bash
export WITTGENSTEIN_HYPERFRAMES_RENDER=1
```

Optional tuning:

- `WITTGENSTEIN_HYPERFRAMES_RENDER_TIMEOUT_MS` (default `600000`)
- `WITTGENSTEIN_HYPERFRAMES_QUALITY` (`draft` | `standard` | `high`, default `standard`)
- `WITTGENSTEIN_HYPERFRAMES_BACKEND` (`distilled-internal` | `npx-cli`, default `distilled-internal`)
- `PUPPETEER_EXECUTABLE_PATH` when Chrome/Chromium is not in a standard location

Each render emits a `videoRender` manifest receipt with renderer backend, FPS, quality, dimensions, duration, frame count, output kind, and available Chrome / FFmpeg version strings. HTML output is marked `byte-parity-on-platform`; MP4 output is currently marked `structural-parity-cross-platform` because browser / font / FFmpeg versions can affect bytes.

## Research validation

Run the lightweight validation script:

```bash
node --import tsx research/validation/video_mp4_renderer_validate.ts
```

By default it validates the HTML path and receipt. To run the local-compute MP4 gate, install Chrome/Chromium + FFmpeg and set:

```bash
export WITTGENSTEIN_VALIDATE_VIDEO_MP4=1
export WITTGENSTEIN_HYPERFRAMES_RENDER=1
node --import tsx research/validation/video_mp4_renderer_validate.ts
```

The MP4 validation renders the same fixed inline-SVG composition twice and requires
both SHA-256 equality (`byte-parity-on-platform`) and ffprobe structural metadata
for the fixture. It exits non-zero when a requested backend fails the gate. Set
`WITTGENSTEIN_VALIDATE_VIDEO_BACKENDS=distilled-internal,npx-cli` to compare both
backends.

The validation JSON records an `environment` block (OS, Node, FFmpeg, ffprobe,
and optional `WITTGENSTEIN_VALIDATION_ENVIRONMENT_ID`) and a `portability`
summary with the structure and portable receipt fields to compare across
machines. `WITTGENSTEIN_VIDEO_VALIDATION_DIR` may be relative or absolute; the
script resolves it before handing frame paths to FFmpeg. The #476 cross-machine
sweep is recorded in
`docs/research/2026-05-31-video-mp4-receipt-portability.md`.

## Benchmark Direction

With the opt-in MP4 branch wired, video should align with common evaluation practice instead of ad-hoc scores once the local-compute gate is run:

- `FVD` for distribution-level video quality
- `Video-Bench` style multi-dimensional evaluation for prompt adherence, visual quality, temporal consistency, and motion fidelity
- motion-specific metrics such as `FVMD` when motion realism matters

The package exists now so video is a first-class codec, not an afterthought. The renderer is intentionally composition-shaped rather than text-to-video generative; M5b quality metrics remain downstream.

## Lineage receipt

For agents reading this doc cold, the lineage from the v0.2 stub to today's main HEAD:

| Step | Surface | Note |
|---|---|---|
| Codec-video stub | `packages/codec-video/` (v0.2) | 🔴 stub at v0.2 lock; codec-v2 plan §M4 explicitly defers MP4 wiring |
| Backend research commission | #264 | Compare HyperFrames vs Remotion / Motion Canvas / Manim / Lottie / GSAP / FFmpeg-direct |
| Backend comparison ratification | PR #277 | HyperFrames-shaped lead path **conditional on license verification + repo-owned distillation** |
| Distillation work commission | #282 | Six slice issues named (#282A–#282F): license audit / behavioral corpus / pure-TS HTML emitter / MP4 opt-in / doctor coverage / manifest receipt block |
| Exec plan annotation | PR #293 | Codec v2 port plan annotated to reflect that #277 / #282 activate M4 video work post-v0.2 |
| Refactor seam | PR #339 / #401 | Composition builders extracted; `ProcessRunner` moved to a leaf package |
| M4 implementation | current | Repo-owned Chrome + FFmpeg renderer; `videoRender` manifest receipt analogous to `audioRender` |

The distinction matters because of the doctrine line in `docs/hard-constraints.md`: the harness ships under Apache-2.0, and any external dependency we import or vendor needs license + receipt clarity before it ships in a release artifact. HyperFrames-shaped distillation lets video M4 land without shipping upstream HyperFrames code.
