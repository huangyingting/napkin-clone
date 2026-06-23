/**
 * Offline persisted-schema migration harness (#502).
 *
 * Per AGENTS.md the runtime render/export paths must NOT carry compatibility
 * branches for superseded payload shapes. When a persisted shape changes, the
 * data is migrated forward by a one-off, offline migration — never patched at
 * read time. This harness provides the reusable structure for those migrations:
 *
 *  - A {@link MigrationDescriptor} describes one migration: how to select
 *    candidate rows, detect rows that are already migrated, transform a row to
 *    its new shape, and (in apply mode) persist it.
 *  - {@link runMigration} executes a descriptor with a `--dry-run` (default)
 *    vs `--apply` switch, returning scanned/changed/skipped/failed counts.
 *  - Idempotency is structural: a correct migration's `isAlreadyMigrated`
 *    returns true for rows it has transformed, so re-running an applied
 *    migration changes 0 rows.
 *
 * The harness is pure/injectable — `selectRows` and `applyRow` are supplied by
 * the caller (the CLI wires them to Prisma; tests use in-memory arrays), so the
 * control flow is fully unit-testable without a live database.
 */

/**
 * Describes a single offline migration over persisted rows of type `Row`.
 */
export interface MigrationDescriptor<Row> {
  /** Stable, human-readable migration name (used in logs/output). */
  name: string;
  /** One-line description of what the migration does. */
  description?: string;
  /** Loads the candidate rows to consider. */
  selectRows: () => Promise<readonly Row[]> | readonly Row[];
  /**
   * True when `row` is already in the target shape and must be skipped. This is
   * what makes a migration idempotent: after `transformRow` runs, the result
   * must satisfy `isAlreadyMigrated`.
   */
  isAlreadyMigrated: (row: Row) => boolean;
  /**
   * Returns the migrated form of `row`, or `null` when the row needs no change
   * (it is then counted as skipped). Must be pure — side effects belong in
   * {@link MigrationDescriptor.applyRow}.
   */
  transformRow: (row: Row) => Row | null;
  /**
   * Persists a migrated `row`. Only invoked in apply mode. Omit for a pure
   * dry-run-only descriptor (e.g. in tests).
   */
  applyRow?: (row: Row) => Promise<void> | void;
}

export interface MigrationRunOptions {
  /** When true, persist changes via `applyRow`. Default false (dry run). */
  apply?: boolean;
  /**
   * Optional sink for per-row diagnostics. Receives SAFE identifiers only —
   * callers must never pass document content.
   */
  onRow?: (event: MigrationRowEvent) => void;
}

export type MigrationRowOutcome = "changed" | "skipped" | "failed";

export interface MigrationRowEvent {
  outcome: MigrationRowOutcome;
  /** Index of the row within the selected set. */
  index: number;
  /** Failure reason (only present for `failed`). */
  reason?: string;
}

export interface MigrationResult {
  name: string;
  /** True when changes were persisted (apply mode), false for a dry run. */
  applied: boolean;
  scanned: number;
  changed: number;
  skipped: number;
  failed: number;
}

/**
 * Executes a migration descriptor. In dry-run mode (default) it reports the
 * counts that an apply WOULD produce without mutating anything. In apply mode
 * it additionally calls `applyRow` for every changed row.
 *
 * A row is:
 *  - **skipped** when `isAlreadyMigrated` is true or `transformRow` returns null;
 *  - **changed** when `transformRow` returns a new row (and, in apply mode, the
 *    persist succeeds);
 *  - **failed** when `transformRow` throws or, in apply mode, `applyRow` throws.
 *
 * Never throws for a single bad row — failures are counted so a migration over
 * many rows surfaces a complete report.
 */
export async function runMigration<Row>(
  descriptor: MigrationDescriptor<Row>,
  options: MigrationRunOptions = {},
): Promise<MigrationResult> {
  const apply = options.apply === true;
  const rows = await descriptor.selectRows();

  let changed = 0;
  let skipped = 0;
  let failed = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    try {
      if (descriptor.isAlreadyMigrated(row)) {
        skipped += 1;
        options.onRow?.({ outcome: "skipped", index });
        continue;
      }

      const next = descriptor.transformRow(row);
      if (next === null) {
        skipped += 1;
        options.onRow?.({ outcome: "skipped", index });
        continue;
      }

      if (apply && descriptor.applyRow) {
        await descriptor.applyRow(next);
      }

      changed += 1;
      options.onRow?.({ outcome: "changed", index });
    } catch (error) {
      failed += 1;
      options.onRow?.({
        outcome: "failed",
        index,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    name: descriptor.name,
    applied: apply,
    scanned: rows.length,
    changed,
    skipped,
    failed,
  };
}

/**
 * Formats a migration result as human-readable lines (counts + mode). Safe to
 * print — contains no row content.
 */
export function formatMigrationResult(result: MigrationResult): string[] {
  const mode = result.applied ? "APPLY" : "DRY-RUN";
  return [
    `Migration: ${result.name} [${mode}]`,
    `  scanned: ${result.scanned}`,
    `  changed: ${result.changed}${result.applied ? " (persisted)" : " (would change)"}`,
    `  skipped: ${result.skipped}`,
    `  failed:  ${result.failed}`,
  ];
}

/**
 * Standard backup guidance printed before any apply run. Migrations mutate
 * persisted data in place; operators must have a restore point first.
 */
export function backupGuidance(): string[] {
  return [
    "Before applying a migration, take a backup you can restore from:",
    '  • Postgres: pg_dump "$DATABASE_URL" > backup.sql',
    "  • SQLite:   cp prisma/dev.db prisma/dev.db.bak",
    "Run with --dry-run first (the default) and review the counts.",
    "Apply only after verifying the dry-run report.",
  ];
}
