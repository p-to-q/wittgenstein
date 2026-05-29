# M1B image failure receipts

Status: draft taxonomy  
Last reviewed: 2026-05-28

## Purpose

Failures should become durable receipts, not silent fallback or hidden retry.

## Required questions

Every failure receipt should answer:

- What was requested?
- Which tier was requested?
- Which component failed?
- Was fallback allowed?
- What error happened?
- Which source/weights/runtime were involved?
- Was an artifact written?
- Was a manifest written?

## Failure classes

### VSC emission failure

Examples: invalid JSON, schema-invalid VSC, unsupported seed shape, token out of range, Semantic IR/VSC disagreement.

### Decoder manifest failure

Examples: missing weights sha, invalid license, unsupported runtime tier, missing codebook hash.

### Weight delivery failure

Examples: fetch failed, sha mismatch, corrupted cache, research-only weights refused, offline cache miss.

### Runtime unavailable

Examples: `onnxruntime-node` missing, unsupported platform, incompatible runtime.

### Adapter failure

Examples: shape mismatch, invalid latent, token collapse, learned adapter cannot beat baseline.

### Decoder execution failure

Examples: ONNX inference error, invalid latent range, timeout, memory failure, NaN output.

### Silent fallback attempt

Most important class. Examples:

- real decoder tier requested but placeholder PNG produced;
- bad weights fall back to dry-run;
- missing runtime silently routes to procedural renderer.

Acceptance: silent fallback attempts should fail tests unless fallback is explicitly allowed and recorded in the manifest.

### Lab-only overclaim

Examples:

- cluster-only metric described as local-proven;
- doc-only receipt described as product code;
- DDP smoke described as trained model;
- "M1B complete" after candidate audit only.

## Suggested receipt fields

```json
{
  "kind": "weight_delivery_failure",
  "requestedTier": "real-decoder",
  "bridgeFamily": "llamagen",
  "errorCode": "WEIGHTS_SHA256_MISMATCH",
  "fallbackAllowed": false,
  "fallbackUsed": false,
  "manifestPath": "artifacts/runs/<run-id>/manifest.json"
}
```

## Source anchors

This draft pack was written from a GitHub-only static review on 2026-05-28. Recheck referenced issues/PRs before merge.

- Repository / README: https://github.com/p-to-q/wittgenstein
- README.md: https://github.com/p-to-q/wittgenstein/blob/main/README.md
- CHANGELOG.md: https://github.com/p-to-q/wittgenstein/blob/main/CHANGELOG.md
- docs/implementation-status.md: https://github.com/p-to-q/wittgenstein/blob/main/docs/implementation-status.md
- docs/exec-plans/active/codec-v2-port.md: https://github.com/p-to-q/wittgenstein/blob/main/docs/exec-plans/active/codec-v2-port.md
- Issue #507: https://github.com/p-to-q/wittgenstein/issues/507
- Issue #402: https://github.com/p-to-q/wittgenstein/issues/402
- PR #457: https://github.com/p-to-q/wittgenstein/pull/457
- PR #491: https://github.com/p-to-q/wittgenstein/pull/491
- PR #492: https://github.com/p-to-q/wittgenstein/pull/492
- PR #493: https://github.com/p-to-q/wittgenstein/pull/493
- PR #455: https://github.com/p-to-q/wittgenstein/pull/455
