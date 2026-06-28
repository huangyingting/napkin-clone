import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  collectImportsFromSource,
  _testOnly,
  computeSccs,
  evaluateImportGraph,
  formatFindings,
  resolveImport,
  runImportGraphCheck,
  signatureForScc,
  sourceFilesForRoot,
} from "./import-graph.mjs";

test("collectImportsFromSource parses imports, re-exports, and export-star barrels", () => {
  const parsed = collectImportsFromSource(`
    import value from "./a";
    import type { T } from "@/lib/t";
    export { value as other } from "./b";
    export type { T } from "./c";
    export * from "./barrel";
  `);

  assert.deepEqual(
    parsed.imports.map((entry) => entry.specifier),
    ["./a", "@/lib/t", "./b", "./c", "./barrel"],
  );
  assert.deepEqual(parsed.exportStars, ["./barrel"]);
});

test("computeSccs returns stable signatures for cyclic components", () => {
  const graph = new Map([
    ["a.ts", new Set(["b.ts"])],
    ["b.ts", new Set(["a.ts"])],
    ["c.ts", new Set(["d.ts"])],
    ["d.ts", new Set()],
  ]);

  assert.deepEqual(computeSccs(graph).map(signatureForScc), ["a.ts | b.ts"]);
});

test("evaluateImportGraph reports unallowlisted cycles, star barrels, and facade imports", () => {
  const rootDir = path.resolve("fixture");
  const files = [
    "src/lib/domain/a.ts",
    "src/lib/domain/b.ts",
    "src/lib/domain/index.ts",
    "src/lib/domain/internal.ts",
  ].map((file) => path.join(rootDir, file));
  const fileContents = new Map([
    [files[0], 'import { b } from "./b"; export const a = b;'],
    [files[1], 'import { a } from "./a"; export const b = a;'],
    [files[2], 'export * from "./a";'],
    [files[3], 'import { a } from "./index"; export const internal = a;'],
  ]);

  const report = evaluateImportGraph({
    rootDir,
    sourceFiles: files,
    fileContents,
    facades: [
      {
        facade: "src/lib/domain/index.ts",
        domainRoot: "src/lib/domain",
        publicConsumers: [],
      },
    ],
    allowlists: {
      sccs: [],
      exportStars: [],
      internalFacadeImports: [],
    },
  });

  assert.deepEqual(
    report.violations.sccs.map((scc) => scc.signature),
    ["src/lib/domain/a.ts | src/lib/domain/b.ts"],
  );
  assert.deepEqual(report.violations.exportStars, [
    { file: "src/lib/domain/index.ts", specifier: "./a" },
  ]);
  assert.deepEqual(report.violations.internalFacadeImports, [
    {
      file: "src/lib/domain/internal.ts",
      specifier: "./index",
      facade: "src/lib/domain/index.ts",
    },
  ]);
});

test("resolveImport handles aliases, relatives, packages, and missing modules", (t) => {
  const rootDir = path.join(
    process.cwd(),
    ".squad",
    "import-graph-resolve-test",
  );
  t.after(() => rmSync(rootDir, { recursive: true, force: true }));
  const importer = path.join(rootDir, "src", "lib", "feature", "index.ts");
  const aliasTarget = path.join(rootDir, "src", "lib", "shared.ts");
  const relativeTarget = path.join(
    rootDir,
    "src",
    "lib",
    "feature",
    "helper.ts",
  );
  mkdirSync(path.dirname(importer), { recursive: true });
  writeFileSync(importer, "export {};\n");
  writeFileSync(aliasTarget, "export const shared = true;\n");
  writeFileSync(relativeTarget, "export const helper = true;\n");

  assert.equal(resolveImport(rootDir, importer, "@/lib/shared"), aliasTarget);
  assert.equal(
    resolveImport(rootDir, importer, "@/lib/shared.ts"),
    aliasTarget,
  );
  assert.equal(resolveImport(rootDir, importer, "./helper"), relativeTarget);
  assert.equal(resolveImport(rootDir, importer, "react"), null);
  assert.equal(resolveImport(rootDir, importer, "./missing"), null);
});

test("sourceFilesForRoot skips generated, dependency, build, and test files", (t) => {
  const rootDir = path.join(
    process.cwd(),
    ".squad",
    "import-graph-source-test",
  );
  t.after(() => rmSync(rootDir, { recursive: true, force: true }));
  for (const directory of [
    "src/lib",
    "src/generated/prisma",
    "node_modules/pkg",
    ".next/server",
    "src/lib/node_modules/pkg",
    "src/lib/.next",
  ]) {
    mkdirSync(path.join(rootDir, directory), { recursive: true });
  }
  writeFileSync(
    path.join(rootDir, "src", "lib", "a.ts"),
    "export const a = 1;\n",
  );
  writeFileSync(
    path.join(rootDir, "src", "lib", "b.test.ts"),
    "export const b = 1;\n",
  );
  writeFileSync(
    path.join(rootDir, "src", "generated", "prisma", "client.ts"),
    "export const generated = 1;\n",
  );
  writeFileSync(
    path.join(rootDir, "src", "lib", "node_modules", "pkg", "index.ts"),
    "export const ignored = 1;\n",
  );
  writeFileSync(
    path.join(rootDir, "src", "lib", ".next", "chunk.ts"),
    "export const ignored = 1;\n",
  );
  writeFileSync(
    path.join(rootDir, "node_modules", "pkg", "index.ts"),
    "export const ignored = 1;\n",
  );
  writeFileSync(
    path.join(rootDir, ".next", "server", "chunk.ts"),
    "export const ignored = 1;\n",
  );

  assert.deepEqual(sourceFilesForRoot(rootDir), [
    path.join(rootDir, "src", "lib", "a.ts"),
  ]);
});

test("evaluateImportGraph honors allowlists and public facade consumers", () => {
  const rootDir = path.resolve("fixture-allowlisted");
  const files = [
    "src/lib/domain/a.ts",
    "src/lib/domain/b.ts",
    "src/lib/domain/index.ts",
    "src/app/page.ts",
  ].map((file) => path.join(rootDir, file));
  const fileContents = new Map([
    [files[0], 'import { b } from "./b"; export const a = b;'],
    [files[1], 'import { a } from "./a"; export const b = a;'],
    [files[2], 'export * from "./a";'],
    [
      files[3],
      'import { a } from "@/lib/domain/index"; export const page = a;',
    ],
  ]);

  const report = evaluateImportGraph({
    rootDir,
    sourceFiles: files,
    fileContents,
    facades: [
      {
        facade: "src/lib/domain/index.ts",
        domainRoot: "src/lib/domain",
        publicConsumers: ["src/app/page.ts"],
      },
    ],
    allowlists: {
      sccs: [{ signature: "src/lib/domain/a.ts | src/lib/domain/b.ts" }],
      exportStars: [{ file: "src/lib/domain/index.ts", specifier: "./a" }],
      internalFacadeImports: [],
    },
  });

  assert.deepEqual(report.violations, {
    sccs: [],
    exportStars: [],
    internalFacadeImports: [],
  });
});

test("formatFindings renders all violation sections and returns empty text for a clean report", () => {
  assert.equal(
    formatFindings({
      violations: { sccs: [], exportStars: [], internalFacadeImports: [] },
    }),
    "",
  );

  const text = formatFindings({
    violations: {
      sccs: [{ signature: "a.ts | b.ts", paths: ["a.ts", "b.ts"] }],
      exportStars: [{ file: "src/index.ts", specifier: "./a" }],
      internalFacadeImports: [
        {
          file: "src/lib/internal.ts",
          specifier: "./index",
          facade: "src/lib/index.ts",
        },
      ],
    },
  });

  assert.match(text, /Import graph SCCs/);
  assert.match(text, /Unapproved export \*/);
  assert.match(text, /Internal facade imports/);
});

test("runImportGraphCheck evaluates files discovered from disk", (t) => {
  const rootDir = path.join(process.cwd(), ".squad", "import-graph-run-test");
  t.after(() => rmSync(rootDir, { recursive: true, force: true }));
  mkdirSync(path.join(rootDir, "src", "lib"), { recursive: true });
  writeFileSync(
    path.join(rootDir, "src", "lib", "a.ts"),
    'import { b } from "./b"; export const a = b;\n',
  );
  writeFileSync(
    path.join(rootDir, "src", "lib", "b.ts"),
    "export const b = 1;\n",
  );

  const { sourceFiles, report } = runImportGraphCheck(rootDir);

  assert.equal(sourceFiles.length, 2);
  assert.deepEqual(report.violations.sccs, []);
});

test("import graph source filter rejects dependency and build paths defensively", () => {
  assert.equal(_testOnly.isSourceFile("src/node_modules/pkg/index.ts"), false);
  assert.equal(_testOnly.isSourceFile("src/.next/server/chunk.ts"), false);
});
