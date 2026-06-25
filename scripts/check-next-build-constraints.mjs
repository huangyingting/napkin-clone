#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import process from "node:process";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const NEXT_CONFIG_EXPORTS = new Set([
  "config",
  "runtime",
  "dynamic",
  "revalidate",
  "fetchCache",
  "preferredRegion",
  "maxDuration",
]);

function extensionOf(filePath) {
  const index = filePath.lastIndexOf(".");
  return index === -1 ? "" : filePath.slice(index);
}

function toPosix(path) {
  return path.split(sep).join("/");
}

function lineAndColumn(text, index) {
  const before = text.slice(0, index);
  const lines = before.split(/\r?\n/);
  return {
    lineNumber: lines.length,
    columnNumber: lines[lines.length - 1].length + 1,
  };
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

function isSourceFile(filePath) {
  return SOURCE_EXTENSIONS.has(extensionOf(filePath));
}

function hasUseServerDirective(text) {
  const firstStatement = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== "" && !line.startsWith("//"));
  return (
    firstStatement === '"use server";' || firstStatement === "'use server';"
  );
}

function stripStaticLiteralSyntax(expression) {
  return expression
    .replace(/(["'`])(?:\\.|(?!\1)[\s\S])*\1/g, "")
    .replace(/\b[A-Za-z_$][\w$]*\s*:/g, "")
    .replace(/\b(?:true|false|null|undefined)\b/g, "")
    .replace(/-?\b\d+(?:\.\d+)?\b/g, "")
    .replace(/[{}\[\](),:;\s]/g, "");
}

function isStaticLiteralExpression(expression) {
  return stripStaticLiteralSyntax(expression).length === 0;
}

function findExportInitializer(text, exportName) {
  const pattern = new RegExp(`export\\s+const\\s+${exportName}\\s*=`, "g");
  const match = pattern.exec(text);
  if (!match) return null;
  const start = pattern.lastIndex;
  let depth = 0;
  let quote = null;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    const prev = text[index - 1];
    if (quote) {
      if (char === quote && prev !== "\\") quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{" || char === "[" || char === "(") depth += 1;
    if (char === "}" || char === "]" || char === ")") depth -= 1;
    if (char === ";" && depth === 0) {
      return {
        initializer: text.slice(start, index).trim(),
        index: match.index,
      };
    }
  }
  return { initializer: text.slice(start).trim(), index: match.index };
}

function finding(filePath, text, index, rule, detail) {
  const { lineNumber, columnNumber } = lineAndColumn(text, index);
  return { filePath, lineNumber, columnNumber, rule, detail };
}

export function scanText(filePath, text) {
  const findings = [];

  if (hasUseServerDirective(text)) {
    const exportRe =
      /^\s*export\s+(?!async\s+function\b)(?:default\b|(?:type|interface|const|let|var|function|class)\b|\{|\*)/gm;
    for (const match of text.matchAll(exportRe)) {
      findings.push(
        finding(
          filePath,
          text,
          match.index ?? 0,
          "use-server-non-action-export",
          'A top-level "use server" file may only export async server actions; move shared types/values to src/lib.',
        ),
      );
    }
  }

  if (filePath === "src/proxy.ts" || filePath.startsWith("src/app/")) {
    for (const exportName of NEXT_CONFIG_EXPORTS) {
      const found = findExportInitializer(text, exportName);
      if (!found) continue;
      if (!isStaticLiteralExpression(found.initializer)) {
        findings.push(
          finding(
            filePath,
            text,
            found.index,
            "next-nonliteral-config",
            `export const ${exportName} must be a statically analyzable literal, not an imported/local expression.`,
          ),
        );
      }
      if (
        exportName === "runtime" &&
        !['"nodejs"', "'nodejs'", '"edge"', "'edge'"].includes(
          found.initializer,
        )
      ) {
        findings.push(
          finding(
            filePath,
            text,
            found.index,
            "next-invalid-runtime",
            'runtime must be the literal "nodejs" or "edge".',
          ),
        );
      }
    }
  }

  return findings;
}

export function scanNextBuildConstraints(repoRoot = process.cwd()) {
  const findings = [];
  const srcRoot = join(repoRoot, "src");
  if (!statSync(srcRoot, { throwIfNoEntry: false })?.isDirectory()) {
    return findings;
  }
  for (const absolutePath of walkFiles(srcRoot)) {
    const filePath = toPosix(relative(repoRoot, absolutePath));
    if (!isSourceFile(filePath)) continue;
    findings.push(...scanText(filePath, readFileSync(absolutePath, "utf8")));
  }
  return findings;
}

function main() {
  const findings = scanNextBuildConstraints();
  if (findings.length === 0) {
    console.log("Next build-constraint guard passed.");
    return;
  }

  console.error("Next build-constraint guard failed:");
  for (const item of findings) {
    console.error(
      `${item.filePath}:${item.lineNumber}:${item.columnNumber} ${item.rule} — ${item.detail}`,
    );
  }
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
