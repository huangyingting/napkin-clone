#!/usr/bin/env node

import {
  formatClientBoundaryFindings,
  runClientBoundaryCheck,
} from "./client-boundary.mjs";

const { sourceFiles, report } = runClientBoundaryCheck(process.cwd());

if (report.violations.length > 0) {
  console.error(formatClientBoundaryFindings(report));
  process.exit(1);
}

console.log(
  `Client boundary check passed (${report.clientRoots.length} client roots, ${report.checkedFiles.length}/${sourceFiles.length} source files reachable from client bundles).`,
);
