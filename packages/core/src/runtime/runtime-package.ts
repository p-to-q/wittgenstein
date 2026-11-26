import { readFile } from "node:fs/promises";

// Source and tsc output have the same depth within this private monorepo.
// The standalone CLI bundle replaces this module with embedded package data.
export async function readRuntimePackage(): Promise<unknown> {
  return JSON.parse(await readFile(new URL("../../../../package.json", import.meta.url), "utf8"));
}
