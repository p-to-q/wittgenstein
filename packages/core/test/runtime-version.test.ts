import { beforeEach, describe, expect, it, vi } from "vitest";
import { readRuntimeVersion } from "../src/runtime/runtime-version.js";
import { readRuntimePackage } from "../src/runtime/runtime-package.js";

vi.mock("../src/runtime/runtime-package.js", () => ({ readRuntimePackage: vi.fn() }));

beforeEach(() => {
  vi.mocked(readRuntimePackage).mockReset();
});

describe("runtime's own package identity", () => {
  it.each(["0.3.0-alpha.3", "1.2.3+build.7"])("accepts %s", async (version) => {
    vi.mocked(readRuntimePackage).mockResolvedValue({ name: "wittgenstein-monorepo", version });
    expect(await readRuntimeVersion()).toBe(version);
  });

  it.each([
    null,
    {},
    { name: "another-app", version: "1.2.3" },
    { name: "wittgenstein-cli", version: 123 },
    { name: "wittgenstein-cli", version: "" },
    { name: "wittgenstein-cli", version: "unknown" },
  ])("rejects invalid identity %j", async (metadata) => {
    vi.mocked(readRuntimePackage).mockResolvedValue(metadata);
    await expect(readRuntimeVersion()).rejects.toMatchObject({ code: "RUNTIME_VERSION_INVALID" });
  });

  it("preserves unreadable or corrupt own-source errors", async () => {
    const cause = new SyntaxError("corrupt own package metadata");
    vi.mocked(readRuntimePackage).mockRejectedValue(cause);
    const error = await readRuntimeVersion().catch((failure: unknown) => failure);
    expect((error as { code: string }).code).toBe("RUNTIME_VERSION_INVALID");
    expect((error as Error).cause === cause).toBe(true);
  });
});
