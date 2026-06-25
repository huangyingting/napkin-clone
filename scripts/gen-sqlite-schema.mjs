// Generates prisma/schema.sqlite.prisma from the canonical prisma/schema.prisma.
//
// The canonical schema (provider = "postgresql") is the single source of truth.
// This script copies it verbatim and rewrites ONLY the datasource provider to
// "sqlite", so the two engines never drift apart. Re-running it is idempotent:
// the output is fully recomputed from the canonical schema each time, so an
// unchanged canonical produces a byte-identical file (no diff).
//
// Usage:
//   node scripts/gen-sqlite-schema.mjs            (npm run db:schema:sqlite)
//   node scripts/gen-sqlite-schema.mjs --check    (npm run db:schema:check)
//   node scripts/gen-sqlite-schema.mjs --stdout
//   node scripts/gen-sqlite-schema.mjs --if-sqlite

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const canonicalPath = join(repoRoot, "prisma", "schema.prisma");
const sqlitePath = join(repoRoot, "prisma", "schema.sqlite.prisma");

const TARGET_PROVIDER = "sqlite";

// Match the datasource block's provider assignment only (the generator block
// also has a `provider`, so a blind replace would be ambiguous). The lazy
// `[^}]*?` keeps the match inside the datasource block.
const DATASOURCE_PROVIDER =
  /(datasource\s+\w+\s*\{[^}]*?provider\s*=\s*)"([^"]*)"/;

function parseOptions(args) {
  const options = {
    check: false,
    ifSqlite: false,
    stdout: false,
  };

  for (const arg of args) {
    if (arg === "--check") {
      options.check = true;
    } else if (arg === "--if-sqlite") {
      options.ifSqlite = true;
    } else if (arg === "--stdout") {
      options.stdout = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (options.check && options.stdout) {
    throw new Error("Use either --check or --stdout, not both.");
  }

  return options;
}

function generateSqliteSchema(canonical) {
  const match = canonical.match(DATASOURCE_PROVIDER);
  if (!match) {
    throw new Error(
      `Could not find a datasource provider in ${canonicalPath}. ` +
        "The canonical schema must declare a `datasource` block with a `provider`.",
    );
  }

  return {
    from: match[2],
    schema: canonical.replace(DATASOURCE_PROVIDER, `$1"${TARGET_PROVIDER}"`),
  };
}

function formatFirstDifference(expected, actual) {
  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  const maxLines = Math.max(expectedLines.length, actualLines.length);
  let lineIndex = 0;

  while (
    lineIndex < maxLines &&
    expectedLines[lineIndex] === actualLines[lineIndex]
  ) {
    lineIndex += 1;
  }

  const start = Math.max(0, lineIndex - 2);
  const end = Math.min(maxLines, lineIndex + 3);
  const lines = [`@@ first difference near line ${lineIndex + 1} @@`];

  for (let index = start; index < end; index += 1) {
    if (expectedLines[index] === actualLines[index]) {
      lines.push(`  ${index + 1}: ${actualLines[index] ?? ""}`);
      continue;
    }

    if (actualLines[index] !== undefined) {
      lines.push(`- ${index + 1}: ${actualLines[index]}`);
    }
    if (expectedLines[index] !== undefined) {
      lines.push(`+ ${index + 1}: ${expectedLines[index]}`);
    }
  }

  return lines.join("\n");
}

function main() {
  const options = parseOptions(process.argv.slice(2));

  if (options.ifSqlite && process.env.DB_PROVIDER === "postgres") {
    console.log("Skipping SQLite schema generation for DB_PROVIDER=postgres.");
    return;
  }

  const canonical = readFileSync(canonicalPath, "utf8");
  const { from, schema: sqliteSchema } = generateSqliteSchema(canonical);

  if (options.stdout) {
    process.stdout.write(sqliteSchema);
    return;
  }

  if (options.check) {
    const current = readFileSync(sqlitePath, "utf8");
    if (current !== sqliteSchema) {
      console.error(
        "prisma/schema.sqlite.prisma is stale. Run `npm run db:schema:sqlite` " +
          "and commit the regenerated file.",
      );
      console.error(formatFirstDifference(sqliteSchema, current));
      process.exitCode = 1;
      return;
    }

    console.log(
      "prisma/schema.sqlite.prisma matches generated output from prisma/schema.prisma.",
    );
    return;
  }

  writeFileSync(sqlitePath, sqliteSchema);

  console.log(
    `Generated prisma/schema.sqlite.prisma from prisma/schema.prisma ` +
      `(datasource provider "${from}" -> "${TARGET_PROVIDER}").`,
  );
}

main();
