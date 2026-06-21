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
