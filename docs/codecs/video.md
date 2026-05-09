# Video Codec

Video owns a composition-first JSON IR and a render seam for HyperFrames.

## IR

The model emits scene blocks, timing, and composition metadata.

Optional `inlineSvgs` is an array of **full** `<svg>…</svg>` documents. When present, the HyperFrames HTML renderer shows **one slide per SVG** on a black stage (no title cards). Timing:

- If `scenes.length` matches `inlineSvgs.length`, use each `scenes[i].durationSec`.
- Else if `durationSec` is set, split it evenly across slides.
- Else default **3 seconds per slide**.

## CLI: playable animation HTML (no HyperFrames)

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

> **HyperFrames-shaped, not HyperFrames-vendored.** Per PR #277 ratification + the #282 follow-up, the upstream `heygen-com/hyperframes` package is the inspiration / reference design, not a runtime dependency. The codec borrows the *spirit* (timeline + inline-SVG composition with `data-*` timing attributes; local FFmpeg + headless-Chrome render) but the implementation must be **repo-owned**: no `heygen-com/hyperframes` import as a runtime dep, no wholesale vendoring of the package into this repo, no preserving upstream modules just because they exist. The distillation work itself is tracked in #282; the verification gates (license clearance, behavioral test corpus, doctor coverage, manifest receipts) are listed there.

### HTML (default)

The codec writes a deterministic HTML file using HyperFrames-style `data-*` timing attributes.

Note: the harness default output path for video is still `output.mp4`, but **without** local encode enabled the codec writes `output.hyperframes.html` next to that basename so the artifact type matches what was generated.

### MP4 (opt-in, local HyperFrames CLI)

HyperFrames is **not** “an API you must call” for basic rendering: the open-source CLI renders **locally** with **FFmpeg + headless Chrome** (see upstream `hyperframes doctor`). Optional network traffic may occur for `npx` package download or CLI update notices unless disabled with `HYPERFRAMES_NO_UPDATE_CHECK=1` (Wittgenstein defaults telemetry/update noise off when spawning).

To emit a real `.mp4` artifact at the harness `outPath`, enable:

```bash
export WITTGENSTEIN_HYPERFRAMES_RENDER=1
```

Optional tuning:

- `WITTGENSTEIN_HYPERFRAMES_RENDER_TIMEOUT_MS` (default `600000`)
- `WITTGENSTEIN_HYPERFRAMES_QUALITY` (`draft` | `standard` | `high`, default `standard`)

## Benchmark Direction

Once the MP4 branch is merged, video should align with common evaluation practice instead of ad-hoc scores:

- `FVD` for distribution-level video quality
- `Video-Bench` style multi-dimensional evaluation for prompt adherence, visual quality, temporal consistency, and motion fidelity
- motion-specific metrics such as `FVMD` when motion realism matters

The package exists now so video is a first-class codec, not an afterthought, but the current main branch is still a scaffold rather than a runnable MP4 benchmark target.

## Lineage receipt

For agents reading this doc cold, the lineage from the v0.2 stub to today's main HEAD:

| Step | Surface | Note |
|---|---|---|
| Codec-video stub | `packages/codec-video/` (v0.2) | 🔴 stub at v0.2 lock; codec-v2 plan §M4 explicitly defers MP4 wiring |
| Backend research commission | #264 | Compare HyperFrames vs Remotion / Motion Canvas / Manim / Lottie / GSAP / FFmpeg-direct |
| Backend comparison ratification | PR #277 | HyperFrames-shaped lead path **conditional on license verification + repo-owned distillation** |
| Distillation work commission | #282 | Six slice issues named (#282A–#282F): license audit / behavioral corpus / pure-TS HTML emitter / MP4 opt-in / doctor coverage / manifest receipt block |
| Exec plan annotation | PR #293 | Codec v2 port plan annotated to reflect that #277 / #282 activate M4 video work post-v0.2 |
| M4 implementation | (gated on #282 slices) | Repo-owned renderer; videoRender manifest block analogous to audioRender |

The distinction matters because of the doctrine line in `docs/hard-constraints.md`: the harness ships under Apache-2.0, and any external dependency we import or vendor needs license + receipt clarity before it ships in a release artifact. HyperFrames-shaped distillation lets video M4 land without taking on that gate work for an upstream package whose license + maintenance posture haven't been audited locally.
