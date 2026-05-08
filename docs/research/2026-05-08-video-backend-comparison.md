---
date: 2026-05-08
status: research note
labels: [research-derived, m4-video]
tracks: [#264, #92, #255]
---

# Video backend comparison — HyperFrames and alternatives

> **Status:** research note (not doctrine, not active execution guidance).
> Surveys the candidate video-rendering backends for Wittgenstein's M4 video lane. Confirms or revises the current HyperFrames assumption with citations and feasibility verdicts. Pins nothing as doctrine; commits no implementation.
> _Tracker: [#264](https://github.com/p-to-q/wittgenstein/issues/264). Supersedes [#92](https://github.com/p-to-q/wittgenstein/issues/92) once ratified._

## Why this note exists

`docs/codecs/video.md` describes a HyperFrames-based path: LLM emits composition JSON / inline SVGs → HyperFrames-style HTML → optional MP4 via local CLI (FFmpeg + headless Chrome). M4 is not yet active in the codec-v2 port (`docs/exec-plans/active/codec-v2-port.md`); this note is design-forward research that should land before M4 starts so the implementation lane isn't doing backend selection mid-flight.

The brief in [#264](https://github.com/p-to-q/wittgenstein/issues/264) asks: confirm or revise HyperFrames as the lead path; produce a backend comparison; if HyperFrames stays, draft the M4 implementation issue.

## Five questions to answer per backend

For each candidate, the same 5 questions:

1. **License** — Apache-2.0 / MIT acceptable; non-commercial fails.
2. **Local-only execution** — does it run on a contributor's laptop without cloud calls?
3. **Determinism** — same inputs + same versions → same output bytes? (Or at least same structural output?)
4. **Composition language** — what does the LLM emit to drive it? JSON? Components-as-code? SVG?
5. **Output format** — HTML? MP4? Both?

## Candidate backends

### 1. HyperFrames (current Wittgenstein lead)

**Citation.** `heygen-com/hyperframes` (GitHub). Engine doc at `hyperframes.heygen.com/packages/engine` per `docs/codecs/video.md`.

| Field | Value |
|---|---|
| License | `unknown` — verify-locally at the LICENSE file |
| Local-only | Yes — open-source CLI renders locally with FFmpeg + headless Chrome |
| Determinism | `inferred-mostly` — fonts / browser version / FFmpeg version drift can affect bytes; structural determinism is more reliable than byte-determinism |
| Composition | JSON timeline + inline-SVG slides (per current `codec-video` doc) |
| Output | HTML (default) + MP4 (opt-in via `WITTGENSTEIN_HYPERFRAMES_RENDER=1`) |

**Notes.** Already integrated as the codec's render seam. Real concrete artifact path; no theoretical risk. Determinism risks (fonts, codec versions) are real but bounded — same shape as image's "byte-pinnable when weights pinned" caveat.

**Verify gate before any further investment:** check the `LICENSE` file at the hyperframes repo. If it's Apache/MIT, status stays `now`; if it's research-only or non-commercial, the lead-path verdict needs reconsideration.

### 2. Remotion

**Citation.** `remotion-dev/remotion` (GitHub). Apache-2.0 license per repo (verify-locally).

| Field | Value |
|---|---|
| License | Apache-2.0 (per repo header — verify-locally) |
| Local-only | Yes — `npx remotion render` runs locally |
| Determinism | `inferred-mostly` — same dependencies as HyperFrames (browser + FFmpeg) |
| Composition | **React components as code** — videos are TypeScript / JSX functions |
| Output | MP4 / WebM / GIF / image sequence |

**Notes.** Most mature open-source "video as code" framework. Strong type safety (TypeScript native). The composition language is *programming* — `Composition` components, `<Sequence>` with `from` / `durationInFrames`, `interpolate()` etc.

**For Wittgenstein:** the LLM would have to emit *JSX/TSX source code* rather than JSON. This is a hard turn from the rest of the codecs (which all use structured JSON). Two options:
- **Option A:** add a Remotion-style composition JSON that compiles to Remotion components at render time. Loses some Remotion flexibility but stays JSON-shaped.
- **Option B:** let the LLM emit Remotion code directly. Aligns with Remotion's design but breaks the "structured JSON, schema-validated" boundary.

Option A is more aligned with Wittgenstein discipline. **Implementation cost:** medium-large — need a JSON-to-Remotion-component compiler.

### 3. Motion Canvas

**Citation.** `motion-canvas/motion-canvas` (GitHub). MIT license per repo (verify-locally).

| Field | Value |
|---|---|
| License | MIT (per repo — verify-locally) |
| Local-only | Yes — Vite-based local editor + render |
| Determinism | `inferred-mostly` |
| Composition | TypeScript-as-code (similar to Remotion); generators/coroutines for animation |
| Output | MP4 (via FFmpeg) / GIF / image sequence |

**Notes.** Newer than Remotion; designed for technical/educational animations (3Blue1Brown-style). Generators-as-animations is conceptually elegant but harder to LLM-emit than declarative timelines.

**For Wittgenstein:** similar tradeoffs as Remotion — TypeScript-as-code does not match the JSON discipline. Same Option A vs Option B applies. Implementation cost slightly higher than Remotion because the generator pattern is less serializable.

### 4. Manim (community)

**Citation.** `ManimCommunity/manim` (GitHub) — community fork of `3b1b/manim`. MIT license per repo (verify-locally).

| Field | Value |
|---|---|
| License | MIT (per repo — verify-locally) |
| Local-only | Yes — Python + LaTeX |
| Determinism | `inferred-mostly` (LaTeX renders affect text) |
| Composition | Python class methods (subclass `Scene`, define `construct()`) |
| Output | MP4 |

**Notes.** Strongest fit for math/science visualization. Python rather than JS/TS — different runtime than the rest of Wittgenstein. Heavy LaTeX dependency.

**For Wittgenstein:** wrong runtime (Python only); LaTeX dependency is a major install cost; output style is too narrow (math-focused). **Verdict:** `not at all`.

### 5. Lottie

**Citation.** `airbnb/lottie-web` (GitHub). MIT license per repo (verify-locally). Spec also at `lottiefiles.com`.

| Field | Value |
|---|---|
| License | MIT |
| Local-only | Yes (player); authoring usually requires After Effects (commercial) |
| Determinism | High — Lottie is a JSON animation spec |
| Composition | **JSON spec** (the JSON is the animation; players interpret it) |
| Output | Played in browser / native; conversion to MP4 via ffmpeg+headless |

**Notes.** Lottie's JSON spec is mature; **most aligned with Wittgenstein's "LLM emits JSON" discipline of any candidate**. The catch: the JSON is *very specific* (After Effects export format) — it's not generally LLM-emittable from scratch without a strong prior.

**For Wittgenstein:** interesting as a *target format* for inline-SVG → Lottie compilation, not as a primary LLM-emit shape. **Verdict:** `later` — could become relevant if a "compose SVG slides into Lottie animation" pipeline earns its keep.

### 6. GSAP (GreenSock)

**Citation.** `greensock/gsap` (GitHub). License: split — free for non-display content, commercial for products that monetize per `gsap.com/licensing`.

| Field | Value |
|---|---|
| License | **`unclear` for our use case** — needs explicit verification of "harness library" classification under their license tiers |
| Local-only | Yes — JS animation library |
| Determinism | High |
| Composition | JS-as-code primarily; some CSS-as-target |
| Output | DOM / SVG animation (no native MP4) |

**Notes.** Best-in-class JS animation library, but the license tiers complicate a freely-redistributable harness. **Verdict:** `not at all` until license clarity for our use case.

### 7. FFmpeg + headless Chrome (low-level)

**Citation.** `ffmpeg.org`. License: LGPL/GPL depending on build options. Headless Chrome via Puppeteer (Apache-2.0) or Playwright (Apache-2.0).

| Field | Value |
|---|---|
| License | LGPL/GPL (FFmpeg) + Apache-2.0 (Puppeteer/Playwright) — verify-locally |
| Local-only | Yes |
| Determinism | Same risks as HyperFrames (uses these tools internally) |
| Composition | None directly — this is the rendering substrate, not an authoring layer |
| Output | MP4 |

**Notes.** This is what HyperFrames runs on internally. Building Wittgenstein-direct on FFmpeg + headless Chrome would skip HyperFrames as an abstraction. Tradeoff: more control, more code to write, more determinism caveats to surface explicitly.

**For Wittgenstein:** could be a fallback if HyperFrames license fails. Not a primary candidate; the abstraction layer matters.

## Comparison table

| Backend | License | Composition shape | Output | Implementation cost | Verdict |
|---|---|---|---|---|---|
| **HyperFrames** | unknown (verify) | JSON + inline SVG | HTML default; MP4 opt-in | small (already integrated) | **`now`** if license clears |
| **Remotion** | Apache-2.0 (verify) | React components | MP4 | medium-large | `later` candidate if HyperFrames license fails |
| **Motion Canvas** | MIT (verify) | TS generators | MP4 | medium-large | `later` |
| **Manim** | MIT (verify) | Python classes | MP4 | wrong runtime | `not at all` |
| **Lottie** | MIT | JSON spec (AE-flavored) | DOM/MP4 | large | `later` — secondary target |
| **GSAP** | unclear for our use | JS code | DOM/SVG | large | `not at all` until license clarity |
| **FFmpeg + headless Chrome** | LGPL/GPL + Apache-2.0 | none (substrate) | MP4 | medium | `later` — fallback if abstraction layer fails |

## Recommendation

**HyperFrames stays the lead path conditional on a single license verification step.** The JSON-composition shape aligns with Wittgenstein's discipline, the local-only render is honest, and the codec already has a working seam. Open `LICENSE` at `heygen-com/hyperframes` and confirm Apache-2.0 / MIT before M4 starts. If license clears, HyperFrames is M4. If license fails, **Remotion is the runner-up** (Apache-2.0, JSON-emit-able with a small adapter, mature).

Before M4 implementation starts, the verification list is:

1. **License audit** at the HyperFrames repo (binding).
2. **Determinism floor** — write a small script that renders the same `inlineSvgs` composition twice and compares MP4 SHA-256. If it varies, document the determinism class as `structural-only` (analogous to Kokoro speech).
3. **Doctor coverage** — `wittgenstein doctor` should detect missing FFmpeg / Chrome / hyperframes CLI and surface a structured error, not crash.
4. **Manifest receipts** — `audioRender`-equivalent for video. Record `renderer: "hyperframes" | "fallback-html"`, `frameCount`, `frameRate`, `dimensions`, `durationSec`, FFmpeg version (if available).

Once those four are in place, the M4 implementation slice becomes straightforward.

## What this note does NOT do

- Does NOT pick a backend definitively. Names a recommendation conditional on the license check.
- Does NOT modify `docs/codecs/video.md`. That doc is consistent with this note's recommendation; it'll need updating after M4 implementation lands, not now.
- Does NOT promote any text-to-video model dependency. Generative video stays out-of-scope per ADR-0005.
- Does NOT close #92 — it'll close on the M4 implementation slice that flows from this note.
- Does NOT propose a benchmark. FVD / Video-Bench / FVMD are downstream of M5b per `docs/exec-plans/active/codec-v2-port.md`.

## Cross-references

- `docs/codecs/video.md` — current video doc; this note is its design-forward research.
- ADR-0005 — decoder ≠ generator.
- `docs/exec-plans/active/codec-v2-port.md` — M4 video gate (currently open).
- `docs/research/2026-05-08-vsc-as-compression-prior.md` ([#271](https://github.com/p-to-q/wittgenstein/pull/271)) — useful contrast for "video stays composition-shaped, not VQ-token-shaped."
- #264 (commission)
- #92 (predecessor; this note supersedes once ratified)
- #255 (umbrella)
- #265 (video implementation gates — downstream of this note)

## Suggested follow-up issues (deferred until ratified)

1. **HyperFrames license verification** (small, open after this note ratifies). One-line: read the LICENSE file, write a one-paragraph closeout.
2. **Video determinism floor measurement** (small). Render twice, compare SHA, record the determinism class.
3. **Video doctor coverage** (small). Extend `wittgenstein doctor` for FFmpeg / Chrome / hyperframes-CLI detection.
4. **Video manifest receipts** (medium). Extend `RunManifest` schema with a `videoRender` block analogous to `audioRender`.
5. **M4 implementation issue** (large). The actual port; depends on items 1-4.

These are deferred. None should land before the license verification (item 1) completes.
