# Project Context

- **Owner:** huangyingting
- **Project:** TextIQ — a modern webapp for writing articles and generating visuals. Goal: redesign the UI into a professional editing system with context-aware toolbars/toolboxes to insert visuals, edit visuals, and change styles. High quality, easy to use, efficient.
- **Stack:** Next.js 16, React 19, TypeScript, Lexical (rich-text editor), Yjs + y-websocket (collaboration), Prisma 7 (SQLite + Postgres adapters), next-auth v5, Tailwind v4, framer-motion, lucide-react, jspdf, pptxgenjs
- **Created:** 2026-06-19T05:36:53Z

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

## 2026-06-19T05:36:53Z — Phase 1 ToolRegistry landed

Phase 1 is live: `ToolRegistry` is now the extension model for editor tools, the floating text toolbar renders from it, and `EditorContext` drives toolbar visibility, active state, and anchoring. Phase 2 can build the insert menu + gutter + deterministic Insert Visual on these foundations, with Tank involved for the visual insertion path.

## 2026-06-19T08:44:38Z — Phase 2 Insert Visual landed

Phase 2 landed: the `+`/`/` insert menu and gutter now share `FloatingSurface`/UI primitives, deterministic Insert Visual works for all 9 kinds without AI, and the AI spark flow remains preserved. Phase 3 can proceed with context-aware visual editing popovers (`visual-card`, `style-panel`, `visual-editor`) on shared surfaces and a theme-first restyle.

## 2026-06-19T09:44:56Z — Phase 5 token carry-forward

Phase 5 hardening left one design-token follow-up for Mouse: add `--ds-state-on-accent` (subtle on-accent overlay) and `--ds-text-on-accent-muted` (muted text over accent) so Switch can replace the selected insert-menu item's remaining `bg-white/15` and `text-white/70` literals with semantic tokens.


## 2026-06-21T20:35:42+08:00 — Slides editing review backlog

Slides editing review produced epic #199 and child issues #200–#214. Mouse owns #206 (document-derived default theme), #207 (theme-first preset color controls), and #211 (slide templates on add).

## 2026-06-25T22:57:28Z — 10-pass code-health review → design-system findings + epic #1097

**Session:** 10-pass refactoring/code-health review (requested by Switch).

**Contributions:** 16 design-system findings (MOUSE-01–16). P0 a11y bug: `ImageCropControl` (controls.tsx:534) misuses `role="dialog" aria-modal="true"` — should be `role="group"` (MOUSE-P0). P1 structural: `controls.tsx` 2660L god-file with 8 panel stubs as 1-line re-exports (MOUSE-09); `FIELD_CLASS`/`LABEL_CLASS` redefined in 3 sibling inspector files — duplicate of `FIELD_CONTROL` in tokens.ts (MOUSE-04); active-toggle pattern hand-coded 7+ times instead of using `TOOLBAR_BUTTON_CHROME` (MOUSE-05); `InheritedColorControl` still uses raw `<input type="color">` when `ColorPicker`/`Swatch` exist (MOUSE-06/07); `shell-components.tsx` 1718L with custom HSV picker duplicating `ui/color-picker.tsx` (MOUSE-08); `check-design-system.mjs` blanket-excludes all of `src/components/presentation/` (MOUSE-14).

**Owned epics (primary):**
- **#1097** (Epic 5): Design-system token & color-control consolidation — MOUSE-04/05/06/07/08 + SWTCH-05. ColorPicker-first (remove bespoke HSV math); use `TOOLBAR_BUTTON_CHROME` token; migrate `InheritedColorControl` to `Swatch`/`ColorPicker` primitives.

**Co-owns:**
- **#1094** (Epic 2): Large-file decomposition — MOUSE-09 (controls.tsx 2660L split is the same file as SWTCH-04). P0 a11y fix belongs in this epic too.
- **#1098** (Epic 6): DRY helpers/dead code — MOUSE-04/05 token duplication.

**Child issues:** #1103–#1150 range (see epic-plan.md for exact assignments).

**P0 fix first:** `ImageCropControl` role="dialog" → role="group" (Epic 5.2 range).
