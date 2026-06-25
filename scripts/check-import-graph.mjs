#!/usr/bin/env node

import { formatFindings, runImportGraphCheck } from "./import-graph.mjs";

const { sourceFiles, report } = runImportGraphCheck(process.cwd());
const totalViolations =
  report.violations.sccs.length +
  report.violations.exportStars.length +
  report.violations.internalFacadeImports.length;

if (totalViolations > 0) {
  console.error(formatFindings(report));
  process.exit(1);
}

console.log(
  `Import graph check passed (${sourceFiles.length} source files, ${report.sccs.length} allowed SCCs, ${report.exportStars.length} allowed export-star barrels, ${report.internalFacadeImports.length} allowed internal facade imports).`,
);
