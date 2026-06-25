# Persisted-schema migrations

**Epic:** #493 — Persisted schema and cross-projection consistency gates
**Issue:** #502 — Offline migration harness

---

## Why offline migrations (not runtime compatibility layers)

Per `AGENTS.md`, the runtime render, export, and editor paths **must not** carry
branches for superseded payload shapes:

> Do not add runtime compatibility layers for superseded payload shapes.
> When schemas change, update code, fixtures, tests, and docs to the current
> shape.

So when a persisted shape changes (`Document.deckJson`, `Document.contentJson`
visuals, `Visual.data`, or `SourceRef`), the stored data is migrated **forward**
by a one-off, offline migration. The runtime only ever reads the current shape;
detection of drift is the job of the audit CLI (#501), and remediation is the
job of this harness.

---

## Global deck template fields

The current deck shape includes optional template and layout-binding fields:

- Deck `customTokenSet` gains optional `typography.roles`, `bullet`,
  `connector`, `visual`, `image`, and extended `shape` token groups.
- Text/bullets elements may carry optional `textRole` + `styleOverride`; shapes
  may carry `textRole` + `textStyleOverride`; every element may carry an
  optional `layoutSlot`.

`validateDeck` rejects any deck whose `schemaVersion` is not the current version.
Runtime render, export, and editor paths do not add missing role or slot bindings
to persisted decks; if persisted role/slot stamping becomes necessary, it must
be modeled as an explicit offline migration descriptor.

`safeParseDeck` round-trips the full current-shape template model; see the
"current-shape template model" tests in
`src/lib/presentation/deck-master-schema.test.ts`.

---

## Components

| Piece                    | Location                                  |
| ------------------------ | ----------------------------------------- |
| Reusable harness         | `src/lib/schema-migrate/harness.ts`       |
| Harness tests            | `src/lib/schema-migrate/harness.test.ts`  |
| CLI + migration registry | `src/scripts/migrate-persisted-schema.ts` |
| npm script               | `npm run migrate:schema`                  |

A migration is a `MigrationDescriptor<Row>`:

```ts
interface MigrationDescriptor<Row> {
  name: string;
  description?: string;
  selectRows: () => Promise<readonly Row[]> | readonly Row[];
  isAlreadyMigrated: (row: Row) => boolean; // makes the migration idempotent
  transformRow: (row: Row) => Row | null; // pure; null = no change (skipped)
  applyRow?: (row: Row) => Promise<void> | void; // only called in --apply mode
}
```

`runMigration(descriptor, { apply })` returns
`{ name, applied, scanned, changed, skipped, failed }`.

---

## Workflow

1. **Add a migration.** Define a `MigrationDescriptor` and push it onto the
   `MIGRATIONS` array in `src/scripts/migrate-persisted-schema.ts`. Wire
   `selectRows`/`applyRow` to Prisma; keep `transformRow` pure. Ensure
   `isAlreadyMigrated` returns `true` for the shape `transformRow` produces — this
   is what guarantees idempotency.

2. **List migrations.**

   ```bash
   npm run migrate:schema -- --list
   ```

3. **Dry run (default).** Reports the counts an apply _would_ produce, mutating
   nothing:

   ```bash
   npm run migrate:schema -- --name <migration>
   ```

4. **Back up, then apply.** Take a restore point first (the CLI prints this
   guidance before every apply):

   ```bash
   # Postgres
   pg_dump "$DATABASE_URL" > backup.sql
   # SQLite
   cp prisma/dev.db prisma/dev.db.bak

   npm run migrate:schema -- --name <migration> --apply
   ```

5. **Verify idempotency.** Re-run with `--apply`; a correct migration reports
   `changed: 0` the second time.

6. **Audit.** Confirm the audit gate is clean afterward:

   ```bash
   npm run audit:schema -- --ci
   ```

## Guarantees

- **Dry-run is the default** — `--apply` is required to write.
- **Per-row isolation** — a row whose `transformRow`/`applyRow` throws is counted
  as `failed`; the run continues and reports a complete tally.
- **No content in output** — counts and safe identifiers only.
- **Idempotent** — re-applying changes 0 rows.

## Deck theme unification (schema v3)

Deck schema v3 removes the superseded per-deck and per-slide theme snapshot
fields. The current persisted shape uses required `Deck.themeId` as the sole
deck-level theme selector; slides no longer carry a theme snapshot. Built-in
themes use the `DeckTheme` ids (`indigo`, `ocean`, `forest`, `sunset`,
`grape`, `default`). Brand/custom themes set `Deck.themeId` to the custom
token-set id and carry `Deck.customTokenSet`.

There is no runtime compatibility shim for non-current theme payloads. Persisted
development data and fixtures must be regenerated or migrated to the current
schema.

---

## Related

- Audit CLI (#501): `src/lib/schema-audit/audit.ts`,
  `npm run audit:schema`.
- Repair playbook (#504): [`persisted-schema-repair.md`](./persisted-schema-repair.md).
- Release gate: [`release-gate.md`](./release-gate.md).
