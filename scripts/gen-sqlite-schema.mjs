// Generates prisma/schema.sqlite.prisma from the canonical prisma/schema.prisma.
//
// The canonical schema (provider = "postgresql") is the single source of truth.
// This script copies it verbatim and rewrites ONLY the datasource provider to
// "sqlite", so the two engines never drift apart. Re-running it is idempotent:
// the output is fully recomputed from the canonical schema each time, so an
// unchanged canonical produces a byte-identical file (no diff).
//
// Usage: node scripts/gen-sqlite-schema.mjs   (npm run db:schema:sqlite)

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const canonicalPath = join(repoRoot, "prisma", "schema.prisma");
const sqlitePath = join(repoRoot, "prisma", "schema.sqlite.prisma");

const TARGET_PROVIDER = "sqlite";

// Match the datasource block's provider assignment only (the generator block
// also has a `provider`, so a blind replace would be ambiguous). The lazy
// `[^}]*?` keeps the match inside the datasource block.
const DATASOURCE_PROVIDER =
  /(datasource\s+\w+\s*\{[^}]*?provider\s*=\s*)"([^"]*)"/;

const canonical = readFileSync(canonicalPath, "utf8");

const match = canonical.match(DATASOURCE_PROVIDER);
if (!match) {
  throw new Error(
    `Could not find a datasource provider in ${canonicalPath}. ` +
      "The canonical schema must declare a `datasource` block with a `provider`.",
  );
}

const sqliteSchema = canonical.replace(
  DATASOURCE_PROVIDER,
  `$1"${TARGET_PROVIDER}"`,
);

writeFileSync(sqlitePath, sqliteSchema);

const from = match[2];
console.log(
  `Generated prisma/schema.sqlite.prisma from prisma/schema.prisma ` +
    `(datasource provider "${from}" -> "${TARGET_PROVIDER}").`,
);
