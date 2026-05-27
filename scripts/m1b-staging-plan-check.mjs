#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const planPath = "docs/research/2026-05-26-m1b-staging-plan.md";
const plan = readFileSync(planPath, "utf8");
const stageEntries = parseStageEntries(plan);
const doNotStageEntries = parseDoNotStageEntries(plan);

const missingOnDisk = stageEntries.filter((path) => !existsSync(path));
const changedFiles = changedFilesFromGit();
const changedSet = new Set(changedFiles);
const stageSet = new Set(stageEntries);
const doNotStageSet = new Set(doNotStageEntries);

const unclassified = changedFiles.filter((path) => !stageSet.has(path) && !doNotStageSet.has(path));
const stagedPlanNotChanged = stageEntries.filter(
  (path) => !changedSet.has(path) && existsSync(path),
);
const doNotStageStillChanged = doNotStageEntries.filter((path) => changedSet.has(path));

const result = {
  ok: missingOnDisk.length === 0 && unclassified.length === 0,
  stageEntries: stageEntries.length,
  changedFiles: changedFiles.length,
  missingOnDisk,
  unclassified,
  stagedPlanNotChanged,
  doNotStageStillChanged,
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) {
  process.exitCode = 1;
}

function parseStageEntries(text) {
  const lines = text.split(/\r?\n/);
  const entries = [];
  let inBlock = false;
  for (const line of lines) {
    if (line.trim() === "git add \\") {
      inBlock = true;
      continue;
    }
    if (!inBlock) continue;
    if (line.trim() === "```") break;
    const item = line.trim().replace(/\\$/, "").trim();
    if (item) entries.push(item);
  }
  return entries;
}

function parseDoNotStageEntries(text) {
  const marker = "## Do not stage for M1B PR";
  const start = text.indexOf(marker);
  if (start === -1) return [];
  const after = text.slice(start);
  const firstFence = after.indexOf("```bash");
  if (firstFence === -1) return [];
  const body = after.slice(firstFence + "```bash".length);
  const endFence = body.indexOf("```");
  if (endFence === -1) return [];
  return body
    .slice(0, endFence)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function changedFilesFromGit() {
  const baseRef = resolveBaseRef();
  const prDiff = spawnSync("git", ["diff", "--name-only", `${baseRef}...HEAD`], {
    encoding: "utf8",
  });
  const worktreeDiff = spawnSync("git", ["diff", "--name-only"], { encoding: "utf8" });
  const untracked = spawnSync("git", ["ls-files", "--others", "--exclude-standard"], {
    encoding: "utf8",
  });
  if (prDiff.status !== 0 || worktreeDiff.status !== 0 || untracked.status !== 0) {
    throw new Error("failed to read git status");
  }
  const files = [
    ...prDiff.stdout.split(/\r?\n/),
    ...worktreeDiff.stdout.split(/\r?\n/),
    ...untracked.stdout.split(/\r?\n/),
  ]
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((path) => !path.includes("__pycache__"))
    .map((path) => normalizeDirectoryEntry(path));
  return [...new Set(files)];
}

function resolveBaseRef() {
  const candidates = [process.env.M1B_STAGING_BASE_REF, "upstream/main", "origin/main"].filter(
    Boolean,
  );
  for (const ref of candidates) {
    const result = spawnSync("git", ["rev-parse", "--verify", "--quiet", ref], {
      encoding: "utf8",
    });
    if (result.status === 0) return ref;
  }
  throw new Error("failed to resolve a staging-plan base ref");
}

function normalizeDirectoryEntry(path) {
  if (path === "artifacts/m1b-audit") {
    return join(path, "README.md");
  }
  if (path === "research/validation/fixtures") {
    return join(path, "m1b-audit", "README.md");
  }
  return path;
}
