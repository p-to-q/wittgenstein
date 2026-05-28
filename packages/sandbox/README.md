# @wittgenstein/sandbox

Reserved execution boundary for untrusted or capability-scoped programs.

## Why it exists

The scaffold does not need a real sandbox today, but the repo reserves a stable package and API for future codecs that may need to execute generated Python, DSP snippets, or other untrusted code behind an explicit boundary.

## Stability Promise

- `execProgram()` is the public seam.
- The current implementation throws a `NotImplementedError`-style failure on purpose.
- Future versions may swap the backend implementation without changing the call shape.

Reserved boundary for untrusted-code execution.

## Why this package exists today

No current codec needs to run arbitrary user/LLM-emitted code. But future codec routes (Python-backed DSP for audio, LLM-emitted drawing programs, symbolic-music synthesis) will. This package reserves the interface now so those routes have a single, reviewed place to integrate.

## Stability guarantee

The `execProgram(code, options): Promise<ExecResult>` signature is stable. Implementations may be swapped (subprocess, Deno permissions, Firecracker, etc.) without changing the contract.

## Not implemented

Calling `execProgram` throws. A real implementation must enforce timeout, memory cap, network isolation, and filesystem scope.
