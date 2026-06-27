import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCoverageCommand,
  coverageMinimum,
  LINE_COVERAGE_STAGES,
  parseCoverageMinimum,
  runLineCoverage,
} from "./check-line-coverage.mjs";

test("line coverage stages cover source and script unit gates", () => {
  assert.deepEqual(
    LINE_COVERAGE_STAGES.map((stage) => stage.name),
    ["Source unit line coverage", "Script line coverage"],
  );
  assert.deepEqual(LINE_COVERAGE_STAGES[0].includes, [
    "src/**/*.ts",
    "src/**/*.tsx",
  ]);
  assert.deepEqual(LINE_COVERAGE_STAGES[1].testFiles, [
    "scripts/**/*.test.mjs",
  ]);
});

test("line coverage minimum uses global and stage-specific overrides", () => {
  assert.equal(coverageMinimum(LINE_COVERAGE_STAGES[0], {}), 91);
  assert.equal(
    coverageMinimum(LINE_COVERAGE_STAGES[0], { LINE_COVERAGE_MIN: "100" }),
    100,
  );
  assert.equal(
    coverageMinimum(LINE_COVERAGE_STAGES[0], {
      LINE_COVERAGE_MIN: "100",
      SOURCE_LINE_COVERAGE_MIN: "92",
    }),
    92,
  );
});

test("line coverage minimum rejects invalid thresholds", () => {
  assert.throws(
    () => parseCoverageMinimum("101", "LINE_COVERAGE_MIN"),
    /integer between 0 and 100/,
  );
  assert.throws(
    () => parseCoverageMinimum("not-a-number", "LINE_COVERAGE_MIN"),
    /integer between 0 and 100/,
  );
  assert.throws(
    () => parseCoverageMinimum("91.5", "LINE_COVERAGE_MIN"),
    /integer between 0 and 100/,
  );
});

test("line coverage command includes threshold, include, exclude, and tests", () => {
  const command = buildCoverageCommand(LINE_COVERAGE_STAGES[0], {
    SOURCE_LINE_COVERAGE_MIN: "92",
  });

  assert.equal(command.command, "node");
  assert.deepEqual(command.args, [
    "--import",
    "tsx",
    "--test",
    "--experimental-test-coverage",
    "--test-coverage-lines=92",
    "--test-coverage-include=src/**/*.ts",
    "--test-coverage-include=src/**/*.tsx",
    "--test-coverage-exclude=src/**/*.test.ts",
    "--test-coverage-exclude=src/**/*.test.tsx",
    "src/**/*.test.ts",
  ]);
});

test("line coverage runner stops on the first failed stage", () => {
  const calls = [];
  const exitCode = runLineCoverage({
    stages: LINE_COVERAGE_STAGES,
    env: {},
    spawn: (command, args) => {
      calls.push([command, args]);
      return { status: 7 };
    },
  });

  assert.equal(exitCode, 7);
  assert.equal(calls.length, 1);
});

test("line coverage runner succeeds after all stages pass", () => {
  const calls = [];
  const exitCode = runLineCoverage({
    stages: LINE_COVERAGE_STAGES,
    env: {},
    spawn: (command, args) => {
      calls.push([command, args]);
      return { status: 0 };
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(calls.length, 2);
});
