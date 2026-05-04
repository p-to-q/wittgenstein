import { describe, expect, it } from "vitest";
import type { WittgensteinRequest } from "@wittgenstein/schemas";
import { CodecRegistry } from "../src/runtime/registry.js";
import { WittgensteinError } from "../src/runtime/errors.js";
import { routeRequest } from "../src/runtime/router.js";

function fakeCodec(modality: WittgensteinRequest["modality"]) {
  return {
    name: `fake-${modality}`,
    modality,
    schema: undefined as never,
    expand: () => ({}) as never,
    render: () => ({}) as never,
  } as never;
}

describe("routeRequest", () => {
  it("returns the registered codec for the request's modality", () => {
    const registry = new CodecRegistry();
    registry.register(fakeCodec("sensor"));
    registry.register(fakeCodec("audio"));

    const sensorReq = { modality: "sensor" } as WittgensteinRequest;
    const audioReq = { modality: "audio" } as WittgensteinRequest;

    expect((routeRequest(sensorReq, registry) as { name: string }).name).toBe("fake-sensor");
    expect((routeRequest(audioReq, registry) as { name: string }).name).toBe("fake-audio");
  });

  it("throws WittgensteinError with UNKNOWN_MODALITY when the modality is not registered", () => {
    const registry = new CodecRegistry();
    registry.register(fakeCodec("sensor"));

    const audioReq = { modality: "audio" } as WittgensteinRequest;

    let caught: unknown;
    try {
      routeRequest(audioReq, registry);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(WittgensteinError);
    expect((caught as WittgensteinError).code).toBe("UNKNOWN_MODALITY");
  });

  it("does not invoke the codec — routing is lookup-only", () => {
    const registry = new CodecRegistry();
    let renderCalls = 0;
    const codec = {
      name: "fake-image",
      modality: "image" as const,
      schema: undefined as never,
      expand: () => ({}) as never,
      render: () => {
        renderCalls += 1;
        return {} as never;
      },
    } as never;
    registry.register(codec);

    routeRequest({ modality: "image" } as WittgensteinRequest, registry);
    expect(renderCalls).toBe(0);
  });
});
