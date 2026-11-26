# Runtime package provenance correction — 2026-11-27

Engineering bug fix for #707; no manifest schema or codec contract change.

Previously `collectRuntimeFingerprint(cwd)` read the caller's `package.json`.
An unrelated application could therefore supply Wittgenstein's reported version.
The runtime now reads code-owned package metadata:

- Source and `tsc` output: the private monorepo's root package, resolved relative
  to the loaded runtime module, independently of the caller's working directory.
- Self-contained CommonJS CLI bundle: the CLI distribution's name/version embedded
  at bundle time. The bundle does not need the source checkout or a neighboring
  package file. The existing monorepo and CLI versions are different release
  identities; this correction does not silently unify or bump them.
- Missing, malformed or invalid **own** metadata raises
  `WittgensteinError` with code `RUNTIME_VERSION_INVALID`; it never fabricates
  `0.0.0`. An absent or malformed **caller** package is harmless.

`gitSha` and `lockfileHash` deliberately retain their existing caller-workspace
semantics. This fix establishes package-version identity, not a source hash for
an installed bundle. It makes no new whole-program reproducibility claim.

Regression coverage includes source callers, native compiled ESM with an
isolated package layout (including broken own metadata), and a copied,
self-contained CJS CLI performing real dry-run sensor work from empty,
malformed-package and unrelated-app directories. No network inference or model
training is used. Full local verification logs are under the ignored
`artifacts/runs/20261127-robustness-phase/` directory; those local logs are not
an off-machine archive or a substitute for Linux CI.
