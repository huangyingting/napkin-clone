# Project Context

- **Owner:** huangyingting
- **Project:** TextIQ — a modern webapp for writing articles and generating visuals. Goal: redesign the UI into a professional editing system with context-aware toolbars/toolboxes to insert visuals, edit visuals, and change styles. High quality, easy to use, efficient.
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

## 2026-06-19T18-13-23Z — Ship-and-merge session: 9 features, 18 PRs

Shipped frontends for #6 (style gallery), #8 (visual catalog), #17 (export options), #18 (element styling), #16 (frame/canvas), #14 (text-visual sync), #15 (elastic layout), #12 (mobile viewing), #9 (i18n). All 18 PRs passed full CI quality gate (test/typecheck/lint/format:check/build). Key learning: `npm run format:check` must pass before push; .squad/.copilot are tooling-ignored in eslint + prettier configs.

## 2026-06-20T00-05-35Z — Backlog clear session: 9 features, 9 PRs merged

Shipped all Switch backlog items: #40 (two-pane layout + docked 320px right rail for desktop), #52 (in-app Present mode with snapshot data model), #53 (persisted `deckJson` column separate from Lexical state), #54 (public `/present/[shareId]` routes + shared `SlideCanvas` primitive), #44 (visual effects array on `Visual`; SVG filters for SHADOW/SKETCH), #42 (per-node font family native select), #45 (categorized menu drill-down + extracted DOM-free `computeVisualInfo` lib), #41 (overall-adjustments toolbox with pure `shouldShowOverallToolbox` predicate), #43 (verified visual edits already tracked by Yjs UndoManager; surfaced as discoverable UI). All 9 PRs (#57–#67) passed 5 CI gates and merged to main. 3 epics closed (#39, #46, #47).

## 2026-06-20T04:05:00Z — Browser-review backlog clear: 5 p1 + 1 p2 issues, 5 PRs merged

Cleared Ralph's backlog triage findings. Shipped #76 (RightSurfaceCoordinator + z-index discipline for #69/#70/#71), #77 (pt-14 HUD offset for #68), #78 (responsive mobile nav + editing sheet for #72), #79 (VisualRenderer transparentBackground opt-in for #74), #80 (skeleton + staged generation UX for #73). All 5 PRs passed 5 CI gates. 705/705 tests pass. Mobile nav 390px overflow verified fixed.

## 2026-06-20T06:20:00Z — Triage session: #82/#83 verified-done+closed; #84 shipped quick-action bar; CI format fix; #87 roadmap deferred

Ralph processed open board; Switch shipped remaining acceptance criterion for #84 (on-canvas `VisualQuickActionBar` via PR #85). Direct-to-main auth commit lacked Prettier formatting (b58e1d6, PR #85 test); Ralph fixed via PR #86. Final state: main green (710 tests, format:check clean). Roadmap items (5 future PRs) escalated to #87 [Epic] (p2/backlog/squad:switch/squad:mouse). 


## 2026-06-21T20:35:42+08:00 — Slides editing review backlog

Slides editing review produced epic #199 and child issues #200–#214. Switch owns #200 (undo/redo), #201 (auto-materialize/remove gate), #202 (insert+restyle document visuals), #208 (save-status/autosave/close guard), #209 (responsive/touch editor), and #212 (thumbnail rail polish).

## 2026-06-22T15:47:18+08:00 — Slides review + #293 "From document" panel

Frontend impl review (8 HIGH issues → #304–#307); immediately implemented #293 "From document" quick-insert panel (11 tests, commit af4d248, PR #308).
