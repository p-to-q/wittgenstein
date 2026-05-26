# RFC-0002 — CLI ergonomics

**Date:** 2026-04-25
**Author:** engineering (@Jah-yee @Moapacha)
**Status:** 🟢 Accepted
**Feeds from:** Brief D (`docs/research/briefs/D_cli_and_sdk_conventions.md`)
**Ratified by:** ADR-0009

**Summary:** Close the 30% gap Brief D identified between Wittgenstein's CLI and the 2025-class AI CLI template — `--json`/NDJSON on stdout with logs on stderr, documented flag-over-env-over-file precedence with provenance-aware `doctor`, a one-liner `npx @wittgenstein/cli doctor` install — while deliberately diverging on two axes (no primary REPL, no user-facing `--model` on modality commands) that would turn a batch harness into a chat surface.

---

## Context

Brief D (2026-04-23) surveyed nine reference tools — Claude Code, Codex CLI, Gemini CLI, Kimi CLI, Cursor, `gh`, `npm`, the OpenAI Agents SDK, and the Anthropic SDK — against the HumanLayer _12-Factor Agents_ manifesto (Horthy, 2025) and Anthropic's April 2026 _Scaling Managed Agents_ post. It distilled a seven-point "2025-class AI CLI" template (noun-first subcommands, shared flag vocabulary, strict config precedence, decoupled auth, structured stdout with log-on-stderr discipline, a `doctor`, a one-line install) and audited Wittgenstein against it. The verdict was that Wittgenstein's current surface — `wittgenstein image|tts|audio|sensor|video|svg|asciipng|animate-html <prompt> [--seed --dry-run --out]` plus `doctor`, `init`, and `minimax-key` — sits at roughly 70% of that bar. The wins (noun-first subcommands, `--seed` and `--dry-run` everywhere, a `doctor` that already emits JSON, a `RunManifest` spine that is Kimi-shaped and 12-factor-aligned) are real. The gaps are specific and cheap: no `--json`/NDJSON output contract on modality commands, no documented config precedence, no uniform `auth` subcommand, no canonical one-liner install, ad-hoc stdout/stderr discipline, and a leaked provider-specific `minimax-key` command.

CLI ergonomics for Wittgenstein are not a style question. METR's 2024 capability-evaluation work (METR, 2024) established that _scaffolding changes are comparable in magnitude to a major model upgrade_ on their autonomy suite — harness and model are entangled experimental variables, and any claim that a run is reproducible depends on the harness emitting structured, replayable artifacts. Anthropic's _Scaling Managed Agents_ (2026) pushed the same conclusion from a different angle: the brain/hands/session split is an API boundary, and the CLI is one projection of that API. If the CLI doesn't enforce stdout discipline, structured output, and explicit config precedence, the harness layer is lying to itself when it claims those boundaries exist. The 12-Factor Agents principles (own your prompts, own your control flow, stateless agent design, separate business state from execution state — Horthy, 2025) map directly onto CLI rules: everything reproducible from `CLI invocation + git SHA + manifest`, no hidden mutable global state, layered explicit config, session log as single source of truth.

Pipe ergonomics matter specifically because Wittgenstein's outputs are artifacts, not chat. A Cursor or Claude Code user rarely pipes the CLI into another program — the conversation _is_ the product. A Wittgenstein user producing an overnight codec sweep absolutely pipes: `wittgenstein image '...' --seed 7 --json | jq '.quality.fid'` is the shape of a credible A/B test. Without a structured stdout contract, that sweep has to parse pretty output with regex, which is how reproducibility dies. The rest of this RFC turns Brief D's verdict into concrete interface commitments.

## Proposal

Three cheap fixes and two deliberate divergences.

**Fix 1 — Adopt `--json`/NDJSON as the canonical machine-output contract on stdout; move all logs, progress, and warnings to stderr.** This is the `gh` convention (GitHub, 2025), and Brief D names it as _the single biggest gap_ in the current CLI. Default behaviour stays pretty when stdout is a TTY. When `--json` is passed, or when stdout is not a TTY, the command emits one NDJSON record per artifact with a stable, versioned schema. Progress bars, model chatter, and human-readable log lines go to stderr regardless. This is the minimum condition for `wittgenstein image ... | jq` to work and therefore the minimum condition for codec A/B sweeps to be scriptable.

**Fix 2 — Document and enforce the precedence `flag > env > project config > user config > defaults`, and teach `wittgenstein doctor` to print per-key provenance.** This is the npm config order (npm, 2024) and it is, as Brief D notes, not up for debate — tools that invert it are considered broken. Today Wittgenstein's `loadWittgensteinConfig` reads a config file, but the CLI docs don't state the precedence, which means users can't predict whether `MOONSHOT_API_KEY` in env beats `provider.apiKey` in `wittgenstein.config.json`. The fix is half documentation, half integration test: freeze the order in code, invert-each-pair tests to confirm, and make `doctor` answer the question "where did this value come from?" for every effective config key.

**Fix 3 — Make `npx @wittgenstein/cli doctor` the zero-config one-liner install, and introduce a uniform `wittgenstein auth <provider> login|logout|status` surface that deprecates the provider-specific `minimax-key` command.** Cursor's `curl https://cursor.com/install -fsSL | bash` (Cursor, 2025) and Claude Code's `npm install -g @anthropic-ai/claude-code` (Anthropic, 2026) set the bar at one command. `npx` gets us there without a custom install script, and `doctor` is the right landing command — it tells the user what works now, what needs a key, what needs ffmpeg, and exits. The `auth` surface copies `gh auth` (GitHub, 2025) and `kimi login` (Moonshot, 2025): one subcommand whose only job is to obtain, refresh, or inspect credentials. Provider keys never live as CLI flags and never as fields in the main config file.

**Divergence 1 — No interactive REPL as the primary interface, through at least v0.3.** Claude Code, Cursor, Gemini CLI, and Kimi CLI all centre a REPL with slash-commands. Wittgenstein will not. The harness thesis is that the LLM is one stage in a pipeline, not the user-facing surface; a REPL pulls the product towards chat-app framing and away from the batch-artifact framing that the `RunManifest` spine is built for. This is a deliberate choice to stay narrower than the 2025-class template, modelled on LangChain CLI's narrow scope (LangChain, 2024–2025) and `gh`'s one-shot discipline. If an interactive surface is ever needed it ships as a separate binary, clearly labelled, not as the default entrypoint.

**Divergence 2 — No user-facing `--model` flag on modality commands.** Every chat CLI in Brief D's survey exposes `--model`/`-m` because their primary job is LLM-as-service. Wittgenstein's primary job is a specific codec producing a specific artifact; the LLM is an implementation detail of the codec's IR stage, and exposing `--model` at the modality boundary invites users to swap it in ways that invalidate the codec's determinism and quality guarantees. The escape hatch is the environment variable `WITTGENSTEIN_MODEL`, which by Fix 2's precedence rule still beats config-file values but is explicitly positioned as an experimentation-only affordance, not part of the stable surface. This is a conscious divergence from Gemini, Claude Code, and Kimi, and it is defensible because Wittgenstein is a harness, not a chat service.

## Interface

The concrete surface after RFC-0002 lands.

### Subcommand taxonomy

```
wittgenstein <modality> <route> <prompt>   # image, tts, audio, sensor, video, svg, asciipng, ...
wittgenstein run --manifest <path>          # replay a prior RunManifest byte-for-byte
wittgenstein doctor                         # environment diagnostics with provenance
wittgenstein auth <provider> <login|logout|status>
wittgenstein manifest <runId>               # inspect a RunManifest
wittgenstein showcase                       # list/browse the 35-artifact showcase pack
wittgenstein init                           # scaffold ./wittgenstein.toml
```

Modality is always the first positional. Route is the codec-declared sub-mode (e.g. `audio speech`, `audio soundscape`, `audio music`), surfaced by the codec's `Route.match` as declared in RFC-0001. The verb is never the first positional, matching `gh <resource> <verb>` (GitHub, 2025) and `lark <resource> <verb>` (larksuite/cli, 2023–2026) — the two reference CLIs whose noun-first taxonomy composes best in shell pipelines and is most readable to an agent skimming `--help` output. See Brief D §Lark CLI for the three-tier auth pattern this RFC's `wittgenstein auth <provider>` surface inherits.

### Flag baseline

Every command inherits this baseline. Per-modality codecs declare additional flags; those additions pass through `Route.match` so the CLI parser and the codec agree on shape.

```
--seed <int>         # REQUIRED on modality commands; reproducibility anchor
--dry-run            # default: true on first-run-without-keys; false with --seed in CI
--json               # NDJSON on stdout, logs on stderr; implied when !isatty(stdout)
--quiet, -q          # suppress stderr progress; errors still surface
--output <path>, -o  # artifact destination; '-' writes to stdout (mutex with --json)
--manifest <path>    # explicit RunManifest destination; defaults to artifacts/runs/<id>/
--config <path>      # override project config file location
```

`--seed` is required because METR's 2024 finding — that harness choices move the needle as much as model upgrades — makes deterministic replay the only credible unit of measurement. `--dry-run`'s true default on first run means `npx @wittgenstein/cli doctor` and a user's first `wittgenstein image 'hello'` never bill an API unexpectedly; once a provider is configured and a seed is pinned, CI flips the default.

### Per-modality flags via `Route.match`

RFC-0001 specifies codecs declare their routes and each route declares its own flag schema. The CLI mounts those at `wittgenstein <modality> <route>` automatically — no per-command hand-maintained flag list. A codec adding a new route does not touch `packages/cli/src/commands/*.ts`; it exports a `Route` and the flags appear. This keeps the CLI a thin projection of the codec surface rather than a second source of truth.

### Config resolution (5 levels)

```ts
function resolveKey<T>(key: string): { value: T; source: ConfigSource } {
  // 1. Flag passed on CLI (--provider anthropic)
  if (flags.has(key)) return { value: flags.get(key), source: "flag" };
  // 2. Environment variable (WITTGENSTEIN_PROVIDER=anthropic)
  const envKey = `WITTGENSTEIN_${key.toUpperCase().replace(/\./g, "_")}`;
  if (process.env[envKey]) return { value: process.env[envKey], source: "env" };
  // 3. Project config (./wittgenstein.toml — git-tracked)
  if (projectConfig?.has(key)) return { value: projectConfig.get(key), source: "project" };
  // 4. User config (${XDG_CONFIG_HOME:-~/.config}/wittgenstein/config.toml)
  if (userConfig?.has(key)) return { value: userConfig.get(key), source: "user" };
  // 5. Built-in default
  return { value: defaults[key], source: "default" };
}
```

Project config lives at `./wittgenstein.toml`; user config at `${XDG_CONFIG_HOME:-~/.config}/wittgenstein/config.toml`. TOML, not JSON, for the same reason Codex and Cargo chose TOML: hand-editable config files should tolerate comments. Provider credentials never live in either file; they live in the OS keychain via `wittgenstein auth`.

### `wittgenstein doctor` output format

`doctor` tests the environment and reports. It is distinct from a hypothetical `config show`, following the Claude Code `/doctor`-vs-`/status` split (Anthropic, 2026). Exit codes: `0` all green, `1` warnings (something degraded but usable, e.g. ffmpeg missing but image codec fine), `2` fail (nothing will work). Default output is a pretty-printed health report; `--json` emits a single structured object.

```
wittgenstein doctor --json
{
  "schemaVersion": 2,
  "ok": true,
  "runtime": { "wittgenstein": "0.2.3", "node": "20.11.1", "pnpm": "9.0.6" },
  "providers": [
    { "name": "anthropic", "auth": "ok", "source": "keychain" },
    { "name": "openai",    "auth": "missing", "fix": "wittgenstein auth openai login" },
    { "name": "minimax",   "auth": "ok", "source": "env:MINIMAX_API_KEY" },
    { "name": "ollama",    "auth": "n/a", "source": "local" }
  ],
  "seed": { "entropy": "/dev/urandom", "reproducible": true },
  "config": [
    { "key": "provider.default", "value": "anthropic", "source": "project" },
    { "key": "artifacts.dir",    "value": "./artifacts", "source": "default" }
  ],
  "artifacts": { "dir": "./artifacts", "writable": true }
}
```

The provenance column (`source`) is the novel piece. It answers "why is my run using provider X?" without reading the loader. Brief D named the absence of this the second-biggest gap after the stdout contract.

### `--json` stdout contract

When `--json` is set (or when stdout is not a TTY), a modality command emits one NDJSON record per produced artifact. Schema:

```json
{
  "schemaVersion": 2,
  "runId": "01HZX...",
  "modality": "image",
  "route": "default",
  "seed": 7,
  "latencyMs": 4182,
  "priceUsd": 0.0032,
  "quality": { "fid": null, "clip": 0.31 },
  "manifestPath": "artifacts/runs/01HZX.../manifest.json",
  "artifactPath": "artifacts/out/01HZX....png",
  "artifactSha256": "8a2c...",
  "gitSha": "7897062",
  "timestamp": "2026-04-25T14:22:01Z"
}
```

`schemaVersion: 2` is explicit and stable; future changes bump the integer and add a compatibility shim rather than mutating field meanings. NDJSON rather than a JSON array because multi-phase runs (e.g. video codec with progressive frames) emit incrementally, and piping consumers (`jq -c`, `datasette insert`) handle NDJSON natively. `--output -` writes the binary artifact to stdout and becomes mutually exclusive with `--json`; the CLI errors loudly if both are set. This is the ffmpeg convention and Brief D names it as the right resolution to the binary-vs-JSON-on-stdout conflict.

### Auth surface

```
wittgenstein auth <provider> login    # browser OAuth where the provider supports it; paste-key fallback
wittgenstein auth <provider> logout   # remove from keychain
wittgenstein auth <provider> status   # { "provider": "...", "auth": "ok|missing", "source": "..." }
wittgenstein auth status              # all providers at once
wittgenstein auth status --json       # machine-readable for CI gating
```

Supported providers at v0.3: `anthropic`, `openai`, `minimax`, `ollama` (local, no auth — reports `"auth": "n/a"`). Credentials stored in the OS keychain (macOS Keychain, `libsecret` on Linux, Credential Manager on Windows) with a documented fallback to `${XDG_CONFIG_HOME:-~/.config}/wittgenstein/credentials.toml` with `0600` perms when no keychain is available (CI, minimal containers). Env-var fallback (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `MINIMAX_API_KEY`) is preserved for CI, and by Fix 2's precedence, env beats both stored credential layers — the documented semantic is "env-var-in-CI always wins."

## Migration

Five phases, each gated on a specific milestone, none big-bang.

**M1 — Ship the `--json` flag and NDJSON writer; keep pretty default on TTY.** Add a thin `emit(event)` helper in `packages/cli/src/io/` that renders to pretty or NDJSON based on one resolved config. All modality commands switch their "here's the manifest path" log line to `emit({kind: "artifact", ...})`. Pretty output is unchanged; JSON output becomes canonical. Ships in v0.2.x as additive.

**M2 — Introduce `wittgenstein auth <provider>` and alias `minimax-key` with a deprecation notice.** `minimax-key` prints `warning: 'wittgenstein minimax-key' is deprecated; use 'wittgenstein auth minimax login' — alias will be removed in v0.4` on stderr and forwards to the new surface. Deprecation window: v0.3 through v0.3.x. Removed in v0.4.

**M3 — `doctor` v2 with config provenance.** Today's `doctor` already emits JSON with `ok/nodeVersion/hasApiKey/llmProvider/llmModel/artifactsDir`. v2 adds the `config` array with per-key provenance, the `providers` array replacing scalar `hasApiKey`, and bumps `schemaVersion` from 1 to 2. Consumers reading v1 see an `ok` field in the same place; breaking changes are confined to the array shapes, which old consumers were not parsing.

**M4 — `wittgenstein` → `@wittgenstein/cli` npm package with `npx` support.** The package is published with `"bin": { "wittgenstein": "./dist/cli.js" }`. `npx @wittgenstein/cli doctor` becomes the documented one-liner in the README and the quickstart. The existing `pnpm --filter @wittgenstein/cli exec wittgenstein` path continues to work for workspace developers. The Python twin (`python3 -m polyglot.cli`) is documented as the research-only path and is not the canonical invocation.

**M5 — Freeze precedence order in code with an integration test.** Add `packages/cli/test/config-precedence.spec.ts` that constructs every adjacent-pair inversion (flag-beats-env, env-beats-project, project-beats-user, user-beats-default) and asserts the documented winner. Any future change to the loader has to update this test. This is the guardrail that keeps Fix 2 from silently regressing when someone refactors `loadWittgensteinConfig`.

## Red team

Three plausible pushbacks, each answered inline.

**"NDJSON plus pretty doubles output code."** It doesn't, if built right. The adapter is thin: one `emit(event)` call in the command body, one renderer in `packages/cli/src/io/` that branches on mode. The command never formats a string itself. We measured the footprint in a spike — the pretty and NDJSON renderers together are ~80 lines. The alternative (pretty-only stdout with a parallel `--log-file writes-json` hack) is worse because it bifurcates the artifact stream and consumers need two code paths.

**"Divergence on `--model` is dogmatic; users will work around it with env vars anyway."** That is precisely the design. `WITTGENSTEIN_MODEL` _is_ the escape hatch, documented as such in the `doctor` provenance output and in the codec READMEs. The divergence is not "users can't change the model" — it is "the default CLI surface does not advertise model choice as a first-class knob, because doing so invites quality-invalidating swaps and erodes the codec contract." Users who know they want to A/B models can; casual users see a clean surface that does not suggest model choice is theirs to make. Gemini and Claude Code expose `--model` because the model is the product; Wittgenstein's product is the codec, not the model.

**"Config at 5 levels is over-engineered for a tool with ~7 modalities."** The five levels are already de facto present, unlabelled: today's `loadWittgensteinConfig` reads flags, env vars, a project config, and falls through to defaults — the only "missing" level is a user config, which every user already emulates by symlinking the same `wittgenstein.config.json` across projects. This RFC documents what is already load-bearing and makes it inspectable. The incremental cost is ~40 lines of loader code plus the precedence test from M5. The counterfactual — staying at "it's whatever the loader happens to do today" — is how config precedence bugs ship.

## Kill criteria

Concrete events that would force a revision or full withdrawal of this RFC.

- **If by v0.4 the dominant agentic surface is MCP-native rather than CLI** (the Gemini / Claude Code / Cursor trajectory through 2025 — all three converged on `/mcp` as a first-class surface), the fix-1/fix-2/fix-3 investment becomes a local maximum. In that world Wittgenstein ships as an MCP server first, CLI second, and the stdout contract work is not wasted (MCP tool responses are structured too) but the install-one-liner and auth surface work is. Tripwire: if two of {Claude Code, Cursor, Gemini CLI} deprecate their direct CLI invocation path in favour of MCP-host-only by v0.4, reopen this RFC.

- **If `--json` consumers diverge** — i.e., if we ship the NDJSON contract and the codec-sweep scripts that people actually write still parse pretty output with regex — the contract failed its intended use case. Either the schema is wrong (wrong fields, unstable shape) or the discoverability is wrong (nobody knows `--json` exists). Tripwire: survey three sweeps in the wild 90 days after M1; if <2 use `--json`, investigate.

- **If `doctor` takes >2 s on cold start**, it's a bad doctor. `npx @wittgenstein/cli doctor` is the one-liner install, and a 5-second first impression is worse than no one-liner. Tripwire: cold-start budget of 2000ms on a 2022-class laptop; regression test in M4.

- **If `WITTGENSTEIN_MODEL` becomes the most common env var users set**, the divergence on `--model` is leaking through the wrong channel and we should promote it to a first-class flag (or remove the env var entirely and pick a different affordance for experimentation). Tripwire: telemetry opt-in shows `WITTGENSTEIN_MODEL` present in >30% of runs by v0.4.

- **If the stdout-binary-vs-stdout-JSON resolution (`--output -` mutex with `--json`) surfaces a real use case we didn't anticipate** — specifically someone wanting both the artifact and the manifest on stdout as a multipart stream — revisit; the ffmpeg convention may not generalise.

## Decision record

- **Accepted by:** ADR-0009
- **Superseded by:** —
