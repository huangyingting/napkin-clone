#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, sep } from "node:path";
import process from "node:process";

const SCAN_ROOTS = ["src/components", "src/lib"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const IMPORT_RE =
  /\b(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s*)?["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

function extensionOf(filePath) {
  const index = filePath.lastIndexOf(".");
  return index === -1 ? "" : filePath.slice(index);
}

function toPosix(path) {
  return path.split(sep).join("/");
}

function shouldScanFile(filePath) {
  const normalized = toPosix(filePath);
  if (!SOURCE_EXTENSIONS.has(extensionOf(normalized))) {
    return false;
  }
  return (
    !normalized.includes("/node_modules/") && !normalized.includes("/.next/")
  );
}

function lineAndColumn(text, index) {
  const before = text.slice(0, index);
  const lines = before.split(/\r?\n/);
  return {
    lineNumber: lines.length,
    columnNumber: lines[lines.length - 1].length + 1,
  };
}

function resolveImport(filePath, specifier) {
  if (specifier.startsWith("@/")) {
    return `src/${specifier.slice(2)}`;
  }
  if (!specifier.startsWith(".")) {
    return specifier;
  }
  return toPosix(normalize(join(dirname(filePath), specifier)));
}

function isAppActionsImport(resolvedSpecifier) {
  if (!resolvedSpecifier.startsWith("src/app/")) {
    return false;
  }
  const basename = resolvedSpecifier.split("/").at(-1) ?? "";
  return basename.endsWith("actions");
}

function finding(filePath, index, text, rule, specifier) {
  const { lineNumber, columnNumber } = lineAndColumn(text, index);
  return { filePath, lineNumber, columnNumber, rule, specifier };
}

export function scanText(filePath, text) {
  const findings = [];
  const normalizedFile = toPosix(filePath);
  for (const match of text.matchAll(IMPORT_RE)) {
    const specifier = match[1] ?? match[2];
    if (!specifier) continue;
    const resolvedSpecifier = resolveImport(normalizedFile, specifier);
    if (
      normalizedFile.startsWith("src/components/") &&
      isAppActionsImport(resolvedSpecifier)
    ) {
      findings.push(
        finding(
          normalizedFile,
          match.index ?? 0,
          text,
          "component-app-actions-import",
          specifier,
        ),
      );
    }
    if (
      normalizedFile.startsWith("src/lib/") &&
      resolvedSpecifier.startsWith("src/app/")
    ) {
      findings.push(
        finding(
          normalizedFile,
          match.index ?? 0,
          text,
          "lib-app-import",
          specifier,
        ),
      );
    }
  }
  return findings;
}

function walkFiles(root) {
  const files = [];
  const entries = readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

export function scanActionPorts(repoRoot = process.cwd()) {
  const findings = [];
  for (const root of SCAN_ROOTS) {
    const absoluteRoot = join(repoRoot, root);
    if (!statSync(absoluteRoot, { throwIfNoEntry: false })?.isDirectory()) {
      continue;
    }
    for (const absolutePath of walkFiles(absoluteRoot)) {
      const filePath = toPosix(relative(repoRoot, absolutePath));
      if (!shouldScanFile(filePath)) {
        continue;
      }
      findings.push(...scanText(filePath, readFileSync(absolutePath, "utf8")));
    }
  }
  return findings;
}

function main() {
  const findings = scanActionPorts();
  if (findings.length === 0) {
    console.log("Action-port import guard passed.");
    return;
  }

  console.error("Action-port import guard failed:");
  for (const item of findings) {
    const guidance =
      item.rule === "component-app-actions-import"
        ? "Shared src/components code must receive typed action ports from a route shell instead of importing src/app action modules."
        : "Shared src/lib code must stay independent of src/app route modules; move route-independent code into src/lib first.";
    console.error(
      `${item.filePath}:${item.lineNumber}:${item.columnNumber} ${item.rule} ${item.specifier} — ${guidance}`,
    );
  }
  console.error(
    "Allowed exception: small route-only client components may live under src/app and import sibling route actions directly.",
  );
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
