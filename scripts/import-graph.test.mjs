import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  collectImportsFromSource,
  computeSccs,
  evaluateImportGraph,
  signatureForScc,
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
