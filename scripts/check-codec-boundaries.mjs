import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import ts from "typescript";

const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), "..");
const packagesDir = resolve(repoRoot, "packages");
const codecDirs = (await readdir(packagesDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("codec-"))
  .map((entry) => entry.name);

const codecByPackageName = new Map(codecDirs.map((name) => [`@wittgenstein/${name}`, name]));
const violations = [];

for (const codecDir of codecDirs) {
  for (const filePath of await collectSourceFiles(resolve(packagesDir, codecDir))) {
    const sourceText = await readFile(filePath, "utf8");
    const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);

    for (const dependency of collectDependencies(sourceFile)) {
      const targetCodec = resolveTargetCodec(codecDir, filePath, dependency);
      if (!targetCodec || targetCodec === codecDir) {
        continue;
      }

      const line = sourceFile.getLineAndCharacterOfPosition(dependency.start).line + 1;
      violations.push(`${relative(repoRoot, filePath)}:${line} imports ${dependency.specifier}`);
    }
  }
}

if (violations.length > 0) {
  console.error("Cross-codec imports are forbidden. Found:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log(`Codec boundary check passed for ${codecDirs.length} codec packages.`);

async function collectSourceFiles(rootDir) {
  const files = [];
  const entries = await readdir(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === "dist" || entry.name === "node_modules") {
      continue;
    }

    const fullPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(fullPath)));
      continue;
    }

    if ([".ts", ".mts", ".js", ".mjs"].includes(extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

function collectDependencies(sourceFile) {
  const dependencies = [];

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      dependencies.push({
        specifier: node.moduleSpecifier.text,
        start: node.moduleSpecifier.getStart(sourceFile),
      });
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      dependencies.push({
        specifier: node.arguments[0].text,
        start: node.arguments[0].getStart(sourceFile),
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return dependencies;
}

function resolveTargetCodec(ownerCodec, filePath, dependency) {
  const bareTarget = codecByPackageName.get(dependency.specifier);
  if (bareTarget) {
    return bareTarget;
  }

  if (!dependency.specifier.startsWith(".")) {
    return null;
  }

  const resolvedPath = resolve(dirname(filePath), dependency.specifier);
  const relativeToPackages = relative(packagesDir, resolvedPath);
  if (relativeToPackages.startsWith("..")) {
    return null;
  }

  const [targetCodec] = relativeToPackages.split("/");
  if (!targetCodec || !targetCodec.startsWith("codec-")) {
    return null;
  }

  return targetCodec === ownerCodec ? null : targetCodec;
}
