import type { AudioRenderManifest, codecV2 } from "@wittgenstein/schemas";
import type { AudioPlan } from "./schema.js";

export type AudioRoute = "speech" | "soundscape" | "music";

export interface AudioArtifactMetadata extends codecV2.BaseArtifactMetadata {
  readonly codec: "audio";
  readonly route: AudioRoute;
  warnings: codecV2.CodecWarning[];
  readonly llmTokens: { input: number; output: number };
  readonly costUsd: number;
  readonly durationMs: number;
  readonly seed: number | null;
  readonly promptExpanded: string | null;
  readonly llmOutputRaw: string | null;
  readonly llmOutputParsed: AudioPlan | null;
  readonly quality: {
    readonly structural: {
      readonly schemaValidated: boolean;
      readonly route: AudioRoute;
      readonly determinismClass: "byte-parity" | "structural-parity";
    };
    readonly partial: {
      readonly reason: "procedural-runtime" | "kokoro-cross-platform-pending";
    };
  };
  readonly audioRender: AudioRenderManifest;
  readonly decoderHash: {
    readonly value: string;
    readonly frozen: true;
    readonly slot: "Kokoro-82M-family-decoder" | "procedural-audio-runtime";
  };
  artifactSha256: string | null;
}

export interface AudioArtifact extends codecV2.BaseArtifact {
  readonly outPath: string;
  bytes?: Uint8Array;
  readonly mime: "audio/wav";
  readonly metadata: AudioArtifactMetadata;
}
