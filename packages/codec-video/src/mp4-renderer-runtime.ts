// Runtime-tier dynamic loading for the video MP4 renderer's puppeteer-core peer.
//
// Per the delivery doctrine and #464 follow-up to PR #456, `puppeteer-core` is
// only needed when the codec emits MP4 output (`WITTGENSTEIN_HYPERFRAMES_RENDER=1`
// + `.mp4` extension). The HTML-only path — which is the codec's default — does
// not load it. Mirrors the `ensureOnnxRuntime()` pattern in
// `@wittgenstein/codec-image/src/decoders/runtime.ts`.
//
// The contract:
//   - `renderHtmlToMp4()` calls `ensurePuppeteerCore()` BEFORE launching a browser.
//   - On success: returns the imported module structurally typed for the
//     calls this codec actually makes.
//   - On failure: throws `WittgensteinPuppeteerUnavailableError` with structured
//     details (code `MP4_RENDERER_PUPPETEER_UNAVAILABLE`) pointing the user at
//     the install hint, instead of leaking Node's `ERR_MODULE_NOT_FOUND`.
//   - The helper compiles cleanly even when `puppeteer-core` is not installed
//     on disk, because all types are local and the import is hidden behind a
//     dynamic-import-from-variable shape.
import { z } from "zod";
import { CLOSED_TRACKERS } from "@wittgenstein/schemas";

/**
 * Minimal structural surface this codec needs from `puppeteer-core`. Extending
 * this means the renderer can use a new symbol; the codec still compiles
 * without the peer because the types are local.
 */
export interface PuppeteerCore {
  readonly launch: (options: PuppeteerLaunchOptions) => Promise<PuppeteerBrowser>;
}

export interface PuppeteerLaunchOptions {
  readonly executablePath: string;
  readonly headless: boolean;
  readonly args?: ReadonlyArray<string>;
}

export interface PuppeteerBrowser {
  newPage(): Promise<PuppeteerPage>;
  version(): Promise<string>;
  close(): Promise<void>;
}

export interface PuppeteerPage {
  setViewport(viewport: {
    width: number;
    height: number;
    deviceScaleFactor?: number;
  }): Promise<void>;
  goto(url: string, options?: { waitUntil?: string }): Promise<unknown>;
  $(selector: string): Promise<PuppeteerElementHandle | null>;
}

export interface PuppeteerElementHandle {
  screenshot(options: { path: string; omitBackground?: boolean }): Promise<unknown>;
}

export interface PuppeteerUnavailableDetails {
  readonly runtime: "puppeteer-core";
  readonly tier: "video";
  readonly installHint: string;
  readonly cause: string;
  readonly tracker: string;
}

export const PuppeteerUnavailableDetailsSchema = z.object({
  runtime: z.literal("puppeteer-core"),
  tier: z.literal("video"),
  installHint: z.string().min(1),
  cause: z.string(),
  tracker: z.string().url(),
}) satisfies z.ZodType<PuppeteerUnavailableDetails>;

export class WittgensteinPuppeteerUnavailableError extends Error {
  readonly code = "MP4_RENDERER_PUPPETEER_UNAVAILABLE";
  readonly details: PuppeteerUnavailableDetails;

  constructor(message: string, details: PuppeteerUnavailableDetails) {
    super(message);
    this.name = "WittgensteinError";
    this.details = PuppeteerUnavailableDetailsSchema.parse(details);
  }
}

/**
 * Load `puppeteer-core` and return its module. Throws a structured
 * `MP4_RENDERER_PUPPETEER_UNAVAILABLE` if the peer isn't installed.
 *
 * The dynamic-import-from-variable shape (`new Function('return import(...)')`)
 * keeps the TypeScript compiler from resolving the module at type level — the
 * package compiles whether or not `puppeteer-core` is on the disk.
 */
export async function ensurePuppeteerCore(): Promise<PuppeteerCore> {
  const moduleId = "puppeteer-core";
  try {
    const dynamicImport = new Function("id", "return import(id)") as (
      id: string,
    ) => Promise<PuppeteerCore>;
    return await dynamicImport(moduleId);
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new WittgensteinPuppeteerUnavailableError(
      "Video MP4 renderer requires `puppeteer-core`. Install it with " +
        "`pnpm add puppeteer-core` (or `npm install puppeteer-core`) and retry, " +
        "or unset `WITTGENSTEIN_HYPERFRAMES_RENDER` to emit HTML only.",
      {
        runtime: "puppeteer-core",
        tier: "video",
        installHint: "pnpm add puppeteer-core",
        cause,
        tracker: CLOSED_TRACKERS.puppeteerCoreOptionalPeer,
      },
    );
  }
}
