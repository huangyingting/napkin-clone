# Release Gate and Readiness Checklist

**Epic:** #455 — System stabilization and release readiness for document visuals  
**Issue:** #456  
**Status:** Active gate — review before every foundation release wave

---

## Overview

This document defines the concrete release-readiness gate for the TextIQ
document-visuals and Slides foundation. Every item below must pass (or be
explicitly deferred with a written justification) before expanding into the
next feature wave.

The gate is intentionally small: it must be runnable by any team member in
under 30 minutes.

---

## Part 1 — Automated quality gate

The primary gate is a single CI command that runs on every push to `main` and
on every pull request (see `.github/workflows/ci.yml`):

```bash
export DB_PROVIDER=sqlite DATABASE_URL="file:./prisma/dev.db" AUTH_SECRET=ci-placeholder
npm run db:schema:check
npm run db:generate
npm test && npm run typecheck && npm run typecheck:unused && npm run lint && npm run format:check
```

| Step                | Tool / command             | Failure means                                    |
| ------------------- | -------------------------- | ------------------------------------------------ |
| SQLite schema drift | `npm run db:schema:check`  | The generated SQLite schema is stale             |
| Prisma client       | `npm run db:generate`      | Generated Prisma client cannot be refreshed      |
| Unit + pure tests   | `npm test`                 | A pure helper, schema, or domain model is broken |
| TypeScript          | `npm run typecheck`        | Type errors or unused symbols in src/ or scripts |
| Unused guard        | `npm run typecheck:unused` | Focused unused-symbol gate regressed             |
| Lint                | `npm run lint`             | ESLint rule violations                           |
| Formatting          | `npm run format:check`     | Prettier formatting drift                        |

**All seven steps must be green. A single failure is a release blocker.**

The CI job is defined in `.github/workflows/ci.yml` (`quality-gate` job,
Node 22, SQLite). CI runs the SQLite schema drift check before refreshing the
generated Prisma client, so stale `prisma/schema.sqlite.prisma` changes fail
before typechecking. The build step (`npm run build`) is also run in CI but is
not part of the local gate loop — a passing local gate with a failing build is
still a release blocker and must be fixed immediately.

Runtime environment variables used by this gate and by deployed services are
inventoried in [runtime-config.md](./runtime-config.md).

### Persisted-schema audit (Epic #493)

The automated gate above validates code. A second, data-facing gate validates
the **persisted payloads** the runtime trusts — `Document.deckJson`, embedded
`Document.contentJson` visuals, `Visual.data`, and active `SourceRef` fields.
Run it against a target database (staging or a production replica) before a
release wave:

```bash
npm run audit:schema -- --ci
```

The CLI (`src/scripts/audit-persisted-schema.ts`, core in
`src/lib/schema-audit/audit.ts`) exits non-zero when any row fails its schema
validator and reports only safe identifiers (document id / row id / schema area
/ failure reason) — never document content. A clean run is a precondition for
release; drift is remediated with the [repair playbook](./persisted-schema-repair.md).

### Test coverage scope

`npm test` runs:

- `src/**/*.test.ts` via `node --import tsx --test`
- `scripts/**/*.test.mjs` via `node --test`

The following subsystems have dedicated test files that must stay green:

| Subsystem                            | Test file(s)                                                                                                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Block identity (#430)                | `src/lib/lexical/block-id.test.ts`                                                                                                                                                      |
| Visual mirror diff (#448)            | `src/lib/visual/mirror-diff.test.ts`, `mirror-repair.test.ts`                                                                                                                           |
| Command envelope (#436)              | `src/lib/commands/`, `src/lib/presentation/slide-commands.test.ts`                                                                                                                      |
| Deck save / conflict (#376)          | `src/lib/presentation/save-conflict.test.ts`, `deck-revision-token.test.ts`                                                                                                             |
| Export preflight (#416)              | `src/lib/visual/export-preflight.test.ts`                                                                                                                                               |
| Authorization                        | `src/lib/auth/document-permissions.test.ts`, `authz-regression.test.ts`                                                                                                                 |
| API surface governance (#495)        | `src/app/api/api-route-security-matrix.test.ts`, `src/lib/api/errors.test.ts`, `src/lib/diagnostics/api-abuse.test.ts`, `src/app/api/slide-assets/[documentId]/[...path]/route.test.ts` |
| Structured diagnostics (#460)        | `src/lib/diagnostics/error-codes.test.ts`                                                                                                                                               |
| Performance budgets (#461)           | `src/lib/presentation/perf-budgets.test.ts`                                                                                                                                             |
| Autosave / conflict hardening (#459) | `src/lib/presentation/autosave-hardening.test.ts`                                                                                                                                       |
| A11y helpers (#462)                  | `src/lib/a11y/a11y-helpers.test.ts`                                                                                                                                                     |

---

### Critical-flow E2E profile (Epic #517)

The unit gate above is intentionally credential-less and never starts a server.
A second, opt-in **deterministic E2E profile** drives the critical product
flows end to end through a real browser. It is **not** part of `npm test` or the
required fast gate — it runs in a dedicated job against a seeded database and a
running app.

```bash
# 1. Seed the deterministic fixture (owner + viewer users, one shared document
#    with text + visual + deckJson + public share policy + a slide image asset,
#    plus a private document/asset for access-control checks).
export DB_PROVIDER=sqlite DATABASE_URL="file:./prisma/dev.db" AUTH_SECRET=ci-placeholder
npm run db:reset        # or db:push
npm run db:seed:e2e     # writes e2e/.e2e-fixture.json + storage/slide-assets/…

# 2. Start the app, then run the profile suite (sets E2E_PROFILE=1).
npm run dev &
npm run test:e2e:profile
```

Key properties:

- The seeded **document URL** (`/app/documents/<documentId>`) and **share id**
  (`<slug>-<shareId>`) are **deterministic** — the seed and the specs share one
  source of truth in `e2e/helpers/profile.ts`.
- Under the profile (`E2E_PROFILE=1`), authenticated specs **do not skip**; they
  run for real. Without it, every profile-dependent spec **skips cleanly** so the
  credential-less fast gate and CI stay green.
- Seeded owner/viewer emails and passwords are fixed test credentials (see
  `e2e/helpers/profile.ts` / the emitted `e2e/.e2e-fixture.json`).

| Spec (Epic #517)             | Covers                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `import-roundtrip.spec.ts`   | #519 Markdown import → editor render → edit/save → reload persistence; unsupported-type error  |
| `present-export.spec.ts`     | #520 authenticated + public present render seeded text; real PDF download (nonzero bytes)      |
| `slide-asset-upload.spec.ts` | #521 inspector image upload → reload resolves protected asset; private-asset 403 vs shared 200 |

See [`e2e/README.md`](../../e2e/README.md) for the full environment-variable
reference and per-spec run instructions.

---

## Part 2 — Critical flow checklist

For each flow below, check the indicated owner: **A** = automated test,
**M** = manual smoke, **I** = documented invariant, **D** = deferred risk.

### Document flows

| #   | Flow                              | Owner           | Notes                                                                                                                     |
| --- | --------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| D-1 | Document edit and Lexical save    | **A**           | `saveDocumentLexical` path; block-id stamping tested                                                                      |
| D-2 | Inline visual edit and save       | **A**           | `mirrorVisualNodes` + diff tested                                                                                         |
| D-3 | Document duplicate                | **A**           | `regenerateBlockIds` tested; share-id regeneration tested                                                                 |
| D-4 | Document version restore          | **A**           | Snapshot policy tested in `save-conflict.test.ts`                                                                         |
| D-5 | Document import (markdown, .docx) | **M** + **E2E** | Pure import helpers tested; Markdown round-trip in `e2e/import-roundtrip.spec.ts` (#519); DOCX UI round-trip still manual |
| D-6 | Document search                   | **A**           | `search.test.ts`                                                                                                          |
| D-7 | Document delete / trash / restore | **A**           | `trash.test.ts`                                                                                                           |

### Slide / deck flows

| #   | Flow                                | Owner           | Notes                                                                                                 |
| --- | ----------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------- |
| S-1 | Slide edit and autosave (deck JSON) | **A**           | `save-conflict.test.ts`, `autosave-hardening.test.ts`                                                 |
| S-2 | Deck patch save (`saveDeckPatch`)   | **A**           | `save-conflict.test.ts`                                                                               |
| S-3 | Stale revision conflict recovery    | **A**           | `deck-revision-token.test.ts`, `autosave-hardening.test.ts`                                           |
| S-4 | Oversized deck rejection            | **A**           | `perf-budgets.test.ts`, `autosave-hardening.test.ts`                                                  |
| S-5 | Present mode (read-only render)     | **M** + **E2E** | SlideCanvas rendering; authenticated + public present asserted in `e2e/present-export.spec.ts` (#520) |
| S-6 | Deck PPTX / PDF export              | **A** + **E2E** | `export-preflight.test.ts`; real PDF download asserted in `e2e/present-export.spec.ts` (#520)         |
| S-7 | Export preflight (fatal / warning)  | **A**           | `export-preflight.test.ts`                                                                            |

### Visual projection flows

| #   | Flow                                          | Owner | Notes                                                 |
| --- | --------------------------------------------- | ----- | ----------------------------------------------------- |
| V-1 | Visual mirror sync on save                    | **A** | `mirror-diff.test.ts`, `mirror-repair.test.ts`        |
| V-2 | Visual mirror rebuild action                  | **A** | `mirror-repair.test.ts`; `autosave-hardening.test.ts` |
| V-3 | Invalid visual payload skipped (no data loss) | **A** | `mirror-diff.test.ts`, `autosave-hardening.test.ts`   |
| V-4 | Visual registry validation                    | **A** | `registry.test.ts`, `schema.test.ts`                  |
| V-5 | Source-link staleness detection               | **A** | `source-link-staleness.test.ts`                       |

### Authorization flows

| #   | Flow                                   | Owner | Notes                                                      |
| --- | -------------------------------------- | ----- | ---------------------------------------------------------- |
| A-1 | Owner / editor / viewer capabilities   | **A** | `document-permissions.test.ts`, `authz-regression.test.ts` |
| A-2 | Stranger / cross-workspace denial      | **A** | `authz-regression.test.ts`                                 |
| A-3 | Share / embed / present access control | **A** | `share-access.test.ts`, `authz-regression.test.ts`         |
| A-4 | Revoked / expired share link denial    | **A** | `authz-regression.test.ts`                                 |
| A-5 | Deck save / patch denial for viewer    | **A** | `authz-regression.test.ts`                                 |
| A-6 | Visual rebuild denial for viewer       | **A** | `authz-regression.test.ts`                                 |

### Asset flows

| #    | Flow                             | Owner           | Notes                                                                                                                                  |
| ---- | -------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| AS-1 | Image upload and protected asset | **M** + **E2E** | UI smoke; budget check in `perf-budgets.test.ts`; inspector upload + protected-asset access in `e2e/slide-asset-upload.spec.ts` (#521) |
| AS-2 | Missing asset preflight warning  | **A**           | `export-preflight.test.ts`                                                                                                             |
| AS-3 | Oversized image rejection        | **A**           | `perf-budgets.test.ts` (INLINE_IMAGE_HARD_BYTES)                                                                                       |

### Accessibility flows

| #    | Flow                                               | Owner | Notes                                                                                                                                                                                                                                                                                                                                                   |
| ---- | -------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1 | VisualRenderer role=img + aria-label               | **A** | `a11y-helpers.test.ts`                                                                                                                                                                                                                                                                                                                                  |
| AC-2 | Decorative canvas elements aria-hidden             | **A** | `a11y-helpers.test.ts`                                                                                                                                                                                                                                                                                                                                  |
| AC-3 | Icon-only toolbar controls labelled                | **A** | `a11y-helpers.test.ts`                                                                                                                                                                                                                                                                                                                                  |
| AC-4 | Modal dialog semantics                             | **A** | `a11y-helpers.test.ts`                                                                                                                                                                                                                                                                                                                                  |
| AC-5 | Canvas keyboard resize / traversal / announcements | **A** | Keyboard resize, deterministic traversal (roving tabindex), focus restoration, and `aria-live` announcements ship (#530–#535); pure logic covered by `canvas-a11y.test.ts`. Remaining accepted limitations are tracked as connector free-draw (#930) and rotation (#931) in [ADR 0002](../architecture/decisions/0002-canvas-keyboard-accessibility.md) |

---

## Part 3 — Blocking vs warning criteria

### Release blockers (must be green)

1. `npm run db:schema:check`, `npm run db:generate`, `npm test`,
   `npm run typecheck`, `npm run lint`, and `npm run format:check` — all green.
2. Every critical flow marked **A** above has its corresponding test passing.
3. Authorization denials (A-1 through A-6) all passing.
4. No structured diagnostic emitting `severity: "fatal"` in the automated test run.

### Release warnings (document and track, not necessarily block)

- A flow marked **M** (manual smoke) failed: document the failure and its risk level;
  the responsible engineer signs off that it is safe to proceed.
- A known canvas keyboard limitation (**D**) is present: confirm it is recorded in
  `a11y-helpers.test.ts`, in [ADR 0002 — Canvas keyboard accessibility](../architecture/decisions/0002-canvas-keyboard-accessibility.md),
  and the deferred-risk list. The R1–R3 keyboard parity work (resize, traversal,
  focus restoration, announcements) now ships (#530–#535, covered by
  `canvas-a11y.test.ts`); only the accepted A1 (connector free-draw) and A2
  (rotation) limitations remain as documented warnings tracked by #930 and #931.
- Performance budgets report `warned: true` (not `exceeded`) for any metric: log the
  finding and plan remediation within the next sprint.

---

## Part 4 — Sign-off procedure

Before each foundation release wave:

1. Run
   `npm run db:schema:check && npm run db:generate && npm test && npm run typecheck && npm run typecheck:unused && npm run lint && npm run format:check`
   locally. All seven must exit 0.
2. Verify CI is green on the merge commit (`.github/workflows/ci.yml` → `quality-gate` job).
3. Walk the checklist in Part 2 and confirm every **M** flow manually.
4. Record any warnings (Part 3) in the release PR description with a brief risk note.
5. Obtain sign-off from at least one other engineer on the PR before merging.

---

## Part 5 — Cross-references

| Related issue | Area                                                                                                                                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #430          | Block-anchor identity — `block-id.ts`, `block-id-runtime.ts`                                                                                                                                                               |
| #448          | Visual projection repair — `mirror-diff.ts`, `mirror-repair.ts`                                                                                                                                                            |
| #436          | Command envelope — `slide-commands.ts`, `commands/`                                                                                                                                                                        |
| #379 / #380   | Export pipeline — `export-preflight.ts`, `deck-export.ts`                                                                                                                                                                  |
| #376          | Conflict recovery — `deck-revision-token.ts`                                                                                                                                                                               |
| #460          | Structured diagnostics — `src/lib/diagnostics/error-codes.ts`                                                                                                                                                              |
| #461          | Performance budgets — `src/lib/presentation/perf-budgets.ts`                                                                                                                                                               |
| #495          | API surface governance — `docs/security/api-route-security-matrix.md`, `src/lib/api/errors.ts`, `src/lib/diagnostics/api-abuse.ts`                                                                                         |
| #493          | Persisted-schema gates — `src/lib/schema-audit/audit.ts`, `docs/operations/persisted-schema-repair.md`                                                                                                                     |
| #517          | Release-gate E2E profile — `prisma/seed-e2e.ts`, `e2e/helpers/profile.ts`, `e2e/{import-roundtrip,present-export,slide-asset-upload}.spec.ts`, [ADR 0002](../architecture/decisions/0002-canvas-keyboard-accessibility.md) |
