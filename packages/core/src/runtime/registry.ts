import type { Modality, WittgensteinCodec, codecV2 } from "@wittgenstein/schemas";
import { ModalitySchema } from "@wittgenstein/schemas";
import { WittgensteinError } from "./errors.js";

export type AnyCodec =
  | WittgensteinCodec<unknown, unknown>
  | codecV2.Codec<unknown, codecV2.BaseArtifact>;

/**
 * `register()` accepts a union of v1 and v2 codec shapes and stores them in a
 * single map. The union cast is unavoidable (v1 has `parse`/`render`; v2 has
 * `produce`/`manifestRows`), but without runtime validation an author can land
 * a malformed codec — wrong modality string, missing `produce()` on a v2
 * codec, etc. — and the failure surfaces only deep inside the harness at use
 * time (Issue #344). The guard below catches the problem at registration.
 */
export class CodecRegistry {
  private readonly codecs = new Map<Modality, AnyCodec>();

  public register<Req, Parsed, Art extends codecV2.BaseArtifact>(
    codec: WittgensteinCodec<Req, Parsed> | codecV2.Codec<Req, Art>,
  ): this {
    validateCodecShape(codec);
    this.codecs.set(codec.modality, codec as unknown as AnyCodec);
    return this;
  }

  public get(modality: Modality): AnyCodec | undefined {
    return this.codecs.get(modality);
  }

  public getOrThrow(modality: Modality): AnyCodec {
    const codec = this.get(modality);

    if (!codec) {
      throw new WittgensteinError(
        "UNKNOWN_MODALITY",
        `No codec registered for modality: ${modality}`,
      );
    }

    return codec;
  }

  public list(): AnyCodec[] {
    return [...this.codecs.values()];
  }
}

function validateCodecShape(codec: unknown): void {
  if (typeof codec !== "object" || codec === null) {
    throw new WittgensteinError(
      "INVALID_CODEC_REGISTRATION",
      "register() requires an object — got a non-object value.",
      { details: { receivedType: typeof codec } },
    );
  }

  const candidate = codec as Record<string, unknown>;

  if (typeof candidate.modality !== "string") {
    throw new WittgensteinError(
      "INVALID_CODEC_REGISTRATION",
      "Codec is missing a string `modality` field.",
      { details: { codec: identifyCodec(candidate) } },
    );
  }

  const modalityCheck = ModalitySchema.safeParse(candidate.modality);
  if (!modalityCheck.success) {
    throw new WittgensteinError(
      "INVALID_CODEC_REGISTRATION",
      `Codec declares unknown modality "${candidate.modality}". Allowed: ${ModalitySchema.options.join(", ")}.`,
      { details: { codec: identifyCodec(candidate), modality: candidate.modality } },
    );
  }

  // Same predicate the harness uses on read (`isV2Codec`): v2 codecs have a
  // `produce()` method. v1 codecs don't, and must instead expose `parse` +
  // `render`. Mismatched methods signal a malformed codec.
  const hasProduce = typeof candidate.produce === "function";
  if (hasProduce) {
    if (typeof candidate.manifestRows !== "function") {
      throw new WittgensteinError(
        "INVALID_CODEC_REGISTRATION",
        "v2 codec (has `produce`) is missing required method `manifestRows`.",
        { details: { codec: identifyCodec(candidate) } },
      );
    }
  } else {
    if (typeof candidate.parse !== "function") {
      throw new WittgensteinError(
        "INVALID_CODEC_REGISTRATION",
        "v1 codec (no `produce`) is missing required method `parse`.",
        { details: { codec: identifyCodec(candidate) } },
      );
    }
    if (typeof candidate.render !== "function") {
      throw new WittgensteinError(
        "INVALID_CODEC_REGISTRATION",
        "v1 codec (no `produce`) is missing required method `render`.",
        { details: { codec: identifyCodec(candidate) } },
      );
    }
  }
}

function identifyCodec(candidate: Record<string, unknown>): string {
  if (typeof candidate.id === "string") return candidate.id;
  if (typeof candidate.name === "string") return candidate.name;
  return "<unnamed>";
}
