/**
 * Offline persisted-schema migration CLI (#502).
 *
 * Wires the reusable harness in `src/lib/schema-migrate/harness.ts` to the app
 * Prisma client. One-off deck / visual / source-ref migrations are registered
 * in the {@link MIGRATIONS} array; each is a {@link MigrationDescriptor} whose
 * `selectRows`/`applyRow` talk to Prisma and whose `transformRow` is a pure
 * shape transform.
 *
 * Migrations live ONLY here (offline) — the runtime render/export paths never
 * branch on superseded shapes (AGENTS.md).
 *
 * Usage:
 *   node --import tsx src/scripts/migrate-persisted-schema.ts --list
 *   node --import tsx src/scripts/migrate-persisted-schema.ts --name <migration>           # dry run (default)
 *   node --import tsx src/scripts/migrate-persisted-schema.ts --name <migration> --apply    # persist changes
 *
 * npm script: `npm run migrate:schema -- --name <migration> [--apply]`.
 *
 * Defaults to --dry-run; --apply is required to mutate data. See
 * docs/operations/persisted-schema-migrations.md.
 */

import { prisma } from "@/lib/prisma";
import { resolveProvider } from "@/lib/db-provider";
import {
  runMigration,
  formatMigrationResult,
  backupGuidance,
  type MigrationDescriptor,
} from "@/lib/schema-migrate/harness";

/**
 * Registered offline migrations. Add a descriptor here when a persisted shape
 * changes. Example skeleton (deck migration):
 *
 *   const myDeckMigration: MigrationDescriptor<{ id: string; deckJson: unknown }> = {
 *     name: "2026-07-example-deck-field",
 *     description: "Backfill Deck.newField for decks persisted before vN.",
 *     selectRows: () =>
 *       prisma.document.findMany({ select: { id: true, deckJson: true } }),
 *     isAlreadyMigrated: (row) => deckHasNewField(row.deckJson),
 *     transformRow: (row) => {
 *       const migrated = addNewField(row.deckJson);
 *       return migrated ? { ...row, deckJson: migrated } : null;
 *     },
 *     applyRow: (row) =>
 *       prisma.document.update({
 *         where: { id: row.id },
 *         data: { deckJson: row.deckJson as Prisma.InputJsonValue },
 *       }).then(() => undefined),
 *   };
 *
 * Then push it onto MIGRATIONS below.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MIGRATIONS: MigrationDescriptor<any>[] = [];

function getArg(flag: string): string | undefined {
  const argv = process.argv.slice(2);
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  return argv[index + 1];
}

function printLines(lines: string[]): void {
  for (const line of lines) console.log(line);
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const apply = args.has("--apply");
  const name = getArg("--name");

  console.log(`Persisted schema migrations (provider: ${resolveProvider()})`);

  if (args.has("--list") || (!name && MIGRATIONS.length > 0)) {
    if (MIGRATIONS.length === 0) {
      console.log("No migrations registered.");
    } else {
      console.log("Available migrations:");
      for (const m of MIGRATIONS) {
        console.log(
          `  • ${m.name}${m.description ? ` — ${m.description}` : ""}`,
        );
      }
    }
    return;
  }

  if (!name) {
    console.log(
      "No migrations registered. Add a MigrationDescriptor to MIGRATIONS " +
        "in src/scripts/migrate-persisted-schema.ts. See " +
        "docs/operations/persisted-schema-migrations.md.",
    );
    return;
  }

  const migration = MIGRATIONS.find((m) => m.name === name);
  if (!migration) {
    console.error(`Unknown migration: ${name}`);
    process.exitCode = 1;
    return;
  }

  if (apply) {
    printLines(backupGuidance());
  } else {
    console.log(
      "Dry run (no changes will be written). Pass --apply to persist.",
    );
  }

  const result = await runMigration(migration, { apply });
  printLines(formatMigrationResult(result));

  if (result.failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(
      `Migration run failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
