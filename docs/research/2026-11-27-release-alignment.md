# Release alignment and installed-package qualification — 2026-11-27

This engineering receipt accompanies [#741](https://github.com/p-to-q/wittgenstein/issues/741).
The source candidate is `0.3.0-alpha.4`. Public npm and GitHub publication remain
pending an authorized npm publisher; no historical version/tag is replaced.

## Confirmed failures and bounded repairs

The public distribution is `wittgenstein-cli`. Before this repair, the root and
GitHub prerelease were `0.3.0-alpha.3`, the workspace CLI and runtime version were
`0.1.0`, and npm exposed `0.1.0` and `0.2.0-alpha.2` with only `latest: 0.1.0`.
The scoped workspace package is not the public install target.

Root, CLI package, generated public package, packed executable and intended tag
now have a checked version identity. Public package metadata binds the source
commit, lockfile SHA-256 and dirty state. The release helper records the packed
SHA-512 integrity, checks the public registry before GitHub publication, and uses
`next` for this alpha while retaining the stable `latest` channel. Missing or
conflicting public versions, bytes, channels and dirty/stale source are refusals.

The first independent tarball install found a second, tightly coupled defect:
`--version` worked, but `doctor` exited 1 with `ERR_INVALID_ARG_VALUE` because
CommonJS bundling erased `import.meta.url`. The bundle now supplies the actual
bundle file URL. Two standalone regressions exercise both an unresolved optional
ONNX peer and one resolved relative to the installed bundle. The packed release
check and CI now run `doctor` too. This probes resolution only; a test stub is
not a functional ONNX engine or decoder qualification.

## Local evidence

Local receipts live under `artifacts/runs/20261127-release-alignment/`:

| Receipt                           | Meaning                                                                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `qualified/receipt.json`          | Initial clean `433eeee9a71f6ed55fc8c5066fe7728f1feda56e` source checks; did not catch installed doctor failure          |
| `consumer-branch/receipt.json`    | Actual installed-package doctor failure on that candidate                                                               |
| `consumer-fix-test.log`           | First regression fixture failed because the ESM fixture exposed an ancestor dependency and macOS canonicalized its path |
| `consumer-fix-test-corrected.log` | Eleven runtime-provenance tests passed after isolating peer resolution and using real paths                             |
| `consumer-fixed/receipt.json`     | Probe expectation failure: sensor HTML hash depends on output basename                                                  |
| `consumer-fixed-v2/receipt.json`  | Corrected reviewer-bench convention: five hashes and two replay round-trips pass after offline tarball installation     |
| `qualified-final/receipt.json`    | Final committed candidate checks, packed doctor and identical repeated tarball integrity                                |
| `main-final/receipt.json`         | Exact merged-main requalification, generated after merge                                                                |
| `consumer-main/receipt.json`      | Separate offline install of the final merged-main tarball                                                               |
| `public-check.json`               | Expected refusal while the public candidate version is absent                                                           |

Receipts include actual source hashes, commands and exits. A referenced final
receipt is evidence only when it exists and records success. Generated tarballs
are source-bound: merging changes the embedded commit and requires rebuilding.
Local artifact directories are ignored and are not an off-machine backup.

The pre-release main `07a2e9702e7b8ec68fc1f541966fe417696e367a` passed frozen
install, build, typecheck, lint, package tests, goldens, reviewer bench and
172 CPU training checks with zero skips. The release regressions add 14 focused
version/provenance/registry checks. Existing optional package-test skips remain
reported as skips. These lanes overlap and must not be added into a single
independent-test total.

## Public completion gate and remaining scope

The current npm account authenticates but is absent from the package's writable
collaborator roster. Publication therefore requires an authorized publisher;
credentials must not be pasted into an issue or chat. The
[candidate handoff](../release/0.3.0-alpha.4-candidate.md) gives the exact commands
and npm/GitHub readback requirements. Keep #741 open until those public receipts
exist. A local install, draft or successful Vercel deployment does not close it.

GitHub Actions availability/enforcement remains tracked in #661. A skipped
CodeRabbit check is not independent approval. Research/weight/corpus gates
#400/#402, M1B validation and target-machine GPU acceptance remain distinct;
no paid inference, model download, GPU training or empirical image-quality claim
was performed for this packaging repair. Proposed governance PR #711 and
research-design PR #720 still require independent review.
