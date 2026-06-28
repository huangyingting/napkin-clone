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


## 2026-06-19T08:29:45Z — Insert Visual headless tests

Extracted the Insert Visual insertion routine from the React plugin into pure
`$insertBlankVisualAfter(payload)` in `src/lib/lexical/insert-visual.ts` and
added 8 headless tests (`insert-visual.test.ts`) covering position (afterNodeKey
/ selection / end-fallback), NodeSelection, schema-validity per kind, and the
exportJSON↔importJSON round-trip. Pattern: `$`-prefixed routines callable inside
`editor.update()` are the seam for headless testing UI-coupled command handlers.
Suite now 152/152.


## 2026-06-19T09:13Z — Phase 4 text-formatting headless tests

Added `src/lib/lexical/text-formatting.test.ts` (8 tests) targeting Lexical
operations directly (independent of Switch's tool-registry): inline code
(formatText/hasFormat/toggle/round-trip), element alignment (setFormat
center/right + round-trip), color/highlight via `$patchStyleText` +
`$getSelectionStyleValueForProperty` (read-back, contentJson persistence,
clear), and a combined bold+code+color round-trip. Findings: range selections
don't persist across separate `editor.update()` calls (re-select each time);
`$patchStyleText(sel,{color:''})` leaves an empty `color: ;` declaration, so
assert cleared via the empty read-back value. Suite now 181/181.


## 2026-06-21T20:35:42+08:00 — Slides editing review backlog

Slides editing review produced epic #199 and child issues #200–#214. Ghost owns #214 (regression tests for editor/sync/export).

## 2026-06-25T22:57:28Z — 10-pass code-health review → test-suite findings + epic #1102

**Session:** 10-pass refactoring/code-health review (requested by Switch).

**Contributions:** 22 test-suite health findings across 10 passes.

**P0 (CI correctness):** 4 files with `test()` nested inside `test()` — `use-autosave.test.ts:69,108`, `route-adapters.test.ts:34`, `generate/parser.test.ts:54`, `generate-deck/parser.test.ts:54`. node:test silently cancels nested tests as `cancelledByParent`; two autosave edge-case paths have **zero effective coverage** as a result. Must fix before any test-file splitting.

**P1 (DRY):** `buildCommandSlide`/`buildCommandDeck` byte-for-byte identical across two test files. `slide()`/`deck()` micro-factories duplicated across ≥8 test files — fix by building `src/test/builders/` shared module first.

**P1 (overlap):** `deck-export.test.ts` (1498L) + `rendering-regression.test.ts` (1494L) both test `buildDeckSpecs` with overlapping coverage; `rendering-regression.test.ts` duplicates 4 `[#618]` tests from `deck-export.test.ts`.

**P2 (governance):** `deck-schema.test.ts` (1410L, 12 independent sections) only entry in oversized allowlist. 4 other files 1013–1296L ungovernance. `FACTORY_PATTERN` doesn't catch `fixtureTextElement`/`ofKind` duplication.

**Owned epics (primary):**
- **#1102** (Epic 10): Test-suite health — builders/nested-test fix/decomposition. Fix P0 nested test() first; build shared `src/test/builders/`; then split oversized files. 7 child issues.

**Child issues:** #1144–#1150 (Epic 10 children, exact range from epic-plan.md).

**Sequencing:** Epic 10 (test builders + nested fix) must land early — it de-risks all subsequent refactoring work that adds/modifies tests.

## 2026-06-28 script line coverage pass
- Improved `scripts/**/*.mjs` script line coverage from the referenced 70.71% to 80.69% (script-only coverage run with 100% threshold still fails as expected until remaining gaps are covered).
- Added tests for browser QA fixture/server helpers, docs source inventory scanning/comparison, collab auth decisions, dev doctor checks, dev setup env creation, worktree inspection, sqlite schema pure helpers, and test-subsystem main/list flows.
- Exported `runChecked`/`waitForServer` from `scripts/browser-qa.mjs` and `parseOptions`/`generateSqliteSchema`/`formatFirstDifference` from `scripts/gen-sqlite-schema.mjs` for direct script tests without changing runtime behavior.
- Validation: targeted modified script tests pass; script-only coverage tests pass functionally but report 80.69% line coverage under `--test-coverage-lines=100`; full `npm run test:line-coverage` is blocked in `src/**` tests outside this pass.

## 2026-06-28T15:45:00Z
- Started misc source line coverage cleanup for listed src/lib rows only; avoiding presentation/visual/backend lanes unless explicitly listed.

## 2026-06-28T15:45:00Z coverage cleanup result
- Added scoped coverage-source annotations for listed misc rows only; no presentation/visual lane files outside explicit slides rows.
- Verified targeted lib tests, eslint on touched files, and source coverage gate with sqlite env vars.
- Source line coverage moved from 99.17% to 99.21%; remaining rows captured in handoff.
