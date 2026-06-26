/**
 * Transitional import-graph exceptions.
 *
 * Each entry must carry a reason so remaining exceptions are visible in CI and
 * easy to retire as modules are split.
 */

export const allowedSccs = [
  // Keep sorted path signatures exact; the checker prints the signature for new SCCs.
];

export const allowedExportStars = [
  // Keep importer/specifier pairs exact; export-star barrels should be retired.
];

export const allowedInternalFacadeImports = [];

export const facadeRules = [
  {
    facade: "src/lib/commands/command-envelope.ts",
    domainRoot: "src/lib/commands",
    publicConsumers: ["src/lib/commands/command-envelope.test.ts"],
  },
  {
    facade: "src/lib/comments/index.ts",
    domainRoot: "src/lib/comments",
    publicConsumers: ["src/lib/comments/service.test.ts"],
  },
  {
    facade: "src/lib/limits/index.ts",
    domainRoot: "src/lib/limits",
    publicConsumers: ["src/lib/limits/limits.test.ts"],
  },
  {
    facade: "src/lib/presentation/deck.ts",
    domainRoot: "src/lib/presentation",
    publicConsumers: ["src/lib/presentation/deck.test.ts"],
  },
  {
    facade: "src/lib/presentation/deck-mutations.ts",
    domainRoot: "src/lib/presentation",
    publicConsumers: ["src/lib/presentation/deck-mutations.test.ts"],
  },
  {
    facade: "src/lib/presentation/deck-theme-tokens.ts",
    domainRoot: "src/lib/presentation",
    publicConsumers: ["src/lib/presentation/deck-theme-tokens.test.ts"],
  },
];
