/**
 * Pins the tracker URL constants exported from `@wittgenstein/schemas`.
 *
 * These constants replace ~13 hardcoded `https://github.com/p-to-q/wittgenstein/issues/<N>`
 * string literals scattered across the cli, codec-image, and codec-video
 * packages (#487 item 2). Future renumber / org-rename touches one line per
 * tracker; receipt-format consumers reference the named constant.
 */
import { describe, expect, it } from "vitest";
import { CLOSED_TRACKERS, TRACKERS } from "../src/index.js";

const URL_SHAPE = /^https:\/\/github\.com\/p-to-q\/wittgenstein\/issues\/\d+$/;

describe("@wittgenstein/schemas — trackers (#487 item 2)", () => {
  it("every active tracker matches the canonical GitHub issue URL shape", () => {
    for (const [name, url] of Object.entries(TRACKERS)) {
      expect(url, name).toMatch(URL_SHAPE);
    }
  });

  it("every closed tracker matches the canonical GitHub issue URL shape", () => {
    for (const [name, url] of Object.entries(CLOSED_TRACKERS)) {
      expect(url, name).toMatch(URL_SHAPE);
    }
  });

  it("active and closed tracker namespaces don't overlap", () => {
    const activeKeys = new Set(Object.keys(TRACKERS));
    const closedKeys = new Set(Object.keys(CLOSED_TRACKERS));
    const overlap = [...activeKeys].filter((k) => closedKeys.has(k));
    expect(overlap).toEqual([]);
  });

  it("pins the specific URLs that runtime receipts depend on", () => {
    // These exact values are checked into the public receipt surface; renaming
    // either key requires updating the receipt consumers. The test pins the
    // mapping so a typo in `trackers.ts` cannot silently change a receipt.
    expect(TRACKERS.m1bImageDecoderUmbrella).toBe(
      "https://github.com/p-to-q/wittgenstein/issues/283",
    );
    expect(TRACKERS.m1bGateCDeterminism).toBe("https://github.com/p-to-q/wittgenstein/issues/334");
    expect(TRACKERS.m1bGateDOnnxCpu).toBe("https://github.com/p-to-q/wittgenstein/issues/335");
    expect(TRACKERS.decoderDeliveryDecision).toBe(
      "https://github.com/p-to-q/wittgenstein/issues/402",
    );
    expect(TRACKERS.installTierCli).toBe("https://github.com/p-to-q/wittgenstein/issues/403");
    expect(TRACKERS.trainingDataSweepInfra).toBe(
      "https://github.com/p-to-q/wittgenstein/issues/400",
    );
    expect(CLOSED_TRACKERS.adr0020Implementation).toBe(
      "https://github.com/p-to-q/wittgenstein/issues/376",
    );
    expect(CLOSED_TRACKERS.onnxRuntimeOptionalPeer).toBe(
      "https://github.com/p-to-q/wittgenstein/issues/404",
    );
    expect(CLOSED_TRACKERS.puppeteerCoreOptionalPeer).toBe(
      "https://github.com/p-to-q/wittgenstein/issues/464",
    );
  });
});
