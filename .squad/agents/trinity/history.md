# Project Context

- **Owner:** huangyingting
- **Project:** TextIQ — a modern webapp for writing articles and generating visuals. Goal: redesign the UI into a professional editing system with context-aware toolbars/toolboxes to insert visuals, edit visuals, and change styles. High quality, easy to use, efficient.
- **Stack:** Next.js 16, React 19, TypeScript, Lexical (rich-text editor), Yjs + y-websocket (collaboration), Prisma 7 (SQLite + Postgres adapters), next-auth v5, Tailwind v4, framer-motion, lucide-react, jspdf, pptxgenjs
- **Created:** 2026-06-19T05:36:53Z

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

## 2026-06-19T05:36:53Z — Phase 0 foundations landed

Phase 0 landed the additive redesign foundations: Mouse added the `--ds-*` token layer, re-mapped `--ghost-*` chrome tokens with identical resolved values, and rebased `control-styles.ts` onto tokens; Switch added `EditorContextProvider` / `useEditorContext()` plus shared `src/components/ui/` primitives. Nothing has been rewired yet, so Phase 1 can consume these foundations while preserving current editor behavior.

## 2026-06-19T09:10:47Z — Phases 0–3 complete

Phases 0–3 are complete: foundations; ToolRegistry + text toolbar; unified insert + deterministic visual; and context-aware, theme-first visual editing popover. Verification: typecheck clean, 173/173 tests pass, build green, dev server boots and serves 200s; lint only has pre-existing `ralph-triage.js` errors. Next: Phase 4 capability expansion (inline code, text color, alignment, richer restyle), then Phase 5 polish/a11y/perf.


## 2026-06-20T03:30:00Z — Post-ship browser triage

Ran live browser walkthrough of the running app (port 4000) post-phases 0–3. Exercised editor/presentation/export workflows. Triaged 6 findings into 8 GitHub issues (#68–#75): 3 p1 bugs, 1 p1 epic, 2 p2 features, 1 p2 bug. Key architectural finding: z-index + surface mutual-exclusion pattern requires epic-level fix (Switch + Mouse ownership). Top 3 priorities: #69/#70/#71 (surface collision), #68 (present HUD), #72 (mobile nav). Decision logged in .squad/decisions.md; orchestration + session logs created.


## 2026-06-21T20:35:42+08:00 — Slides editing review backlog

Slides editing review produced epic #199 and child issues #200–#214. Trinity owns #205 (doc↔deck merge-sync + staleness) and authored the cross-discipline balance narrative for the backlog.

## 2026-06-22T15:47:18+08:00 — Slides architecture review → epic #292

Architecture review: balance inverted (free-form over-built, doc-leverage under-built); P0 image-budget/server-cap mismatch; epic #292 and child issues #293–#307 created.

## 2026-06-25T22:57:28Z — 10-pass code-health review → architecture findings + epics #1093/#1095/#1100/#1102

**Session:** 10-pass refactoring/code-health review (requested by Switch).

**Contributions:** 20 architecture findings (TRIN-01–TRIN-20). Top items: dual SlideCommand/DeckPatch definition (TRIN-01/14), DECK_THEMES/STYLE_THEMES divergence (TRIN-02), 91 facade-migration exceptions with no retirement plan (TRIN-03), deck-export.ts (1709L) wrongly placed in lib/visual/ (TRIN-05), VISUAL_KIND_META_DATA duplicate (TRIN-06), three mega-files 3044/1987/2660L (TRIN-09/10/11).

**Owned epics (primary):**
- **#1093** (Epic 1): Dual-track slide command & deck-theme contract unification — TRIN-01/14 + TRIN-02. Single-source into `slide-command-contracts.ts`; derive DECK_THEMES from STYLE_THEMES.
- **#1095** (Epic 3): Deck-export modularization & relocation — TRIN-05 + TANK-04. Real `deck-export.ts` split (spec-builder/PPTX/SVG) + move to `lib/presentation/export/`.
- **#1100** (Epic 8): Import-graph facade migration — TRIN-03. Retire 91 blanket exceptions; quarterly-declining threshold.

**Co-owns:**
- **#1094** (Epic 2): large-file decomposition — TRIN-09/10/11 (slide-editor.tsx 3044L, slide-stage-editor.tsx 1987L).

**Child issues:** #1103–#1150 range (see epic-plan.md for exact assignments).

**Sequencing note:** Epic #1093 and #1102 (test builders) should land first to de-risk everything; Epic #1100 (facade burn-down) is last.
