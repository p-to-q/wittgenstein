import { describe, expect, it } from "vitest";
import { Modality, RenderResultSchema, RunManifestSchema } from "../src/index.js";

describe("@wittgenstein/schemas", () => {
  it("exports the locked modality set", () => {
    expect(Modality.Image).toBe("image");
    expect(Modality.Audio).toBe("audio");
    expect(Modality.Video).toBe("video");
    expect(Modality.Sensor).toBe("sensor");
    expect(Modality.Svg).toBe("svg");
    expect(Modality.Asciipng).toBe("asciipng");
  });

  it("validates render results and manifests", () => {
    expect(
      RenderResultSchema.safeParse({
        artifactPath: "/tmp/out.png",
        mimeType: "image/png",
        bytes: 1,
        metadata: {
          codec: "image",
          llmTokens: { input: 0, output: 0 },
          costUsd: 0,
          durationMs: 0,
          seed: null,
        },
      }).success,
    ).toBe(true);

    expect(
      RunManifestSchema.safeParse({
        runId: "run-1",
        gitSha: null,
        lockfileHash: null,
        nodeVersion: process.version,
        wittgensteinVersion: "0.0.0",
        command: "wittgenstein image",
        args: ["prompt"],
        seed: null,
        codec: "image",
        llmProvider: "openai-compatible",
        llmModel: "gpt-4.1-mini",
        llmTokens: { input: 0, output: 0 },
        costUsd: 0,
        promptRaw: "prompt",
        promptExpanded: "expanded",
        llmOutputRaw: "{}",
        llmOutputParsed: {},
        artifactPath: null,
        artifactSha256: null,
        audioRender: {
          sampleRateHz: 22_050,
          channels: 1,
          durationSec: 2.5,
          container: "wav",
          bitDepth: 16,
          determinismClass: "byte-parity",
          decoderId: "procedural-audio-runtime",
          decoderHash: "sha256-placeholder",
        },
        startedAt: new Date().toISOString(),
        durationMs: 0,
        ok: false,
        error: {
          code: "NOT_IMPLEMENTED",
          message: "NotImplementedError(codec: image)",
        },
      }).success,
    ).toBe(true);
  });

  it("requires artifact evidence on successful manifests", () => {
    const parsed = RunManifestSchema.safeParse({
      runId: "run-success",
      gitSha: "abc123",
      lockfileHash: "def456",
      nodeVersion: process.version,
      wittgensteinVersion: "0.0.0",
      command: "wittgenstein audio",
      args: ["hello"],
      seed: 7,
      codec: "audio",
      route: "speech",
      llmProvider: "anthropic",
      llmModel: "claude-3-5-haiku-20241022",
      llmTokens: { input: 1, output: 2 },
      costUsd: 0,
      promptRaw: "hello",
      promptExpanded: "hello",
      llmOutputRaw: "{}",
      llmOutputParsed: {},
      artifactPath: null,
      artifactSha256: null,
      audioRender: {
        sampleRateHz: 24_000,
        channels: 1,
        durationSec: 1.2,
        container: "wav",
        bitDepth: 32,
        determinismClass: "structural-parity",
        decoderId: "kokoro-82m:test",
      },
      startedAt: new Date().toISOString(),
      durationMs: 10,
      ok: true,
      error: null,
    });

    expect(parsed.success).toBe(false);
  });

  it("requires failed manifests to carry an error payload", () => {
    const parsed = RunManifestSchema.safeParse({
      runId: "run-failure",
      gitSha: "abc123",
      lockfileHash: "def456",
      nodeVersion: process.version,
      wittgensteinVersion: "0.0.0",
      command: "wittgenstein image",
      args: ["prompt"],
      seed: 7,
      codec: "image",
      llmProvider: "openai-compatible",
      llmModel: "gpt-4.1-mini",
      llmTokens: { input: 1, output: 2 },
      costUsd: 0,
      promptRaw: "prompt",
      promptExpanded: "prompt",
      llmOutputRaw: "{}",
      llmOutputParsed: {},
      artifactPath: null,
      artifactSha256: null,
      startedAt: new Date().toISOString(),
      durationMs: 10,
      ok: false,
      error: null,
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects invalid audio routes", () => {
    const parsed = RunManifestSchema.safeParse({
      runId: "run-audio-route",
      gitSha: "abc123",
      lockfileHash: "def456",
      nodeVersion: process.version,
      wittgensteinVersion: "0.0.0",
      command: "wittgenstein audio",
      args: ["hello"],
      seed: 7,
      codec: "audio",
      route: "spech",
      llmProvider: "anthropic",
      llmModel: "claude-3-5-haiku-20241022",
      llmTokens: { input: 1, output: 2 },
      costUsd: 0,
      promptRaw: "hello",
      promptExpanded: "hello",
      llmOutputRaw: "{}",
      llmOutputParsed: {},
      artifactPath: "/tmp/out.wav",
      artifactSha256: "sha256",
      audioRender: {
        sampleRateHz: 24_000,
        channels: 1,
        durationSec: 1.2,
        container: "wav",
        bitDepth: 32,
        determinismClass: "structural-parity",
        decoderId: "kokoro-82m:test",
      },
      startedAt: new Date().toISOString(),
      durationMs: 10,
      ok: true,
      error: null,
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects invalid image routes (Issue #190)", () => {
    const parsed = RunManifestSchema.safeParse({
      runId: "run-image-route",
      gitSha: "abc123",
      lockfileHash: "def456",
      nodeVersion: process.version,
      wittgensteinVersion: "0.0.0",
      command: "wittgenstein image",
      args: ["hello"],
      seed: 7,
      codec: "image",
      route: "rastr",
      llmProvider: "anthropic",
      llmModel: "claude-opus-4-7",
      llmTokens: { input: 10, output: 20 },
      costUsd: 0,
      promptRaw: "hello",
      promptExpanded: "hello",
      llmOutputRaw: "{}",
      llmOutputParsed: {},
      artifactPath: "/tmp/out.png",
      artifactSha256: "sha256",
      startedAt: new Date().toISOString(),
      durationMs: 10,
      ok: true,
      error: null,
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts the canonical image route literal (Issue #190)", () => {
    const parsed = RunManifestSchema.safeParse({
      runId: "run-image-route-ok",
      gitSha: "abc123",
      lockfileHash: "def456",
      nodeVersion: process.version,
      wittgensteinVersion: "0.0.0",
      command: "wittgenstein image",
      args: ["hello"],
      seed: 7,
      codec: "image",
      route: "raster",
      llmProvider: "anthropic",
      llmModel: "claude-opus-4-7",
      llmTokens: { input: 10, output: 20 },
      costUsd: 0,
      promptRaw: "hello",
      promptExpanded: "hello",
      llmOutputRaw: "{}",
      llmOutputParsed: {},
      artifactPath: "/tmp/out.png",
      artifactSha256: "sha256",
      startedAt: new Date().toISOString(),
      durationMs: 10,
      ok: true,
      error: null,
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects invalid sensor routes (Issue #190)", () => {
    const parsed = RunManifestSchema.safeParse({
      runId: "run-sensor-route",
      gitSha: "abc123",
      lockfileHash: "def456",
      nodeVersion: process.version,
      wittgensteinVersion: "0.0.0",
      command: "wittgenstein sensor",
      args: ["hello"],
      seed: 7,
      codec: "sensor",
      route: "ekg",
      llmProvider: "anthropic",
      llmModel: "claude-opus-4-7",
      llmTokens: { input: 10, output: 20 },
      costUsd: 0,
      promptRaw: "hello",
      promptExpanded: "hello",
      llmOutputRaw: "{}",
      llmOutputParsed: {},
      artifactPath: "/tmp/out.json",
      artifactSha256: "sha256",
      startedAt: new Date().toISOString(),
      durationMs: 10,
      ok: true,
      error: null,
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts canonical sensor route literals (Issue #190)", () => {
    for (const route of ["ecg", "temperature", "gyro"]) {
      const parsed = RunManifestSchema.safeParse({
        runId: `run-sensor-route-${route}`,
        gitSha: "abc123",
        lockfileHash: "def456",
        nodeVersion: process.version,
        wittgensteinVersion: "0.0.0",
        command: "wittgenstein sensor",
        args: ["hello"],
        seed: 7,
        codec: "sensor",
        route,
        llmProvider: "anthropic",
        llmModel: "claude-opus-4-7",
        llmTokens: { input: 10, output: 20 },
        costUsd: 0,
        promptRaw: "hello",
        promptExpanded: "hello",
        llmOutputRaw: "{}",
        llmOutputParsed: {},
        artifactPath: "/tmp/out.json",
        artifactSha256: "sha256",
        startedAt: new Date().toISOString(),
        durationMs: 10,
        ok: true,
        error: null,
      });
      expect(parsed.success).toBe(true);
    }
  });

  it("rejects invalid video routes (Issue #190)", () => {
    const parsed = RunManifestSchema.safeParse({
      runId: "run-video-route",
      gitSha: "abc123",
      lockfileHash: "def456",
      nodeVersion: process.version,
      wittgensteinVersion: "0.0.0",
      command: "wittgenstein video",
      args: ["hello"],
      seed: 7,
      codec: "video",
      route: "hyperframes-mov",
      llmProvider: "anthropic",
      llmModel: "claude-opus-4-7",
      llmTokens: { input: 10, output: 20 },
      costUsd: 0,
      promptRaw: "hello",
      promptExpanded: "hello",
      llmOutputRaw: "{}",
      llmOutputParsed: {},
      artifactPath: "/tmp/out.mp4",
      artifactSha256: "sha256",
      startedAt: new Date().toISOString(),
      durationMs: 10,
      ok: true,
      error: null,
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts canonical video route literals (Issue #190)", () => {
    for (const route of ["hyperframes-mp4", "hyperframes-html"]) {
      const parsed = RunManifestSchema.safeParse({
        runId: `run-video-route-${route}`,
        gitSha: "abc123",
        lockfileHash: "def456",
        nodeVersion: process.version,
        wittgensteinVersion: "0.0.0",
        command: "wittgenstein video",
        args: ["hello"],
        seed: 7,
        codec: "video",
        route,
        llmProvider: "anthropic",
        llmModel: "claude-opus-4-7",
        llmTokens: { input: 10, output: 20 },
        costUsd: 0,
        promptRaw: "hello",
        promptExpanded: "hello",
        llmOutputRaw: "{}",
        llmOutputParsed: {},
        artifactPath: "/tmp/out.mp4",
        artifactSha256: "sha256",
        startedAt: new Date().toISOString(),
        durationMs: 10,
        ok: true,
        error: null,
      });
      expect(parsed.success).toBe(true);
    }
  });

  it("accepts costUsd: null when paired with a non-computed reason", () => {
    const parsed = RunManifestSchema.safeParse({
      runId: "run-cost-null",
      gitSha: "abc123",
      lockfileHash: "def456",
      nodeVersion: process.version,
      wittgensteinVersion: "0.0.0",
      command: "wittgenstein image",
      args: ["test"],
      seed: 7,
      codec: "image",
      llmProvider: "anthropic",
      llmModel: "claude-future-2030",
      llmTokens: { input: 500, output: 250 },
      costUsd: null,
      costUsdReason: "unknown-model",
      promptRaw: "test",
      promptExpanded: null,
      llmOutputRaw: "{}",
      llmOutputParsed: {},
      artifactPath: "/tmp/out.png",
      artifactSha256: "deadbeef",
      startedAt: new Date().toISOString(),
      durationMs: 10,
      ok: true,
      error: null,
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects costUsd: null without a costUsdReason (Issue #182)", () => {
    const parsed = RunManifestSchema.safeParse({
      runId: "run-cost-null-bare",
      gitSha: "abc123",
      lockfileHash: "def456",
      nodeVersion: process.version,
      wittgensteinVersion: "0.0.0",
      command: "wittgenstein image",
      args: ["test"],
      seed: 7,
      codec: "image",
      llmProvider: "anthropic",
      llmModel: "claude-future-2030",
      llmTokens: { input: 500, output: 250 },
      costUsd: null,
      // costUsdReason intentionally omitted
      promptRaw: "test",
      promptExpanded: null,
      llmOutputRaw: "{}",
      llmOutputParsed: {},
      artifactPath: "/tmp/out.png",
      artifactSha256: "deadbeef",
      startedAt: new Date().toISOString(),
      durationMs: 10,
      ok: true,
      error: null,
    });

    expect(parsed.success).toBe(false);
  });

  it('accepts costUsd: null with costUsdReason: "no-llm-call" (dry-run, pure-local) — Issue #363', () => {
    const parsed = RunManifestSchema.safeParse({
      runId: "run-no-llm-call",
      gitSha: "abc123",
      lockfileHash: "def456",
      nodeVersion: process.version,
      wittgensteinVersion: "0.0.0",
      command: "wittgenstein image --dry-run",
      args: ["test"],
      seed: 7,
      codec: "image",
      llmProvider: "anthropic",
      llmModel: "claude-opus-4-7",
      llmTokens: { input: 0, output: 0 },
      costUsd: null,
      costUsdReason: "no-llm-call",
      promptRaw: "test",
      promptExpanded: null,
      llmOutputRaw: null,
      llmOutputParsed: null,
      artifactPath: "/tmp/out.png",
      artifactSha256: "deadbeef",
      startedAt: new Date().toISOString(),
      durationMs: 10,
      ok: true,
      error: null,
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects costUsdReason: "no-llm-call" paired with non-null costUsd (Issue #363)', () => {
    const parsed = RunManifestSchema.safeParse({
      runId: "run-no-llm-call-but-nonzero",
      gitSha: "abc123",
      lockfileHash: "def456",
      nodeVersion: process.version,
      wittgensteinVersion: "0.0.0",
      command: "wittgenstein image --dry-run",
      args: ["test"],
      seed: 7,
      codec: "image",
      llmProvider: "anthropic",
      llmModel: "claude-opus-4-7",
      llmTokens: { input: 0, output: 0 },
      costUsd: 0,
      costUsdReason: "no-llm-call",
      promptRaw: "test",
      promptExpanded: null,
      llmOutputRaw: null,
      llmOutputParsed: null,
      artifactPath: "/tmp/out.png",
      artifactSha256: "deadbeef",
      startedAt: new Date().toISOString(),
      durationMs: 10,
      ok: true,
      error: null,
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects costUsd: null with costUsdReason: "computed" (contradiction)', () => {
    const parsed = RunManifestSchema.safeParse({
      runId: "run-cost-null-contradiction",
      gitSha: "abc123",
      lockfileHash: "def456",
      nodeVersion: process.version,
      wittgensteinVersion: "0.0.0",
      command: "wittgenstein image",
      args: ["test"],
      seed: 7,
      codec: "image",
      llmProvider: "anthropic",
      llmModel: "claude-future-2030",
      llmTokens: { input: 500, output: 250 },
      costUsd: null,
      costUsdReason: "computed",
      promptRaw: "test",
      promptExpanded: null,
      llmOutputRaw: "{}",
      llmOutputParsed: {},
      artifactPath: "/tmp/out.png",
      artifactSha256: "deadbeef",
      startedAt: new Date().toISOString(),
      durationMs: 10,
      ok: true,
      error: null,
    });

    expect(parsed.success).toBe(false);
  });

  // Schema-boundary negative cases (#383). The cases above cover known
  // invariants (artifact evidence, error payload, route literals, cost
  // contradictions). These cases pin the broader "wrong-type / missing /
  // out-of-range" surface so a future schema relaxation can't quietly
  // accept ill-formed input.
  const okManifestFields = () => ({
    runId: "run-x",
    gitSha: "abc123",
    lockfileHash: "def456",
    nodeVersion: process.version,
    wittgensteinVersion: "0.0.0",
    command: "wittgenstein image",
    args: ["test"],
    seed: 7,
    codec: "image",
    llmProvider: "anthropic",
    llmModel: "claude-opus-4-7",
    llmTokens: { input: 1, output: 2 },
    costUsd: 0,
    promptRaw: "test",
    promptExpanded: "test",
    llmOutputRaw: "{}",
    llmOutputParsed: {},
    artifactPath: "/tmp/out.png",
    artifactSha256: "sha256",
    startedAt: new Date().toISOString(),
    durationMs: 10,
    ok: true,
    error: null,
  });

  it("rejects manifest with wrong-type runId (number)", () => {
    const parsed = RunManifestSchema.safeParse({ ...okManifestFields(), runId: 42 });
    expect(parsed.success).toBe(false);
  });

  it("rejects manifest with missing runId", () => {
    const fields: Record<string, unknown> = { ...okManifestFields() };
    delete fields.runId;
    const parsed = RunManifestSchema.safeParse(fields);
    expect(parsed.success).toBe(false);
  });

  it("rejects manifest with non-integer seed", () => {
    const parsed = RunManifestSchema.safeParse({ ...okManifestFields(), seed: 3.14 });
    expect(parsed.success).toBe(false);
  });

  it("rejects manifest with negative durationMs", () => {
    const parsed = RunManifestSchema.safeParse({ ...okManifestFields(), durationMs: -5 });
    expect(parsed.success).toBe(false);
  });

  it("rejects manifest with negative costUsd", () => {
    const parsed = RunManifestSchema.safeParse({ ...okManifestFields(), costUsd: -0.01 });
    expect(parsed.success).toBe(false);
  });

  it("rejects manifest with negative llmTokens.input", () => {
    const parsed = RunManifestSchema.safeParse({
      ...okManifestFields(),
      llmTokens: { input: -1, output: 2 },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects manifest with non-integer llmTokens.output", () => {
    const parsed = RunManifestSchema.safeParse({
      ...okManifestFields(),
      llmTokens: { input: 1, output: 2.5 },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects manifest with wrong-type args (string instead of array)", () => {
    const parsed = RunManifestSchema.safeParse({ ...okManifestFields(), args: "prompt" });
    expect(parsed.success).toBe(false);
  });

  it("rejects manifest with wrong-type ok flag (string)", () => {
    const parsed = RunManifestSchema.safeParse({ ...okManifestFields(), ok: "true" });
    expect(parsed.success).toBe(false);
  });

  it("rejects manifest with invalid cost reason enum value", () => {
    const parsed = RunManifestSchema.safeParse({
      ...okManifestFields(),
      costUsd: null,
      costUsdReason: "made-up-reason",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a minimal happy-path manifest (positive control)", () => {
    // Defends against regression: if the okManifestFields fixture stops
    // being a valid manifest, the negative tests above lose their
    // meaning (they'd be rejected for the wrong reason).
    const parsed = RunManifestSchema.safeParse(okManifestFields());
    expect(parsed.success).toBe(true);
  });

  it("accepts artifact sidecar receipts on successful manifests", () => {
    const parsed = RunManifestSchema.safeParse({
      ...okManifestFields(),
      artifactSidecars: [
        {
          role: "sensor-csv",
          path: "/tmp/out.csv",
          mimeType: "text/csv",
          bytes: 17,
          sha256: "deadbeef",
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });
});
