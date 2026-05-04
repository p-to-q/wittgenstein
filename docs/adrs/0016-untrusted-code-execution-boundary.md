# 0016 Untrusted-code execution boundary — research vs production

## Status

Accepted (governance lane per ADR-0014; ratifies the boundary already documented in `SECURITY.md` and the `polyglot-mini/polyglot/sandbox.py` implementation, and locks the `@wittgenstein/sandbox` package as the production-path entrypoint).

## Context

Wittgenstein executes code that a language model emits in two places today:

1. **Structured JSON IR (low-risk).** Scene specs, audio plans, operator specs are validated by zod schemas before any codec sees them. Schema validation is the boundary; malformed or injection-laden JSON is rejected at the edge. This path is not at issue here.

2. **Python painter code (high-risk).** The `polyglot-mini` image path's "code-as-painter" mode lets the LLM emit arbitrary Python, which `polyglot-mini/polyglot/sandbox.py` runs through `subprocess.run` with:
   - a 20-second wall-clock timeout,
   - a pre-injected preamble exposing only `numpy`, `scipy`, `PIL`, `matplotlib`,
   - a path-restricted output via `POLYGLOT_OUT_PATH`.

   It explicitly does **not** provide:
   - kernel-level isolation (no `seccomp`, no namespace separation, no `firejail`/`bubblewrap`/`nsjail` wrapper),
   - filesystem write restrictions beyond the declared output path (the subprocess inherits `os.environ` and the parent's filesystem permissions),
   - network firewalling.

`SECURITY.md` already documents this honestly ("adequate for local development and research; not adequate for multi-tenant production"), but the boundary was not yet locked as doctrine — it lived in narrative prose without a decision record.

The 2026-05-03 staff audit (#103, §3.4) flagged that the line between "research-grade subprocess sandbox" and "production-grade code-execution boundary" needed an ADR so future contributors and downstream operators have a clear rule, not an implicit one.

`packages/sandbox/` exists as a TypeScript package whose `execProgram` currently throws on call (a generic `Error` carrying an explicit `"not implemented"` message; a typed `NotImplementedError` class is an open follow-up nicety, but the load-bearing contract is the throw, not the class) — it is the **reserved boundary** for the production path. ADR-0016 ratifies that reservation rather than implementing the production sandbox itself; production implementation is a separate engineering line whose entry condition is named below.

## Decision

1. **The `polyglot-mini` painter sandbox is research-grade only.** `subprocess + 20s timeout + safe globals` is the documented and accepted shape for local development, demos, and individual-machine research. It is **not** an acceptable shape for any environment that satisfies any of the following:
   - executes painter code on behalf of a user other than the operator,
   - runs on shared / multi-tenant infrastructure,
   - is exposed to the public internet,
   - processes prompts originating outside the operator's trust boundary,
   - requires regulatory containment guarantees (HIPAA, SOC 2, etc.).

   In any of those environments, engaging the painter path is a **hard error**: the tooling must refuse to run rather than fall back to the research-grade sandbox.

2. **The production path is named.** The supported production-grade isolation mechanisms are:
   - **`nsjail`** — Linux seccomp + namespace + cgroups; the canonical pick when the host is Linux and root or `CAP_SYS_ADMIN` is available;
   - **`bubblewrap`** — lighter Linux user-namespace sandbox; used by Flatpak; suitable when only unprivileged sandboxing is feasible;
   - **Pyodide-WASM** — Python compiled to WebAssembly; suitable when the painter must run inside a process the operator does not control (browser, untrusted-host edge runtime).

   Other mechanisms (Firecracker microVMs, gVisor, Docker without seccomp profiles, etc.) are not categorically rejected, but adopting them requires an ADR amendment naming the specific mechanism and its threat-model coverage.

3. **`@wittgenstein/sandbox` is the production-path entrypoint.** The TypeScript package `packages/sandbox/` carries the production-path API surface. Its `execProgram` currently throws on call (the explicit not-implemented contract described in §Context); that is correct and intentional — the package exists so callers have a single, typed seam to depend on, with no silent fallback to the research-grade subprocess sandbox available. When the production sandbox is implemented (against one of the named mechanisms above), it lands inside this package; callers do not change.

4. **Hard-error contract for production engagement.** A future "production mode" flag (CLI, env var, or harness config) must, when set, cause the painter path to:
   - call `@wittgenstein/sandbox`'s `execProgram` and propagate the resulting throw as a structured failure with the manifest entry `error.kind = "production_sandbox_not_implemented"`,
   - **not** fall through to the `polyglot-mini` subprocess sandbox.

   Until the production sandbox lands, this means production deployments of the painter path simply do not run; they fail loudly. Per the manifest-spine invariant, the failure is recorded, not silent.

5. **Manifest evidence of which sandbox ran.** Every painter run writes a manifest field `painter.sandbox` with one of:
   - `"polyglot-mini-subprocess"` (research-grade, current default),
   - `"@wittgenstein/sandbox/<mechanism>"` once the production path lands (e.g. `"@wittgenstein/sandbox/nsjail"`),
   - structured error if neither was engageable.

   This makes "which boundary actually ran" auditable from the manifest alone, not from prose context.

## Consequence

- `SECURITY.md` cites this ADR as the load-bearing doctrine for the research / production boundary; the existing prose is preserved as the inline summary.
- `docs/engineering-discipline.md` carries a short inline paragraph in §"Robustness: Never Hide Errors" naming this boundary as a non-silent-fallback case, citing ADR-0016.
- `packages/sandbox/README.md` already exists; a focused follow-up will tighten its `execProgram` contract description and add an ADR-0016 cite (it currently uses `NotImplementedError`-style wording that predates this ADR).
- Painter-path callers in `polyglot-mini` continue to work as today; nothing in the research-grade path changes.
- Future engineering work on the production sandbox lands inside `packages/sandbox/` against one of the named mechanisms in §Decision 2; the choice of mechanism + its threat-model coverage is its own engineering-lane PR (Brief / RFC / ADR amendment / exec plan / code).
- **Kill criterion:** if a production deployment is attempted before `@wittgenstein/sandbox` is implemented, this ADR's hard-error contract (§Decision 4) trips. That failure is the signal to land the production sandbox, not to weaken the boundary. Reopening this ADR to allow the research-grade subprocess sandbox in production requires explicit doctrine reversal, not a quiet workaround.
