# Agent Guides

This folder holds short, phase-specific guides that can be handed directly to coding agents and contributors.

Use an agent guide when:

- the doctrine is already decided,
- the remaining work is implementation sequencing,
- a contributor needs a reliable starting prompt and guardrails.

Each guide is:

- narrowly scoped to one phase or one migration,
- explicit about invariants,
- explicit about out-of-scope work,
- readable without prior chat context.

## Current guides

| Guide                                              | Phase | Owner-line                 | Reads                                                                  |
| -------------------------------------------------- | ----- | -------------------------- | ---------------------------------------------------------------------- |
| [`image-to-audio-port.md`](image-to-audio-port.md) | M0–M2 | shared context             | doctrine + image+audio cross-line context (read first if new to repo)  |
| [`image-port.md`](image-port.md)                   | M1A   | image contributor / agent  | image codec port, Brief H practices, F1 + F2 amendments, golden parity |
| [`audio-port.md`](audio-port.md)                   | M2    | audio contributor / agent  | audio codec port, route collapse, soft-deprecation of `--route`        |
| [`sensor-port.md`](sensor-port.md)                 | M3    | sensor contributor / agent | sensor codec port, byte-for-byte parity, no-L4 confirmation case       |

## How to pick one

- **You are new to the repo:** start with `image-to-audio-port.md` for cross-line context, then move to your line's specific guide.
- **You own the audio line:** `audio-port.md` is your execution brief; image-to-audio is supporting context.
- **You own the sensor line:** `sensor-port.md` is your execution brief; read `audio-port.md` for the immediately-prior port pattern.
- **You own the image line (M1A):** `image-port.md` is your execution brief; `image-to-audio-port.md` is supporting cross-line context; `docs/research/briefs/H_codec_engineering_prior_art.md` is your implementation checklist; `docs/research/briefs/G_image_network_clues.md` is decoder rationale.

## How to add a new guide

A new agent guide ships only when:

- a new phase opens that needs its own execution brief, **or**
- a new contributor line spins up that cannot be served by an existing guide.

Do not add guides for doctrine changes — those belong in briefs / RFCs / ADRs. Do not add guides for one-off bug fixes — those belong in PR descriptions.

If you are tempted to add a guide that overlaps with an existing one, tighten the existing one first.
