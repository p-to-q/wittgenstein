# Brief D — CLI / SDK / harness conventions

**Date:** 2026-04-23
**Author:** research (max.zhuang.yan@gmail.com)
**Status:** Draft v0.1
**Summary:** Surveys what a modern AI CLI / SDK looks like in April 2026 — subcommand taxonomy, flag vocabulary, config resolution order, auth, pipe discipline, doctor patterns, one-liner install — and audits where `wittgenstein`'s current CLI is on the industry grid and where it is off. Verdict: the shape is mostly right (noun-first subcommands, `--seed`, `--dry-run`, a `doctor`), but the output contract, config precedence, and install story are under-specified; RFC-0002 should adopt a small set of hard conventions (`--json`/NDJSON on stdout, stderr for logs, `flag > env > project file > user file > defaults`, a single `npx @wittgenstein/cli` one-liner) and deliberately diverge from the "LLM-chat CLI" pattern — Wittgenstein is a harness, not a chatbot, and its CLI is first a pipeline tool, second a demo.

---

## Context

Three pieces of 2024–2026 work make CLI conventions load-bearing for Wittgenstein rather than a style question.

First, Anthropic's _Scaling Managed Agents: Decoupling the brain from the hands_ (Anthropic, April 2026) formalised the split between the reasoning component ("brain"), the execution environment ("hands" / sandbox), and an append-only session log. Managed Agents is explicitly a _meta-harness_: unopinionated about the concrete harness layered around Claude, but committed to the shape of the interface between them. The observation that matters for Brief D is that the boundary between brain, harness, and sandbox is an API boundary — and the CLI is one projection of that API. If the CLI does not enforce clean stdout/stderr discipline, structured output, and explicit config precedence, the harness layer is lying to itself when it claims those boundaries exist.

Second, METR's 2024 evaluation work (METR, 2024) repeatedly showed that _scaffolding changes are comparable in magnitude to a major model upgrade_ on their autonomy suite — and that the scaffolding-vs-model interaction is a live experimental variable, not a fixed factor. A useful harness therefore needs to be A/B-testable: runs need to carry the full manifest of what scaffolding was used, which means the CLI (a) must emit structured artifacts deterministically, (b) must accept the same run configuration as env / file / flag, and (c) must support `--dry-run` and fixed-seed runs cheaply. These are not polish features. They are the minimum surface area required to credibly claim a run is reproducible.

Third, HumanLayer's _12-Factor Agents_ (Horthy, 2025) distilled a set of principles that directly constrain CLI shape: _own your prompts, own your control flow, stateless agent design, separate business state from execution state, manage context explicitly_. Several of these have direct CLI projections — stateless by default (no global mutable state in `~/.wittgenstein/`), separation between business config (what the LLM is told) and execution config (which provider, which sandbox), and an explicit, inspectable event log (the `RunManifest` spine already exists in Wittgenstein for this).

So: the question for RFC-0002 is not "what color should the flags be." It is "what does the CLI have to look like so that the harness claims above are actually true when someone runs `wittgenstein image 'X' --seed 7`."

## Steelman

State the industry convention as its proponents would.

There is now a recognisable _2025-class AI CLI_ template, converged on across at least six reference implementations: Claude Code, Codex CLI (OpenAI), Gemini CLI (Google), Cursor CLI, Kimi CLI (Moonshot), and — as the non-AI reference standard — `gh` from GitHub. The template has seven load-bearing components.

**1. One binary, noun-first subcommands.** `gh pr list`, `gh issue view`, `claude /status`, `kimi mcp`, `gemini /agents`. The pattern is `<tool> <resource> <verb>` or `<tool> <verb>`. The verb is never the first positional. This makes shell history greppable, tab-completion discoverable, and help pages chunkable.

**2. A small, shared flag vocabulary.** Every serious CLI in 2026 supports a roughly-equivalent core set: `--model` / `-m` (which LLM), `--stream` (token streaming), `--seed` (determinism), `--json` or `-o json` (machine output contract), `--dry-run` (no side effects, no billable calls), `-q`/`--quiet`, `-v`/`--verbose`, `--config <path>`. Gemini CLI uses `--model` / `-m` (Google, 2025). `gh` uses `--json <fields>` with `--jq` and `--template` as post-filters (GitHub, 2025). These flags mean the same thing everywhere.

**3. A strict config resolution order.** The canonical order, inherited from npm and 12-Factor App, is `CLI flag > env var > project-local config > user config > global/system config > built-in defaults` (npm, 2024). This is universal and it is not up for debate: tools that invert it (env overrides flag, project overrides flag) are considered broken.

**4. Auth that decouples from config.** `gh auth login`, `kimi login`, Claude Code's OAuth bootstrap, `codex login` all follow the same shape: a subcommand whose only job is to obtain or refresh credentials, store them in a platform-appropriate keychain or a well-documented file, and exit. The credential is never a flag and never a field in the main config file. `gh auth status --json hosts` is the canonical inspection command (GitHub, 2025).

**5. Structured output on stdout, logs on stderr.** This is the Unix discipline, re-enforced by the LLM-era. `gh` supports `--json <fields>` output on any subcommand (GitHub, 2025). `jq` pipelines downstream assume NDJSON or canonical JSON. Interactive pretty-printing happens when stdout is a TTY; it silently switches to machine format when piped. Logs, progress bars, warnings all go to stderr.

**6. A `doctor` subcommand.** Claude Code has `/doctor` (environment diagnostics, distinct from `/status` which reads current session config — Anthropic, 2026). `gh` has `gh auth status`. `brew doctor`, `npm doctor`, `flutter doctor` are the pre-LLM precedents. The pattern is: one subcommand, no side effects, emits a structured health report with actionable error messages. On success exits 0; on failure exits nonzero with a list of what to fix.

**7. A one-line install.** `curl https://cursor.com/install -fsSL | bash` (Cursor, 2025). `npm install -g @openai/codex` (OpenAI, 2025). `brew install gh`. The user acquires the binary in a single command that does not require cloning a repo or managing a Python env.

The steelman version of the 2025-class AI CLI is: if your tool does not implement all seven of these, it is below the bar set by every mainstream AI developer tool shipped in the last eighteen months. Matching them is table stakes. Deviating from them is a deliberate choice that must be defended.

## Survey

Nine reference tools, read for the seven components above. Facts verified against current 2025–2026 documentation.

**OpenAI Codex CLI (OpenAI, 2025).** Subcommand taxonomy: `codex`, `codex exec`, `codex features`, `codex login`. Flags: `--model`, `--sandbox`, `--approval-mode`, `--config`, `--cd`. Config resolution: env > `~/.codex/config.toml` > built-in defaults; CLI flags override all. Auth: `codex login` (browser OAuth flow), stored in `~/.codex/`. Output contract: pretty on TTY, JSON when `--json` is set; session transcripts written to disk in a structured format. Doctor: no dedicated `doctor`, but `codex features` inspects and persists capability flags. Install: `npm install -g @openai/codex`. Notes: the Agents SDK _itself_ is a Python library (`pip install openai-agents`) — there is no `agents` CLI, which is the first important observation. The CLI surface is for the coding agent; the SDK surface is for building agents. This is a deliberate split that Wittgenstein should mirror.

**Anthropic SDK + Claude Managed Agents (Anthropic, 2026).** The SDK is `anthropic` (Python) / `@anthropic-ai/sdk` (TypeScript); there is no general-purpose `anthropic` CLI. Managed Agents exposes a REST surface for session lifecycle (create session, post event, fetch session log), not a CLI. The brain-hands-session split _does_ imply a CLI shape for harness builders: the CLI's job is to drive a session, and the session log is the authoritative artifact. This is exactly the `RunManifest` pattern Wittgenstein already has.

**Claude Code CLI (Anthropic, 2026).** Subcommands: the REPL is the primary interface; slash-commands inside the REPL provide structure — `/doctor`, `/status`, `/config`, `/model`, `/agents`, `/mcp`. Non-REPL invocation: `claude config list | set | reset`, `claude --print <prompt>`. Flags: `--model`, `--print` (one-shot), `--dangerously-skip-permissions`, `--config`. Config: `.claude/settings.json` (project) layered over `~/.claude/settings.json` (user); env vars with `CLAUDE_CODE_*` prefix override file. Auth: OAuth via `claude login`, stored in platform keychain. Doctor pattern: `/doctor` actively _tests_ the environment (Node version, MCP servers reachable, credentials valid) and reports failures with actionable errors; `/status` is a separate read-only settings dump. Install: `npm install -g @anthropic-ai/claude-code` or `curl -fsSL claude.ai/install.sh | sh`. The doctor / status split is the single most copyable convention from Claude Code.

**Gemini CLI (Google, 2025).** Open-source (`google-gemini/gemini-cli`). Subcommands: slash-prefix inside REPL (`/agents`, `/mcp list`, `/model`, `/include-directories`), `@path` for file inclusion, `!cmd` for shell. Flags: `--model` / `-m` with aliases, `--include-directories`, `--yolo` (auto-approve), `-o <format>`. Config: `.gemini/config.json` project > user > env `GEMINI_*`. Auth: Google OAuth via `gemini auth login`; API-key mode for programmatic use. Output: pretty in TTY; JSON mode via flag. Doctor: no `doctor`, but `/mcp list` and `/about` cover health-check-shaped queries. Install: `npm install -g @google/gemini-cli`.

**`gh` (GitHub, 2015–2025).** The non-AI reference standard. Subcommands: `gh <resource> <verb>` — `gh pr list`, `gh issue view`, `gh run watch`. Flags: `--json <fields>` on basically every command, `--jq`, `--template`, `-R <owner/repo>`, `--web`. Config: `~/.config/gh/config.yml`, `GH_TOKEN` / `GITHUB_TOKEN` env overrides. Auth: `gh auth login` / `gh auth status --json hosts --show-token` / `gh auth refresh` / `gh auth logout`. Output: `--json` gives canonical JSON on stdout; everything else is pretty-printed with TTY detection. Doctor-equivalent: `gh auth status`. Install: `brew install gh`, `winget install --id GitHub.cli`, or apt repo. `gh` is the cleanest implementation of the seven-point template and the one Wittgenstein's CLI should most closely resemble in shape.

**`npm` (npm Inc., 2010–2025).** Config resolution is the canonical implementation of the precedence order (npm, 2024): `--foo bar` on CLI > `npm_config_foo=bar` in env (case-insensitive) > project `.npmrc` > user `~/.npmrc` > global `.npmrc` > built-in defaults. Any new CLI that wants to ship in 2026 without justifying itself should copy this order verbatim.

**Cursor CLI (Cursor, 2025–2026).** Single binary `cursor-agent`. Subcommands / modes: `--mode=plan|ask|agent`, slash-commands in REPL (`/plan`, `/ask`, `/model`, `/usage`, `/about`, `/resume`). Flags: `--mode`, `--model`. Config: `.cursor/mcp.json` for MCP, environment for API keys. Auth: session tokens managed by Cursor account. Output: pretty TTY; structured mode for pipe. Doctor: `/about` is the health-check. Install: `curl https://cursor.com/install -fsSL | bash`. The mode flag (`--mode=plan|ask|agent`) is interesting — it's a dimension we don't have today and may not need.

**Kimi CLI (Moonshot, 2025).** `kimi` is the main binary. Subcommands: `kimi` (interactive), `kimi login`, `kimi mcp <subcmd>`, `kimi export`, plus a Web UI server and an agent trace visualizer. Flags: `--model`, `--port`, `--host` (for Web UI). Config: `~/.kimi/` with `context.jsonl`, `wire.jsonl`, `state.json` exported on demand. Auth: browser OAuth via `kimi login`, auto-configures available models. Doctor: not by that name, but the "Ralph Loop" mode and tracing visualizer cover inspection. Install: via pip / uvx. Kimi's export format (`context.jsonl` + `wire.jsonl` + `state.json`) is _exactly_ the shape a harness-side run manifest should take and is a cleaner version of what Wittgenstein currently writes under `artifacts/runs/`.

**Lark CLI (larksuite/cli, ByteDance / Feishu, 2023–2026).** `lark` is the main binary for the Feishu open platform. Subcommands: `lark bot <subcmd>`, `lark event`, `lark mina` (mini-program), `lark oapi` (open-API call runner), `lark config`. Flags: `--app-id`, `--app-secret`, `--tenant-access-token`, `--json`, `--verbose`, `--config`. Config resolution: flag → env (`LARK_APP_ID`, `LARK_APP_SECRET`) → `~/.lark/config.yaml` → project-local `.lark/config.yaml`. Auth: three-tier (tenant / user / app) with explicit token subcommand. Exit-code discipline: strict non-zero on any OAPI error, stderr for logs, stdout for the response body — so shell pipes `lark oapi ... | jq` work without flag gymnastics. Install: `go install github.com/larksuite/project-manager/cmd/lark@latest` or pre-built binaries. The pattern Wittgenstein should steal is the **noun-first subcommand taxonomy** (`lark bot`, `lark event`, `lark oapi`) paired with the **three-tier explicit auth** and the **stdout-is-payload discipline** — i.e. the user-facing surface says exactly what it operates on and composes cleanly in scripts. It is the closest existing CLI to the shape a codec-per-noun Wittgenstein CLI would have (`wittgenstein image`, `wittgenstein audio`, `wittgenstein sensor` as nouns, not verbs), and its config precedence is the model RFC-0002 adopted. Source: `github.com/larksuite/cli` (the project-manager binary is the public reference implementation). [Added 2026-04-24 per `docs/v02-alignment-review.md` §2.6.]

**LangChain CLI (LangChain, 2024–2025).** `langchain` CLI exists primarily as a project scaffolder — `langchain app new`, `langchain serve`. It is _not_ an interactive agent runner. The relevant lesson for Wittgenstein is the LangChain CLI's narrow scope: it sets up a LangServe app and stops there. It does not try to be a chat client. Wittgenstein's CLI has a similar opportunity to stay narrow: generate artifacts and emit manifests; do not try to become a chat REPL.

**12-Factor Agents (Horthy / HumanLayer, 2025).** Not a CLI, a manifesto. Directly relevant principles: _own your prompts_ (prompts live as files in the repo, not hard-coded in the binary — Wittgenstein already does this), _own your control flow_ (the harness drives the loop, not the LLM — Wittgenstein already does this), _stateless agent design_ (no hidden `~/.wittgenstein/` mutable state — Wittgenstein mostly does this but has implicit workspace resolution that should be documented), _separate business state from execution state_ (the `RunManifest` records business state; execution state lives in provider SDKs and should not leak into manifests). The 12-factor framing converts roughly into these CLI rules: (a) everything reproducible from `CLI invocation + git SHA + manifest`, (b) no mutable global state the CLI depends on, (c) config is layered and explicit, (d) the session log is the single source of truth.

## Wittgenstein's current CLI — audit

Source: `packages/cli/src/commands/*.ts`, `packages/cli/README.md`, `docs/quickstart.md`.

Current surface:

```
wittgenstein image   <prompt> [--out <path>] [--seed <n>] [--dry-run]
wittgenstein tts     <prompt> [--out <path>] [--seed <n>] [--dry-run]
wittgenstein audio   <prompt> [--route speech|soundscape|music] [--out] [--seed] [--dry-run]
wittgenstein sensor  <prompt> [--out] [--seed] [--dry-run]
wittgenstein video   <prompt> [--out] [--seed] [--dry-run]
wittgenstein svg     <prompt> [--out] [--seed] [--dry-run]
wittgenstein asciipng <prompt> [--out] [--seed] [--dry-run]
wittgenstein animate-html --out <path>
wittgenstein doctor  [--config <path>]
wittgenstein init
wittgenstein minimax-key
```

Seven modality groups (image, tts/audio, sensor, video, svg, asciipng, animate-html) plus three infra commands (`doctor`, `init`, `minimax-key`). `RunManifest` is the spine: every invocation writes `artifacts/runs/<id>/manifest.json` with git SHA, lockfile hash, seed, prompt, IR, LLM output, and artifact SHA-256.

**Where it's on the grid.**

- _Noun-first subcommands._ `wittgenstein <modality>` follows the `gh <resource>` pattern, not the `cli run --modality=X` anti-pattern. Good.
- _`--seed` everywhere._ Determinism is a first-class flag on every modality command. Matches the steelman.
- _`--dry-run` everywhere._ Matches the steelman and the METR "scaffolding is a variable" constraint.
- _`doctor` subcommand._ Already emits JSON with structured fields (`ok`, `nodeVersion`, `hasApiKey`, `llmProvider`, `llmModel`, `artifactsDir`). This is closer to Claude Code's `/doctor` than to the average Python CLI's "print stuff and hope" pattern.
- _Manifest-per-run._ Kimi-shaped, 12-factor-aligned. This is genuinely ahead of the median CLI.
- _`--out` relative-path resolution._ `--out` relative paths resolve from the workspace root, which is the Claude Code / gh convention (project-local semantics by default).

**Where it's off the grid.**

- _No `--json` / NDJSON output contract._ Every modality command currently writes its primary artifact to disk (`--out`) and prints human-readable logs. There is no canonical way to pipe `wittgenstein image ... | jq '.manifest_path'`. `doctor` happens to emit JSON but that is a local convention, not a contract. _This is the single biggest gap._
- _No documented config resolution order._ `@wittgenstein/core`'s `loadWittgensteinConfig` reads a config file, but the precedence of flag vs env vs project vs user is not stated in the CLI docs. Users don't know whether `MOONSHOT_API_KEY` in the env beats a `provider.apiKey` entry in `wittgenstein.config.json`, or the reverse.
- _No `auth` subcommand._ API keys are read from env vars directly (`MOONSHOT_API_KEY`, `MINIMAX_API_KEY`, etc.). There is a `minimax-key` command, which is provider-specific rather than a uniform `wittgenstein auth <provider>` surface. The `gh auth` pattern is cleaner.
- _No `--model` flag._ The model is resolved via config. This is defensible — Wittgenstein is a harness, not a chat CLI, and the user often shouldn't care — but there is no escape hatch for A/B-testing models at the CLI level, which is exactly the METR use case.
- _No `--stream`._ Irrelevant for most modality runs (they produce a single artifact, not a token stream), but likely relevant for a future `wittgenstein chat` or `wittgenstein plan` surface.
- _Stdout vs stderr discipline is ad hoc._ Progress output, warnings, and the final manifest path all go to stdout today. For pipe-ability, logs must move to stderr.
- _Two install paths, no canonical one-liner._ The quickstart documents both `pnpm --filter @wittgenstein/cli exec wittgenstein ...` (workspace-internal) and `python3 -m polyglot.cli ...` (the Python twin). `npm install -g @wittgenstein/cli` exists but `npx @wittgenstein/cli doctor` is not highlighted as the canonical try-it-out command. Cursor's `curl | bash` and Claude Code's `npm install -g` have set the bar at one command.
- _`init` and `minimax-key` leak implementation._ `minimax-key` is a one-off for a specific provider; it should be `wittgenstein auth minimax` or removed. `init` is fine but should be documented.
- _No `wittgenstein run` universal entrypoint._ For scripted use, a single `wittgenstein run --modality=image --prompt=... --seed=...` would be more ergonomic than seven modality-specific commands. But see the Red Team below — this is a live trade-off, not an obvious win.

## Red team

Three plausible pushbacks, answered inline.

**Pushback A: "Why not just match `openai` / `codex` 1:1?"** Because those tools are shaped around a different job. The OpenAI Agents SDK is a Python framework for building agents; the Codex CLI is a coding agent for a terminal user. Neither is optimised for "driver of a deterministic multimodal artifact pipeline." If Wittgenstein adopted Codex's shape verbatim it would gain a REPL and a sandbox mode it doesn't need, and would lose the noun-first modality taxonomy that is actually its clearest win. The right reference is `gh`, not `codex` — a CLI whose job is to drive well-defined resources through well-defined verbs. Match `gh`'s surface discipline, not Codex's surface features.

**Pushback B: "CLI ergonomics is bikeshedding before codec v2 lands."** Partly fair, partly wrong. It would be bikeshedding if this were about colours and help-text wording. It isn't. The items on the critical path are (i) `--json` / NDJSON output contract, (ii) documented config precedence, and (iii) stderr discipline. Items (i) and (iii) are prerequisites for A/B-testing codecs at all — if you can't `wittgenstein image ... --json | jq '.metrics.fid'`, you can't run an overnight sweep. Item (ii) is a prerequisite for reproducibility claims to be real. Codec v2 will land faster with these in place, not slower. The rest (install one-liner, `auth` subcommand, `--model` flag) can wait behind a post-v2 milestone.

**Pushback C: "Users run the CLI once then use the SDK. The CLI doesn't matter."** True for chat CLIs like Codex and Cursor. False for Wittgenstein, because the CLI _is_ the reproducibility surface. The `RunManifest` is produced by the CLI path. A user who drops to the SDK and skips the CLI loses the manifest spine, loses the `artifacts/runs/<id>/` layout, and loses the git-SHA + lockfile-hash provenance that makes a run citeable. In Wittgenstein's world, the CLI is not a demo — it is the canonical way to produce an artifact you can put in a paper. Making it pipe-friendly is making the science-grade artifact stream pipe-friendly. That matters.

## Kill criteria

Concrete things that would invalidate this brief's recommendations.

1. **By Q2 2027, if the dominant developer-tool UX has shifted from CLI → TUI → MCP-native clients,** such that new AI tools ship primarily as MCP servers consumed by hosts (Claude Code, Cursor, Gemini CLI's `/mcp`), the CLI-shape recommendations here are stale and RFC-0002 should pivot to "Wittgenstein is an MCP server first, a CLI second." Probability: moderate. Gemini CLI, Claude Code, Cursor all converged on MCP in 2025; the direction of travel is real. Mitigation: ship an MCP adapter in parallel with the CLI hardening so neither path is a dead end.

2. **If NDJSON-on-stdout turns out to conflict with how users actually pipe binary artifacts.** Most Wittgenstein outputs are binary (PNG, WAV, MP4). `--json` is a manifest-and-metadata contract, not an artifact-on-stdout contract. If, in practice, users want to pipe the artifact itself (`wittgenstein image ... | convert - out.jpg`), a stdout-binary mode conflicts with a stdout-JSON mode. Resolution: `--out -` writes the artifact to stdout; `--json` writes the manifest to stdout; the two are mutually exclusive and the CLI errors loudly if both are set. This is the ffmpeg convention and it works.

3. **If the config precedence order we pick conflicts with an upstream tool (`pnpm`, `pip`, `uvx`) that wraps us.** If `pnpm --filter @wittgenstein/cli exec wittgenstein` injects env vars that we treat as higher-precedence than flags, we have a bug. Mitigation: enforce `flag > env > file > defaults` in `loadWittgensteinConfig` with tests.

4. **If a future `wittgenstein chat` or `wittgenstein plan` surface needs streaming, tools, and state that don't fit the "one-shot artifact" pattern.** This is not a kill but a forcing function: the current CLI shape will need a second command family (streaming, interactive) that lives next to the modality commands. The recommendations below should not foreclose that.

5. **If Anthropic's Managed Agents pricing model (Anthropic charges 8 US cents per session hour for active runtime, per their April 2026 post) becomes the dominant cost structure for agent workloads,** then "a CLI that drives local sessions" becomes the minority case and we should design for "a CLI that drives remote Managed Agents sessions" — which has different config and auth shape. Probability: low in the next year; agents are still mostly local-driven.

## Verdict

RFC-0002 should propose the following six decisions. Four track the industry convention; two deliberately diverge because Wittgenstein is a harness, not an LLM-chat CLI.

1. **Adopt `--json` as the canonical machine-output flag on every modality command and on `doctor`.** When `--json` is set, stdout is a single canonical JSON object (or NDJSON for multi-phase runs) containing `{manifest_path, artifact_path, artifact_sha256, run_id, seed, git_sha, duration_ms, ...}`; everything else (progress, warnings, model chatter) goes to stderr. Without `--json`, stdout auto-detects TTY and pretty-prints. This is the `gh` contract (GitHub, 2025) and it is non-negotiable if A/B sweeps are to work.

2. **Document and enforce the config resolution order: `CLI flag > env var > project config (./wittgenstein.config.ts or .json) > user config (~/.wittgenstein/config.json) > built-in defaults`.** Copy npm's order verbatim (npm, 2024); add a test that inverts each pair and asserts the correct one wins. `doctor` should print which layer each effective value came from.

3. **Keep `wittgenstein <modality> <prompt>` as the primary shape; do _not_ collapse to `wittgenstein run --modality=...`.** The noun-first pattern is the clearest part of today's CLI and matches `gh`. Do add a power-user `wittgenstein run --manifest <path>` that replays a previous RunManifest byte-for-byte — this is the A/B-sweep primitive.

4. **Ship a `wittgenstein doctor` that tests, a separate read-only `wittgenstein config show` that inspects.** Copy the Claude Code `/doctor` vs `/status` split (Anthropic, 2026). `doctor` exits nonzero on failure with a list of actionable fixes; `config show` prints effective config with provenance.

5. **Add a uniform `wittgenstein auth <provider> [login|status|logout]` surface and deprecate `minimax-key`.** Model it on `gh auth` (GitHub, 2025) and `kimi login` (Moonshot, 2025). Keep env-var fallback for CI (`MOONSHOT_API_KEY`, etc.), but make `wittgenstein auth status --json` the canonical inspection path. The current `minimax-key` command should be a thin alias that prints a deprecation warning.

6. **Make the install one-liner `npx @wittgenstein/cli doctor`, and make that command do something useful with zero config.** `npx @wittgenstein/cli doctor` should, with no API key and no config file, report which codecs are usable in dry-run mode, which need a provider key, and which need system tools (ffmpeg, afconvert). Cursor's `curl | bash` (Cursor, 2025) is the speed benchmark; `npx` gets us most of the way there without a custom install script.

Two deliberate divergences from the 2025-class AI CLI template.

- **No interactive REPL as the primary interface, and no slash-commands.** Claude Code, Cursor, Gemini, Kimi all centre a REPL. Wittgenstein should not. The harness thesis is that the LLM is one stage in a pipeline, not the user-facing surface; a REPL pulls towards chat-app framing and away from pipeline framing. Keep `wittgenstein` as a one-shot command with structured output. If an interactive surface is ever needed, it should be a separate binary (`wittgenstein-repl`) with an explicit "this is the toy version" label.

- **No `--model` override on modality commands by default.** The chat CLIs all expose `--model` because their primary job is LLM-as-service. Wittgenstein's primary job is a specific codec producing a specific artifact; the model is an internal implementation detail of the harness, and exposing it at the CLI invites users to swap it in ways that invalidate the codec's guarantees. Instead, expose `--provider <name>` (choose which configured provider) and let the provider's config pin the model. Power users who need fine-grained model control can set `WITTGENSTEIN_LLM_MODEL=...` in env; the precedence rule from (2) means that still works. This is a divergence from Gemini / Claude Code / Kimi and it is defensible because we are a harness, not a chat service.

Net: six decisions to write into RFC-0002, two of which are industry-standard, two of which are industry-standard-with-Wittgenstein-shape (config order with provenance-aware `doctor`, noun-first with `--manifest` replay), and two of which are deliberate divergences from chat-CLI framing. The current CLI is about 70% of the way to the bar the 2025-class AI CLIs have set; the remaining 30% is mostly the output contract and the config precedence, and both are cheap to fix. For M2, the audio-specific CLI / SDK audit below should be read as an addendum rather than a counter-proposal — it refines the route-level UX, not the top-level CLI doctrine. — research, 2026-04-23.

## Audio addendum (M2)

This addendum exists because M2 audio needs a narrower survey than the main CLI doctrine brief. The top-level question of Brief D is “what should `wittgenstein` look like?” The M2 question is “what should an audio route inherit from existing speech / transcription / hosted-audio tools, and what should it deliberately refuse?”

### Piper

`piper` is the cleanest local-TTS CLI in the set because it is brutally explicit: model path, config path, text input, output path. It does not pretend to be a chat tool or a hosted SDK. The important transferable conventions are that synthesis is file-first, flags are narrow, and the output artifact is the primary unit. What does **not** transfer is Piper's willingness to let the voice/model choice dominate the user-facing surface. In Wittgenstein, the user asks for a speech artifact; the specific decoder family sits underneath the codec boundary.

### Coqui TTS / `tts`

Coqui's `tts` CLI shows the opposite extreme: many flags, many synthesis modes, several voice / speaker / language switches, and a surface that is great for research but noisy for a harness. What transfers is the separation between “synthesis request” and “speaker / model configuration,” plus the ability to write directly to a file path. What does not transfer is exposing the full model zoo or a long tail of decoder-specific flags on the primary modality command.

### Whisper / speech tooling CLIs

Whisper-style CLIs are useful here not because Wittgenstein is a transcription tool, but because they establish good audio-I/O habits: explicit input file, explicit output format, explicit language or auto-detect, and a machine-readable mode when results need piping. The part worth borrowing is the contract that audio tooling should say exactly what file it consumed and what file it emitted. The part to avoid is turning every audio modality command into a generic speech-lab interface with dozens of transcription-oriented toggles.

### OpenAI Audio API

The OpenAI Audio API represents the hosted-SDK shape: programmatic, model-first, and explicit about whether output is a stream or a file. Its useful lesson for Wittgenstein is not “copy the model flag,” but “make structured output and binary output mutually explicit.” When a route produces a file, the caller should never have to infer whether stdout contains bytes, JSON, or logs. The hosted API also normalizes the idea that voice/model selection is configuration, not usually the first user concern.

### ElevenLabs SDK / CLI patterns

ElevenLabs is the strongest reminder that premium speech UX often grows around hosted features that are structurally incompatible with our doctrine: mutable voices, account-scoped assets, cloud-side caching, and nontrivial vendor state. That makes it bad architectural prior art for the core path, but still useful negative prior art. The main thing to borrow is the user expectation that “speech” is a route with explicit output control and predictable latency reporting. The things to reject are vendor-bound voice management and any CLI that makes account state the hidden center of the workflow.

### Keep / change / borrow table

| Tool / family                  | Keep                                                                | Change                                                                  | Borrow                                                                        |
| ------------------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Piper                          | File-first local synthesis and explicit output path                 | Do not expose decoder identity as the primary user surface              | Minimal local-TTS CLI posture for the `speech` route                          |
| Coqui TTS                      | Separation between synthesis request and decoder config             | Avoid surfacing research-zoo flags on `wittgenstein tts`                | Keep decoder choice in config / provider layer, not modality command          |
| Whisper-style CLIs             | Explicit audio input/output contracts and machine-readable mode     | Do not import transcription-specific option sprawl                      | Strong binary-vs-JSON output discipline for audio tooling                     |
| OpenAI Audio API               | Explicit stream/file distinction and structured result shape        | Do not expose model-first semantics as the default UX                   | Clear stdout contract and route-level latency / metadata reporting            |
| ElevenLabs-style hosted speech | User expectation of polished speech output and explicit file result | Reject account-centric / mutable cloud asset workflows in the core path | Negative prior art for what the on-device deterministic route must not become |

## References

- Anthropic (April 2026). "Scaling Managed Agents: Decoupling the brain from the hands." https://www.anthropic.com/engineering/managed-agents
- Anthropic (2026). "Claude Code CLI Reference." https://code.claude.com/docs/en/cli-reference
- Cursor (2025–2026). "Cursor CLI." https://cursor.com/cli and https://cursor.com/docs/cli/overview
- GitHub (2025). "gh Manual." https://cli.github.com/manual/ ; `gh auth status` https://cli.github.com/manual/gh_auth_status
- Google (2025). "Gemini CLI Reference." https://geminicli.com/docs/reference/commands/ ; repo https://github.com/google-gemini/gemini-cli
- Horthy, D. / HumanLayer (2025). "12-Factor Agents." https://github.com/humanlayer/12-factor-agents and https://www.humanlayer.dev/12-factor-agents
- LangChain (2024–2025). "LangChain CLI." https://python.langchain.com/docs/langserve/
- METR (2024). "An update on our general capability evaluations." https://metr.org/blog/2024-08-06-update-on-evaluations/
- Moonshot AI (2025). "Kimi Code CLI." https://github.com/MoonshotAI/kimi-cli and https://moonshotai.github.io/kimi-cli/en/reference/kimi-command.html
- npm / npm Inc. (2024). "npm-config." https://docs.npmjs.com/cli/v11/using-npm/config/
- OpenAI (2025). "Codex CLI Reference." https://developers.openai.com/codex/cli/reference ; "Agents SDK." https://openai.github.io/openai-agents-python/
- Wittgenstein repo (2026). `packages/cli/src/commands/*.ts`, `packages/cli/README.md`, `docs/quickstart.md`.
