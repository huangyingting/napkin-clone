#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const LINE_COVERAGE_STAGES = [
  {
    name: "Source unit line coverage",
    envKey: "SOURCE_LINE_COVERAGE_MIN",
    defaultMinimum: 91,
    command: "node",
    args: ["--import", "tsx", "--test", "--experimental-test-coverage"],
    includes: ["src/**/*.ts", "src/**/*.tsx"],
    excludes: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "src/generated/**",
      "src/test/**",
    ],
    testFiles: ["src/**/*.test.ts"],
  },
  {
    name: "Script line coverage",
    envKey: "SCRIPT_LINE_COVERAGE_MIN",
    defaultMinimum: 70,
    command: "node",
    args: ["--test", "--experimental-test-coverage"],
    includes: ["scripts/**/*.mjs"],
    excludes: ["scripts/**/*.test.mjs"],
    testFiles: ["scripts/**/*.test.mjs"],
  },
];

export function parseCoverageMinimum(raw, name) {
  const minimum = Number(raw);
  if (
    !Number.isFinite(minimum) ||
    !Number.isInteger(minimum) ||
    minimum < 0 ||
    minimum > 100
  ) {
    throw new Error(`${name} must be an integer between 0 and 100.`);
  }
  return minimum;
}

export function coverageMinimum(stage, env = process.env) {
  return parseCoverageMinimum(
    env[stage.envKey] ?? env.LINE_COVERAGE_MIN ?? stage.defaultMinimum,
    stage.envKey,
  );
}

function formatCoverageMinimum(minimum) {
  return String(minimum);
}

export function buildCoverageCommand(stage, env = process.env) {
  const minimum = coverageMinimum(stage, env);
  return {
    command: stage.command,
    args: [
      ...stage.args,
      `--test-coverage-lines=${formatCoverageMinimum(minimum)}`,
      ...stage.includes.map((pattern) => `--test-coverage-include=${pattern}`),
      ...stage.excludes.map((pattern) => `--test-coverage-exclude=${pattern}`),
      ...stage.testFiles,
    ],
    minimum,
  };
}

function displayCommand(command, args) {
  return [command, ...args].join(" ");
}

export function runLineCoverage({
  stages = LINE_COVERAGE_STAGES,
  env = process.env,
  spawn = spawnSync,
} = {}) {
  for (const [index, stage] of stages.entries()) {
    let coverageCommand;
    try {
      coverageCommand = buildCoverageCommand(stage, env);
    } catch (error) {
      console.error(error.message);
      return 1;
    }

    console.log(
      `\n[line-coverage ${index + 1}/${stages.length}] ${stage.name}: minimum ${formatCoverageMinimum(coverageCommand.minimum)}%`,
    );
    console.log(displayCommand(coverageCommand.command, coverageCommand.args));

    const result = spawn(coverageCommand.command, coverageCommand.args, {
      stdio: "inherit",
      env,
    });
    if (result.status !== 0) {
      return result.status ?? 1;
    }
  }

  console.log("\nLine coverage gate passed.");
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = runLineCoverage();
}
