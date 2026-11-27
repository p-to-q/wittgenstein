import assert from "node:assert/strict";
import test from "node:test";
import {
  assertBuildProvenance,
  assertPublishedArtifact,
  assertReleaseAlignment,
  releaseChannel,
} from "./check-release.mjs";

const version = "0.3.0-alpha.4";
const input = {
  root: version,
  cli: version,
  artifact: version,
  binary: version,
  tag: `v${version}`,
  name: "wittgenstein-cli",
  integrity: "sha512-local",
};
const registry = () => ({
  "dist-tags": { next: version, latest: "0.1.0" },
  versions: {
    [version]: { name: "wittgenstein-cli", version, dist: { integrity: input.integrity } },
  },
});

test("align root, public package, packed CLI and prerelease tag", () => {
  const local = assertReleaseAlignment(input);
  assert.equal(local.channel, "next");
  assert.equal(assertPublishedArtifact(registry(), local).version, version);
  assert.equal(registry()["dist-tags"].latest, "0.1.0");
});
for (const field of ["root", "cli", "artifact", "binary", "tag"]) {
  test(`refuse drift in ${field}`, () => {
    assert.throws(
      () => assertReleaseAlignment({ ...input, [field]: field === "tag" ? "v0.1.0" : "0.1.0" }),
      /RELEASE_VERSION_MISMATCH/,
    );
  });
}
test("refuse a different package or malformed version", () => {
  assert.throws(() => assertReleaseAlignment({ ...input, name: "@wittgenstein/cli" }));
  for (const value of ["garbage", "01.2.3", "0.3.0-01", "0.3.0-alpha/4"])
    assert.throws(() => releaseChannel(value));
});
test("stable releases select latest; prereleases select next", () => {
  assert.equal(releaseChannel("0.3.0"), "latest");
  assert.equal(releaseChannel("0.3.0-rc.1"), "next");
});
test("refuse an absent npm version", () => {
  assert.throws(
    () => assertPublishedArtifact({ "dist-tags": {}, versions: {} }, assertReleaseAlignment(input)),
    /RELEASE_NPM_VERSION_MISSING/,
  );
});
test("refuse public bytes or metadata different from the checked tarball", () => {
  for (const change of [{ version: "0.1.0" }, { dist: { integrity: "sha512-other" } }]) {
    const document = registry();
    Object.assign(document.versions[version], change);
    assert.throws(
      () => assertPublishedArtifact(document, assertReleaseAlignment(input)),
      /RELEASE_NPM_ARTIFACT_MISMATCH/,
    );
  }
});
test("refuse missing/stale public release channel", () => {
  for (const tags of [{ latest: version }, { next: "0.2.0-alpha.2" }]) {
    const document = registry();
    document["dist-tags"] = tags;
    assert.throws(
      () => assertPublishedArtifact(document, assertReleaseAlignment(input)),
      /RELEASE_NPM_CHANNEL_MISMATCH/,
    );
  }
});
test("refuse malformed registry or missing integrity", () => {
  for (const document of [null, {}, { "dist-tags": {}, versions: [] }])
    assert.throws(() => assertPublishedArtifact(document, assertReleaseAlignment(input)));
  const document = registry();
  delete document.versions[version].dist;
  assert.throws(() => assertPublishedArtifact(document, assertReleaseAlignment(input)));
});

const source = { commit: "a".repeat(40), lockfileSha256: "b".repeat(64), dirty: false };
const build = { sourceCommit: source.commit, lockfileSha256: source.lockfileSha256, dirty: false };
test("bind build to source commit and lockfile", () => {
  assert.equal(assertBuildProvenance(build, source, true).sourceCommit, source.commit);
  for (const change of [
    { sourceCommit: "c".repeat(40) },
    { lockfileSha256: "d".repeat(64) },
    { dirty: true },
  ]) {
    assert.throws(
      () => assertBuildProvenance({ ...build, ...change }, source, true),
      /RELEASE_BUILD_MISMATCH/,
    );
  }
});
test("dirty local builds are inspectable but cannot pass a publication check", () => {
  assert.equal(
    assertBuildProvenance({ ...build, dirty: true }, { ...source, dirty: true }, false).dirty,
    true,
  );
  assert.throws(
    () => assertBuildProvenance({ ...build, dirty: true }, { ...source, dirty: true }, true),
    /RELEASE_BUILD_MISMATCH/,
  );
});
