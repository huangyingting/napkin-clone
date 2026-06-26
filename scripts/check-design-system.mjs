#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import process from "node:process";

const SCAN_ROOTS = ["src/app", "src/components"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".css"]);
const RAW_Z_CLASS = /\bz-(?:\[(?:\d+)\]|\d+)\b/g;
const RAW_HEX_ARBITRARY_CLASS =
  /\b(?:bg|text|border|ring|shadow|fill|stroke|from|via|to)-\[#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\]/g;
const RAW_RADIUS_ARBITRARY_CLASS =
  /\brounded(?:-[trbl]{1,2})?-\[(?!var\()[^\]]+\]/g;
const RAW_SHADOW_ARBITRARY_CLASS = /\bshadow-\[(?!var\()[^\]]+\]/g;
const NON_DS_NEUTRAL_CLASS =
  /\b(?:bg|text|border|ring)-(?:slate|gray|zinc|neutral|stone)-\d{2,3}(?:\/\d{1,3})?\b/g;

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
  if (normalized.includes("/node_modules/") || normalized.includes("/.next/")) {
    return false;
  }
  return true;
}

function shouldScanRawHex(filePath) {
  const normalized = toPosix(filePath);
  if (normalized === "src/app/globals.css") {
    return false;
  }
  if (normalized.startsWith("src/components/ui/")) {
    return false;
  }
  return true;
}

function shouldScanRawChrome(filePath) {
  const normalized = toPosix(filePath);
  if (normalized === "src/app/globals.css") {
    return false;
  }
  if (normalized.startsWith("src/components/ui/")) {
    return false;
  }
  return true;
}

function finding(filePath, lineNumber, columnNumber, rule, match) {
  return { filePath, lineNumber, columnNumber, rule, match };
}

export function scanText(filePath, text) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  const scanHex = shouldScanRawHex(filePath);
  const scanChrome = shouldScanRawChrome(filePath);

  lines.forEach((line, lineIndex) => {
    for (const match of line.matchAll(RAW_Z_CLASS)) {
      findings.push(
        finding(
          filePath,
          lineIndex + 1,
          (match.index ?? 0) + 1,
          "raw-z-index",
          match[0],
        ),
      );
    }

    if (!scanHex) {
      if (!scanChrome) {
        return;
      }
    }

    if (scanChrome) {
      for (const match of line.matchAll(RAW_RADIUS_ARBITRARY_CLASS)) {
        findings.push(
          finding(
            filePath,
            lineIndex + 1,
            (match.index ?? 0) + 1,
            "raw-radius-class",
            match[0],
          ),
        );
      }

      for (const match of line.matchAll(RAW_SHADOW_ARBITRARY_CLASS)) {
        findings.push(
          finding(
            filePath,
            lineIndex + 1,
            (match.index ?? 0) + 1,
            "raw-shadow-class",
            match[0],
          ),
        );
      }

      for (const match of line.matchAll(NON_DS_NEUTRAL_CLASS)) {
        findings.push(
          finding(
            filePath,
            lineIndex + 1,
            (match.index ?? 0) + 1,
            "non-ds-neutral-class",
            match[0],
          ),
        );
      }
    }

    if (scanHex) {
      for (const match of line.matchAll(RAW_HEX_ARBITRARY_CLASS)) {
        findings.push(
          finding(
            filePath,
            lineIndex + 1,
            (match.index ?? 0) + 1,
            "raw-hex-class",
            match[0],
          ),
        );
      }
    }
  });

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

export function scanDesignSystem(repoRoot = process.cwd()) {
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
  const findings = scanDesignSystem();
  if (findings.length === 0) {
    console.log("Design-system guardrails passed.");
    return;
  }

  console.error("Design-system guardrails failed:");
  for (const item of findings) {
    const guidance =
      item.rule === "raw-z-index"
        ? "Use a named semantic z utility from globals.css (for example z-raised, z-modal, z-toast)."
        : item.rule === "raw-hex-class"
          ? "Move raw hex colors into the DS token/theme layer; feature class names must use semantic utilities."
          : "Use DS radius, elevation, and neutral utilities instead of raw chrome classes.";
    console.error(
      `${item.filePath}:${item.lineNumber}:${item.columnNumber} ${item.rule} ${item.match} — ${guidance}`,
    );
  }
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
