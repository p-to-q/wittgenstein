import * as esbuild from "esbuild";
import { chmod, copyFile, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(root, "..");
const out = resolve(pkgRoot, "dist/bundle.cjs");
const loupeSrc = resolve(pkgRoot, "../codec-sensor/loupe.py");
const loupeOut = resolve(pkgRoot, "dist/loupe.py");
const runtimePackageModule = resolve(pkgRoot, "../core/src/runtime/runtime-package.ts");
const pkg = JSON.parse(await readFile(resolve(pkgRoot, "package.json"), "utf8"));

await esbuild.build({
  entryPoints: [resolve(pkgRoot, "src/cli-main.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: out,
  external: ["onnxruntime-node"],
  plugins: [
    {
      name: "embed-runtime-package",
      setup(build) {
        build.onLoad({ filter: /runtime-package\.ts$/ }, ({ path }) => {
          if (path !== runtimePackageModule) return;
          // Embed the distribution's own identity, never the caller's package.json
          // or a build-machine path. Runtime validation remains the same in both modes.
          return {
            contents: `export async function readRuntimePackage() { return ${JSON.stringify({ name: "wittgenstein-cli", version: pkg.version })}; }`,
            loader: "js",
          };
        });
      },
    },
  ],
  banner: { js: "#!/usr/bin/env node\n" },
  logLevel: "info",
});

await chmod(out, 0o755);
await copyFile(loupeSrc, loupeOut);
console.log("wrote", out);
