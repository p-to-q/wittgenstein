# Image route evolution

Status: draft history / claim-control document  
Last reviewed: 2026-05-28

## Purpose

This document explains how the image route evolved and why the current direction should be described as:

> text-first LLM → Visual Seed Code → adapter / seed expander → frozen VQ decoder → PNG + manifest receipt

It prevents three common errors:

1. treating the early procedural PNG path as the final image thesis;
2. treating Semantic IR as the primary decoder-facing object;
3. treating M1B candidate audits as completed M1B delivery.

## Phase 0 — artifact proof

The early image route proved that the harness could emit real PNG files. That was valuable because the project is about artifact generation, not just model text. But this was not proof of a neural image path.

Safe wording:

> Early image output proved artifact emission.

Unsafe wording:

> The project already had a finished image generator.

## Phase 1 — semantic / scene structure

Semantic or scene-style representations made the image plan inspectable: objects, relations, style, and composition. That remains useful because pure seed codes can be opaque.

Correct role of Semantic IR:

- concept activation;
- user inspection;
- optional conditioning;
- diagnosis and failure explanation.

Incorrect role:

- final image research object;
- substitute for decoder-facing visual code;
- evidence that a frozen VQ decoder can already run.

## Phase 2 — Visual Seed Code becomes primary

The doctrine now treats Visual Seed Code as the primary decoder-facing object. VSC is the structured visual code that the LLM emits or conditions, and the adapter/decoder path consumes.

Why this matters:

- the LLM has a concrete contract;
- image capability remains outside the base model;
- multiple decoder families can fit behind the same seam;
- manifests can record the actual code/decoder/weights path.

## Phase 3 — candidate audit before delivery

The current LlamaGen/VQGAN-class discussion is a candidate audit and bridge-provenance line. That evidence can make a decoder candidate credible, but it does not by itself ship a user-facing M1B path.

Candidate audit can prove:

- provenance;
- license shape;
- weight hashability;
- determinism/ONNX feasibility under stated conditions.

Candidate audit cannot prove:

- lazy weight delivery works;
- end-user install works;
- VSC emission is stable;
- adapter quality is sufficient;
- end-to-end artifact receipts exist.

## Phase 4 — M1B acceptance

M1B should be described as complete only when:

- bridge manifest exists and validates;
- weights/codebook/runtime are hash-pinned and delivered through tier-aware fetch/cache;
- license refusal, runtime unavailable, fetch failure, and hash mismatch are structured errors;
- real decoder tier never silently falls back to procedural PNG;
- VSC emission validation passes;
- tokenizer/adapter evidence exists;
- end-to-end artifact manifests include VSC, bridge identity, hashes, determinism class, and artifact sha256.

## Summary

The correct historical story is neither "just a procedural demo" nor "image is solved." It is:

> Wittgenstein moved from artifact proof to structured semantic support, then to Visual Seed Code doctrine, and now to M1B audit/delivery gates. The final image-depth claim remains pending until the bridge, weights, VSC, adapter/tokenizer, and E2E receipts clear.

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
