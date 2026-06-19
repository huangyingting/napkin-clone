# Project Context

- **Owner:** huangyingting
- **Project:** Napkin-Clone — a modern webapp for writing articles and generating visuals. Goal: redesign the UI into a professional editing system with context-aware toolbars/toolboxes to insert visuals, edit visuals, and change styles. High quality, easy to use, efficient.
- **Stack:** Next.js 16, React 19, TypeScript, Lexical (rich-text editor), Yjs + y-websocket (collaboration), Prisma 7 (SQLite + Postgres adapters), next-auth v5, Tailwind v4, framer-motion, lucide-react, jspdf, pptxgenjs
- **Created:** 2026-06-19T05:36:53Z

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
## 2026-06-19T05:36:53Z — Redesign planning context

Trinity and Mouse aligned the redesign around shared `EditorContext` + `ToolRegistry`, reusable `src/components/ui/` primitives, theme-first visual restyling, and an incremental rollout that preserves Lexical/Yjs/contentJson invariants.


## 2026-06-19T05:36:53Z — Phase 1: ToolRegistry + text toolbar migration

Built `src/lib/lexical/tool-registry.ts` (data-driven `EditorTool` model; pure
`when`/`isActive`; `run` via Lexical commands only) and migrated the floating
selection toolbar to `floating-text-toolbar.tsx` (`FloatingTextToolbar`), which
reads `useEditorContext()` and renders `toolsFor('text-format', ctx)` inside the
shared `FloatingSurface` as lucide `IconButton`s with tooltips. Deleted the legacy
`floating-toolbar.tsx`. Added scroll/resize rect refresh to `EditorContextProvider`.
Behaviour preserved; verified typecheck/lint/test(139)/build.


## 2026-06-19T05:36:53Z — Phase 2: unified insert menu + deterministic Insert Visual

Added `BLOCK_INSERT_TOOLS` + `VISUAL_INSERT_TOOLS` (one per `VisualKind`, from a
single `VISUAL_KIND_META`) to `tool-registry.ts`, with optional `description`/
`keywords` on `EditorTool`. Rebuilt the `+`/`/` menu as `insert-menu.tsx`
(`InsertMenuPlugin`) on `ui/FloatingSurface`, driven by `toolsFor`, with "Text"
and "Visuals" sections, icon-first items, `/` filtering, and the original
keyboard nav (deleted `block-insert-menu.tsx`, swapped the mount). Visual items
only `dispatchCommand(INSERT_VISUAL_COMMAND, { kind, afterNodeKey })` — Tank's
handler owns insertion. Reconciled the gutter: `block-spark.tsx` AI flow kept
intact but routed through `FloatingSurface`/`ui` primitives, now offering the
deterministic blank kinds alongside "Generate from this block". Verified
typecheck/lint clean, 152 tests pass, build OK.


## 2026-06-19T05:36:53Z — Phase 3: theme-first visual ContextPopover

Migrated selected-visual editing into one `VisualContextPopover`
(`visual-context-popover.tsx`) in the shared `FloatingSurface`, surfaced when
`useEditorContext().kind === 'visual'` for the card. Added `Swatch` +
`ColorPicker` ui primitives (replacing raw `<input type=color>` rows). Selection
now flows through a Lexical `NodeSelection` (clicking the card selects the
`VisualNode`); retired the old inline popover + per-card outside-click state
machine and deleted `style-panel.tsx`. Controls map to Tank's pure
`@/lib/visual/transforms` (`setVisualKind`/`applyTheme`/`setVisualStyle`/
`setNodeStyle`/`resetNodeStyle`/`setNodeIcon`/`clearNodeIcon`), each applied via
`node.setVisual(next)` in `editor.update()`. AI "more variations" (`/api/generate`),
export, remove, and per-node canvas editing preserved. typecheck/lint clean,
173 tests pass, build green.


## 2026-06-19T05:36:53Z — Phase 4: pro text toolbar (code, align, color, highlight)

Added four registry-driven `text-format` capabilities, all additive. Inline
`code` (`format-code`, `FORMAT_TEXT_COMMAND 'code'`) themed as a chip via
`theme.text.code` in `lexical-editor.tsx` using `--ds` Tailwind utilities (no
`globals.css` edit). Alignment (`align-left/center/right/justify`,
`FORMAT_ELEMENT_COMMAND`) with active state from the new `ctx.elementFormat`.
Text color + highlight as `"color"`-control tools applying `$patchStyleText`
inside `editor.update()` (reset → `null`), reading `ctx.textColor` /
`ctx.highlightColor`. Extended `EditorTool` with a `control` discriminator +
`value`/`apply` (made `run` optional; updated `insert-menu.tsx` to `run?.`).
Extended `EditorContextSnapshot` (read-only) with `elementFormat`/`textColor`/
`highlightColor`. Toolbar groups by section with dividers; color/highlight open a
`ColorPicker` popover (new `icon`/`onReset`/`preserveSelection` props keep the
anchored selection alive). typecheck/lint clean, 181 tests pass, build green.
