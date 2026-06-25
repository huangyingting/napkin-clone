/**
 * Tests for the offline migration harness (#502).
 *
 * Uses a representative in-memory migration: rows are decks whose `theme` must
 * be normalized to lowercase. Asserts the three core properties:
 *  1. dry-run reports counts WITHOUT mutating the store;
 *  2. apply mutates the store;
 *  3. re-applying is idempotent (0 changes).
 */

import assert from "node:assert/strict";
import { test, describe } from "node:test";

import {
  runMigration,
  formatMigrationResult,
  backupGuidance,
  type MigrationDescriptor,
} from "./harness";

interface DeckRow {
  id: string;
  themeId: string;
}

/**
 * Builds a migration that lowercases `theme`, backed by a mutable in-memory
 * store so we can assert apply-vs-dry-run mutation behavior.
 */
function makeThemeMigration(store: DeckRow[]): MigrationDescriptor<DeckRow> {
  return {
    name: "lowercase-deck-theme",
    selectRows: () => store,
    isAlreadyMigrated: (row) => row.themeId === row.themeId.toLowerCase(),
    transformRow: (row) => {
      const lowered = row.themeId.toLowerCase();
      if (lowered === row.themeId) return null;
      return { ...row, themeId: lowered };
    },
    applyRow: (row) => {
      const target = store.find((r) => r.id === row.id);
      if (target) target.themeId = row.themeId;
    },
  };
}

describe("runMigration", () => {
  test("dry-run reports counts without mutating the store", async () => {
    const store: DeckRow[] = [
      { id: "a", themeId: "Indigo" },
      { id: "b", themeId: "amber" },
      { id: "c", themeId: "EMERALD" },
    ];
    const result = await runMigration(makeThemeMigration(store), {
      apply: false,
    });
    assert.equal(result.applied, false);
    assert.equal(result.scanned, 3);
    assert.equal(result.changed, 2); // Indigo + EMERALD
    assert.equal(result.skipped, 1); // amber already lowercase
    assert.equal(result.failed, 0);
    // Store is untouched.
    assert.equal(store.find((r) => r.id === "a")?.themeId, "Indigo");
    assert.equal(store.find((r) => r.id === "c")?.themeId, "EMERALD");
  });

  test("apply mutates the store", async () => {
    const store: DeckRow[] = [
      { id: "a", themeId: "Indigo" },
      { id: "b", themeId: "amber" },
    ];
    const result = await runMigration(makeThemeMigration(store), {
      apply: true,
    });
    assert.equal(result.applied, true);
    assert.equal(result.changed, 1);
    assert.equal(store.find((r) => r.id === "a")?.themeId, "indigo");
  });

  test("re-applying an applied migration is idempotent (0 changes)", async () => {
    const store: DeckRow[] = [
      { id: "a", themeId: "Indigo" },
      { id: "b", themeId: "Amber" },
    ];
    const migration = makeThemeMigration(store);
    const first = await runMigration(migration, { apply: true });
    assert.equal(first.changed, 2);

    const second = await runMigration(migration, { apply: true });
    assert.equal(second.changed, 0);
    assert.equal(second.skipped, 2);
    assert.equal(second.failed, 0);
  });

  test("counts a row whose transform throws as failed without aborting", async () => {
    const store: DeckRow[] = [
      { id: "ok", themeId: "Indigo" },
      { id: "boom", themeId: "Amber" },
      { id: "ok2", themeId: "Emerald" },
    ];
    const migration: MigrationDescriptor<DeckRow> = {
      name: "explodes-on-boom",
      selectRows: () => store,
      isAlreadyMigrated: (row) => row.themeId === row.themeId.toLowerCase(),
      transformRow: (row) => {
        if (row.id === "boom") throw new Error("kaboom");
        return { ...row, themeId: row.themeId.toLowerCase() };
      },
    };
    const result = await runMigration(migration, { apply: false });
    assert.equal(result.changed, 2);
    assert.equal(result.failed, 1);
    assert.equal(result.scanned, 3);
  });

  test("emits per-row events with safe identifiers", async () => {
    const store: DeckRow[] = [
      { id: "a", themeId: "Indigo" },
      { id: "b", themeId: "amber" },
    ];
    const events: string[] = [];
    await runMigration(makeThemeMigration(store), {
      apply: false,
      onRow: (e) => events.push(`${e.index}:${e.outcome}`),
    });
    assert.deepEqual(events, ["0:changed", "1:skipped"]);
  });
});

describe("formatMigrationResult / backupGuidance", () => {
  test("formats counts and the run mode", () => {
    const lines = formatMigrationResult({
      name: "m1",
      applied: false,
      scanned: 5,
      changed: 2,
      skipped: 3,
      failed: 0,
    });
    const text = lines.join("\n");
    assert.ok(text.includes("DRY-RUN"));
    assert.ok(text.includes("scanned: 5"));
    assert.ok(text.includes("changed: 2"));
  });

  test("backup guidance mentions both providers", () => {
    const text = backupGuidance().join("\n");
    assert.ok(text.includes("pg_dump"));
    assert.ok(text.includes("dev.db"));
  });
});
