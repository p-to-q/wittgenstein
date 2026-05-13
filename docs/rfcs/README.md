# RFCs

Request-for-Comments documents for Wittgenstein. An RFC proposes a concrete design change — interface, protocol, ergonomic surface, naming — with enough detail that a reader could implement it without another meeting.

RFCs complement ADRs and research briefs:

- **Brief** (`docs/research/briefs/`) — pressure-tests a claim or lineage. Output: a verdict.
- **RFC** (`docs/rfcs/`) — proposes a specific design that ratifies or extends a brief's verdict. Output: an interface and a migration path.
- **ADR** (`docs/adrs/`) — records that an RFC has been accepted and the decision is now load-bearing. Output: a one-line "we did this."

A brief feeds one or more RFCs. An RFC, once accepted, is ratified by an ADR. Code changes land in a separate execution plan after the ADR.

## Current RFCs

| ID   | Title                                                      | Status        | Ratifying ADR   |
| ---- | ---------------------------------------------------------- | ------------- | --------------- |
| 0001 | [Codec Protocol v2](0001-codec-protocol-v2.md)             | 🟢 Accepted   | ADR-0008        |
| 0002 | [CLI ergonomics](0002-cli-ergonomics.md)                   | 🟢 Accepted   | ADR-0009        |
| 0003 | [Naming pass](0003-naming-pass.md)                         | ⚫ Superseded | — (by RFC-0005) |
| 0004 | [Site reconciliation actions](0004-site-reconciliation.md) | 🟢 Accepted   | — (site-ops)    |
| 0005 | [Naming lock v2](0005-naming-lock-v2.md)                   | 🟢 Accepted   | ADR-0011        |
| 0006 | [Visual Seed Code Image Route](0006-hybrid-image-code.md)  | 🟢 Accepted   | ADR-0018        |
| 0007 | [Image seed-code shape discriminator (1D \| 2D)](0007-image-seedcode-shape-discriminator.md) | 🟡 Draft — pre-emptive | — (pending; activates on first 1D candidate clearance) |

## Status legend

- 🟢 Accepted — an ADR ratifies it; code may begin.
- 🟡 Draft — open for review; iterating.
- 🔴 Not started — placeholder only.
- ⚫ Superseded — newer RFC replaces it.

## RFC shape

Every RFC ships the following grep-able headings:

```
## Context
## Proposal
## Interface
## Migration
## Red team
## Kill criteria
## Decision record
```

An RFC may include a "Round-trip test" section proving the interface handles every current case in ≤N lines. RFC-0001 requires one.

## Review process

1. **Researcher hat** — does the RFC's evidence base survive contact with the briefs it cites?
2. **Hacker hat** — if an agent read this RFC at 2 a.m., could it write the right migration PR?

Both hats sign off in the PR. On acceptance, a paired ADR lands alongside, and the RFC status flips to 🟢.

## Template

See [00_template.md](00_template.md).
