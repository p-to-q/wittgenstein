// Named tracker-URL constants for receipt fields, error details, and doctor
// surface output. Centralized here so:
//
//   1. The repo can move orgs (it has — see #83 `org-rename-p-to-q`) without
//      a fan-out string-literal hunt across packages.
//   2. Future maintainers reading a stale receipt know what the link *means*
//      from the constant name, not from clicking through to discover the
//      issue's intent.
//   3. New runtime call sites importing one of these constants accept the
//      canonical URL shape (no typos, no missing slashes, no protocol
//      variants).
//
// Convention:
//
//   - Active blockers / pending-work trackers go in `TRACKERS`.
//   - Closed-but-referenced trackers (kept in code as provenance for a
//     decision the runtime still enforces) go in `CLOSED_TRACKERS` with a
//     comment naming the closing PR or successor issue.
//
// Names describe *intent*, not issue number. A future renumber or org move
// touches one line per tracker.
//
// Surfaced + landed by the 2026-05-27 pre-training audit follow-up
// (#487 item 2).

const REPO_ISSUES = "https://github.com/p-to-q/wittgenstein/issues" as const;

function issueUrl(n: number): string {
  return `${REPO_ISSUES}/${n}`;
}

/**
 * Active trackers — pending work, open issues. Runtime emits these in
 * `details.tracker`, `details.umbrella`, etc. so an operator hitting a
 * structured error can click through to the right discussion.
 */
export const TRACKERS = {
  /** M1B umbrella — image trained projector blocker. */
  m1bImageDecoderUmbrella: issueUrl(283),
  /** VQGAN-class Gate C (deterministic encode/decode round-trip). */
  m1bGateCDeterminism: issueUrl(334),
  /** VQGAN-class Gate D (ONNX export + CPU decode feasibility). */
  m1bGateDOnnxCpu: issueUrl(335),
  /** OpenMAGVIT2 per-candidate four-gate audit; Gate A/B cleared, empirical C/D remain. */
  m1bOpenMagvit2Audit: issueUrl(331),
  /** Decoder-delivery decision: lazy weight fetch + sha256 verify. */
  decoderDeliveryDecision: issueUrl(402),
  /** `wittgenstein install <tier>` CLI + doctor tier readiness. */
  installTierCli: issueUrl(403),
} as const;

/**
 * Closed trackers — preserved in code because the runtime references them
 * as the provenance for a still-live invariant (ADR enforcement, peer-dep
 * contract). The constant keeps the link working; the comment names the
 * closing PR or successor so a maintainer can trace the chain.
 */
export const CLOSED_TRACKERS = {
  /** ADR-0020 implementation; closed 2026-05-26 (already shipped). */
  adr0020Implementation: issueUrl(376),
  /** Optional/peer-dep declarations for heavy runtimes; closed via #409. */
  onnxRuntimeOptionalPeer: issueUrl(404),
  /** puppeteer-core optional peer; closed via #488 (the consolidation PR). */
  puppeteerCoreOptionalPeer: issueUrl(464),
} as const;

export type TrackerKey = keyof typeof TRACKERS;
export type ClosedTrackerKey = keyof typeof CLOSED_TRACKERS;
