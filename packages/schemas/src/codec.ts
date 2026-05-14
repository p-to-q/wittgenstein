import { z } from "zod";
import type { Modality } from "./modality.js";

export type Result<T, E = CodecError> = { ok: true; value: T } | { ok: false; error: E };

export interface CodecError {
  code: string;
  message: string;
  cause?: unknown;
  details?: Record<string, unknown>;
}

export interface RenderCtx {
  runId: string;
  runDir: string;
  seed: number | null;
  outPath: string;
  logger: {
    debug: (msg: string, data?: unknown) => void;
    info: (msg: string, data?: unknown) => void;
    warn: (msg: string, data?: unknown) => void;
    error: (msg: string, data?: unknown) => void;
  };
}

import type { CostUsdReason } from "./manifest.js";

export interface RenderSidecar {
  role: string;
  path: string;
  mimeType: string;
  bytes: number;
  sha256: string;
}

export interface RenderResult {
  artifactPath: string;
  mimeType: string;
  bytes: number;
  metadata: {
    codec: string;
    route?: string;
    llmTokens: { input: number; output: number };
    costUsd: number;
    /** Optional rationale aligned with `RunManifest.costUsdReason` (Issue #182). */
    costUsdReason?: CostUsdReason;
    durationMs: number;
    seed: number | null;
    /**
     * Optional artifact bundle members emitted alongside the primary artifact.
     * Sensor uses this to make its JSON / CSV / HTML triple explicit rather
     * than hiding CSV and JSON as undocumented filesystem neighbors.
     */
    sidecars?: RenderSidecar[];
    /**
     * Optional codec-internal path identifier — e.g. for sensor it discriminates
     * `loupe-script` / `loupe-cli` / `fallback-static-html` so the manifest tells
     * the truth about which renderer actually fired (Issue #223).
     */
    renderPath?: string;
  };
}

export const RenderResultSchema = z.object({
  artifactPath: z.string(),
  mimeType: z.string(),
  bytes: z.number().int().nonnegative(),
  metadata: z.object({
    codec: z.string(),
    route: z.string().optional(),
    llmTokens: z.object({
      input: z.number().int().nonnegative(),
      output: z.number().int().nonnegative(),
    }),
    costUsd: z.number().nonnegative(),
    costUsdReason: z.enum(["computed", "unknown-model", "missing-usage", "no-llm-call"]).optional(),
    durationMs: z.number().nonnegative(),
    seed: z.number().int().nullable(),
    sidecars: z
      .array(
        z.object({
          role: z.string(),
          path: z.string(),
          mimeType: z.string(),
          bytes: z.number().int().nonnegative(),
          sha256: z.string(),
        }),
      )
      .optional(),
    renderPath: z.string().optional(),
  }),
});

export interface WittgensteinCodec<Req, Parsed> {
  name: string;
  modality: Modality;
  schemaPreamble: (req: Req) => string;
  requestSchema: z.ZodType<Req, z.ZodTypeDef, unknown>;
  outputSchema: z.ZodType<Parsed, z.ZodTypeDef, unknown>;
  parse: (llmRaw: string) => Result<Parsed>;
  render: (parsed: Parsed, ctx: RenderCtx) => Promise<RenderResult>;
}

export interface CodecMetadata {
  name: string;
  modality: Modality;
  version: string;
  routes?: readonly string[];
}

export const CodecMetadataSchema = z.object({
  name: z.string(),
  modality: z.enum(["image", "audio", "video", "sensor", "svg", "asciipng"]),
  version: z.string(),
  routes: z.array(z.string()).optional(),
});
