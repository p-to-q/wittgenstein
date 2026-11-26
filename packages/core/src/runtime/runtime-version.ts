import { z } from "zod";
import { WittgensteinError } from "./errors.js";
import { readRuntimePackage } from "./runtime-package.js";

const RuntimePackageSchema = z.object({
  name: z.enum(["wittgenstein-monorepo", "wittgenstein-cli"]),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/),
});

export async function readRuntimeVersion(): Promise<string> {
  try {
    return RuntimePackageSchema.parse(await readRuntimePackage()).version;
  } catch (cause) {
    throw new WittgensteinError(
      "RUNTIME_VERSION_INVALID",
      "Cannot verify the loaded Wittgenstein package version. Repair the installation or rebuild the CLI.",
      { cause },
    );
  }
}
