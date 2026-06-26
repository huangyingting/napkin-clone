#!/usr/bin/env node

/**
 * Import-graph ratchet thresholds.
 *
 * These constants set a DECLINING maximum for each bypass category. The check
 * fails if the actual allowlist count exceeds the threshold. Lower the
 * threshold whenever the count is reduced; never raise it silently.
 *
 * All three categories reached 0 as part of the code-health initiative:
 *   #1136 — internal-facade-import allowlist retired to 0
 *   #1137 — thresholds locked at 0; bypasses can no longer regress
 *
 * To burn down further: remove entries from import-graph-allowlist.mjs and
 * lower the corresponding constant here in the same commit.
 */
const MAX_SCCS = 0;
const MAX_EXPORT_STARS = 0;
const MAX_INTERNAL_FACADE_IMPORTS = 0;

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

const ratchetErrors = [];
if (report.internalFacadeImports.length > MAX_INTERNAL_FACADE_IMPORTS) {
  ratchetErrors.push(
    `Internal-facade-import bypasses increased to ${report.internalFacadeImports.length}, exceeding the allowed maximum of ${MAX_INTERNAL_FACADE_IMPORTS} — route new imports through the facade barrel.`,
  );
}
if (report.sccs.length > MAX_SCCS) {
  ratchetErrors.push(
    `Allowed SCCs increased to ${report.sccs.length}, exceeding the allowed maximum of ${MAX_SCCS} — resolve the cycle instead of adding it to the allowlist.`,
  );
}
if (report.exportStars.length > MAX_EXPORT_STARS) {
  ratchetErrors.push(
    `Allowed export-star barrels increased to ${report.exportStars.length}, exceeding the allowed maximum of ${MAX_EXPORT_STARS} — replace the export-star with named re-exports.`,
  );
}
if (ratchetErrors.length > 0) {
  for (const msg of ratchetErrors) {
    console.error(`[import-graph] ratchet exceeded: ${msg}`);
  }
  process.exit(1);
}

console.log(
  `Import graph check passed (${sourceFiles.length} source files, ${report.sccs.length} allowed SCCs, ${report.exportStars.length} allowed export-star barrels, ${report.internalFacadeImports.length} allowed internal facade imports).`,
);
