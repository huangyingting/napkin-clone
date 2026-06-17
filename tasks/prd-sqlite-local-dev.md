# PRD: SQLite for Local Dev/Test (Postgres in Production)

## Introduction

Today the Napkin Clone app requires a running **PostgreSQL** server for any local
work: contributors (and the autonomous Ralph agent) must `apt-get install
postgresql`, start the service, create a role/database, and set `DATABASE_URL`
before `npm run dev`, tests, or migrations will work. This is friction for
first-run setup and for ephemeral/CI environments.

This feature adds **SQLite as a zero-setup local database** while keeping
**PostgreSQL for production**. The database engine is chosen at runtime by a new
`DB_PROVIDER` environment variable (`sqlite` | `postgres`). The Prisma schema is
made **portable** (Postgres enums become `String` with app-level union types;
`Json` columns are kept) so the **same model definitions** drive both engines, and
**real Prisma migrations** work against both providers.

The default for local development is SQLite, so a fresh clone runs with no database
service to install.

## Goals

- Let a fresh clone run `npm run dev`, the test suite, and migrations against
  **SQLite** with **no external database service** to install or start.
- Keep **PostgreSQL** as the production database, unchanged in behavior.
- Select the engine at runtime via a single `DB_PROVIDER` env var
  (`sqlite` | `postgres`); default to `sqlite` locally.
- Maintain **one portable set of Prisma models** (no per-engine model drift) by
  removing Postgres-only enums in favor of `String` + app-level union types, while
  keeping `Json` columns.
- Keep **Prisma migrations** working for **both** providers (each provider has its
  own migration history; the SQLite history is generated from the same schema).
- Preserve all existing app behavior and data shapes (owner-scoping, JSON visual
  storage, auth, etc.).

## User Stories

### US-001: Make the Prisma schema portable (enums → String)

**Description:** As a developer, I want the schema to avoid Postgres-only enum
types so the same models can target SQLite and Postgres.

**Acceptance Criteria:**
- [ ] Remove the `enum WorkspaceRole { ... }` and `enum VisualType { ... }`
      declarations from `prisma/schema.prisma`.
- [ ] `WorkspaceMember.role`, `InviteLink.role` become `String @default("VIEWER")`.
- [ ] `Visual.type` becomes `String` (no default).
- [ ] All `Json` columns (`Visual.data`) remain `Json` (Prisma maps `Json` → `TEXT`
      on SQLite automatically).
- [ ] `prisma validate` passes against the schema.
- [ ] `npm run db:generate` regenerates the client with no `VisualType` /
      `WorkspaceRole` enum exports.
- [ ] Typecheck/lint passes (after US-002 lands the replacement types).

### US-002: Replace generated enum types with app-level union types

**Description:** As a developer, I need the TypeScript code that imported the
Prisma `VisualType` / `WorkspaceRole` enums to keep compiling after the enums are
removed.

**Acceptance Criteria:**
- [ ] Define local string-literal union types and constants to replace the
      generated enums, e.g. in `src/lib/visual/schema.ts` for visual types
      (`"FLOWCHART" | "MINDMAP" | "LIST" | "CHART" | "CONCEPT"`) and a new
      `src/lib/workspace/roles.ts` (or similar) for roles
      (`"OWNER" | "EDITOR" | "VIEWER"`).
- [ ] Remove `import { VisualType } from "@/generated/prisma/enums"` (and any
      `WorkspaceRole` import from generated code); update `VISUAL_KIND_TO_PRISMA` /
      `PRISMA_TO_VISUAL_KIND` and any role usages to the new local types.
- [ ] Grep confirms no remaining imports of enums from `@/generated/prisma`.
- [ ] `npm run typecheck` and `npm run lint` pass.
- [ ] `npm test` passes.

### US-003: Add `DB_PROVIDER` env var and provider-aware `prisma.config.ts`

**Description:** As a developer, I want a single env flag to choose the engine, and
I want the Prisma CLI (migrate/seed/studio) to target the right datasource and
migration history.

**Acceptance Criteria:**
- [ ] `DB_PROVIDER` (`sqlite` | `postgres`) is read in `prisma.config.ts`; default
      is `sqlite` when unset.
- [ ] `prisma.config.ts` selects the correct **schema file** and **migrations path**
      per provider (see US-004 for the schema files; SQLite migrations live in a
      separate folder, e.g. `prisma/migrations-sqlite`).
- [ ] `prisma.config.ts` resolves `datasource.url` from `DATABASE_URL`; when
      `DB_PROVIDER=sqlite` and `DATABASE_URL` is unset, it defaults to a local file
      URL (e.g. `file:./prisma/dev.db`).
- [ ] `.env.example` documents `DB_PROVIDER` and example `DATABASE_URL`s for both
      engines (SQLite `file:./prisma/dev.db`, Postgres
      `postgresql://...`); the committed `.env`/example defaults to SQLite.
- [ ] `npx prisma validate` succeeds for both `DB_PROVIDER=sqlite` and
      `DB_PROVIDER=postgres`.

### US-004: Generate the SQLite schema from the canonical Postgres schema

**Description:** As a developer, I want the SQLite schema to be derived from the one
canonical schema so the models never drift between engines (only the `datasource
provider` line differs).

**Acceptance Criteria:**
- [ ] `prisma/schema.prisma` remains the **canonical** schema with
      `datasource db { provider = "postgresql" }`.
- [ ] A script (e.g. `scripts/gen-sqlite-schema.mjs`, run via an npm script like
      `db:schema:sqlite`) produces `prisma/schema.sqlite.prisma` that is identical
      to the canonical schema **except** the datasource `provider` is `"sqlite"`
      (and `output`/generator unchanged).
- [ ] The generator output path is the same for both (`../src/generated/prisma`),
      so app code imports one client.
- [ ] Running the script is idempotent; re-running produces no diff when the
      canonical schema is unchanged.
- [ ] A check (npm script or note) exists so contributors regenerate the SQLite
      schema after editing the canonical one (drift is detectable).
- [ ] `npx prisma validate --schema prisma/schema.sqlite.prisma` passes.

### US-005: Provider-aware runtime Prisma client (driver adapter selection)

**Description:** As a developer, I want `src/lib/prisma.ts` to pick the right Prisma
**driver adapter** based on the selected provider so the app connects to SQLite
locally and Postgres in production.

**Acceptance Criteria:**
- [ ] Add the SQLite driver adapter dependency (e.g.
      `@prisma/adapter-better-sqlite3` + `better-sqlite3`) alongside the existing
      `@prisma/adapter-pg`.
- [ ] `createPrismaClient()` chooses `PrismaPg` when `DB_PROVIDER=postgres` and the
      SQLite adapter when `DB_PROVIDER=sqlite` (default), using `DATABASE_URL`
      (defaulting to the local file URL for SQLite when unset).
- [ ] The exported `prisma` singleton behavior (global reuse in non-production) is
      preserved.
- [ ] `npm run build` succeeds with `DB_PROVIDER=sqlite`.
- [ ] Production path (`DB_PROVIDER=postgres`) still constructs the `PrismaPg`
      adapter exactly as before.

### US-006: Create the initial SQLite migration history

**Description:** As a developer, I want `prisma migrate` to manage the SQLite
database with a real migration history (not just `db push`).

**Acceptance Criteria:**
- [ ] With `DB_PROVIDER=sqlite`, `npm run db:migrate` (`prisma migrate dev`) creates
      an initial migration under the SQLite migrations folder and applies it to a
      fresh `prisma/dev.db`.
- [ ] `prisma/migrations-sqlite/migration_lock.toml` records `provider = "sqlite"`.
- [ ] The existing Postgres migrations under `prisma/migrations` are updated/added
      to reflect the enum→String change so `DB_PROVIDER=postgres` migrate still
      applies cleanly from scratch.
- [ ] `npm run db:reset` works for `DB_PROVIDER=sqlite` (drops, re-migrates, seeds)
      without errors.
- [ ] The SQLite DB file and journal are git-ignored (e.g. `prisma/*.db`,
      `prisma/*.db-journal`).

### US-007: Make the seed provider-agnostic and verify on SQLite

**Description:** As a developer, I want `prisma/seed.ts` to run successfully against
SQLite (and still Postgres), since it is referenced by `migrate reset`.

**Acceptance Criteria:**
- [ ] `npm run db:seed` succeeds with `DB_PROVIDER=sqlite` on a freshly migrated
      `dev.db`.
- [ ] Seed remains idempotent (upsert / find-or-create) so repeated runs and
      `migrate reset` are safe on both engines.
- [ ] Any enum literals in the seed use the new `String` union values
      (e.g. `"VIEWER"`), not removed Prisma enum members.
- [ ] Seeded rows (users, documents, visuals with `Json` data) read back correctly
      via the client on SQLite.

### US-008: Zero-setup npm scripts and default-to-SQLite local dev

**Description:** As a new contributor, I want to clone the repo and run the app
against SQLite with a single setup command and no database service.

**Acceptance Criteria:**
- [ ] A documented one-liner (e.g. `npm install && npm run db:migrate &&
      npm run db:seed && npm run dev`) brings up the app on SQLite from a clean
      clone with no Postgres installed.
- [ ] `npm install` (`postinstall: prisma generate`) succeeds without a database
      present and without `DB_PROVIDER=postgres`.
- [ ] `db:migrate`, `db:deploy`, `db:seed`, `db:reset`, `db:generate` all honor
      `DB_PROVIDER` (default `sqlite`); production deploy uses `DB_PROVIDER=postgres`.
- [ ] Switching to Postgres is a documented matter of setting `DB_PROVIDER=postgres`
      and a `postgresql://` `DATABASE_URL`.

### US-009: Verify the full app runs on SQLite (build + key flows)

**Description:** As a maintainer, I want confidence that the app's core flows work
end-to-end on SQLite before relying on it for local dev/test.

**Acceptance Criteria:**
- [ ] `npm run build`, `npm run typecheck`, `npm run lint`, `npm run format:check`,
      and `npm test` all pass with `DB_PROVIDER=sqlite`.
- [ ] With the dev server on SQLite: sign up a user, create a document, generate or
      seed a visual, and reload — data persists (owner-scoped reads work).
- [ ] Verify in browser: the dashboard, document editor (autosave), and visual
      render correctly against the SQLite-backed dev server.
- [ ] No `Json`/enum-related runtime errors appear in the server logs during the
      above flows.

### US-010: Update docs (AGENTS.md / README) for the dual-provider workflow

**Description:** As a future contributor or agent, I want the database conventions
documented so I use the right provider and commands.

**Acceptance Criteria:**
- [ ] `AGENTS.md` "Database" section is updated: SQLite is the default local/test
      engine, Postgres is production, selection via `DB_PROVIDER`, the canonical vs
      generated `schema.sqlite.prisma`, separate migration folders, and the
      enum→String + app-level union-type convention.
- [ ] `README.md` (or equivalent) documents the zero-setup SQLite quickstart and how
      to switch to Postgres.
- [ ] The old "Local Postgres bootstrap (one-time)" instructions are marked as
      **optional / Postgres-only**, not required for local dev.
- [ ] Docs note the gotcha that editing the canonical schema requires regenerating
      `schema.sqlite.prisma`.

## Functional Requirements

- FR-1: The system must select the database engine at runtime from `DB_PROVIDER`
  (`sqlite` | `postgres`), defaulting to `sqlite` when unset.
- FR-2: The Prisma models must be defined once (canonical `prisma/schema.prisma`)
  and must not use Postgres-only `enum` types; role/visual-type columns must be
  `String` with app-level union types enforcing the allowed values.
- FR-3: `Json` columns must be retained and must round-trip correctly on both
  engines.
- FR-4: `prisma.config.ts` must select the correct schema file and migrations path
  per provider and resolve `DATABASE_URL`, defaulting SQLite to a local file URL.
- FR-5: A generation step must produce `prisma/schema.sqlite.prisma` from the
  canonical schema, differing only in the datasource `provider`.
- FR-6: `src/lib/prisma.ts` must construct the Postgres driver adapter
  (`@prisma/adapter-pg`) for `postgres` and a SQLite driver adapter for `sqlite`,
  preserving the singleton pattern.
- FR-7: `prisma migrate dev`/`reset`/`deploy` and `prisma db seed` must succeed for
  both providers, each with its own migration history folder and `migration_lock.toml`.
- FR-8: A clean clone with no Postgres installed must reach a working dev server and
  passing test suite using only SQLite.
- FR-9: The SQLite database file(s) must be git-ignored.
- FR-10: Production behavior on Postgres must remain functionally unchanged.

## Non-Goals (Out of Scope)

- Running **production** on SQLite (Postgres remains the production engine).
- Live data migration of existing Postgres data into SQLite (or vice versa); the
  feature targets fresh local/test databases.
- Supporting additional engines (MySQL, libSQL/Turso remote, etc.).
- Changing the application's data model semantics, auth, collaboration, or API
  surface beyond the enum→String type change.
- Cross-engine `Json` **querying/filtering** (the app stores/reads JSON blobs but
  does not query into them).
- Replacing the existing test runner or adding a new ORM/query layer.

## Technical Considerations

- **Prisma 7 + driver adapters:** runtime connections already go through a driver
  adapter (`@prisma/adapter-pg`). SQLite needs its own adapter (e.g.
  `@prisma/adapter-better-sqlite3` with `better-sqlite3`). The generated client
  output path stays `src/generated/prisma` so app imports are unchanged.
- **`datasource.provider` is static per schema**, and `migration_lock.toml` is
  provider-specific. Therefore dual-provider support uses (a) a canonical Postgres
  schema, (b) a generated SQLite schema identical except the provider line, and
  (c) **separate migration folders** per provider — all selected in
  `prisma.config.ts` by `DB_PROVIDER`. This avoids mixing incompatible migration
  SQL (e.g. Postgres `CREATE TYPE ... ENUM`) in one history.
- **Enum removal blast radius:** `src/lib/visual/schema.ts` imports `VisualType`
  from `@/generated/prisma/enums` and uses it in `VISUAL_KIND_TO_PRISMA` /
  `PRISMA_TO_VISUAL_KIND`; `WorkspaceRole` is similarly generated. Replace these
  with local string-literal union types/constants and update all usages.
- **`Json` on SQLite:** Prisma maps `Json` to `TEXT` and (de)serializes
  automatically; existing `Visual.data` casts (`as unknown as Prisma.InputJsonValue`)
  continue to work. Avoid relying on DB-side JSON operators.
- **Default URL handling:** when `DB_PROVIDER=sqlite` and `DATABASE_URL` is unset,
  default to `file:./prisma/dev.db` so first run needs no env editing.
- **`postinstall: prisma generate`** must work without a live database; generation
  only needs a schema, so defaulting to SQLite is safe in CI/first-install.
- **Keep `.prettierignore`/`.eslint` ignores** for `src/generated` as-is.
- **`.gitignore`:** add `prisma/*.db` and journal/WAL files; keep committed
  migrations (both folders).

## Success Metrics

- A fresh clone with **no Postgres** reaches a running dev server and a green
  `npm test` using only `npm install` + the documented db setup commands.
- First-run database setup time drops from "install + configure Postgres" to a
  single migrate/seed command.
- All quality gates (`build`, `typecheck`, `lint`, `format:check`, `test`) pass
  under `DB_PROVIDER=sqlite` and under `DB_PROVIDER=postgres`.
- Zero model drift: the SQLite schema is generated, so the model definitions match
  Postgres exactly except the datasource provider.

## Open Questions

- None outstanding. (If `better-sqlite3` native builds prove problematic in the
  target environment, an alternative SQLite adapter such as `@prisma/adapter-libsql`
  with a local file may be substituted in US-005 without changing the rest of the
  design.)
