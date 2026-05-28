# M4 video renderer acceptance criteria

Status: draft checklist  
Last reviewed: 2026-05-28

## Purpose

Accept the structured video renderer without confusing it with neural text-to-video generation.

Current safe doctrine:

> LLM → structured video composition → HyperFrames-shaped local HTML render → optional repo-owned MP4 encode → artifact + `videoRender` receipt.

## Safe claim

Video HTML output ships, and MP4 is an opt-in local renderer path requiring Chrome/Chromium and FFmpeg.

## Unsafe claim

Wittgenstein ships a neural text-to-video model.

## Gates

### Gate 0 — composition schema

- `VideoComposition` validates;
- LLM cannot emit arbitrary renderer code;
- unsupported fields fail;
- HTML remains default unless MP4 is enabled.

### Gate 1 — HTML renderer

- self-contained HTML;
- deterministic structure;
- no external CDN;
- manifest records output kind.

### Gate 2 — MP4 opt-in

- MP4 path is opt-in;
- Chrome/Chromium and FFmpeg required only for MP4;
- missing deps produce structured errors;
- HTML path works without MP4 deps.

### Gate 3 — backend selection

- default MP4 backend is repo-owned/internal;
- upstream CLI backend is explicit experiment/parity mode;
- backend and versions recorded.

### Gate 4 — `videoRender` receipt

Record:

- backend;
- backend version;
- output kind;
- fps;
- quality;
- dimensions;
- frame count;
- duration;
- tool versions;
- determinism class;
- artifact sha256.

### Gate 5 — determinism

- same composition gives same HTML structure;
- MP4 double-render validation exists for pinned environment;
- if bytes differ, structural diff is recorded;
- determinism class is honest.

### Gate 6 — failure behavior

Structured failures:

- schema invalid;
- backend unavailable;
- Chrome unavailable;
- FFmpeg unavailable;
- render timeout;
- missing receipt.

No hidden MP4-to-HTML fallback unless manifest says so.

## Downstream metrics

Heavy neural-video metrics such as FVD-like or Video-Bench-style scores are downstream. They should not block structured-render acceptance, but they are required before any neural-video-quality claim.

## Source anchors

This draft pack was written from a GitHub-only static review on 2026-05-28. Recheck referenced issues/PRs before merge.

- Repository / README: https://github.com/p-to-q/wittgenstein
- README.md: https://github.com/p-to-q/wittgenstein/blob/main/README.md
- CHANGELOG.md: https://github.com/p-to-q/wittgenstein/blob/main/CHANGELOG.md
- docs/implementation-status.md: https://github.com/p-to-q/wittgenstein/blob/main/docs/implementation-status.md
- docs/exec-plans/active/codec-v2-port.md: https://github.com/p-to-q/wittgenstein/blob/main/docs/exec-plans/active/codec-v2-port.md
- Issue #507: https://github.com/p-to-q/wittgenstein/issues/507
- Issue #402: https://github.com/p-to-q/wittgenstein/issues/402
- PR #457: https://github.com/p-to-q/wittgenstein/pull/457
- PR #491: https://github.com/p-to-q/wittgenstein/pull/491
- PR #492: https://github.com/p-to-q/wittgenstein/pull/492
- PR #493: https://github.com/p-to-q/wittgenstein/pull/493
- PR #455: https://github.com/p-to-q/wittgenstein/pull/455
