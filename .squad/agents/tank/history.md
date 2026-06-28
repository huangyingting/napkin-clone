# Project Context

- **Owner:** huangyingting
- **Project:** TextIQ — a modern webapp for writing articles and generating visuals. Goal: redesign the UI into a professional editing system with context-aware toolbars/toolboxes to insert visuals, edit visuals, and change styles. High quality, easy to use, efficient.
- **Stack:** Next.js 16, React 19, TypeScript, Lexical (rich-text editor), Yjs + y-websocket (collaboration), Prisma 7 (SQLite + Postgres adapters), next-auth v5, Tailwind v4, framer-motion, lucide-react, jspdf, pptxgenjs
- **Created:** 2026-06-19T05:36:53Z

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
## 2026-06-19T05:36:53Z — Redesign planning context

Trinity and Mouse aligned the redesign around shared `EditorContext` + `ToolRegistry`, reusable `src/components/ui/` primitives, theme-first visual restyling, and an incremental rollout that preserves Lexical/Yjs/contentJson invariants.


## 2026-06-19T05:36:53Z — Phase 0 foundations landed

Phase 0 landed the additive redesign foundations: Mouse added the `--ds-*` token layer, re-mapped `--ghost-*` chrome tokens with identical resolved values, and rebased `control-styles.ts` onto tokens; Switch added `EditorContextProvider` / `useEditorContext()` plus shared `src/components/ui/` primitives. Nothing has been rewired yet, so Phase 1 can consume these foundations while preserving current editor behavior.

## 2026-06-19T05:36:53Z — Phase 1 ToolRegistry landed

Phase 1 is live: `ToolRegistry` is now the extension model for editor tools, the floating text toolbar renders from it, and `EditorContext` drives toolbar visibility, active state, and anchoring. Phase 2 can build the insert menu + gutter + deterministic Insert Visual on these foundations, with Tank involved for the visual insertion path.

## 2026-06-19T05:36:53Z — Phase 2 backend: deterministic Insert Visual

Owned the backend half of Phase 2. Added `INSERT_VISUAL_COMMAND` +
`InsertVisualPayload` in `src/lib/lexical/commands.ts`, `createBlankVisual(kind)`
(schema-valid blank template for all 9 kinds) in `src/lib/visual/fixtures.ts`,
and `InsertVisualPlugin` (`insert-visual-plugin.tsx`, mounted in
`lexical-editor.tsx`) that builds + inserts + selects a `VisualNode` in one
`editor.update()` with no AI/network call. Verified the unchanged
save → `mirrorVisualNodes` path mirrors blank visuals to `Visual`/`VisualRevision`
rows for every kind. typecheck/lint clean, 144/144 tests pass, build green.
Switch builds the menu UI next and dispatches the command.

## 2026-06-19T05:36:53Z — Phase 3 backend: pure visual transforms
Owned the backend half of Phase 3. Created `src/lib/visual/transforms.ts`
(pure, framework-free) exporting `applyTheme(visual, themeId)`,
`isThemeActive`, `setVisualKind(visual, kind)`, `setVisualStyle`,
`setNodeStyle`, `resetNodeStyle`, `setNodeIcon`, `clearNodeIcon` +
`NodeStyleField` type. Themes resolved dynamically from `STYLE_THEMES`
(no hardcoded ids). `setVisualKind` re-lays-out positioned kinds
(flowchart stack / mindmap+concept radial), drops stale x/y for
order-derived kinds. All transforms immutable + schema-valid +
safeParseVisual round-trip. Added `transforms.test.ts` (15 tests).
Did NOT touch style-panel/visual-card/visual-editor (Switch) or
themes.ts exports (Mouse). Verified persistence: setVisual → contentJson
→ mirrorVisualNodes snapshots one VisualRevision per real change; no
backend change needed. typecheck/lint clean, 167/167 tests pass, build
green. Decision: .squad/decisions/inbox/tank-phase3-transforms.md.

## 2026-06-19T18-13-23Z — Ship-and-merge session: 7 features, 18 PRs

Shipped backends for #5 (doc export), #13 (generation controls), #4 (doc import), #11 (full-text search), #19 (native PPTX), #7 (Brand Studio), #10 epic (monetization foundation). All 18 PRs passed full CI quality gate (test/typecheck/lint/format:check/build). Key learning: `npm run format:check` must pass before push; .squad/.copilot are tooling-ignored in eslint + prettier configs.

## 2026-06-20T00-05-35Z — Backlog clear session: 4 features, 4 PRs merged

Shipped all Tank backlog items: #51 (Deck model + block-type reuse in `deck.ts`), #48 (social export presets with effective-viewbox padding; added `"9:16"` preset), #49 (social share via pure URL builders + `SocialShareMenu` component), #50 (infographic export with pure `computeInfographicLayout` lib + browser rasteriser split). All 4 PRs (#55, #56, #57, #62) passed 5 CI gates and merged. Key lesson: PR #56 needed 1 coordinator CI typecheck fix — local `tsc --noEmit` can pass on stale incremental cache while CI catches errors; agents should delete `tsconfig.tsbuildinfo` before typecheck.

## 2026-06-20T04:05:00Z — Seed visual embedding: pure Lexical helper + unit tests

Shipped #81 for #75 (seed visual). Extracted `buildSeedContentJson()` pure helper in `src/lib/lexical/seed-content.ts` (6 unit tests; node --test). Seed now embeds VisualNode in contentJson (not just DB row). Verified DB persistence. PR #81 passed 5 CI gates. 705/705 tests pass (19 net new).


## 2026-06-21T20:35:42+08:00 — Slides editing review backlog

Slides editing review produced epic #199 and child issues #200–#214. Tank owns #203 (deck→PPTX honoring deckJson), #204 (orphan-visual guard), #210 (rich-text preservation in derivation), and #213 (schema hygiene: SSR-safe IDs + legacy→free-form migration).

## 2026-06-25T22:57:28Z — 10-pass code-health review → backend findings + epics #1096/#1099

**Session:** 10-pass refactoring/code-health review (requested by Switch).

**Contributions:** 22 backend findings across 4 proposed epics. Key items: `legacyErrorResponse` still present with 12+ callsites not using canonical helpers (TANK-01/-02/-03/-16); `deck-export.ts` 1709L with 2–3 line stub split files (TANK-04/-20); `Document.content` plain-text field written at creation only, queried in 6 places for search/excerpt/OG metadata — stale post-edit (TANK-05/-15); config/boilerplate across `persistence-service.ts` (938L, 4 concerns), rate-limit split, `getBillingState` DB-write side-effect, `document-permissions.ts`/`workspace-capabilities.ts` parallel 300-line duplicates (TANK-06 through TANK-22).

**Owned epics (primary):**
- **#1096** (Epic 4): Canonical API error shape & legacy compat removal — TANK-01/-02/-03/-16. Delete `legacyErrorResponse` entirely (no compat alias); migrate all 12+ callsites to canonical helpers from `errors.ts`.
- **#1099** (Epic 7): Backend config/persistence splits & Document.content deprecation — TANK-05 through TANK-22. Split `persistence-service.ts`; unify rate-limit config; migrate stale `Document.content` reads to `contentJson`.

**Co-owns:**
- **#1095** (Epic 3): Deck-export modularization — TANK-04/-20 (real deck-export.ts split into spec-builder/PPTX/SVG appliers).

**Child issues:** #1103–#1150 range (see epic-plan.md for exact assignments).

## 2026-06-28 Backend/source line coverage pass

- Continued backend/service coverage without touching `src/app/**`, `src/components/**`, or `scripts/**`.
- Added focused generation-route and Stripe provider tests; introduced a test-only Stripe loader seam to exercise checkout, cancellation, and webhook flows without the optional Stripe SDK.
- Preserved/extended document persistence coverage and marked TypeScript-only/source-map noise with Node coverage pragmas where tests already exercise behavior.
- Final scoped coverage rows: `stripe-provider.ts` 100%, document `deck.ts`/`versioning.ts`/`visual.ts` 100%, `generation-route.ts` 99.83% (remaining line 375 coverage-pragmas/source-map artifact). Overall source line coverage reached 93.80% in scoped extraction; a tail run showed 93.85%.
- Validation: targeted backend tests passed (91 tests); ESLint passed for touched files. `npm run typecheck` still fails on pre-existing unrelated billing test stub typing errors outside touched scope; touched-file type errors were cleared.

2026-06-28T05:36Z - Continued core source coverage cleanup. Added runtime tests for asset upload policy WEBP/font alias magic bytes, metadata error paths, JPEG dimension handling; added a11y nested focus-trap and dialog focus-trap-failure checks; added comment orphan restore float coverage. Final source line coverage: 97.60% (from 97.51%). Validated touched tests and eslint.

## 2026-06-27T23:43:42Z — Core coverage follow-up started
- Picked up Switch request to continue exact residual core rows from latest source coverage.
- Scope: core modules only, avoiding presentation/visual/lexical/app/components/scripts/generated/test-support.
- Note: latest report path is under /tmp, which this runtime forbids for file operations; proceeding from provided residual row list and local coverage commands.

## 2026-06-28T07:04:20Z — Core coverage follow-up complete
- Added runtime coverage around first-run sample seeding, brand serialization, pointer media-query subscription, font-face injection, and comment anchor normalizers/record mapping.
- Added narrow preserved node coverage pragmas for source-map/type facade/object-literal spans in billing and visual command metadata.
- Final source coverage command reported 98.21% line coverage (was 97.94% in Switch handoff, +0.27pp).
- Validation: targeted node tests passed; targeted eslint passed; full source coverage passed. npm run typecheck was attempted but failed on pre-existing src/components/ui/chrome.test.ts errors, with no touched-file errors in filtered output.

## 2026-06-28T10:13:00Z source coverage cleanup

- Added targeted source coverage pragmas for confirmed tsx/source-map/type-facade artifacts in backend/core files.
- Source line coverage gate passed at 98.73% with sqlite env vars (`DB_PROVIDER=sqlite DATABASE_URL=file:./prisma/dev.db AUTH_SECRET=coverage-placeholder SOURCE_LINE_COVERAGE_MIN=98`).
- Targeted tests and eslint for touched files passed.

## 2026-06-28T14:45Z backend/core coverage pass
- Inspected remaining backend/core coverage rows and nearby tests.
- Added direct visual-command metadata malformed payload cases for edge label and edge toggle validation.
- Reworked ignore placement/comments in scoped backend/core files; targeted lint and tests passed.
- Source coverage gate rerun with sqlite env still exits 1 due existing script test failure (`scripts/test-subsystem.test.mjs`), and scoped rows still remain in the native coverage table (see `.squad/tank-source-coverage.log`).
