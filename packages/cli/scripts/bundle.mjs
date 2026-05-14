import * as esbuild from "esbuild";
import { chmod, copyFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(root, "..");
const out = resolve(pkgRoot, "dist/bundle.cjs");
const loupeSrc = resolve(pkgRoot, "../codec-sensor/loupe.py");
const loupeOut = resolve(pkgRoot, "dist/loupe.py");

await esbuild.build({
  entryPoints: [resolve(pkgRoot, "src/cli-main.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: out,
  external: ["onnxruntime-node"],
  banner: { js: "#!/usr/bin/env node\n" },
  logLevel: "info",
});

await chmod(out, 0o755);
await copyFile(loupeSrc, loupeOut);
console.log("wrote", out);
