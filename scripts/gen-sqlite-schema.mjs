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
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const canonicalPath = join(repoRoot, "prisma", "schema.prisma");
const sqlitePath = join(repoRoot, "prisma", "schema.sqlite.prisma");

const TARGET_PROVIDER = "sqlite";

// Match the datasource block's provider assignment only (the generator block
// also has a `provider`, so a blind replace would be ambiguous). The lazy
// `[^}]*?` keeps the match inside the datasource block.
const DATASOURCE_PROVIDER =
  /(datasource\s+\w+\s*\{[^}]*?provider\s*=\s*)"([^"]*)"/;

const REQUIRED_SCHEMA_CONTRACT_METADATA = [
  {
    name: "DocumentVersion persisted snapshots",
    all: [
      /model\s+DocumentVersion\s*\{/,
      /contentJson\s+Json/,
      /deckJson\s+Json\?/,
      /Point-in-time snapshot of a document's editable state/,
    ],
  },
  {
    name: "Comment anchor persisted columns",
    all: [
      /model\s+Comment\s*\{/,
      /anchorType\s+String\?/,
      /anchorNodeId\s+String\?/,
      /anchorGeometry\s+Json\?/,
      /Slide-level anchor fields/,
    ],
  },
  {
    name: "Tag slug ownership invariants",
    all: [
      /model\s+Tag\s*\{/,
      /slug\s+String/,
      /@@unique\(\[ownerId,\s*slug\]\)/,
      /The slug derives from slugify\(name\)/,
    ],
  },
  {
    name: "Workspace role string literal metadata",
    all: [
      /model\s+WorkspaceMember\s*\{/,
      /role\s+String\s+@default\("VIEWER"\)/,
      /model\s+InviteLink\s*\{/,
      /model\s+InviteLinkUse\s*\{/,
    ],
  },
  {
    name: "Asset scope metadata",
    all: [
      /model\s+Asset\s*\{/,
      /documentId\s+String\?/,
      /workspaceId\s+String\?/,
      /brandId\s+String\?/,
      /Scope: an asset may be owned by a document, workspace, or brand/,
    ],
  },
];

export function parseOptions(args) {
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

export function validateSchemaContractMetadata(schema) {
  const missing = [];
  for (const requirement of REQUIRED_SCHEMA_CONTRACT_METADATA) {
    const absent = requirement.all.filter((pattern) => !pattern.test(schema));
    if (absent.length > 0) {
      missing.push(requirement.name);
    }
  }
  return missing;
}

export function generateSqliteSchema(canonical) {
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

export function formatFirstDifference(expected, actual) {
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

export function runSqliteSchemaCli({
  argv = process.argv.slice(2),
  env = process.env,
  readFile = readFileSync,
  writeFile = writeFileSync,
  stdout = process.stdout,
  stderr = process.stderr,
  setExitCode = (code) => {
    process.exitCode = code;
  },
  paths = { canonicalPath, sqlitePath },
} = {}) {
  const options = parseOptions(argv);

  if (options.ifSqlite && env.DB_PROVIDER === "postgres") {
    stdout.write(
      "Skipping SQLite schema generation for DB_PROVIDER=postgres.\n",
    );
    return;
  }

  const canonical = readFile(paths.canonicalPath, "utf8");
  const { from, schema: sqliteSchema } = generateSqliteSchema(canonical);

  if (options.stdout) {
    stdout.write(sqliteSchema);
    return;
  }

  if (options.check) {
    const current = readFile(paths.sqlitePath, "utf8");
    if (current !== sqliteSchema) {
      stderr.write(
        "prisma/schema.sqlite.prisma is stale. Run `npm run db:schema:sqlite` " +
          "and commit the regenerated file.\n",
      );
      stderr.write(`${formatFirstDifference(sqliteSchema, current)}\n`);
      setExitCode(1);
      return;
    }

    const missingMetadata = validateSchemaContractMetadata(canonical);
    if (missingMetadata.length > 0) {
      stderr.write(
        "prisma/schema.prisma is missing persisted-contract metadata for: " +
          `${missingMetadata.join(", ")}\n`,
      );
      stderr.write(
        "Document schema changes must keep migration/no-migration intent and " +
          "contract comments with the schema they describe.\n",
      );
      setExitCode(1);
      return;
    }

    stdout.write(
      "prisma/schema.sqlite.prisma matches generated output from prisma/schema.prisma.\n",
    );
    return;
  }

  writeFile(paths.sqlitePath, sqliteSchema);

  stdout.write(
    `Generated prisma/schema.sqlite.prisma from prisma/schema.prisma ` +
      `(datasource provider "${from}" -> "${TARGET_PROVIDER}").\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSqliteSchemaCli();
}
