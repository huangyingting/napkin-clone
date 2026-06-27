import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTestPlan,
  classifyTestFile,
  findSubsystemCoverageGaps,
  findTestFileNameProblems,
  findUnclassifiedTestFiles,
  findWeakTestTitleProblems,
  listSubsystems,
  runTestCoverageAudit,
  scanTestText,
} from "./test-subsystem.mjs";

const SAMPLE_TEST_FILES = [
  "e2e/present-export.spec.ts",
  "scripts/collab-auth.test.mjs",
  "scripts/check-docs-links.test.mjs",
  "src/app/api/collab/authorize/parser.test.ts",
  "src/lib/auth/password.test.ts",
  "src/lib/collab/room-access.test.ts",
  "src/lib/presentation/deck-schema.test.ts",
];

test("test subsystem map exposes stable subsystem names", () => {
  assert.ok(listSubsystems().includes("editor"));
  assert.ok(listSubsystems().includes("presentation"));
  assert.ok(listSubsystems().includes("security"));
});

test("test subsystem map classifies files by owning subsystem", () => {
  assert.deepEqual(classifyTestFile("src/lib/auth/password.test.ts"), ["auth"]);
  assert.ok(
    classifyTestFile("src/lib/presentation/deck-schema.test.ts").includes(
      "data-model",
    ),
  );
  assert.ok(
    classifyTestFile("e2e/present-export.spec.ts").includes("presentation"),
  );
});

test("test subsystem plan routes source and script files without e2e by default", () => {
  const plan = buildTestPlan({
    subsystems: ["collaboration"],
    testFiles: SAMPLE_TEST_FILES,
  });

  assert.deepEqual(plan.commands, [
    {
      label: "source unit tests",
      command: "node",
      args: [
        "--import",
        "tsx",
        "--test",
        "src/app/api/collab/authorize/parser.test.ts",
        "src/lib/collab/room-access.test.ts",
      ],
    },
    {
      label: "script tests",
      command: "node",
      args: ["--test", "scripts/collab-auth.test.mjs"],
    },
  ]);
  assert.deepEqual(plan.skippedE2e, []);
});

test("test subsystem plan keeps e2e specs opt-in", () => {
  const withoutE2e = buildTestPlan({
    subsystems: ["presentation"],
    testFiles: SAMPLE_TEST_FILES,
  });
  const withE2e = buildTestPlan({
    subsystems: ["presentation"],
    testFiles: SAMPLE_TEST_FILES,
    includeE2e: true,
  });

  assert.deepEqual(withoutE2e.skippedE2e, ["e2e/present-export.spec.ts"]);
  assert.deepEqual(withE2e.commands.at(-1), {
    label: "e2e tests",
    command: "npx",
    args: ["playwright", "test", "e2e/present-export.spec.ts"],
  });
});

test("test subsystem coverage check flags unmapped test files", () => {
  assert.deepEqual(findUnclassifiedTestFiles(SAMPLE_TEST_FILES), []);
  assert.deepEqual(
    findUnclassifiedTestFiles(["src/lib/unowned/example.test.ts"]),
    ["src/lib/unowned/example.test.ts"],
  );
});

test("test subsystem coverage check flags empty subsystem buckets", () => {
  assert.deepEqual(findSubsystemCoverageGaps(SAMPLE_TEST_FILES), [
    "ai",
    "billing",
    "brand",
    "commands",
    "comments",
    "diagnostics",
    "documents",
    "editor",
    "import",
    "localization",
    "product",
    "security",
    "system",
    "ui",
    "visual",
    "workspace",
  ]);
});

test("test naming audit flags unclear file names", () => {
  assert.deepEqual(
    findTestFileNameProblems(["src/lib/auth/password.test.ts"]),
    [],
  );
  assert.deepEqual(
    findTestFileNameProblems([
      "src/lib/auth/password.spec.ts",
      "e2e/auth_redirect.test.ts",
    ]).map((item) => item.rule),
    ["test-file-name", "e2e-spec-name", "unit-test-name"],
  );
});

test("test naming audit flags weak test case names", () => {
  assert.deepEqual(
    scanTestText(
      "src/lib/example.test.ts",
      [
        'test("delete", () => {});',
        'test("returns null when everything is deleted", () => {});',
      ].join("\n"),
    ).map((item) => item.match),
    ["delete"],
  );
});

test("test coverage audit combines coverage and naming checks", () => {
  const audit = runTestCoverageAudit(["src/lib/unowned/example.test.ts"], {
    readText: () => 'test("works", () => {});',
  });

  assert.deepEqual(audit.unclassified, ["src/lib/unowned/example.test.ts"]);
  assert.equal(audit.weakTitleProblems[0].match, "works");
});

test("test naming audit reads supplied test file text", () => {
  const findings = findWeakTestTitleProblems(
    ["src/lib/auth/password.test.ts"],
    {
      readText: () => 'test("selection", () => {});',
    },
  );

  assert.equal(findings[0].rule, "weak-test-title");
});
