import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectRuntimeFingerprint, hashFile } from "../src/runtime/manifest.js";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "wittgenstein-manifest-test-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("hashFile", () => {
  it("returns the SHA-256 hex digest of the file contents", async () => {
    const path = join(tmp, "fixture.txt");
    const content = "deterministic content";
    await writeFile(path, content);

    const expected = createHash("sha256").update(content).digest("hex");
    expect(await hashFile(path)).toBe(expected);
  });

  it("is identical for two writes of the same content", async () => {
    const a = join(tmp, "a.txt");
    const b = join(tmp, "b.txt");
    await writeFile(a, "same bytes");
    await writeFile(b, "same bytes");

    expect(await hashFile(a)).toBe(await hashFile(b));
  });

  it("differs when a single byte changes", async () => {
    const a = join(tmp, "a.txt");
    const b = join(tmp, "b.txt");
    await writeFile(a, "same bytes");
    await writeFile(b, "Same bytes"); // capitalized first letter

    expect(await hashFile(a)).not.toBe(await hashFile(b));
  });

  it("returns null (not throws) for a missing file — failure must be inspectable, not silent", async () => {
    const result = await hashFile(join(tmp, "does-not-exist.txt"));
    expect(result).toBeNull();
  });
});

describe("collectRuntimeFingerprint", () => {
  it("returns the spine shape for a directory with no git or lockfile", async () => {
    const fp = await collectRuntimeFingerprint(tmp);

    // gitSha is null because tmpdir is not a git repo.
    expect(fp.gitSha).toBeNull();
    // lockfile is missing in tmpdir, so its hash is null too.
    expect(fp.lockfileHash).toBeNull();
    // wittgensteinVersion falls back to 0.0.0 when package.json is absent.
    expect(fp.wittgensteinVersion).toBe("0.0.0");
    // Node version is a real value, like "v20.x.y".
    expect(fp.nodeVersion).toBe(process.version);
    expect(fp.nodeVersion).toMatch(/^v\d+\.\d+\.\d+/);
  });

  it("reads version from package.json when present", async () => {
    await writeFile(join(tmp, "package.json"), JSON.stringify({ version: "1.2.3" }));
    const fp = await collectRuntimeFingerprint(tmp);
    expect(fp.wittgensteinVersion).toBe("1.2.3");
  });

  it("reads lockfile hash when pnpm-lock.yaml is present", async () => {
    const lockfilePath = join(tmp, "pnpm-lock.yaml");
    await writeFile(lockfilePath, "lockfileVersion: '6.0'\n");

    const fp = await collectRuntimeFingerprint(tmp);

    const expected = createHash("sha256").update("lockfileVersion: '6.0'\n").digest("hex");
    expect(fp.lockfileHash).toBe(expected);
  });
});
