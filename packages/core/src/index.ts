/**
 * Public consumer surface for `@wittgenstein/core` (Issue #365).
 *
 * What ships:
 *   - `Wittgenstein` — the harness class consumers run requests through.
 *   - `loadWittgensteinConfig` — the config loader CLI / consumers call.
 *   - `codecV2` — the experimental v2 codec protocol namespace.
 *   - Types needed to type `Wittgenstein.run`'s call site.
 *
 * What does NOT ship (intentionally not re-exported here):
 *   - Runtime internals: `CodecRegistry`, `BudgetTracker`, retry / seed /
 *     telemetry helpers. These live under `./runtime/` and are reachable via
 *     deep imports for tests + internal wiring, but they are not the consumer
 *     surface.
 *   - LLM adapter implementations: `OpenAICompatibleLlmAdapter`,
 *     `AnthropicLlmAdapter`. Consumers should configure adapters via
 *     `loadWittgensteinConfig` and let the harness wire them.
 *   - V1-codec helpers (`injectSchemaPreamble`, schema validators) — these
 *     are v1-pipeline compatibility scaffolding that retires with #300.
 *   - The `./codecs/*` registration helpers — those are harness wiring.
 *
 * If a consumer needs an internal, deep-import from the package's source
 * path — but be aware those imports are unstable and not covered by semver.
 */
export { Wittgenstein } from "./runtime/harness.js";
export type {
  HarnessOutcome,
  HarnessRunOptions,
  WittgensteinOptions,
} from "./runtime/harness.js";
export { loadWittgensteinConfig } from "./runtime/config.js";

/**
 * Codec Protocol v2 (experimental, M0). Surfaced under a namespace to avoid
 * shadowing v1 names that consumers may have grandfathered. See
 * `docs/rfcs/0001-codec-protocol-v2.md`.
 */
export { codecV2 } from "@wittgenstein/schemas";
