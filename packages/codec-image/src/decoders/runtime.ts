// Runtime-tier dynamic loading for image decoder bridges.
//
// Per the delivery doctrine
// (docs/research/2026-05-13-delivery-and-componentization.md §"Optional/peer
// dependencies for runtimes"), heavy inference runtimes (onnxruntime-node,
// GPU bindings) MUST NOT land in a Tier 0 user's install footprint. They are
// declared in this package's `peerDependenciesMeta` as `optional: true` so
// `pnpm install @wittgenstein/cli` against a clean machine pulls zero
// ONNX bytes.
//
// When a future bridge impl (Issue #402) needs the runtime, it calls
// `ensureOnnxRuntime()` here. The helper turns the dynamic-import failure
// into a typed `WittgensteinError` with `code: "DECODER_RUNTIME_UNAVAILABLE"`
// that points the user at the install CLI (Issue #403), instead of leaking
// Node's confusing `ERR_MODULE_NOT_FOUND` to the surface.
//
// The contract:
//   - Bridges call `ensureOnnxRuntime()` at load time, BEFORE building any
//     inference session.
//   - On success: returns the imported module. On failure: throws
//     `DECODER_RUNTIME_UNAVAILABLE` with structured details. Never returns
//     a partial or stub runtime.
//   - The helper is intentionally typed against the structural surface
//     bridges actually use, not against `onnxruntime-node`'s full types,
//     so the package can compile cleanly without the peer installed.
import { z } from "zod";
import { CLOSED_TRACKERS } from "@wittgenstein/schemas";

/**
 * The minimal structural surface a bridge needs from `onnxruntime-node`.
 * Extending this means the bridge can use the new symbol — but the helper
 * compiles without the peer installed because the types are local.
 */
export interface OnnxRuntime {
  readonly InferenceSession: {
    readonly create: (path: string | Uint8Array, options?: unknown) => Promise<unknown>;
  };
  readonly Tensor: new (type: string, data: ArrayLike<number>, dims: readonly number[]) => unknown;
}

export interface RuntimeUnavailableDetails {
  readonly runtime: "onnxruntime-node";
  readonly tier: "image" | "audio" | "video" | "sensor";
  readonly installHint: string;
  readonly cause: string;
  readonly tracker: string;
}

export const RuntimeUnavailableDetailsSchema = z.object({
  runtime: z.literal("onnxruntime-node"),
  tier: z.enum(["image", "audio", "video", "sensor"]),
  installHint: z.string().min(1),
  cause: z.string(),
  tracker: z.string().url(),
}) satisfies z.ZodType<RuntimeUnavailableDetails>;

export class WittgensteinRuntimeUnavailableError extends Error {
  readonly code = "DECODER_RUNTIME_UNAVAILABLE";
  readonly details: RuntimeUnavailableDetails;

  constructor(message: string, details: RuntimeUnavailableDetails) {
    super(message);
    this.name = "WittgensteinError";
    this.details = RuntimeUnavailableDetailsSchema.parse(details);
  }
}

/**
 * Load `onnxruntime-node` and return its module. Throws a structured
 * `DECODER_RUNTIME_UNAVAILABLE` if the peer isn't installed.
 *
 * The dynamic-import-from-variable shape (`new Function('return import(...)')`
 * pattern) keeps the TypeScript compiler from resolving the module at type
 * level — the package compiles whether or not `onnxruntime-node` is on the
 * disk.
 */
export async function ensureOnnxRuntime(): Promise<OnnxRuntime> {
  const moduleId = "onnxruntime-node";
  try {
    const dynamicImport = new Function("id", "return import(id)") as (
      id: string,
    ) => Promise<OnnxRuntime>;
    return await dynamicImport(moduleId);
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new WittgensteinRuntimeUnavailableError(
      "Image decoder runtime `onnxruntime-node` is not installed. Install the image tier " +
        "with `wittgenstein install image` (or `npm install onnxruntime-node`) and retry.",
      {
        runtime: "onnxruntime-node",
        tier: "image",
        installHint: "wittgenstein install image",
        cause,
        tracker: CLOSED_TRACKERS.onnxRuntimeOptionalPeer,
      },
    );
  }
}
