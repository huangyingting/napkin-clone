#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const HEAVY_EXPORT_PACKAGES = new Set(["jspdf", "jszip", "pptxgenjs"]);
const HEAVY_EXPORT_MODULES = [
  "src/lib/visual/export.ts",
  "src/lib/visual/document-export-targets.ts",
  "src/lib/visual/deck-export.ts",
];

const PAYLOAD_BUDGETS = [
  {
    name: "editor document loader",
    file: "src/lib/document-editor/loader.ts",
    forbiddenFields: ["collabRecoverySnapshot"],
  },
  {
    name: "public presentation projection",
    file: "src/lib/public-render/resolver-selects.ts",
    forbiddenFields: ["collabRecoverySnapshot"],
  },
  {
    name: "dashboard card projection",
    file: "src/lib/document-management/list.ts",
    forbiddenFields: ["contentJson", "deckJson", "collabRecoverySnapshot"],
  },
];

function sourceKindFor(fileName) {
  return fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function collectStaticValueImports(sourceText, fileName) {
  const source = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    sourceKindFor(fileName),
  );
  const imports = [];
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (
      !statement.moduleSpecifier ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      continue;
    }
    const clause = statement.importClause;
    const typeOnly =
      Boolean(clause?.isTypeOnly) ||
      (!clause?.name &&
        clause?.namedBindings &&
        ts.isNamedImports(clause.namedBindings) &&
        clause.namedBindings.elements.every((element) => element.isTypeOnly));
    if (!typeOnly) imports.push(statement.moduleSpecifier.text);
  }
  return imports;
}

export function runPerfBudgetCheck(rootDir = process.cwd()) {
  const violations = [];

  for (const relativeFile of HEAVY_EXPORT_MODULES) {
    const filePath = path.join(rootDir, relativeFile);
    if (!fs.existsSync(filePath)) continue;
    const imports = collectStaticValueImports(
      fs.readFileSync(filePath, "utf8"),
      relativeFile,
    );
    for (const specifier of imports) {
      const packageName = specifier.startsWith("@")
        ? specifier.split("/").slice(0, 2).join("/")
        : specifier.split("/")[0];
      if (HEAVY_EXPORT_PACKAGES.has(packageName)) {
        violations.push(
          `${relativeFile} statically imports ${specifier}; lazy-load export-heavy dependencies inside export functions.`,
        );
      }
    }
  }

  for (const budget of PAYLOAD_BUDGETS) {
    const filePath = path.join(rootDir, budget.file);
    if (!fs.existsSync(filePath)) continue;
    const source = fs.readFileSync(filePath, "utf8");
    for (const field of budget.forbiddenFields) {
      if (source.includes(`${field}: true`)) {
        violations.push(
          `${budget.name} selects ${field}; keep ${budget.file} under its payload budget.`,
        );
      }
    }
  }

  return { violations };
}

export function formatPerfBudgetFindings(report) {
  return report.violations.length === 0
    ? "Performance budget check passed."
    : [
        "Performance budget violations:",
        ...report.violations.map((v) => `- ${v}`),
      ].join("\n");
}

export function runPerfBudgetCli({
  rootDir = process.cwd(),
  stdout = console.log,
  stderr = console.error,
} = {}) {
  const report = runPerfBudgetCheck(rootDir);
  const text = formatPerfBudgetFindings(report);
  if (report.violations.length > 0) {
    stderr(text);
    return 1;
  }
  stdout(text);
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = runPerfBudgetCli();
}
