#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const distEntry = resolve(here, "../dist/cli-main.js");
const srcEntry = resolve(here, "../src/cli-main.ts");
const workspaceMarker = resolve(here, "../../../pnpm-workspace.yaml");

const result =
  !existsSync(workspaceMarker) && existsSync(distEntry)
    ? spawnSync(process.execPath, [distEntry, ...process.argv.slice(2)], {
        stdio: "inherit",
      })
    : spawnSync(process.execPath, ["--import", "tsx", srcEntry, ...process.argv.slice(2)], {
        stdio: "inherit",
      });

process.exit(result.status ?? 1);
