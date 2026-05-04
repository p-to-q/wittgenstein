# Security

## Trust model

Wittgenstein runs code that a language model emits. The threat model is real and
the mitigations are architectural, not best-effort.

### What the LLM can produce

- **Structured JSON IR** (scene spec, audio plan, operator spec) — validated by zod
  schemas before being passed to a codec. Schema validation is the first line of defence;
  malformed or injection-laden JSON is rejected at the boundary.
- **Python painter code** (in `polyglot-mini` image path, code-as-painter mode). This is
  arbitrary Python. It runs inside a sandboxed subprocess with a 20-second wall-clock timeout,
  no network access guarantees, and pre-injected safe globals (PIL, numpy, scipy, matplotlib).
  See `polyglot-mini/polyglot/sandbox.py` for the boundary.

### What the LLM cannot reach

- Files outside `artifacts/` unless a CLI argument explicitly names a different path
- The user's shell environment (LLM output is never piped to `eval` or `exec` in a shell)
- Arbitrary network endpoints (the harness makes HTTPS calls to the configured provider only)
- Other codec packages — each codec is an isolated module with a typed boundary

### Sandbox guarantees (and limits)

The `polyglot-mini` image sandbox uses `subprocess` with a fixed timeout. It does **not**
provide:

- Kernel-level isolation (no `seccomp`, `firejail`, or containerisation by default)
- Filesystem write restrictions beyond the declared `OUT_PATH`
- Network firewalling

If you deploy Wittgenstein in an adversarial environment, run it inside a container or a
`firejail`-style profile. The current sandbox is adequate for local development and
research; it is not adequate for multi-tenant production.

The research-vs-production boundary is locked in
[`docs/adrs/0016-untrusted-code-execution-boundary.md`](docs/adrs/0016-untrusted-code-execution-boundary.md).
The production-path entrypoint is `@wittgenstein/sandbox` (`packages/sandbox/`);
engaging the painter path in any environment that meets ADR-0016 §Decision 1's
"production" criteria must hard-error through that entrypoint rather than silently
fall back to the research-grade subprocess sandbox. Implementing the production
sandbox against `nsjail` / `bubblewrap` / Pyodide-WASM is its own engineering line.

## Reproducibility and the manifest spine

Every run writes `artifacts/runs/<id>/manifest.json` with:

- SHA-256 of the produced artifact
- lockfile hash and git SHA of the code that ran
- full LLM input and output
- seed and token count

This makes supply-chain drift detectable. If a run claims to have produced a specific
artifact, the manifest proves both what the model emitted and what the codec produced.

## Reporting a vulnerability

Please do **not** open a public issue for security concerns.

1. Email: `security@` the domain of the upstream repo owner, or open a private security
   advisory via GitHub's "Report a vulnerability" flow on the repo
2. Include: reproduction steps, affected component (package and path), and impact assessment
3. Expect acknowledgement within 5 business days

If you believe a patch is urgent and upstream is unresponsive, you may open a public issue
after 30 days — but please err on the side of private disclosure first.

## Supported versions

Wittgenstein is pre-1.0. Security fixes target:

- `main` (always)
- the most recent tagged release

Older tags are not patched; upgrade to `main` or the latest release for fixes.

## API keys and secrets

- `.env` is gitignored. Never commit API keys.
- `.env.example` lists required variable names without values.
- The harness reads provider keys from environment variables at runtime — it does not store
  or transmit them outside the configured provider endpoint.
- Manifests redact API keys. They record the provider name and model, not the credential.

## Dependencies

The repo ships with a pinned `pnpm-lock.yaml`. CI installs with `--frozen-lockfile` to
prevent silent upgrades. Dependency audits are advisory today; a CI step will land in a
future phase (see `ROADMAP.md`).
