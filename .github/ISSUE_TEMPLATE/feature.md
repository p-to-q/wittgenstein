---
name: Feature request
about: Suggest a new codec, modality, provider, or harness capability
title: "[feat] "
labels: enhancement
assignees: ""
---

## The gap

<!-- What can't you do today that you wish you could? -->

## Proposal

<!-- What would the smallest, cleanest version of this look like? -->

## Where it fits

<!-- Which of the five layers does this live in? See docs/architecture.md. -->

- [ ] L1 Harness / Runtime
- [ ] L2 IR / Codec schema
- [ ] L3 Renderer / Decoder
- [ ] L4 Adapter (trained component)
- [ ] L5 Distribution / CLI / skill

## Hard-constraint check

<!-- See docs/hard-constraints.md. Confirm this doesn't violate a locked decision. -->

- [ ] Does not introduce diffusion generators into the core image path
- [ ] Does not require fine-tuning a frontier LLM
- [ ] Does not hide failures via silent fallback
- [ ] Produces a real file (not a mock or placeholder)

## Willing to contribute?

- [ ] I'd open a PR with guidance
- [ ] I can describe the spec but not implement
- [ ] I'm hoping someone else picks this up
