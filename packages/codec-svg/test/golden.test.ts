/**
 * Byte-stable golden coverage for codec-svg (Issue #347).
 *
 * Locks the deterministic render output against a SHA-256 digest. The codec
 * receives a fixed SVG document, renders it to disk, and we hash the file
 * bytes — any drift in the render path (whitespace, attribute reordering,
 * encoding) will trip the assertion.
 *
 * To regenerate after an intentional renderer change: replace the expected
 * digest with the value the test prints when it fails.
 */
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { svgCodec } from "../src/index.js";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(resolve(tmpdir(), "codec-svg-golden-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("codec-svg golden parity (Issue #347)", () => {
  it("svgCodec.render is byte-stable for a canonical document", async () => {
    const doc =
      '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="black"/></svg>';
    const parsed = svgCodec.parse(JSON.stringify({ svg: doc }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const outPath = join(tmp, "golden.svg");
    await svgCodec.render(parsed.value, {
      runId: "golden",
      runDir: tmp,
      seed: null,
      outPath,
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    });
    const bytes = await readFile(outPath);
    const digest = createHash("sha256").update(bytes).digest("hex");
    expect(digest).toBe(
      "bcc26b60f098379142bdd5947bf0b419fab10225f5197cb9f321cc2a5b8393d8",
    );
  });
});
