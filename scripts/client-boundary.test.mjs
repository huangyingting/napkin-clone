import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  collectClientBoundaryImports,
  _testOnly,
  evaluateClientBoundary,
  formatClientBoundaryFindings,
  resolveLocalImport,
  runClientBoundaryCheck,
  sourceFilesForRoot,
} from "./client-boundary.mjs";

function fixtureFiles(rootDir, entries) {
  const files = [];
  const contents = new Map();
  for (const [relative, source] of Object.entries(entries)) {
    const absolute = path.join(rootDir, relative);
    files.push(absolute);
    contents.set(absolute, source);
  }
  return { files, contents };
}

test("collectClientBoundaryImports ignores type-only imports and detects client roots", () => {
  const parsed = collectClientBoundaryImports(`
    "use client";
    import type { Prisma } from "@prisma/client";
    import { type Foo } from "./types";
    import { value } from "./runtime";
    export type { Other } from "./other";
    export { runtime } from "./runtime2";
  `);

  assert.equal(parsed.isClientEntry, true);
  assert.deepEqual(
    parsed.imports.map(({ specifier, typeOnly }) => ({ specifier, typeOnly })),
    [
      { specifier: "@prisma/client", typeOnly: true },
      { specifier: "./types", typeOnly: true },
      { specifier: "./runtime", typeOnly: false },
      { specifier: "./other", typeOnly: true },
      { specifier: "./runtime2", typeOnly: false },
    ],
  );
});

test("evaluateClientBoundary reports server-only dependencies reachable from a client root", () => {
  const rootDir = path.resolve("fixture-client-boundary");
  const { files, contents } = fixtureFiles(rootDir, {
    "src/components/client.tsx":
      '"use client"; import { helper } from "@/lib/helper"; export { helper };',
    "src/lib/helper.ts":
      'import { prisma } from "@/lib/prisma"; export const helper = prisma;',
    "src/lib/prisma.ts":
      'import { PrismaClient } from "@prisma/client"; export const prisma = new PrismaClient();',
  });

  const report = evaluateClientBoundary({
    rootDir,
    sourceFiles: files,
    fileContents: contents,
  });

  assert.equal(report.violations.length, 1);
  assert.deepEqual(report.violations[0], {
    file: "src/lib/prisma.ts",
    line: 1,
    specifier: "@prisma/client",
    reason:
      "@prisma/client is server-only and must not be statically imported by a client bundle.",
    chain: [
      "src/components/client.tsx",
      "src/lib/helper.ts",
      "src/lib/prisma.ts",
    ],
  });
  assert.match(formatClientBoundaryFindings(report), /client import path:/);
});

test("evaluateClientBoundary allows lazy-only packages when they are not statically imported", () => {
  const rootDir = path.resolve("fixture-client-boundary-lazy");
  const { files, contents } = fixtureFiles(rootDir, {
    "src/components/client.tsx": `"use client";
      export async function exportNow() {
        const { jsPDF } = await import("jspdf");
        return jsPDF;
      }
    `,
  });

  const report = evaluateClientBoundary({
    rootDir,
    sourceFiles: files,
    fileContents: contents,
  });

  assert.deepEqual(report.violations, []);
});

test("collectClientBoundaryImports detects server directives and namespace value imports", () => {
  const parsed = collectClientBoundaryImports(
    `
      "use server";
      import * as fs from "node:fs";
      import "server-only";
      const value = true;
    `,
    "source.js",
  );

  assert.equal(parsed.isServerEntry, true);
  assert.deepEqual(
    parsed.imports.map(({ specifier, typeOnly }) => ({ specifier, typeOnly })),
    [
      { specifier: "node:fs", typeOnly: false },
      { specifier: "server-only", typeOnly: false },
    ],
  );
});

test("collectClientBoundaryImports skips non-directive string prologues", () => {
  assert.equal(
    collectClientBoundaryImports('"not a directive";\n"use client";')
      .isClientEntry,
    true,
  );
  assert.equal(
    collectClientBoundaryImports('"not a directive";').isClientEntry,
    false,
  );
});

test("evaluateClientBoundary reports builtins and lazy-only static imports but stops at server files", () => {
  const rootDir = path.resolve("fixture-client-boundary-builtins");
  const { files, contents } = fixtureFiles(rootDir, {
    "src/components/client.tsx": `"use client";
      import fs from "fs";
      import { zip } from "jszip";
      import { action } from "./actions";
      export { zip, action, fs };
    `,
    "src/components/actions.ts": `"use server";
      import { PrismaClient } from "@prisma/client";
      export async function action() { return PrismaClient; }
    `,
  });

  const report = evaluateClientBoundary({
    rootDir,
    sourceFiles: files,
    fileContents: contents,
  });

  assert.deepEqual(
    report.violations.map((finding) => finding.specifier),
    ["fs", "jszip"],
  );
  assert.equal(formatClientBoundaryFindings({ violations: [] }), "");
});

test("evaluateClientBoundary reports node protocol builtins in client files", () => {
  const rootDir = path.resolve("fixture-client-boundary-node-protocol");
  const { files, contents } = fixtureFiles(rootDir, {
    "src/components/client.tsx": '"use client"; import fs from "node:fs";',
  });

  const report = evaluateClientBoundary({
    rootDir,
    sourceFiles: files,
    fileContents: contents,
  });

  assert.equal(report.violations[0].specifier, "node:fs");
});

test("client boundary resolves explicit files, indexes, packages, and missing locals", (t) => {
  const rootDir = path.join(process.cwd(), ".squad", "client-boundary-resolve");
  t.after(() => rmSync(rootDir, { recursive: true, force: true }));
  const importer = path.join(rootDir, "src", "components", "client.tsx");
  const explicit = path.join(rootDir, "src", "lib", "explicit.ts");
  const index = path.join(rootDir, "src", "lib", "folder", "index.ts");
  mkdirSync(path.dirname(importer), { recursive: true });
  mkdirSync(path.dirname(index), { recursive: true });
  writeFileSync(importer, '"use client";\n');
  writeFileSync(explicit, "export const explicit = true;\n");
  writeFileSync(index, "export const index = true;\n");

  assert.equal(
    resolveLocalImport(rootDir, importer, "@/lib/explicit.ts"),
    explicit,
  );
  assert.equal(resolveLocalImport(rootDir, importer, "@/lib/folder"), index);
  assert.equal(resolveLocalImport(rootDir, importer, "react"), null);
  assert.equal(resolveLocalImport(rootDir, importer, "./missing"), null);
});

test("client boundary discovers source files from disk and runs the check", (t) => {
  const rootDir = path.join(process.cwd(), ".squad", "client-boundary-source");
  t.after(() => rmSync(rootDir, { recursive: true, force: true }));
  for (const directory of [
    "src/components",
    "src/generated/prisma",
    "node_modules/pkg",
    ".next/server",
    "src/components/.next",
    "src/components/node_modules/pkg",
  ]) {
    mkdirSync(path.join(rootDir, directory), { recursive: true });
  }
  writeFileSync(
    path.join(rootDir, "src", "components", "client.tsx"),
    '"use client";\nimport { helper } from "./helper";\n',
  );
  writeFileSync(
    path.join(rootDir, "src", "components", "helper.ts"),
    "export const helper = true;\n",
  );
  writeFileSync(
    path.join(rootDir, "src", "components", "helper.test.ts"),
    "export const ignored = true;\n",
  );
  writeFileSync(
    path.join(rootDir, "src", "generated", "prisma", "client.ts"),
    "export const ignored = true;\n",
  );
  writeFileSync(
    path.join(rootDir, "src", "components", ".next", "chunk.ts"),
    "export const ignored = true;\n",
  );
  writeFileSync(
    path.join(rootDir, "src", "components", "node_modules", "pkg", "index.ts"),
    "export const ignored = true;\n",
  );
  writeFileSync(
    path.join(rootDir, "node_modules", "pkg", "index.ts"),
    "export const ignored = true;\n",
  );
  writeFileSync(
    path.join(rootDir, ".next", "server", "chunk.ts"),
    "export const ignored = true;\n",
  );

  assert.deepEqual(
    sourceFilesForRoot(rootDir)
      .map((file) => path.basename(file))
      .sort(),
    ["client.tsx", "helper.ts"],
  );

  const { sourceFiles, report } = runClientBoundaryCheck(rootDir);
  assert.equal(sourceFiles.length, 2);
  assert.deepEqual(report.violations, []);
});

test("client boundary source filter rejects dependency and build paths defensively", () => {
  assert.equal(_testOnly.isSourceFile("src/node_modules/pkg/index.ts"), false);
  assert.equal(_testOnly.isSourceFile("src/.next/server/chunk.ts"), false);
});
