# M1B closeout ledger

Status: final release-readiness ledger for #507
Last reviewed: 2026-05-31

## Purpose

Map the M1B audit-delivery stack after the May 2026 closeout and prevent
release overclaiming.

This ledger closes the release-readiness umbrella. It is not a decoder-delivery
claim, a trained-tokenizer claim, or an end-to-end M1B image-quality claim.

## Final audit-delivery state

| Lane                              | Final state                                                                                                   | What it proves                                                                                                                                                      | What remains                                                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audit delivery surface            | #457 was superseded by #527, then #528 merged the same delivery surface plus the second CodeRabbit fix round. | Decoder-family manifests, gate audit receipts, preflight, doctor/install visibility, artifact validators, fixtures, and self-check scripts can be reviewed in repo. | Real bridge loading, lazy fetch/cache, license refusal, runtime failure behavior, and sha verification remain #402/#403 delivery work.                                       |
| VQGAN-class Gate C/D evidence     | #491 merged; #334 and #335 closed; parent #329 closed as the VQGAN-class four-gate audit.                     | VQGAN-class clears the audit-plan unblock criterion under the documented structural-parity and ONNX/CPU evidence.                                                   | This is candidate audit clearance, not final product image quality or end-to-end VSC-to-PNG delivery.                                                                        |
| LlamaGen bridge manifest          | #492 merged.                                                                                                  | Candidate provenance, hash, license, and runtime-tier metadata are pinned in a repo-owned manifest.                                                                 | The manifest is not the loader. #402 still owns lazy fetch, cache promotion, sha mismatch handling, and opt-in research-weight policy.                                       |
| Training scaffold                 | #493 merged.                                                                                                  | The training home, manifest spine, and DDP smoke floor exist for owner review.                                                                                      | No trained tokenizer, adapter, dataset acceptance, or releasable weights are claimed. #441/#399/#400 keep owning the training architecture and receipt infrastructure.       |
| Research handoff                  | #455 closed as superseded by #535 and #536.                                                                   | The useful docs slice, radar Gate E, clean-repaint hooks, optional visual-reasoning block, and Phase 0a probe survived as clean PRs.                                | The incompatible dead manifest slice was intentionally dropped in favor of the #493 training manifest spine. Future codec-shape review can target the additive #536 surface. |
| Lab receipt reconciliation        | #474 closed.                                                                                                  | The #491/#492/#528 evidence path was reconciled into issue closures without over-reading it as decoder delivery.                                                    | Gate-policy and blessing semantics that outlive the specific VQGAN receipt stay with #473 and #402.                                                                          |
| Owner/research/governance ledgers | #435, #439, and #440 are closed.                                                                              | Owner routing, post-merge re-audit, and second-pass research backlog all produced bounded successor lanes.                                                          | The successor lanes are concrete issues, not this release-readiness umbrella.                                                                                                |

## Release wording

Safe wording:

- "M1B audit delivery closeout."
- "VQGAN-class candidate cleared the four-gate audit."
- "Decoder manifests, audit receipts, validators, preflight checks, and review
  gates are now in repo."
- "#402/#441/#473 remain open for decoder delivery, training architecture, and
  gate/blessing policy."

Unsafe wording:

- "M1B completed."
- "Wittgenstein ships a working LlamaGen decoder bridge."
- "Image quality is validated end to end."
- "A tokenizer, adapter, or image-emitting model has been trained."
- "Weights are bundled or automatically fetched in the npm package."

## Prerelease criteria outcome

| Criterion from #507                                | Outcome                                                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Audit surface merged or accepted                   | Satisfied by #528, the merged successor to #457/#527.                                                   |
| #491/#492 claims narrowed                          | Satisfied by the #329/#334/#335/#474 closeout chain and the #492 manifest/provenance scope.             |
| #493 fixed or deferred                             | Satisfied by #493 merge after the #514 tooling unblock. It remains a scaffold/smoke claim only.         |
| #455 preserved/sliced/deferred intentionally       | Satisfied by #535/#536 plus the explicit drop of the obsolete manifest subsystem.                       |
| ML-owner review visible                            | Satisfied as routing: #435 closed owner map; #441/#473 remain the open ML/research decision lanes.      |
| #402 implemented or explicitly pending             | Explicitly pending. This ledger says release notes may claim audit delivery only, not decoder delivery. |
| Release notes say audit delivery, not M1B complete | Satisfied here and in `docs/acceptance/m1b-image.md`.                                                   |

## Remaining open gates

Close #507, but keep these lanes visible:

- #402: canonical decoder bridge delivery, lazy weight fetch/cache, sha
  verification, license refusal, runtime errors, and no silent fallback.
- #403: install/doctor tier readiness, parked behind #402.
- #473: Gate C/D threshold policy and manifest-declared blessing rules.
- #441: Phase 1 training-stack architecture and reuse review.
- #399/#400: experiment tracking and DVC/GPU sweep receipt infrastructure.
- #393/#394/#396/#397/#398: actual model, tokenizer, adapter, eval, and
  distillation work.

Non-M1B lanes remain separate:

- #263: sensor operator receipts and measurement gates.
- #476: MP4 cross-machine structural parity and receipt portability.

## Closeout verdict

#507 can close. It has decided the release-readiness question for the current
phase: a future note may be framed as "M1B audit delivery," but not as a
capability release for completed M1B image depth.

Future public release work should happen in a release PR or a narrower
successor issue. Do not reopen #507 for decoder wiring, training, or lab
execution; route those through the concrete gates above.

## Source anchors

- Issue #507: https://github.com/p-to-q/wittgenstein/issues/507
- Issue #402: https://github.com/p-to-q/wittgenstein/issues/402
- Issue #441: https://github.com/p-to-q/wittgenstein/issues/441
- Issue #473: https://github.com/p-to-q/wittgenstein/issues/473
- PR #491: https://github.com/p-to-q/wittgenstein/pull/491
- PR #492: https://github.com/p-to-q/wittgenstein/pull/492
- PR #493: https://github.com/p-to-q/wittgenstein/pull/493
- PR #528: https://github.com/p-to-q/wittgenstein/pull/528
- PR #535: https://github.com/p-to-q/wittgenstein/pull/535
- PR #536: https://github.com/p-to-q/wittgenstein/pull/536
