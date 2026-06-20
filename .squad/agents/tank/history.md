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
