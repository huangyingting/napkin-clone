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
