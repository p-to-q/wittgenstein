import { describe, expect, it } from "vitest";
import {
  BaseCodec,
  CodecPhase,
  createRunSidecar,
  isHybridIR,
  isLatentIR,
  isTextIR,
  type BaseArtifact,
  type Codec,
  type HarnessCtx,
  type IR,
  type ManifestRow,
  type Route,
  type StandardSchemaV1,
} from "../src/codec/v2/index.js";

/**
 * Smoke tests for codec v2 protocol types (M0, @experimental).
 *
 * Goal: prove the surface composes — a tiny in-memory `EchoCodec` can satisfy
 * `Codec<Req, Art>`, the four-stage `produce()` runs in order, and sidecar
 * warnings fold into `Art.metadata.warnings` exactly once.
 *
 * Goal NOT covered: any real LLM, filesystem, or harness wiring. M1A lands those.
 */

interface EchoReq {
  prompt: string;
}

interface EchoArt extends BaseArtifact {
  text: string;
}

const echoSchema: StandardSchemaV1<unknown, EchoReq> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (value) => {
      if (
        typeof value === "object" &&
        value !== null &&
        "prompt" in value &&
        typeof (value as { prompt: unknown }).prompt === "string"
      ) {
        return { value: value as EchoReq };
      }
      return { issues: [{ message: "expected { prompt: string }" }] };
    },
  },
};

class EchoCodec extends BaseCodec<EchoReq, EchoArt> {
  readonly id = "echo";
  readonly modality = "image" as const;
  readonly schema = echoSchema;
  readonly routes: ReadonlyArray<Route<EchoReq>> = [{ id: "default", match: () => true }];

  protected override async expand(req: EchoReq): Promise<IR> {
    return { kind: "text", text: req.prompt };
  }

  protected override async adapt(ir: IR): Promise<IR> {
    return ir;
  }

  protected override async decode(ir: IR, ctx: HarnessCtx): Promise<EchoArt> {
    if (!isTextIR(ir)) {
      throw new Error("EchoCodec only handles TextIR");
    }
    ctx.sidecar.warnings.push({
      code: "echo/decoded",
      message: "decoded text echo",
      phase: CodecPhase.Decode,
    });
    return {
      text: ir.text,
      metadata: {
        codec: this.id,
        route: "default",
        warnings: [],
      },
    };
  }

  manifestRows(art: EchoArt): ReadonlyArray<ManifestRow> {
    return [{ key: "echo.text", value: art.text }];
  }
}

const makeCtx = (): HarnessCtx => {
  const sidecar = createRunSidecar();
  const ctx: HarnessCtx = {
    runId: "run-1",
    parentRunId: null,
    runDir: "/tmp/run-1",
    seed: null,
    outPath: "/tmp/run-1/out",
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    clock: {
      now: () => 0,
      iso: () => "1970-01-01T00:00:00.000Z",
    },
    sidecar,
    fork: (childRunId) => ({ ...ctx, runId: childRunId, parentRunId: ctx.runId }),
  };
  return ctx;
};

describe("codec v2 protocol surface", () => {
  it("BaseCodec.produce runs expand→adapt→decode→package and folds sidecar warnings", async () => {
    const codec: Codec<EchoReq, EchoArt> = new EchoCodec();
    const ctx = makeCtx();

    const art = await codec.produce({ prompt: "hello" }, ctx);

    expect(art.text).toBe("hello");
    expect(art.metadata.codec).toBe("echo");
    expect(art.metadata.warnings).toHaveLength(1);
    expect(art.metadata.warnings[0]?.code).toBe("echo/decoded");
    expect(art.metadata.warnings[0]?.phase).toBe(CodecPhase.Decode);
  });

  it("schema validates good and rejects bad input", async () => {
    const result = await echoSchema["~standard"].validate({ prompt: "ok" });
    expect("value" in result && result.value.prompt).toBe("ok");

    const bad = await echoSchema["~standard"].validate({ prompt: 7 });
    expect("issues" in bad && bad.issues.length).toBeGreaterThan(0);
  });

  it("manifestRows returns codec-authored rows", () => {
    const codec = new EchoCodec();
    const rows = codec.manifestRows({
      text: "hi",
      metadata: { codec: "echo", warnings: [] },
    });
    expect(rows).toEqual([{ key: "echo.text", value: "hi" }]);
  });

  it("IR type guards narrow the sum type", () => {
    const t: IR = { kind: "text", text: "x" };
    const l: IR = { kind: "latent", latent: {} };
    const h: IR = { kind: "hybrid", text: "x", latent: {} };
    expect(isTextIR(t)).toBe(true);
    expect(isLatentIR(l)).toBe(true);
    expect(isHybridIR(h)).toBe(true);
    expect(isTextIR(l)).toBe(false);
  });

  it("HarnessCtx.fork derives parentRunId", () => {
    const ctx = makeCtx();
    const child = ctx.fork("run-2");
    expect(child.runId).toBe("run-2");
    expect(child.parentRunId).toBe("run-1");
  });
});
