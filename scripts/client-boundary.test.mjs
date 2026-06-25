import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  collectClientBoundaryImports,
  evaluateClientBoundary,
  formatClientBoundaryFindings,
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
