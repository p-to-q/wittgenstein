---
date: 2026-10-16
status: investigation landed 2026-10-16 — literal claim not reproducible; diagnostics stream split fixed with it
labels: [research-derived, cli, output-contract, hygiene]
tracks: [#267, #403]
---

# CLI stray-`undefined` investigation — bounding the claim + moving run diagnostics to stderr

## Why this note

- The M1B delivery closeout review carries an unowned cosmetic claim: "the
  known cosmetic defect (stray `undefined` printed on some CLI error paths)
  is pre-existing and not part of this lane's contract"
  ([`2026-10-16-m1b-delivery-closeout-review.md`](./2026-10-16-m1b-delivery-closeout-review.md),
  §#403). No repro path exists anywhere in the repo, and the defect belonged
  to no lane — but it is local, user-facing, and cheap to bound. So it was
  bounded, and the one actionable defect found in the same family was fixed.

## Method

- Read every CLI print site (`packages/cli/src/**`) and every `logger.*` call
  site in every package, plus the harness logger implementation
  (`packages/core/src/runtime/harness.ts`).
- Live probe matrix (~50 distinct invocations). This pass re-ran the earlier
  `img-dry` / `inst-dry` / `inst-fetch` probes, which had silently failed
  with `ERR_MODULE_NOT_FOUND: 'tsx'` because they ran outside the repo — the
  dev bin resolves `tsx` file-relatively, so probes must run from inside the
  clone. Coverage:
  - parse/help: `--version`, `--help` for all 12 commands, noargs, unknown
    command, unknown option, malformed `--seed` / positive-number options;
  - success paths: `image --dry-run` (plain and `--show-*`), `tts` / `audio`
    / `video` / `sensor` / `svg` dry-runs, `svg --source local`,
    `asciipng --source local`, `asciipng --source minimax --dry-run`,
    `animate-html`, `doctor` (incl. `WITTGENSTEIN_HYPERFRAMES_RENDER=1`),
    `replay` of a fresh dry-run manifest (REPLAY_OK byte-parity);
  - error paths: missing API key (`image` / `video` / `audio` / `sensor`),
    `--decoder bogus`, `--decoder llamagen` (WEIGHTS_NOT_INSTALLED),
    `install image` / `--gpu` / `--dry-run` / `--weights-base-url`,
    `install foo`, `replay` missing / tampered / request-stripped manifests,
    `--config` pointing at a missing file, `--out` pointing at a directory;
  - the published npm artifact (`wittgenstein-cli@0.1.0` bundled dist):
    help / version / doctor / `image` no-key / `asciipng --source local`.
- `grep` for the literal `undefined` over every captured stdout/stderr:
  zero hits.

## Findings

- **F1 (fact) — the literal claim is not reproducible, and no print site at
  HEAD can emit it for an undefined value.** Every CLI print site emits
  through `JSON.stringify`, which drops undefined-valued properties instead
  of printing `undefined` (envelope sites in `commands/shared.ts`,
  `install.ts`, `decoder-bridge.ts`, `replay.ts`, `doctor.ts`; fixed strings
  in `init.ts` / `animate-html.ts`). The run logger passed `data ?? ""`, so a
  missing payload printed an empty string, never `undefined`; every
  `logger.*(message, data)` call site in the codecs passes a fully-defined
  data object (audited across `codec-image`, `codec-audio`, `codec-video`).
  The #403-lane files (`install.ts`, `doctor.ts`, `install-image-tier.ts`,
  `install-receipt.ts`, `tiers.ts`, `decoder-bridge.ts`) are byte-identical
  to the state the review assessed (`git diff c2ca18e..HEAD` — empty), so the
  claim cannot be pinned on a later change either. Origin cannot be recovered
  from any repo record.
- **F2 (fact) — the real output-hygiene defect in this family: run
  diagnostics rode stdout.** `console.info` / `console.debug` write to
  stdout, so `wittgenstein image … --dry-run` (and `replay` of an image run)
  printed `[wittgenstein:<runId>] …` progress lines *ahead of* the JSON
  envelope on stdout; the cli test suite worked around it with a
  `stdoutBody()` "parse from the first `{`" helper. This contradicts the
  adopted CLI output contract — ADR-0009 ("logs on stderr") and RFC-0002
  fix 1 ("move all logs, progress, and warnings to stderr … the minimum
  condition for `wittgenstein image … | jq`"). Secondary cosmetic: the
  always-present empty second console argument left a trailing space on
  every diagnostics line.
- **F3 (interpretation) —** the review's wording is best read as a garbled
  pointer at this class (stray non-JSON output around the JSON envelope on
  codec runs) rather than a literal `undefined`; nothing at HEAD matches the
  literal wording. Recorded as such rather than re-litigated.

## Change (same-day fix)

- `packages/core/src/runtime/harness.ts`: `createRunLogger` now writes all
  four severities through a stderr-bound `Console`
  (`{ stdout: process.stderr, stderr: process.stderr }`), so diagnostics
  never interleave with stdout; the trailing-space artifact is gone.
- `packages/cli/test/replay.test.ts`: the image dry-run → replay test now
  parses raw stdout (`JSON.parse(baseline.stdout)` /
  `JSON.parse(replay.stdout)` — the stream-split regression lock) and asserts
  `[wittgenstein:` diagnostics on stderr; the `stdoutBody()` workaround is
  deleted.
- Stream-only behavior delta: same lines, same order, same `util.inspect`
  formatting — on stderr instead of stdout (verified byte-equal formatting
  for a bound `Console` vs global `console`, piped and on a pty, before
  landing).

## Bounded leftovers (recorded, not fixed here)

- `--config` pointing at a missing file dies as an uncaught
  `ERR_MODULE_NOT_FOUND` (raw node stack, no structured envelope, exit 1) —
  candidate for a small CLI error-boundary slice.
  **Fixed (2026-10-16, config error-boundary slice).** The loader now raises
  typed `CONFIG_LOAD_FAILED` (import / transform failures) or
  `CONFIG_SCHEMA_INVALID` (merged config fails `WittgensteinConfigSchema`)
  errors, and the CLI top-level boundary (`runCli` → `printCliError`,
  `packages/cli/src/cli-errors.ts`) renders every escaping rejection as one
  flat `{ ok: false, code, message, details? }` JSON document on stderr with
  exit 1 — the same refusal shape as `printImageDecoderError` /
  `printInstallError`. A `stack` is attached only for `UNEXPECTED_ERROR`
  (errors that could not be named). Verified shapes: missing path,
  unparsable `.ts` (esbuild transform), schema-invalid `.ts` / `.json`, and
  the env-var lane (`WITTGENSTEIN_LLM_PROVIDER=bogus` refuses without
  inventing a `configPath`). `doctor` and all codec commands were affected;
  `replay` was already structured (`REPLAY_EXECUTION_FAILED` + `cause`) and is
  unchanged. Design anchors: Vite's `failed to load config from <path>`
  (fail loud, name the resolved path — `vitejs/vite` `config.ts`); Brief D
  item 5 + RFC-0002 fix 1 (payload on stdout, errors/logs on stderr; non-zero
  exit on refusal). Regression locks: `packages/core/test/config.test.ts`,
  `packages/cli/test/cli-errors.test.ts`, `packages/cli/test/bin.test.ts`.
- `asciipng --source minimax` with non-TTY stdin exits 0 without output or
  work (the interactive key prompt resolves on closed stdin) — a silent
  no-op success.
- `console.warn(message, data)` prints `data` with `util.inspect`, not JSON —
  consistent with the diagnostics stream after this fix, noted for the
  record.

## Sources / anchors

- Claim origin: [`2026-10-16-m1b-delivery-closeout-review.md`](./2026-10-16-m1b-delivery-closeout-review.md) §#403
- Contract: `docs/adrs/0009-cli-ergonomics-v2.md`; `docs/rfcs/0002-cli-ergonomics.md` (fix 1); `docs/research/briefs/D_cli_and_sdk_conventions.md`
- Code: `packages/core/src/runtime/harness.ts` (`createRunLogger`); `packages/cli/test/replay.test.ts`
- Probe captures (ephemeral): `/private/tmp/witt-probe2/`
