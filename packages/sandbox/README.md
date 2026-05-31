# @wittgenstein/sandbox

Reserved execution boundary for untrusted or capability-scoped programs.

## Why it exists

The scaffold does not need a real production sandbox today, but the repo reserves a
stable package and API for future codecs that may need to execute generated Python, DSP
snippets, or other untrusted code behind an explicit boundary.

## Stability Promise

- `execProgram()` is the public seam.
- The current implementation throws a typed `NotImplementedError` on purpose.
- The error carries `code = "SANDBOX_NOT_IMPLEMENTED"` and
  `details.kind = "production_sandbox_not_implemented"` so callers can write manifest
  failures without string parsing.
- Future versions may swap the backend implementation without changing the call shape.

## ADR-0016 contract

ADR-0016 locks this package as the production-path entrypoint for untrusted-code
execution. Until a production backend lands, callers must propagate the typed hard
failure and must not fall back to the research-grade `polyglot-mini` subprocess sandbox.

A real implementation must enforce timeout, memory cap, network isolation, and filesystem
scope against one of the ADR-named mechanisms (`nsjail`, `bubblewrap`, Pyodide/WASM, or a
documented peer mechanism).
