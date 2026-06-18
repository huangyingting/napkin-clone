# PRD: Napkin Product Maturity — Lifecycle, Settings, Templates, History & Hardening

## Introduction/Overview

The Napkin Clone is feature-complete against its first two roadmaps
(`tasks/prd-napkin-clone.md` US-001–020 and `tasks/prd-napkin-parity-gaps.md`
US-001–019): auth, dashboard, Markdown editor, AI visual generation, nine visual
types, type-switching, element/style/connector editing, icons, inline per-block
generation, multi-visual documents, variations, export, sharing, embed,
workspaces, real-time collaboration, and inline comments.

A program-level review against everyday product expectations surfaced gaps that
are **not** about Napkin visual parity but about the app being a usable,
trustworthy product day-to-day:

1. **Document lifecycle is one-directional.** Users can create and edit documents
   but cannot delete, rename (from the dashboard), or duplicate them, and there is
   no search/sort once the grid grows.
2. **No account self-service.** `User.name`/`image` exist in the schema but there
   is no settings page to edit a profile, change a password, or delete an account.
3. **Empty-first onboarding.** Every new document starts blank; there are no
   templates or first-run guidance.
4. **No safety net for visual edits.** Visual edits and regenerations are
   debounce-saved with no undo/version history — an accidental delete or re-roll is
   unrecoverable.
5. **Operational immaturity.** No CI gate protecting `main`, in-memory-only AI rate
   limiting (won't hold across instances), no error tracking, and a single-instance
   in-memory collaboration server.
6. **UX polish gaps.** A known 375px editor-header overflow, no keyboard shortcuts,
   and no global error boundary.

This PRD is a **multi-feature roadmap** to close all of the above. It groups the
work into seven feature areas, each broken into small, independently-shippable
user stories sequenced dependencies-first so each fits one focused session.

**Priority lens:** ship the highest user-value, lowest-risk gaps first (document
lifecycle, settings, templates), then the safety net (version history), then
operational hardening, then polish — all while keeping lint, typecheck, build, and
`format:check` green and honoring every SQLite/Postgres portability and
directive-free-renderer rule in `AGENTS.md`.

## Goals

- Give users full **document lifecycle** control: delete (with confirm + undo
  window), rename and duplicate from the dashboard, plus search and sort.
- Add **organization**: favorite/star documents and filter to favorites.
- Provide **account self-service**: a settings page to edit display name, change
  password, and delete the account.
- Reduce blank-page friction with a **templates library** for new documents and a
  **first-run sample document** for new users.
- Add a **safety net**: per-document visual version history with restore (undo) for
  the most recent edits/regenerations.
- Raise **operational maturity**: a CI workflow protecting `main`, a shared
  (DB-backed) AI rate-limit store, structured error logging, and a documented
  collaboration-server persistence/scaling path.
- Polish **UX**: fix the 375px editor-header overflow, add core keyboard shortcuts,
  and add a global error boundary.
- Every change keeps lint, typecheck, build, and `format:check` green and preserves
  the SQLite/Postgres dual-history + generated-`schema.sqlite.prisma` rules.

## User Stories

> Numbering restarts at US-001 for this PRD (per-PRD convention; disambiguate from
> the original and parity-gaps PRDs by file/branch). Stories execute in priority
> order; earlier stories never depend on later ones.

---

### Feature Area A — Document Lifecycle

### US-001: Delete a document (server action)
**Description:** As a developer, I need an access-scoped server action to delete a
document so the UI can remove documents safely.

**Acceptance Criteria:**
- [ ] Add `deleteDocument(documentId)` to `src/app/app/actions.ts` (`"use server"`).
- [ ] Scope access with `requireUser()` and owner-or-workspace-member check
      (reuse `getAccessibleDocument` from `@/lib/documents`); a non-accessible id is
      a no-op (use `deleteMany`), never a throw that leaks existence.
- [ ] Cascades to the document's `Visual` and `Comment` rows via existing
      `onDelete: Cascade` relations (no orphaned rows).
- [ ] `revalidatePath("/app")` after deletion.
- [ ] Typecheck/lint passes.
- [ ] Tests pass.

### US-002: Delete a document from the dashboard with confirmation
**Description:** As a user, I want to delete a document from the dashboard so I can
remove ones I no longer need.

**Acceptance Criteria:**
- [ ] Each document card exposes a delete affordance (e.g. a kebab/overflow menu
      with a "Delete" item) that does not trigger the card's navigation link.
- [ ] Clicking "Delete" shows a confirmation dialog naming the document before any
      deletion happens.
- [ ] Confirming calls `deleteDocument` and removes the card from the grid.
- [ ] Canceling makes no change.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

### US-003: Undo a document delete (soft-delete window)
**Description:** As a user, I want a brief undo after deleting so an accidental
delete is recoverable.

**Acceptance Criteria:**
- [ ] Add a nullable `deletedAt DateTime?` column to `Document` with migrations in
      **both** provider histories (Postgres + SQLite); rerun
      `npm run db:schema:sqlite`.
- [ ] `deleteDocument` sets `deletedAt = now()` (soft delete) instead of a hard
      delete; all document list/detail queries exclude `deletedAt != null`.
- [ ] After deleting, the dashboard shows a transient "Document deleted — Undo"
      toast/inline action for at least 5 seconds.
- [ ] Clicking "Undo" clears `deletedAt` (via a `restoreDocument(documentId)`
      action) and the card reappears.
- [ ] A scheduled/opportunistic purge or documented cleanup removes soft-deleted
      rows older than 30 days (a `purgeDeletedDocuments()` action invoked on
      dashboard load is acceptable; document the choice).
- [ ] Typecheck/lint passes.
- [ ] Tests pass.
- [ ] Verify in browser.

### US-004: Rename a document from the dashboard
**Description:** As a user, I want to rename a document without opening it so I can
organize quickly.

**Acceptance Criteria:**
- [ ] The card overflow menu has a "Rename" item that opens an inline editable
      field or small dialog pre-filled with the current title.
- [ ] Submitting calls a `renameDocument(documentId, title)` server action
      (access-scoped, `updateMany`); empty title normalizes to "Untitled".
- [ ] The new title shows immediately and persists after reload.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

### US-005: Duplicate a document
**Description:** As a user, I want to duplicate a document so I can branch from
existing work.

**Acceptance Criteria:**
- [ ] The card overflow menu has a "Duplicate" item.
- [ ] A `duplicateDocument(documentId)` server action (access-scoped) creates a new
      document owned by the current user with title `"<original> (copy)"`, the same
      `content`, and a deep copy of every `Visual` row (including `anchorBlockId`,
      `orderIndex`, `type`, `title`, `data`) but **not** comments or share state
      (`isShared = false`, fresh `shareId = null`).
- [ ] The new document appears at the top of the dashboard (most-recent).
- [ ] Typecheck/lint passes.
- [ ] Tests pass.
- [ ] Verify in browser.

### US-006: Search and sort documents on the dashboard
**Description:** As a user, I want to search and sort my documents so I can find
them as the list grows.

**Acceptance Criteria:**
- [ ] The dashboard has a search input that filters the visible documents by title
      (case-insensitive, client-side filter of the loaded list is acceptable).
- [ ] A sort control offers at least: "Last edited" (default), "Title (A–Z)", and
      "Date created"; selection persists in the URL search params.
- [ ] An empty-results state message shows when no documents match the search.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

---

### Feature Area B — Document Organization

### US-007: Favorite (star) a document
**Description:** As a user, I want to star important documents so I can find them
fast.

**Acceptance Criteria:**
- [ ] Add a `favorite Boolean @default(false)` column to `Document` with migrations
      in **both** provider histories; rerun `npm run db:schema:sqlite`.
- [ ] A `toggleFavorite(documentId)` server action (access-scoped, `updateMany`)
      flips the flag.
- [ ] Each dashboard card shows a star toggle reflecting the current state; toggling
      updates immediately and persists after reload.
- [ ] Typecheck/lint passes.
- [ ] Tests pass.
- [ ] Verify in browser.

### US-008: Filter the dashboard to favorites
**Description:** As a user, I want a favorites view so I can focus on starred work.

**Acceptance Criteria:**
- [ ] The dashboard has a "Favorites" toggle/tab that shows only `favorite = true`
      documents; its state persists in the URL search params.
- [ ] Starred documents optionally sort to the top in the default view (document the
      chosen behavior).
- [ ] An empty-state message shows when there are no favorites.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

---

### Feature Area C — Account Settings & Onboarding

### US-009: Account settings page — edit display name
**Description:** As a user, I want a settings page to change my display name so my
profile is accurate.

**Acceptance Criteria:**
- [ ] Add a protected `/app/settings` route (server component, `requireUser()`),
      linked from the site header user menu.
- [ ] A form lets the user edit `User.name`; an `updateProfile(name)` server action
      (`"use server"`, scoped to the current user) saves it.
- [ ] The new name shows in the header/menu after saving and persists after reload.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

### US-010: Change password
**Description:** As a credentials user, I want to change my password so I can keep
my account secure.

**Acceptance Criteria:**
- [ ] The settings page has a "Change password" form: current password, new
      password, confirm new password.
- [ ] A `changePassword(...)` server action verifies the current password with
      `bcryptjs` (cost 12), rejects mismatched/short new passwords with a generic
      error, and updates `passwordHash` on success.
- [ ] Users without a `passwordHash` (Google-only accounts) see a "set a password"
      variant or a clear message that password change is unavailable.
- [ ] Success and error states are shown via `role="status"`/`role="alert"`.
- [ ] Typecheck/lint passes.
- [ ] Tests pass (password validation logic is unit-tested).
- [ ] Verify in browser.

### US-011: Delete account
**Description:** As a user, I want to delete my account so I can remove my data.

**Acceptance Criteria:**
- [ ] The settings page has a "Danger zone" with a "Delete account" action behind a
      confirmation that requires typing the account email (or "DELETE").
- [ ] A `deleteAccount()` server action deletes the `User` row; cascades remove
      owned documents, owned workspaces, memberships, and comments via existing
      relations.
- [ ] After deletion the user is signed out and redirected to the marketing home.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

### US-012: First-run sample document for new users
**Description:** As a new user, I want a sample document on first sign-up so I can
see what the app does without starting from a blank page.

**Acceptance Criteria:**
- [ ] On successful sign-up (credentials and Google first-login), seed exactly one
      sample document for the new user containing example Markdown and at least one
      pre-attached `Visual` (reuse a fixture from `src/lib/visual/fixtures.ts`).
- [ ] Seeding is idempotent/guarded so existing users are never re-seeded and a user
      gets at most one sample.
- [ ] The sample document opens and renders its visual correctly.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

---

### Feature Area D — Templates

### US-013: Template catalog (data + module)
**Description:** As a developer, I need a catalog of starter templates so new
documents can begin from structured content.

**Acceptance Criteria:**
- [ ] Create `src/lib/templates/catalog.ts` exporting a typed
      `TemplateEntry[]` (`{ id; name; description; content: string; visualKind?:
      VisualKind }`) with at least 4 templates (e.g. Blank, Process/Flowchart,
      Mind Map, Comparison) using Markdown `content` parseable by `parseMarkdown`.
- [ ] Add `src/lib/templates/catalog.test.ts` (node --test + tsx) asserting each
      template's `content` parses to ≥1 block and any `visualKind` is a valid
      `VisualKind`.
- [ ] The module is framework-free (no React import) so it stays unit-testable.
- [ ] Typecheck/lint passes.
- [ ] Tests pass.

### US-014: Create a document from a template
**Description:** As a user, I want to pick a template when creating a document so I
don't start blank.

**Acceptance Criteria:**
- [ ] The "New document" affordance opens a template picker (modal or menu) listing
      the catalog entries with name + description; "Blank" remains the default.
- [ ] Selecting a template calls a `createDocumentFromTemplate(templateId)` server
      action that creates the document with the template's `content` (and, if the
      template defines a `visualKind`, leaves visual generation to the user — do not
      call the AI here) and redirects to its editor.
- [ ] An unknown/missing templateId falls back to creating a blank document.
- [ ] Typecheck/lint passes.
- [ ] Tests pass.
- [ ] Verify in browser.

---

### Feature Area E — Visual Version History (Safety Net)

### US-015: Persist visual revisions on save
**Description:** As a developer, I need to record visual revisions so users can
restore previous versions.

**Acceptance Criteria:**
- [ ] Add a `VisualRevision` model (`id`, `visualId`, `data Json`, `type`,
      `title?`, `createdAt`) with `onDelete: Cascade` from `Visual`, plus migrations
      in **both** provider histories; rerun `npm run db:schema:sqlite`.
- [ ] `attachVisual` writes a `VisualRevision` snapshot of the previous `Visual.data`
      before overwriting it (skip when there is no prior data).
- [ ] Keep at most the **last 10** revisions per visual (prune older ones in the
      same action).
- [ ] No change to the public `attachVisual` signature/behavior for callers.
- [ ] Typecheck/lint passes.
- [ ] Tests pass.

### US-016: Browse and restore a previous visual version
**Description:** As a user, I want to see recent versions of a visual and restore
one so I can undo an unwanted edit or regeneration.

**Acceptance Criteria:**
- [ ] The visual panel has a "History" affordance listing recent revisions
      (timestamp + a small `VisualRenderer` thumbnail), newest first.
- [ ] A `listVisualRevisions(documentId, anchorBlockId)` action returns the
      access-scoped revisions; a `restoreVisualRevision(revisionId)` action
      re-validates the snapshot with `validateVisual` and writes it back via the
      existing `attachVisual` path (which itself snapshots the now-current version,
      so restore is itself undoable).
- [ ] Restoring updates the canvas live and persists after reload.
- [ ] Typecheck/lint passes.
- [ ] Tests pass.
- [ ] Verify in browser.

---

### Feature Area F — Operational Hardening

### US-017: CI workflow protecting `main`
**Description:** As a maintainer, I want CI to run the quality gate on every PR so
`main` stays green.

**Acceptance Criteria:**
- [ ] Add `.github/workflows/ci.yml` that, on push and pull_request, runs
      `npm ci`, `npm run db:generate` (SQLite), `npm test`, `npm run typecheck`,
      `npm run lint`, `npm run format:check`, and `npm run build` on Node 22.
- [ ] The workflow uses `DB_PROVIDER=sqlite` and a `file:` `DATABASE_URL` so it needs
      no external services.
- [ ] The workflow file is valid YAML and the documented steps mirror the local
      quality gate in `AGENTS.md`.
- [ ] Typecheck/lint passes (repo gate still green).

### US-018: Database-backed AI rate limiting
**Description:** As an operator, I want AI rate limits enforced across instances so
quota holds in production.

**Acceptance Criteria:**
- [ ] Add a `RateLimitHit` (or equivalent) model keyed by subject (user id or anon
      cookie id) + window, with migrations in **both** provider histories; rerun
      `npm run db:schema:sqlite`.
- [ ] Refactor the authenticated rate-limit path in `/api/generate` to read/write
      the DB store instead of the per-instance in-memory `Map`, preserving the
      existing fixed-window limit/window semantics.
- [ ] The pure window/limit logic in `src/lib/ai/quota.ts` stays unit-tested; add a
      test for the new store interface using an in-memory fake.
- [ ] Anonymous signed-cookie quota behavior is unchanged.
- [ ] Typecheck/lint passes.
- [ ] Tests pass.

### US-019: Structured error logging for the AI endpoint
**Description:** As an operator, I want structured error logs so I can diagnose
generation failures.

**Acceptance Criteria:**
- [ ] Add a small `src/lib/log.ts` helper exposing `logError(scope, error, context?)`
      that emits a single structured JSON line (no PII: never log raw input text or
      secrets) and is safe to call server-side.
- [ ] `/api/generate` logs Azure config errors (503), generation failures (502), and
      unexpected errors (500) via the helper with a `scope` and a request correlation
      id, without changing the HTTP responses.
- [ ] Add a unit test asserting the helper redacts/omits configured sensitive keys.
- [ ] Typecheck/lint passes.
- [ ] Tests pass.

### US-020: Document collaboration-server persistence & scaling path
**Description:** As a maintainer, I want a documented production path for the collab
server so real-time editing can run beyond a single instance.

**Acceptance Criteria:**
- [ ] Add a `docs/collab-deployment.md` (and a README link) describing: how to run
      `scripts/collab-server.mjs` in production, the single-instance in-memory
      limitation, and a concrete scaling/persistence option (e.g. a shared
      pub/sub or a Yjs persistence adapter) with trade-offs.
- [ ] Add an environment-driven `COLLAB_PORT`/`NEXT_PUBLIC_COLLAB_WS_URL` reference
      table and a graceful-degradation note (the app already falls back to
      local-only after 2.5s).
- [ ] No application behavior change required; documentation only.
- [ ] Typecheck/lint passes (repo gate still green).

---

### Feature Area G — UX Polish

### US-021: Fix editor-header overflow at 375px
**Description:** As a mobile user, I want the editor header to fit small screens so
there is no horizontal scroll.

**Acceptance Criteria:**
- [ ] At 375px width the document editor header no longer causes horizontal overflow
      (`document.documentElement.scrollWidth <= clientWidth`); the save-status span
      truncates or wraps instead of pushing width.
- [ ] No regression at 768px/1280px.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

### US-022: Core keyboard shortcuts
**Description:** As a power user, I want keyboard shortcuts so I can work faster.

**Acceptance Criteria:**
- [ ] Add at least: a shortcut to create a new document from the dashboard (e.g.
      `n`), and in the editor a shortcut to toggle Write/Preview (e.g. `Cmd/Ctrl+E`).
- [ ] Shortcuts are ignored while typing in inputs/textareas (except where intended)
      and do not conflict with browser defaults.
- [ ] A small, discoverable "?" or tooltip lists the available shortcuts.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

### US-023: Global error boundary and not-found polish
**Description:** As a user, I want friendly error and 404 pages so failures aren't
jarring.

**Acceptance Criteria:**
- [ ] Add an App Router `src/app/error.tsx` (client error boundary) with a "Try
      again" reset action and a link home.
- [ ] Add/confirm a styled `src/app/not-found.tsx` matching the app's zinc theme.
- [ ] Both render correctly in light and dark mode.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

## Functional Requirements

- FR-1: Provide access-scoped server actions for document **delete (soft, with
  undo), restore, rename, duplicate, and favorite toggle**, all reusing
  `getAccessibleDocument` and `updateMany`/`deleteMany` no-op-on-miss patterns.
- FR-2: Add `Document.deletedAt`, `Document.favorite` columns with migrations in
  **both** provider histories; exclude soft-deleted documents from all list/detail
  queries; purge rows soft-deleted > 30 days.
- FR-3: Dashboard gains per-card overflow actions (delete/rename/duplicate),
  client-side title search, URL-persisted sort, a favorites filter, and a star
  toggle.
- FR-4: Add a protected `/app/settings` page with **edit display name**, **change
  password** (bcryptjs, generic errors, handle password-less accounts), and **delete
  account** (typed confirmation, sign-out + redirect).
- FR-5: Seed exactly **one idempotent sample document** (with a visual) per new user
  on first sign-up (credentials and Google).
- FR-6: Add a framework-free **template catalog** (`src/lib/templates/catalog.ts`,
  ≥4 templates, unit-tested) and a template picker + `createDocumentFromTemplate`
  action; unknown templateId falls back to blank.
- FR-7: Add a `VisualRevision` model; `attachVisual` snapshots the prior version
  (keep last 10); provide list + restore actions; restore is itself undoable.
- FR-8: Add a **CI workflow** running the full quality gate on Node 22 with
  `DB_PROVIDER=sqlite` (no external services).
- FR-9: Move authenticated AI rate limiting to a **DB-backed store** keyed by
  subject + window, preserving existing fixed-window semantics and the anonymous
  signed-cookie path; keep `quota.ts` pure logic unit-tested.
- FR-10: Add a **structured, PII-safe error logger** and wire it into
  `/api/generate` failure paths without changing HTTP responses.
- FR-11: Add **collaboration-server deployment documentation** (persistence/scaling
  trade-offs, env reference) — docs only.
- FR-12: Fix the **375px editor-header overflow**, add **core keyboard shortcuts**
  with a discoverable list, and add a **global error boundary** + styled 404.
- FR-13: Every story keeps lint, typecheck, build, and `format:check` green and
  honors the SQLite/Postgres dual-history + generated-`schema.sqlite.prisma` rules
  in `AGENTS.md` (after editing `prisma/schema.prisma`, rerun
  `npm run db:schema:sqlite` and create migrations under **both** `DB_PROVIDER`s).

## Non-Goals (Out of Scope)

- No trash/recycle-bin **management UI** beyond the transient undo toast (soft-delete
  rows are auto-purged, not browsable).
- No nested **folders** or free-form **tags** (favorites only for this roadmap).
- No team/admin roles, billing, or per-feature entitlement changes (existing
  workspace roles and rate limiting stay).
- No **email** flows (password reset by email, verification, or notification emails).
- No external monitoring SaaS integration (e.g. Sentle/Datadog) — structured
  `console`-level logging only; an adapter seam is enough.
- No re-architecture of the collaboration server in code (US-020 is documentation +
  env reference only).
- No new visual **types** or renderer changes beyond what version history needs.
- No real Azure key requirement for verification — use the documented local
  mock-Azure setup from `AGENTS.md`.
- No mobile-native apps (responsive web only).

## Design Considerations

- **Reuse existing patterns.** Card overflow menus and the settings/template pickers
  must use the **ref-containment** click-outside pattern (never `stopPropagation`),
  per `AGENTS.md`. Match the zinc palette with `dark:` variants, pill buttons, and
  `border-black/[.06]` / `dark:border-white/[.08]` card borders.
- **Dashboard grid** stays `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`; verify no
  horizontal overflow at 1280/768/375.
- **Server-action + pending UI** patterns: use `useFormStatus`/`useActionState` for
  buttons; create-and-redirect actions call `redirect` last (outside try/catch).
- **Confirmation dialogs** name the target (document title / account email) before
  destructive actions; deletes are reversible where feasible (soft-delete + undo).
- **Settings** reuses the credentials form/action conventions in `login`/`signup`
  (generic auth errors, `role="status"`/`role="alert"`).
- **Version history thumbnails** reuse the directive-free `VisualRenderer`.

## Technical Considerations

- **Schema portability:** new columns/models are added to `prisma/schema.prisma`;
  after each change rerun `npm run db:schema:sqlite` (so the two schema files differ
  only by the datasource `provider`) and create migrations under **both**
  `DB_PROVIDER=postgres` and `DB_PROVIDER=sqlite`. No Prisma enums — use `String`
  columns + app-level unions if any enumerations are needed.
- **Access scoping:** every per-document action uses `getAccessibleDocument` and
  `updateMany`/`deleteMany` so a foreign id is a harmless no-op, never a leak.
- **Soft delete** must be applied at **every** read site (dashboard lists, editor
  page, share/embed) — audit `prisma.document.find*` call sites.
- **Rate-limit store** must keep the existing fixed-window semantics; the pure
  window math stays in `quota.ts` with an injected store interface (in-memory fake
  for tests, Prisma-backed in the route).
- **Sample-doc + template seeding** must be idempotent (guarded find-or-create) so
  it is safe on both engines and never duplicates.
- **Testing:** pure logic (templates, rate-limit store interface, password
  validation, error-log redaction) gets Node-test-runner + tsx unit tests next to
  the module; UI stories use the local mock-Azure server where generation is
  involved, never the network. Browser QA uses `dev-browser --headless` (no X
  server) against the production build (`next build && next start`) per `AGENTS.md`.
- **CI** mirrors the local gate exactly so green-locally ⇒ green-in-CI.

## Success Metrics

- Users can delete, rename, duplicate, star, search, and sort documents entirely
  from the dashboard, each in ≤ 2 clicks; an accidental delete is recoverable within
  the undo window.
- New users land on a non-blank sample document and can start a new document from a
  template without facing an empty page.
- A user can restore a previous version of a visual after an unwanted edit/re-roll.
- CI runs the full quality gate on every PR; `main` cannot regress the gate.
- AI rate limits hold consistently regardless of instance count.
- No horizontal overflow at 375/768/1280 across the dashboard, editor, and settings;
  errors and 404s render friendly themed pages.

## Open Questions

- Soft-delete purge: opportunistic on dashboard load vs. a separate scheduled job —
  which is acceptable for the current (serverless) deployment?
- Should duplicated documents copy inline (anchored) visuals only, or also the
  document-level visual? (Current AC: copy **all** `Visual` rows.)
- Keyboard-shortcut surface: is a minimal set (new doc, toggle Write/Preview)
  sufficient for v1, or should it also cover save/export/type-switch?
- Version history retention: is "last 10 per visual" the right cap, or should it be
  time-based (e.g. last 24h)?
- Account deletion: hard-delete immediately vs. a grace period — any compliance
  requirement to honor?
