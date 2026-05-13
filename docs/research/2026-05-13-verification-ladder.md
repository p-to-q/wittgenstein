---
date: 2026-05-13
status: research note
labels: [research-derived, engineering, verification, governance]
tracks: [#310, #304, #306, #309]
---

# Verification ladder beyond green CI

> **Status:** research note delivering [#310](https://github.com/p-to-q/wittgenstein/issues/310). Surveys the verification layers Wittgenstein already has, compares to mature-engineering practice, and proposes a tiered add-now / add-later / not-worth-it split with two concrete follow-up issues at the end.
> _Tracker: [#310](https://github.com/p-to-q/wittgenstein/issues/310); related: [#304](https://github.com/p-to-q/wittgenstein/issues/304) (P0 program), [#306](https://github.com/p-to-q/wittgenstein/issues/306) (reusable-module radar), [#309](https://github.com/p-to-q/wittgenstein/issues/309) (architecture benchmark)._

## Why this note exists

"CI is green" is a necessary but not sufficient gate for a research-engineering system that promises **traceable, reproducible artifacts**. Wittgenstein's manifest spine doctrine (`docs/hard-constraints.md` — "every run writes a manifest with git SHA, lockfile hash, seed, full LLM I/O, artifact SHA-256") makes claims that go beyond what unit tests can pressure-test. If a frozen-decoder bridge emits different bytes on Tuesday than Monday for the same input, the manifest spine is dishonest — and unit tests won't catch it.

This note is the audit before the ladder gets built. It scopes what mature engineering practice looks like in adjacent domains, asks what's relevant to Wittgenstein's actual risk profile, and recommends a small set of cheap-now additions plus two bounded follow-ups.

## Current verification surface

What the repo verifies today, in execution order:

| Layer                           | What it checks                                                               | Where it lives                                                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Syntax / typing**             | `tsc -b` per-package strict typecheck                                        | `pnpm typecheck`, CI `Verify (Node + Python)`                                                                                                    |
| **Style / hygiene**             | ESLint per package; Prettier; reviewdog comments inline                      | `pnpm lint`, `.github/workflows/reviewdog.yml`, CodeRabbit                                                                                       |
| **Unit + integration tests**    | Vitest per package; deterministic test bodies                                | `pnpm test`, ~178 tests across 8 packages as of 2026-05-13                                                                                       |
| **Codec goldens**               | Byte-for-byte or structural parity for deterministic-output codecs           | `pnpm test:golden` (codec-audio, codec-sensor; codec-image/video/asciipng/svg added via [#372](https://github.com/p-to-q/wittgenstein/pull/372)) |
| **Build**                       | Per-package `tsc` + apps/site Vite build                                     | `pnpm build`                                                                                                                                     |
| **CLI smoke**                   | `wittgenstein doctor` runs from a freshly built CLI bin                      | `packages/cli` `pnpm smoke`                                                                                                                      |
| **Cold-checkout receipt**       | A fresh git clone + install + test verifies the repo bootstraps from zero    | `docs/research/2026-05-04-cold-checkout-verification.md`, periodic                                                                               |
| **Static security**             | CodeQL on TS sources                                                         | `.github/workflows/codeql.yml`                                                                                                                   |
| **Doctrine guardrail**          | Soft check: PRs touching doctrine files reference an ADR or RFC              | `.github/workflows/doctrine-guardrail.yml` (ADR-0014 lane)                                                                                       |
| **Doc-link integrity**          | All Markdown links resolve                                                   | `.github/workflows/link-check.yml`                                                                                                               |
| **Manifest schema enforcement** | `RunManifestSchema.superRefine` rejects silent invariant violations on write | `packages/schemas/src/manifest.ts`                                                                                                               |

The surface is **good for an early-stage repo**. It already exceeds what most v0.x research projects ship. The gaps below are not "the repo is weak"; they are "what would let us add capability without losing trust."

## What mature engineering practice adds beyond this

Below is a survey of verification layers used by reproducibility-focused engineering organizations (Google internal eng, reproducible-builds.org, OSS-Fuzz, Bazel-style hermetic systems, scientific-software projects like Nipype / DataLad). Wittgenstein doesn't need to mimic any of them literally — they're reference points for the _kinds_ of checks mature systems lean on.

1. **Hermetic / reproducible build verification** — same source + same toolchain produces the same outputs regardless of when, where, by whom. Bazel's hermetic execution, reproducible-builds.org's diffoscope pipeline, NixOS's bit-reproducible derivations. Wittgenstein already promises this at the manifest level (lockfile hash, seed, decoder hash) but does not yet _test_ it end-to-end on a clean machine.

2. **Presubmit vs postsubmit separation** — fast checks gate the PR merge button; slower checks run after merge and gate the release tag (or open issues when they drift). Wittgenstein's CI currently runs every check on every PR, which is fine while the test suite is fast (~30s total) but won't scale.

3. **Smoke / doctor / cold-checkout verification** — beyond "tests pass," does the artifact a user gets actually work? `wittgenstein doctor` is the current smoke gate. The cold-checkout receipt is the current postsubmit-style verification but it's manual.

4. **Fuzzing / negative-input testing** — random-mutation input testing against parsers and schemas. OSS-Fuzz / ClusterFuzzLite, Atheris (Python), jsfuzz (JS). Wittgenstein's schemas (zod) are the natural target — the codec-image scene parser, the audio plan parser, the manifest schema. Fuzzing finds invariant violations that hand-written tests miss.

5. **Flaky-test detection + quarantine** — track per-test failure rate over time; quarantine tests that fail intermittently; gate fixes on root-cause not patch-over. Wittgenstein hasn't seen flaky tests yet (the test surface is deterministic by construction), but this becomes load-bearing once integration tests that talk to external services land (Kokoro, LlamaGen bridge, etc.).

6. **Dependency / supply-chain verification** — lockfile hash verification (we do this), SBOM generation, vulnerability scanning against advisory databases, license auditing of transitive deps, signed releases. `pnpm audit` exists but isn't gated; CodeQL covers some SAST.

7. **Fixture / golden drift protection** — automated alerts when a golden test's expected output changes (even if the new value still passes a structural check). Wittgenstein has goldens in place; what's missing is a `golden-update` policy doc + reviewer attention discipline.

8. **Artifact / manifest replay verification** — given a manifest from a past run, can we replay it bit-exactly today? This is the _strongest_ test of the reproducibility claim. Wittgenstein's manifests carry enough fields to attempt this (`gitSha`, `lockfileHash`, `seed`, `llmOutputRaw`, `nodeVersion`), but no `wittgenstein replay <manifest-path>` command exists today.

9. **Mutation testing** — flip a line of source code; do the tests still pass? If yes, the test surface didn't actually cover that line. Stryker (TS), mutmut (Python). Useful for assessing test-suite _quality_, not just _coverage_.

10. **Differential testing** — same input, two implementations (Python `polyglot-mini` vs TypeScript `@wittgenstein/*`), assert byte-identical output where the spec says they should match. The polyglot architecture _enables_ this; nothing currently runs the comparison.

## Recommendation: ladder for Wittgenstein

Three tiers, sized to repo-appropriate effort.

### Tier 1 — add now (lightweight)

These are generally small CI-friendly slices, usually estimated under ~2 hours each once scope is fixed, and they close real gaps in current claims.

**1.1 Replay-from-manifest smoke check (small).** Add a `wittgenstein replay <manifest-path>` CLI command that:

- Reads a saved manifest from `artifacts/runs/<id>/manifest.json`.
- Re-runs the codec with the manifest's recorded `seed`, `args`, `llmOutputRaw` (replay the LLM I/O, don't re-call), `request`.
- Asserts `artifactSha256` of the new run matches the manifest's recorded `artifactSha256`.

This is the **honest test of the reproducibility claim.** It uses the manifest spine as a verification surface, not just an audit log. Filed as Tier-1 follow-up issue #384 below.

**1.2 Negative-input schema-boundary tests.** For each schema package's parsers (`parseAudioPlan`, `parseImageSceneSpec`, `RunManifestSchema`), add ~5 tests per parser that feed deliberately malformed input (extra fields, missing required fields, wrong types, contradictory invariants) and assert structured error codes. Today the schemas reject malformed input _correctly_ but we don't have a regression baseline that proves they always will. Adding ~30 tests across the schema layer is a one-evening slice.

**1.3 `wittgenstein doctor` covers more environment.** Today `doctor` reports tool versions. Extend it to check: HyperFrames availability (`npx hyperframes --version` if `WITTGENSTEIN_HYPERFRAMES_RENDER=1`), Kokoro decoder model present (if `WITTGENSTEIN_AUDIO_BACKEND=kokoro`), config file validity, write-access to `artifacts/`. Each check is 5-15 lines.

**1.4 Post-merge drift audit checklist.** A `docs/release/post-merge-checklist.md` that a maintainer runs after each significant doctrine-bearing merge: re-read the touched ADRs, verify the inline summary in `docs/hard-constraints.md` still matches, grep for outdated cross-references. Audit hygiene rather than automation; mature systems eventually automate this with periodic scripts.

### Tier 2 — add later (heavier, after v0.4)

These are valuable but warrant a dedicated planning slice once the repo grows past v0.4.

**2.1 Fuzz the schemas.** Wire jsfuzz or vitest-fuzz at the `@wittgenstein/schemas` parsers. Run for ~5 min per PR; report any new crashes. Most useful AFTER M1B lands real decoder weights because the latents schema is currently a stub.

**2.2 Presubmit vs postsubmit split.** Today: every check runs on every PR. Once test suite passes ~2 min, split into:

- Presubmit: typecheck, lint, unit tests, build (target <90s)
- Postsubmit: golden parity, cold-checkout, link-check, longer integration (no merge gate; opens issues on drift)

**2.3 Differential test polyglot-mini vs TypeScript.** Pick a deterministic shape (sensor IR, asciipng), run the same input through both implementations, compare bytes. This pressure-tests the _cross-surface_ claim that Python and TypeScript implement the same contract.

**2.4 Mutation testing on the codec core.** Stryker on `packages/core/src/runtime/`. Useful AFTER M1B lands so the metric isn't dominated by stub-decoder paths.

### Tier 3 — not worth it (for this repo, at this stage)

**3.1 SBOM + supply-chain attestation.** Real cost (CI minutes + maintainer attention) without matching real risk at v0.3 prerelease scale. Revisit if Wittgenstein ever has paying users or production deployers.

**3.2 Hermetic Bazel-style build.** TypeScript + pnpm workspaces is already 90% hermetic via the lockfile-hash claim; full Bazel migration is a huge ergonomic regression for a marginal trust gain. Don't.

**3.3 Cross-platform byte-parity gates.** Already addressed: the M2 audio sweep documented why cross-platform structural-parity is the right contract; #374 just opened the same question for codec-image. Don't add a CI check that fails on a known-acceptable platform divergence.

**3.4 100% mutation score.** A vanity metric. Aim for "every load-bearing invariant has a test that names it," not "every line has 17 redundant tests."

## Doctrine alignment

This note proposes lightweight checks per the issue's constraint: "Do not propose ceremony for its own sake. Prefer checks that strengthen reproducibility, manifest honesty, and contributor clarity." Tier 1.1 (replay-from-manifest) is the highest-leverage addition — it converts the manifest spine from an audit log into a verification surface.

Any process-doctrine changes (e.g. mandating Tier-1 checks for all PRs) would route through ADR-0014's governance lane. This note proposes the _content_, not the _process gate._

## Concrete follow-ups (per issue's "1-2 bounded follow-up issues")

Filed alongside the merge of this note:

- **Follow-up A (Tier 1.1):** Implement `wittgenstein replay <manifest-path>` smoke check. ~1 day. Tracks the CLI command + first end-to-end replay test for the sensor route. Filed as [#384](https://github.com/p-to-q/wittgenstein/issues/384).

- **Follow-up B (Tier 1.2):** Negative-input schema-boundary test slate. ~½ day. Adds ~30 tests across the three schema parsers asserting malformed input produces structured error codes. Filed as [#383](https://github.com/p-to-q/wittgenstein/issues/383).

The two-or-more Tier-2 items become candidates for v0.4 planning.

## Refs

- Triggering issue: [#310](https://github.com/p-to-q/wittgenstein/issues/310)
- Manifest doctrine: [`docs/hard-constraints.md`](../hard-constraints.md), [`docs/reproducibility.md`](../reproducibility.md)
- Existing cold-checkout work: [`2026-05-04-cold-checkout-verification.md`](2026-05-04-cold-checkout-verification.md)
- Adjacent program umbrellas: [#304](https://github.com/p-to-q/wittgenstein/issues/304) (P0), [#306](https://github.com/p-to-q/wittgenstein/issues/306) (reusable-module radar), [#309](https://github.com/p-to-q/wittgenstein/issues/309) (architecture benchmark)
- Cross-platform divergence case: [#374](https://github.com/p-to-q/wittgenstein/issues/374) (codec-image PNG bytes diverge across platforms — concrete reason cross-platform byte-parity is NOT a fair gate)
- Governance lane for any process-doctrine changes: [ADR-0014](../adrs/0014-governance-lane-for-meta-process-doctrine.md)
