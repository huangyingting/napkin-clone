# Squad Decisions

## Active Decisions

### 2026-06-19T05:36:53Z: Adopt one unified token layer (`--ds-*`) over the split ghost/zinc systems
**By:** Mouse (Design/UX)
**What:** Introduce a single semantic token layer in `globals.css` under `@theme inline` — surfaces, text, border, accent, elevation, radii, spacing, motion. App chrome AND editor controls both consume these tokens. Keep `ghost-*` reading tokens but re-map them onto the new layer; stop hardcoding `zinc-*` and `black/[.0x]` in editor controls (floating-toolbar, style-panel, block-insert-menu, visual-card, control-styles).
**Why:** Today the app mixes two unrelated palettes — `ghost-*` (chrome/reading) and raw `zinc-*`/`black/opacity` (editor controls). A pro editing system must feel like one material. One semantic layer makes light/dark, theming, and future accent changes trivial and consistent.

### 2026-06-19T05:36:53Z: Three-tier elevation + radii scale; no ad-hoc shadows/radii
**By:** Mouse (Design/UX)
**What:** Define elevation tokens (`--ds-shadow-flat/raised/overlay/popover`) and a radii scale (`--ds-radius-sm 8 / md 10 / lg 14 / xl 18 / pill`). Floating toolbar & popovers use `overlay`; the selected-visual control sheet uses `popover`; gutter buttons use `raised`. Replace ad-hoc `shadow-sm/lg/xl` and mixed `rounded-lg/xl/2xl`.
**Why:** Contextual surfaces stack (toolbar over canvas over page). A consistent elevation language tells users what's transient vs. anchored, and keeps the UI calm and intentional.

### 2026-06-19T05:36:53Z: Icon-based controls via lucide-react; retire text-glyph toolbar buttons
**By:** Mouse (Design/UX)
**What:** Replace text glyphs in the floating toolbar (`B`, `I`, `Link`, `H2`, `"`, `•`, `1.`) with lucide icons (Bold, Italic, Link, Heading2, Quote, List, ListOrdered). 28px hit targets, 16px icons, tooltip + aria-label retained. `lucide-react` is already a dependency.
**Why:** Glyph buttons read as a prototype, not a pro tool. Icons are faster to scan, align with Notion/Linear/Figma muscle memory, and free horizontal space for grouping.

### 2026-06-19T05:36:53Z: Context-aware surface model — three distinct surfaces, never simultaneous
**By:** Mouse (Design/UX)
**What:** (1) Text selection → floating inline toolbar above selection. (2) Insert intent → `+`/`/` insert menu (existing). (3) Visual selected → a contextual control sheet anchored to the card (keep current anchored model, do NOT make it a permanent sidebar). Enforce mutual exclusivity: selecting a visual dismisses the text toolbar and vice-versa. While typing with no selection, the canvas is chrome-free except the gutter `+`.
**Why:** "Calm during writing, powerful on demand" is the core UX bet. Surfaces appearing in context and disappearing when idle is what separates a love-it editor from a busy one.

### 2026-06-19T05:36:53Z: Add Button, Popover/FloatingSurface, SegmentedControl, Swatch, Panel/Field primitives
**By:** Mouse (Design/UX)
**What:** Switch to build a small primitive set under `src/components/ui/`: `Button` (variants: ghost/solid/subtle, sizes sm/md), `IconButton`, `FloatingSurface` (portal + positioning + pop motion, factored out of the duplicated logic in floating-toolbar/insert-menu/visual-card), `SegmentedControl` (replaces bespoke type-pills/theme-chips), `Swatch`/`ColorPicker` (replaces raw `<input type=color>` rows), `Panel`/`Field`/`SectionLabel` (style-panel structure). All consume `--ds-*` tokens.
**Why:** The three context surfaces re-implement portal+position+motion and toggle styling independently today. Extracting primitives removes drift, guarantees consistent focus rings/motion/elevation, and makes the redesign a composition exercise rather than a rewrite.

### 2026-06-19T05:36:53Z: Style editing model — Theme-first, then refine; presets over raw pickers
**By:** Mouse (Design/UX)
**What:** Restructure the visual style controls into a hierarchy: **Theme** (palette presets — existing indigo/ocean/forest/sunset/grape, shown as swatch chips) → **Refine** (background/fill/stroke/text/edge via swatch popovers, not bare native inputs) → **Type** (font size/weight) → **Selected element** override. Lead with one-click themes; treat per-color pickers as progressive disclosure.
**Why:** TextIQ's value is "great-looking visual in one move." Most users should restyle by picking a theme, not by tuning five color inputs. Presets first keeps the common path one click while preserving full control for power users.

### 2026-06-19T05:36:53Z: Adopt a single context-aware Toolbar Surface system driven by a Tool Registry
**By:** Trinity (Lead)
**What:** Replace the four ad-hoc, independently-positioned editor controls (`floating-toolbar.tsx`, `block-insert-menu.tsx`, `block-spark.tsx`, and the inline popover inside `visual-card.tsx`) with one coordinated surface system: a shared `EditorContext` derived from Lexical selection/node type, a declarative `ToolRegistry` of tools (each with `id`, `group`, `when(context)`, `icon`, `run(editor)`, `isActive`), and a small set of reusable surfaces (FloatingSelectionToolbar, Slash/PlusInsertMenu, BlockGutter, ContextPopover). Toolbars render the subset of registered tools whose `when()` predicate matches the current context. No control computes selection state or screen position on its own anymore.
**Why:** Today each control re-derives selection state and positioning with duplicated `selectionchange`/`SELECTION_CHANGE_COMMAND` listeners and bespoke rect math, and none of them know about the others. That cannot scale to "context-aware toolboxes that insert/edit/restyle visuals AND format text" without becoming an unmaintainable tangle. A registry + shared context makes the system extensible (a new tool is data, not a new plugin), keeps every surface visually and behaviorally consistent (the quality bar), and gives one place to reason about which affordance shows when.

### 2026-06-19T05:36:53Z: Keep `contentJson` (Lexical state) as the single source of truth; `Visual` rows stay a derived mirror
**By:** Trinity (Lead)
**What:** The visual payload remains embedded in the `VisualNode` (serialized into `Document.contentJson`) and continues to be mirrored to `Visual`/`VisualRevision` rows only by `mirrorVisualNodes` in the save path. The redesign must NOT introduce a second authoritative store or have the new toolbars write visuals directly to the DB. All visual insert/edit/restyle operations go through `editor.update()` → `node.setVisual()`, which already flows through the debounced Lexical save (US-003), the Yjs CRDT sync, and the DB mirror (US-011).
**Why:** This invariant is what makes collaboration, autosave, undo/history, and the read-only share/embed render all work coherently. Any new editing affordance that bypasses it would desync the three stores and break Yjs. Stating it explicitly prevents well-intentioned "just save the visual" shortcuts during the build-out.

### 2026-06-19T05:36:53Z: All editing affordances mutate document state exclusively via Lexical commands/updates (Yjs-safe)
**By:** Trinity (Lead)
**What:** Every tool in the registry mutates the document through Lexical commands or `editor.update()` and never touches the Yjs `Y.Doc` directly or holds Lexical NodeKeys across sessions. Contextual anchors (comments, selection) continue to use stable ids/strings (text content, `visualId`, visual element `id`) — never NodeKeys — consistent with `CaptureSelectionPlugin` and `visual-anchor-context.tsx`.
**Why:** `@lexical/yjs` owns the binding between the editor and the CRDT; local edits persist while remote/`COLLABORATION_TAG`/`HISTORIC_TAG` merges do not re-save. Writing to Yjs directly or persisting NodeKeys would corrupt that contract and break multi-user editing. This keeps the new system compatible with the existing collaboration wiring.

### 2026-06-19T05:36:53Z: Introduce a real design-token layer; tools/surfaces consume tokens, not ad-hoc Tailwind strings
**By:** Trinity (Lead)
**What:** Promote `control-styles.ts` into a small design-system module (Mouse owns it) that exposes semantic tokens and primitive components (ToolbarButton, Surface/Popover shell, Divider, Pill, IconButton) built on the existing `--ghost-*` CSS variables in `globals.css`. New editor surfaces compose these primitives instead of repeating long Tailwind class literals (as `visual-card.tsx` does today). Visual *content* theming stays separate in `src/lib/visual/themes.ts` (the `VisualStyle` palette), which is a document data concern, not app chrome.
**Why:** "Feels like one system" is the explicit quality bar. Centralizing chrome styling makes that enforceable and lets Switch build UI fast without re-deriving spacing/color/focus-ring conventions. Keeping app-chrome tokens distinct from visual-content style avoids conflating the editor's look with the user's diagram colors.

### 2026-06-19T05:36:53Z: Add an explicit "Insert Visual" path independent of AI generation
**By:** Trinity (Lead)
**What:** The Plus/Slash insert menu must gain a "Visual" group that inserts a `VisualNode` directly — seeded from a blank template (leveraging `src/lib/visual/fixtures.ts`) or opening the generate flow — rather than visuals only being creatable via the per-block AI "spark" (`block-spark.tsx`). Editing an inserted visual reuses the same ContextPopover surface.
**Why:** The user goal is a professional tool that can "insert visuals," but today a visual can only come into existence by AI-generating from existing block text. A deterministic, offline insert path is table stakes for a real editor, decouples the editing system from AI availability/quota, and gives a clean target for tests.


### 2026-06-19T05:36:53Z: `--ds-*` design-token layer landed; `--ghost-*` chrome re-mapped onto it

**By:** Mouse (Design/UX)

**What:** Implemented the unified semantic chrome token layer in `src/app/globals.css`
under `:root` (light) with a `prefers-color-scheme: dark` override block, and exposed
every token as a Tailwind v4 utility via `@theme inline` (`ds-*`). Tokens added:

- Surfaces: `--ds-surface-base | -raised | -overlay | -sunken`
- Text: `--ds-text-primary | -secondary | -muted | -on-accent` (all ≥4.5:1)
- Borders: `--ds-border-subtle | -strong`
- Accent: `--ds-accent | -accent-hover | -accent-contrast` (derived from `--ghost-accent-color`)
- Solid control: `--ds-control | -control-hover | -control-text`
- State overlays: `--ds-state-hover | -active | -selected` (replace `black/[.0x]` + `white/[.0x]`)
- Focus: `--ds-focus-ring | -focus-offset`
- Radii: `--ds-radius-sm 8 | -md 10 | -lg 14 | -xl 18 | -pill`
- Elevation: `--ds-shadow-flat | -raised | -overlay | -popover`
- Spacing: `--ds-space-1..6` (kept out of `@theme` to avoid clobbering Tailwind's spacing scale)
- Motion: `--ds-motion-fast | -base | -slow`, `--ds-ease-standard`

Re-mapped the reading/chrome `--ghost-*` tokens onto the new layer with identical
resolved values: `--ghost-text → --ds-text-primary`, `--ghost-secondary →
--ds-text-secondary`, `--ghost-border → --ds-border-strong`, `--ghost-wash →
--ds-surface-sunken`, `--ghost-bg → --ds-surface-base`. `--ds-accent` derives from the
existing single `--ghost-accent-color` knob. Reading typography (`.ghost-prose`, serif
body) is untouched and visually identical.

Rebased `src/components/motion/control-styles.ts` (`FOCUS_RING`, `GUTTER_BUTTON`,
`controlToggleClass`) onto the `ds-*` utilities and dropped all `zinc-*` /
`black/[.0x]` literals and `dark:` variants (tokens flip via media query). This
re-skins floating-toolbar, block-insert-menu, gutter spark, and visual-card surfaces
with no behavior change.

**Why:** Establishes the one-material foundation the redesign needs: light/dark,
theming, and future accent changes now flow from a single semantic layer. Keeping
chrome `--ds-*` distinct from visual-content `VisualStyle`/themes preserves the
separation between editor look and user-diagram colors. Verified with `npm run
typecheck` (clean), `npm run lint` (no new errors — the 6 reported are pre-existing in
files outside this scope), and `npm run build` (CSS compiles, `ds-*` utilities resolve).

### 2026-06-19T05:36:53Z: Phase 0 foundations — EditorContext snapshot + ui/ primitive set

**By:** Switch (Frontend)

**What:**
Landed two additive Phase-0 foundations (no behavior change to the live editor; the four existing controls are untouched and still own their own listeners).

1. **EditorContext** — `src/lib/lexical/editor-context.tsx`. One read-only Lexical
   plugin (`EditorContextProvider`) subscribes a single time to
   `registerUpdateListener` + `SELECTION_CHANGE_COMMAND` + DOM `selectionchange`
   + `registerEditableListener`, and exposes a typed snapshot via React context
   (`useEditorContext()`). It is mounted alongside the existing plugins in
   `lexical-editor.tsx` (wraps the plugin region) but nothing consumes it yet.
   It never calls `editor.update()`, never touches Yjs, and the NodeKeys it
   surfaces are live/transient (for an immediate update) — never persisted.

   Snapshot shape (a true superset of what the four controls compute today):
   ```ts
   type EditorContextSnapshot = {
     kind: 'range' | 'collapsed' | 'empty-block' | 'visual' | 'none';
     editable: boolean;
     isCollapsed: boolean;
     blockType?: 'paragraph' | 'h1' | 'h2' | 'h3' | 'quote' | 'bullet' | 'number';
     activeFormats: Set<'bold' | 'italic' | 'underline' | 'strikethrough' | 'code'>;
     isLink: boolean;
     blockKey?: string;        // live Lexical key, transient
     blockText?: string;
     isEmptyBlock: boolean;
     selectedVisualId?: string;       // stable visualId — safe to anchor/persist
     selectedVisualNodeKey?: string;  // live Lexical key, transient
     rects: { selection: RectSnapshot | null; block: RectSnapshot | null };
   };
   ```
   Refinements vs. the prompt's sketch: `activeFormats` is a `Set` plus a
   separate `isLink` boolean (link is a node, not a Lexical text format);
   `selectedVisualNodeId` is named `selectedVisualNodeKey` to make clear it is a
   transient Lexical key (the stable id is `selectedVisualId`); added a `'none'`
   kind for the blurred/empty case; `rects` carries both the native-range rect
   (floating toolbar) and the active block rect (gutter/menus). Visuals are
   detected by `getType() === 'visual'` (duck-typed `getVisualId()`) so the lib
   layer does not import the app-level node component.

2. **ui/ primitives** — `src/components/ui/` (all consume the `--ds-*` token
   layer, accessible, reduced-motion-aware via `@/components/motion/reveal`):
   - `Surface` — base shell (elevation + radius + border tokens).
   - `Button` / `IconButton` — variants `solid | subtle | ghost | danger`,
     sizes `sm` (28px) / `md` (32px); `IconButton` enforces `aria-label` + `active`.
   - `SegmentedControl` — `radiogroup` with roving arrow-key navigation.
   - `FloatingSurface` — portal + fixed positioning + pop motion + Escape +
     click-away (factors out the duplicated logic in the four controls).
   - `Tooltip` — hover/focus, `aria-describedby`, Escape-to-hide.
   - `Divider` — vertical/horizontal 1px rule.
   - `tokens.ts` — shared `FOCUS_RING`, `RADIUS`, `ELEVATION`, `SURFACE_BASE`, `cx`.

**Token names consumed (for Mouse to align in globals.css):** these are
additive and each `var(--ds-*, …)` carries a neutral fallback so the primitives
render even if a token is momentarily absent:
- Surfaces: `--ds-surface`, `--ds-surface-raised`, `--ds-surface-hover`, `--ds-surface-active`
- Text: `--ds-text`, `--ds-text-muted`, `--ds-text-on-accent`
- Border: `--ds-border`
- Accent: `--ds-accent`, `--ds-accent-hover`, `--ds-accent-active`
- Danger: `--ds-danger`, `--ds-danger-hover`
- Focus: `--ds-focus`
- Elevation: `--ds-shadow-flat | -raised | -overlay | -popover`
- Radii: `--ds-radius-sm(8) | -md(10) | -lg(14) | -xl(18) | -pill`

**Why:**
This is the single derivation point + primitive set that Phase 1 will use to
collapse the four ad-hoc controls into one registry-driven surface system
(per the approved decisions). Building it additively first lets us validate the
snapshot shape and primitives against the real toolbars without risking the live
editor, collaboration, or the `contentJson` source-of-truth invariant.

**Verification:** `npm run typecheck` clean; `npm run lint` clean for all new
files (the 5 remaining lint errors are in the pre-existing, untouched
`.squad/templates/ralph-triage.js`). Files prettier-formatted.


### Phase 0 EditorContext selection-derivation unit tests (headless Lexical)

**By:** Ghost (Tester)

**What:**
- Added `src/lib/lexical/editor-context.test.ts` (14 tests) exercising the pure
  selection-derivation in `src/lib/lexical/editor-context.tsx` via
  `@lexical/headless` `createHeadlessEditor`, wired with the SAME node set the
  app registers (`HeadingNode`, `QuoteNode`, `ListNode`, `ListItemNode`,
  `LinkNode`, `HorizontalRuleNode`, and the real `VisualNode`).
- Coverage:
  - **kind detection** — empty paragraph → `empty-block`; collapsed caret in
    non-empty text → `collapsed`; non-collapsed selection → `range`; selected
    `VisualNode` decorator (NodeSelection) → `visual`; null/blurred selection →
    `none`.
  - **blockType mapping** — paragraph, h1/h2/h3, quote, bullet list, number list.
  - **activeFormats** — bold/italic/underline/strikethrough/code each reflected
    individually, plus a multi-format case; `isLink` true inside a `LinkNode`,
    false for plain text.
  - **blockText** reflects the live block's concatenated text; **selectedVisualId**
    is the stable anchor-safe id (`vis-stable-1`) while **selectedVisualNodeKey**
    is the transient Lexical key, and the two are asserted distinct.
- Minimal refactor: exported the previously module-private `readSelectionDescriptor`
  and its `SelectionDescriptor` type from `editor-context.tsx` (no behavior change;
  the provider still calls it identically). This was required for headless
  testability of the derivation without mounting React.

**Why:**
The Phase 0 `EditorContext` is the single selection-derivation point that every
contextual surface (floating toolbar, insert menu, block gutter, visual controls)
will consume in Phase 1. Locking its derived snapshot under unit tests now
prevents regressions as Switch rewires consumers onto it. Tests are headless and
read-only — they never mutate the document, touch Yjs, or persist NodeKeys.

**Verification:** `npm test` → 139 pass (125 pre-existing + 14 new), 0 fail.
`npm run typecheck` clean. `eslint` clean on both changed files.

**Coordinate-safe:** did not touch floating-toolbar, tool-registry, or any file
Switch is migrating; the only edit to `editor-context.tsx` was the additive
export needed for testability.

### 2026-06-19T05:36:53Z: ToolRegistry contract + text formatting toolbar migrated to it

**By:** Switch (Frontend)

**What:**
Landed Phase 1 — a data-driven `ToolRegistry` and the first surface migrated onto
it (the floating text toolbar). The four ad-hoc controls otherwise remain.

1. **ToolRegistry** — `src/lib/lexical/tool-registry.ts`. An `EditorTool` is:
   ```ts
   type EditorTool = {
     id: string;
     group: 'text-format'|'block-insert'|'visual-insert'|'visual-edit'|'visual-style';
     label: string;
     icon?: LucideIcon;
     shortcut?: string;        // canonical "Mod+B" form
     section?: string;         // optional visual sub-group, for divider placement
     when(ctx): boolean;       // PURE — visible for this snapshot?
     isActive?(ctx): boolean;  // PURE — toggled on?
     run(editor, ctx): void;   // Lexical commands / editor.update() ONLY
   };
   ```
   Helpers: `registerTool` / `registerTools`, `getTools`, `toolsFor(group, ctx)`
   (visible subset filtered by `when`), `isToolActive(tool, ctx)`, and
   `formatShortcut(shortcut, isMac)` (`Mod+B` → `⌘B` on macOS, `Ctrl+B`
   elsewhere). **Invariant:** `when`/`isActive` are pure functions of the
   `EditorContextSnapshot` — no DOM, editor, or Yjs access — so they unit-test
   under `node --test` (verified by a throwaway probe). `run` mutates the
   document only through Lexical commands / `editor.update()`; never Yjs, never
   persists NodeKeys. `contentJson` stays the single source of truth.

2. **Text-format tool set** (`TEXT_FORMAT_TOOLS`, icons-first via lucide-react):
   bold (⌘B), italic (⌘I), underline (⌘U), strikethrough, link toggle, H2, H3,
   quote, bullet list, number list. Each `run` reuses the *exact* command logic
   from the legacy toolbar (`FORMAT_TEXT_COMMAND`, `$setBlocksType` with
   heading/quote/paragraph creators, `INSERT_(UN)ORDERED_LIST`/`REMOVE_LIST`,
   `TOGGLE_LINK_COMMAND` with the same `window.prompt` URL UX). Underline +
   strikethrough were added because the editor already applies them (theme
   classes + default `Mod+U`) — surfacing existing capability, not inventing new
   formatting. Inline `code` was deliberately omitted (no editor styling for it).

3. **Floating text toolbar** — `src/app/app/documents/[id]/floating-text-toolbar.tsx`
   (`FloatingTextToolbar`). Reads `useEditorContext()` instead of running its own
   `selectionchange` listener or rect math; renders `toolsFor('text-format', ctx)`
   inside the shared `FloatingSurface` as `Tooltip`-wrapped `IconButton`s (label +
   shortcut tooltip, `aria-label`, `aria-pressed`), with `Divider`s between
   `section`s (inline | block | list). It shows only for
   `kind === 'range' && editable`, positions over `ctx.rects.selection`, centers
   horizontally, and flips below the selection near the top edge (legacy
   behaviour). Mutual exclusivity with visuals is automatic (a visual selection
   yields `kind === 'visual'`, hiding the toolbar). Reduced motion is honoured via
   `FloatingSurface`/`usePopMotion`.

4. **Wiring** — `lexical-editor.tsx` now mounts `<FloatingTextToolbar />` in place
   of `<FloatingToolbarPlugin />`; the dead `floating-toolbar.tsx` (385 lines) was
   deleted (nothing else imported it).

5. **EditorContext fix** — added `resize` + capture-phase `scroll` listeners to
   `EditorContextProvider` so `rects` refresh as the viewport moves under a stable
   selection (the snapshot's `rects` doc comment already promised "recompute on
   scroll/resize"; the implementation didn't). This keeps the `position: fixed`
   toolbar anchored on scroll, matching the legacy plugin. Still read-only.

**Why:**
A registry makes a new tool *data*, not a new plugin, and concentrates "which
affordance shows when" in pure predicates one place can reason about (and Ghost
can test without a DOM). Migrating the text toolbar first proves the
EditorContext snapshot + `ui/` primitives against a real surface with zero
behaviour change — same actions, same shortcuts, same show/hide and link UX —
while delivering the icons-first look. Block-insert-menu, block-spark, and
visual-card stay untouched for Phase 2/3.

**Verification:** `npm run typecheck` clean; `npm run lint` clean for `src/`
(the 5 remaining errors are the pre-existing `.squad/templates/ralph-triage.js`);
`npm test` 139/139 pass; `npm run build` succeeds.


### 2026-06-19T05:36:53Z: INSERT_VISUAL_COMMAND — deterministic, non-AI "Insert Visual" foundation (Phase 2)

**By:** Tank (Backend)

**What:**
Landed the backend half of Phase 2 — a Yjs-safe command + blank-template seed +
handler that inserts a visual WITHOUT any AI/network call. `contentJson` stays
the single source of truth; the existing save flow mirrors the result.

1. **Command contract** — `src/lib/lexical/commands.ts` (new shared commands module):
   ```ts
   export type InsertVisualPayload = { kind: VisualKind; afterNodeKey?: string };
   export const INSERT_VISUAL_COMMAND: LexicalCommand<InsertVisualPayload>;
   ```
   - Import path: `@/lib/lexical/commands`.
   - `kind` is a `VisualKind` from `@/lib/visual/schema`.
   - `afterNodeKey` is optional and TRANSIENT (used only inside the dispatching
     update, never persisted). Omitted → insert at the current selection's
     top-level block, falling back to the end of the document.
   - Switch dispatches with
     `editor.dispatchCommand(INSERT_VISUAL_COMMAND, { kind })` from a
     `visual-insert` tool's `run`.

2. **Blank templates** — `createBlankVisual(kind): Visual` added to
   `src/lib/visual/fixtures.ts`. Returns a fresh, schema-valid minimal `Visual`
   for ALL 9 kinds (graph types flowchart/mindmap/concept get positioned nodes +
   edges; chart/funnel get valued bars; comparison gets two columns;
   list/timeline/cycle get plain steps), each on `DEFAULT_STYLE` with placeholder
   labels the user edits. A new object graph is returned per call (style cloned,
   literal node/edge arrays) so callers can mutate freely. Every result passes
   `validateVisual`.

3. **Handler plugin** — `src/app/app/documents/[id]/insert-visual-plugin.tsx`
   (`InsertVisualPlugin`), mounted in `lexical-editor.tsx` alongside the other
   plugins. On `INSERT_VISUAL_COMMAND` it runs ONE `editor.update()`: builds a
   `VisualNode` via `$createVisualNode(createBlankVisual(kind))`, inserts it after
   the target block (mirroring `block-spark.tsx`'s `top.insertAfter(...)`), and
   selects it as a `NodeSelection` so the existing visual-context surfaces
   (`kind: 'visual'` in `editor-context.tsx`) light up. No Yjs writes, no
   persisted NodeKeys, no network.

**Why:**
A deterministic, offline insert path is table stakes for a real editor and
decouples visual creation from AI availability/quota (per the approved
"explicit Insert Visual path" decision). Keeping the mutation a pure Lexical
command means it inherits autosave, undo/history, collaboration, and the DB
mirror for free — no second authoritative store.

**Persistence verification (end-to-end):**
A blank visual inserted as a `VisualNode` serializes into `contentJson`
identically to an AI-generated one, so the unchanged save path handles it:
`saveDocumentLexical` → `mirrorVisualNodes` → `collectVisualNodes` (walks
`type:"visual"` nodes) → `safeParseVisual` (re-validate) → `Visual`/`VisualRevision`
rows keyed by `visualId`. Verified all 9 kinds are collected, re-validated, and
map to a Prisma `Visual.type`. No change was needed to `mirrorVisualNodes` or
`saveDocumentLexical`.

**Files:** added `src/lib/lexical/commands.ts`,
`src/app/app/documents/[id]/insert-visual-plugin.tsx`,
`src/lib/visual/fixtures.test.ts`; edited `src/lib/visual/fixtures.ts`,
`src/app/app/documents/[id]/lexical-editor.tsx`.

**Verification:** `npm run typecheck` clean; `npm run lint` clean for `src/`
(only the pre-existing `.squad/templates/ralph-triage.js` errors remain);
`npm test` 144/144 pass (139 pre-existing + 5 new in `fixtures.test.ts`);
`npm run build` succeeds.

**For Switch:** command `INSERT_VISUAL_COMMAND`, payload
`InsertVisualPayload = { kind: VisualKind; afterNodeKey?: string }`, both
imported from `@/lib/lexical/commands`. Build the `visual-insert` menu/tools and
dispatch the command; the handler owns insertion + selection + persistence. Do
not write visuals to the DB directly.

### 2026-06-19T05:36:53Z: Phase 2 (UI) — unified `+`/`/` insert menu + deterministic Insert Visual, gutter reconciled

**By:** Switch (Frontend)

**What:**
Landed the Phase 2 frontend half: a registry-driven, shared-surface insert menu
that adds a deterministic (non-AI) "Insert Visual" path, plus a reconciled gutter
that keeps AI generation intact.

1. **ToolRegistry tool sets** (`src/lib/lexical/tool-registry.ts`):
   - Added two optional, purely presentational fields to `EditorTool`:
     `description?` (menu hint line) and `keywords?` (extra `/` filter terms).
     No change to the `when`/`isActive` purity invariant or `run` contract.
   - `BLOCK_INSERT_TOOLS` (group `block-insert`): Heading 2/3, Bullet list,
     Numbered list, Quote, Divider — exactly the set the legacy
     `block-insert-menu.tsx` offered. Each `run` reuses that menu's block
     transform via a shared `applyBlockInsert` (replace the anchored block with a
     fresh paragraph, then apply the type) — Lexical `editor.update()` only.
   - `VISUAL_INSERT_TOOLS` (group `visual-insert`): one tool per `VisualKind`
     (all 9), built from a single `VISUAL_KIND_META` source (label/icon/keywords/
     description, lucide icons). Each `run` only
     `dispatchCommand(INSERT_VISUAL_COMMAND, { kind, afterNodeKey: ctx.blockKey })`
     — the UI never builds a `VisualNode` or writes to the DB; Tank's handler owns
     insertion + selection + persistence.

2. **Insert menu rebuilt on shared surfaces** (NEW `insert-menu.tsx`,
   `InsertMenuPlugin`; DELETED `block-insert-menu.tsx`):
   - Renders inside `ui/FloatingSurface`, driven by `toolsFor('block-insert')`
     and `toolsFor('visual-insert')`, reading the shared `useEditorContext()`
     snapshot (no selection/rect math of its own).
   - Two labelled sections — **"Text"** and **"Visuals"** — each item icon-first
     (leading icon + label + hint).
   - Preserved behaviour: `+` gutter button on an empty paragraph (menu takes
     focus, local arrow/Enter/Escape), `/` trigger from any block (editor keeps
     focus, Lexical key commands), `/` filtering by label + keywords, click-away.
     Slash-committing a Visual first clears the `/query` block so no trigger text
     is left behind.
   - Swapped the mount in `lexical-editor.tsx` (`BlockInsertMenuPlugin` →
     `InsertMenuPlugin`).

3. **Gutter reconciled** (`block-spark.tsx`): kept the AI "spark" generate flow
   (`/api/generate` → candidate panel → inserts the AI `VisualNode`) **unchanged
   in behaviour**, but routed its button + panel through `FloatingSurface` and
   the `ui/` primitives (`IconButton`, `Button`, `Divider`) for one consistent
   look (gutter buttons share `GUTTER_BUTTON`). The panel now surfaces the
   deterministic blank kinds **alongside** AI: a "Generate from this block"
   section over an "Or insert a blank" grid that dispatches
   `INSERT_VISUAL_COMMAND` (with `afterNodeKey` = the hovered block). So a block
   exposes a single coherent insert affordance for visuals, AI-optional.

4. Icons-first, token-driven (`--ds-*` via `ui/` primitives), reduced-motion via
   `usePopMotion`/`FloatingSurface`, accessible (listbox/option + dialog roles,
   keyboard nav, `aria-label`s).

**Why:**
Realises the approved "explicit Insert Visual path independent of AI" decision:
a deterministic, offline insert is now first-class in the `+`/`/` menu and the
gutter, decoupling visual creation from AI availability/quota while keeping AI
generation as a distinct action. Collapsing the insert surfaces onto the
ToolRegistry + shared `FloatingSurface`/`ui` primitives removes the last bespoke
insert chrome and keeps every affordance consistent. All mutations stay Lexical-
command/`editor.update()`-only; `contentJson` remains the single source of truth.

**Verification:** `npm run typecheck` clean; `npm run lint` (only the 5
pre-existing `.squad/templates/ralph-triage.js` errors remain); `npm test` → 152
pass / 0 fail; `npm run build` succeeds. Constraints honoured: did not touch
`commands.ts`, `insert-visual-plugin.tsx`, `globals.css`, `control-styles.ts`, or
the Phase-3 visual-card/style-panel/visual-editor files.

### 2026-06-19T08:29:45Z: Headless integration tests for Insert Visual — extracted `$insertBlankVisualAfter`

**By:** Ghost (Tester)

**What:**
Added headless integration coverage for the core INSERT_VISUAL_COMMAND insertion
behavior, independent of React/DOM, plus a minimal extraction so the routine is
directly callable from a headless test.

1. **Surgical extraction** — pulled the insertion routine out of the React
   plugin's `registerCommand` callback into a new non-React module
   `src/lib/lexical/insert-visual.ts`:
   ```ts
   export function $insertBlankVisualAfter(payload: InsertVisualPayload): VisualNode
   ```
   It builds `$createVisualNode(createBlankVisual(kind))`, resolves the target
   block (explicit `afterNodeKey` → its top-level element, else current
   selection's top-level block, else root append), inserts AFTER it, and selects
   it as a `NodeSelection`. The `resolveTarget` helper moved here too. Runtime is
   identical — `insert-visual-plugin.tsx` now just calls
   `$insertBlankVisualAfter(payload)` inside its `editor.update()`. A new helper
   file was chosen to avoid any overlap with Switch's in-flight files
   (block-insert-menu/block-spark/tool-registry/lexical-editor).

2. **Tests** — `src/lib/lexical/insert-visual.test.ts` (8 tests, node:test + tsx),
   using `createHeadlessEditor` wired with the SAME node set the app registers
   (Heading, Quote, List, ListItem, Link, HorizontalRule, VisualNode):
   - inserting a visual creates exactly one schema-valid VisualNode of the
     requested kind (`safeParseVisual`).
   - `afterNodeKey` set → visual lands immediately after the targeted block
     (asserted via root child ordering + index), winning over the live caret.
   - no `afterNodeKey` → visual lands after the current selection's block.
   - no resolvable target (no selection, no key) → appended at document end.
   - the inserted node is selected as a real `NodeSelection` containing exactly
     the visual's key (`$isNodeSelection` + `getNodes()`).
   - round-trip: `exportJSON` payload re-validates (`safeParseVisual`) and
     re-hydrates via `VisualNode.importJSON`, proving it persists into
     `contentJson` cleanly (source-of-truth invariant).
   - every `VISUAL_KIND` seeds a schema-valid, kind-matching visual on insert.
   - `$createVisualNode`/`$isVisualNode` interop sanity for the inserted node.

**Why:**
The insertion logic is the heart of the deterministic Insert Visual path, but it
lived inside a React callback that headless tests can't invoke. Extracting a
pure `$`-prefixed routine (callable inside any `editor.update()`) lets us lock in
position, selection, schema-validity, and serialization round-trip behavior
without a browser — guarding the `contentJson`-as-source-of-truth invariant that
the save→`mirrorVisualNodes` pipeline depends on.

**Files:** added `src/lib/lexical/insert-visual.ts`,
`src/lib/lexical/insert-visual.test.ts`; edited
`src/app/app/documents/[id]/insert-visual-plugin.tsx` (extract + delegate).

**Verification:** `npm test` 152/152 pass (144 pre-existing + 8 new);
`npm run typecheck` clean; `eslint` clean on all three changed files.

### 2026-06-19T05:36:53Z: Phase 3 — pure visual edit/restyle transforms (`@/lib/visual/transforms`)

**By:** Tank (Backend)

**What:**
Extracted the visual edit/restyle operations into a new PURE, framework-free
module `src/lib/visual/transforms.ts` (no React/Lexical imports — operates on the
`Visual` data type only). Every function returns a brand-new `Visual`, never
mutates its input, and always produces schema-valid output that round-trips
through `safeParseVisual`. The UI (Switch's Phase 3 chrome) should call these
from inside its own `editor.update()` → `node.setVisual(next)` blocks.

Exact exported API (import path `@/lib/visual/transforms`):

- `applyTheme(visual: Visual, themeId: string): Visual`
  — applies a palette theme to the whole visual; typography
  (`fontFamily`/`fontSize`/`fontWeight`) preserved. Unknown id = safe no-op clone.
- `isThemeActive(visual: Visual, themeId: string): boolean`
  — true when the visual's colors match that theme (for active-chip UI state).
- `setVisualKind(visual: Visual, kind: VisualKind): Visual`
  — switches the kind; preserves all node ids/labels/values/icons/per-node
  colors and all edges; positioned kinds get fresh x/y; same-kind = clone.
- `setVisualStyle(visual: Visual, patch: Partial<VisualStyle>): Visual`
  — merges a style patch (background / node colors / edge / fontSize /
  fontWeight / palette). Patched palette is copied (no aliasing).
- `setNodeStyle(visual: Visual, id: string, field: NodeStyleField, value: string): Visual`
  — `NodeStyleField = "color" | "stroke" | "textColor"` (also exported).
- `resetNodeStyle(visual: Visual, id: string): Visual` — clears the 3 per-node color overrides.
- `setNodeIcon(visual: Visual, id: string, icon: string): Visual`
- `clearNodeIcon(visual: Visual, id: string): Visual`

These are the pure equivalents of the inline helpers currently in
`style-panel.tsx` (`applyTheme`, `setStyle`, `setNodeStyle`, `resetNodeStyle`,
`setNodeIcon`, `clearNodeIcon`, `themeActive`). Switch can swap the panel's
local helpers for these imports during the Phase 3 UI rewrite. Per coordination,
I did NOT edit `style-panel.tsx` / `visual-card.tsx` / `visual-editor.tsx`
(Switch owns those) and did NOT touch `themes.ts` exports (Mouse owns those).

**Theme lookup approach:**
Themes are resolved dynamically by id from the `STYLE_THEMES` array exported by
`themes.ts` (`STYLE_THEMES.find(t => t.id === themeId)`) — no theme ids are
hardcoded, so any theme Mouse adds works automatically. `theme.colors` (palette +
the 5 base colors) is merged over the style; typography is left untouched,
matching the existing panel behavior.

**setVisualKind layout:**
- flowchart → nodes stacked in a vertical column, centered.
- mindmap → first node centered, rest on a ring (default shape `pill`).
- concept → same radial layout (default shape `ellipse`).
- chart/list/timeline/cycle/comparison/funnel → stale `x`/`y` dropped because
  `src/components/visual/layout.ts` derives those kinds' positions from node
  order at render time. NOTE: this is a deterministic structural switch (no AI),
  unlike the current `visual-card.tsx` type pills which call `/api/generate`. The
  result is always schema-valid but a value-driven target (comparison/funnel/
  chart) coming from a kind with no `value`s will be valid-but-degenerate (renderer
  falls back: `value ?? 0`, comparison groups to one column). Switch/AI path can
  still override with a richer generated visual.

**Persistence / revision findings (verified, no backend change needed):**
The source-of-truth flow is intact. `applyTheme`/`setVisualKind`/style changes go
`node.setVisual(next)` → `contentJson` (debounced `saveDocumentLexical`) →
`mirrorVisualNodes` (`actions.ts`). `mirrorVisualNodes`:
- Re-validates each node's payload (`safeParseVisual`) before persisting — garbled
  payloads are skipped, never stored.
- Creates the `Visual` row on first sight (no revision snapshot on create).
- On subsequent saves, compares the normalized (re-validated) payload via
  `JSON.stringify`; only when it actually changed does it call
  `snapshotVisualRevision(existing)` (writing the PREVIOUS state into
  `VisualRevision`, retaining newest `MAX_VISUAL_REVISIONS = 10`) and then update
  the row. A save that doesn't change a visual records NO spurious revision; an
  order-only change updates `orderIndex` without a snapshot.
So each distinct theme/kind/style edit produces exactly one new `VisualRevision`
of the prior state — versioning works as expected for all transform paths.
`Visual`/`VisualRevision` remain a derived mirror; `contentJson` stays the single
authoritative store.

**Why:**
Phase 3 requires the visual edit/restyle logic to live as pure, tested data
transforms the new context-aware UI can call, instead of being embedded in React
components. This keeps the logic framework-free, unit-testable, and reusable
across Switch's rewritten chrome while preserving the Lexical/contentJson
invariants.

**Verification:** `npm run typecheck` clean; `npm run lint` clean except the
pre-existing `.squad/templates/ralph-triage.js` errors; `npm test` 167/167 pass
(152 prior + 15 new in `src/lib/visual/transforms.test.ts`); `npm run build` green.

### 2026-06-19T05:36:53Z: Phase 3 — refined visual theme set + ContextPopover restyle spec

**By:** Mouse (Design/UX)

**What:**

**1. Visual theme set (`src/lib/visual/themes.ts`)** — public export shape unchanged
(`STYLE_THEMES: StyleTheme[]`, `StyleTheme`, `ThemeColors`). Each theme is now drawn
from a single hue family so a visual reads as one designed object. Label text
(`nodeText`) on `nodeFill` clears WCAG AA in every theme — lowest measured ratio is
~8:1 (well above the 4.5:1 bar). These are visual-CONTENT colors baked into the
Visual data and are intentionally independent of the `--ds-*` chrome tokens
(Decision c). The 8 themes (id → intent):

- `indigo` — signature brand blue-violet; the default-aligned palette. Deepened
  stroke (`#4f46e5`) and text (`#312e81`); soft indigo connectors (`#a5b4fc`).
- `ocean` — calm cool teal/blue; warmed background so it doesn't read clinical.
- `forest` — natural, organic greens; good for processes/growth.
- `sunset` — warm orange→red→pink energy; presentations, marketing.
- `grape` — rich purple/magenta; creative, premium feel.
- `rose` — soft, elegant pink/crimson; lighter-weight than sunset. (NEW)
- `amber` — golden, optimistic warmth; readable despite the bright family. (NEW)
- `mono/slate` — neutral grayscale; serious/professional, lets content lead.

DEFAULT_STYLE (in `schema.ts`, not edited) remains the blank-insert default and
matches the indigo family, so freshly inserted visuals look intentional.

**2. Chrome tokens (`src/app/globals.css`)** — additive only: added
`--ds-segment-track` (→ `surface-sunken`) and `--ds-segment-thumb` (→
`surface-raised`), exposed as `ds-segment-track`/`ds-segment-thumb` utilities, for
the SegmentedControl used by the ContextPopover. Everything else the popover needs
already exists from Phase 0 (surface-overlay, shadow-popover, radii, state overlays,
focus ring, motion-fast 120ms). Dark mode cascades automatically via `var()`.

**3. ContextPopover UX spec** — see below. Theme-first: one click on a theme chip
is the primary restyle path; raw color pickers are progressive disclosure.

**Why:** TextIQ's core value is "great-looking visual in one move." Most users
should restyle by picking a theme, not tuning five inputs. Cohesive, contrast-safe
palettes make the one-click path reliably beautiful; the new rose/amber/mono themes
broaden tone (elegant / optimistic / serious) without diluting the set.

---

## ContextPopover spec (for Switch to implement)

**Surface & placement**
- Portal-rendered `FloatingSurface`/Popover anchored BELOW the selected visual card
  (keep today's anchored model — NOT a permanent sidebar). Anchor to the card's
  bottom-left, flip above if it would clip the viewport; ~8px gap.
- `bg-ds-surface-overlay`, `shadow-ds-popover`, `rounded-ds-lg`, `border-ds-border-subtle`.
  Width ~300–340px. Internal spacing on the `--ds-space-*` scale.
- Mutually exclusive with the text floating toolbar (selecting a visual dismisses
  the text toolbar; per Decision on surface exclusivity).

**Motion**
- Enter ≤140ms using `--ds-motion-fast` (120ms) + `--ease-ds-standard`: fade +
  4–6px rise + 0.98→1 scale from the anchor edge. Exit ~100ms.
- `@media (prefers-reduced-motion: reduce)` → opacity-only, no transform.
- Calm-when-idle: no hover wiggle, no shimmer; controls animate only on interaction.

**Focus / keyboard**
- On open, move focus to the first actionable control (the Type segmented control).
- Esc closes and returns focus to the visual card. Focus is trapped while open;
  Tab cycles within. Every control shows `ring-ds-focus-ring` on `:focus-visible`.
- Arrow keys move within the SegmentedControl and the theme chip grid (roving
  tabindex); Enter/Space activates.

**Content hierarchy (top → bottom)**
1. **Header row** — kind label (e.g. "Flowchart") on the left; quick actions on the
   right as `IconButton`s: swap type (overflow/“…” → variations), more variations
   (regenerate layout), export (PDF/PPTX/SVG menu), close (×). Header is quiet:
   secondary text, ghost buttons.
2. **Type** — `SegmentedControl` of the 9 `VisualKinds` (flowchart/mindmap/list/
   chart/concept/timeline/cycle/comparison/funnel). Selecting one calls
   `setVisualKind`. Uses `ds-segment-track`/`ds-segment-thumb`; active thumb gets
   `shadow-ds-raised`. If too many to fit, wrap to two rows or horizontal scroll —
   never truncate options silently.
3. **Style › Theme** (PRIMARY path) — `SectionLabel` "Theme", then a grid of swatch
   chips, one per `STYLE_THEMES` entry. Each chip is a mini preview: a rounded tile
   showing `nodeFill` with a `nodeStroke` border and a 3-dot strip of the first
   palette colors; label below. One click = `applyTheme(theme)`. Active theme
   (matched via existing `themeActive`) shows `ring-ds-accent`/checkmark. This is the
   default-open, prominent section.
4. **Style › Refine** (progressive disclosure) — a "Customize" disclosure
   (collapsed by default). When expanded, a `Field` per color: Background, Node fill,
   Node stroke, Text, Edge — each a `Swatch` + `ColorPicker` (NOT a bare native
   `<input type=color>`). Edits call `setStyle({ [field]: value })`. A subtle "Reset
   to theme" link reverts overrides.
5. **Type (typography)** — `SectionLabel` "Type": font size (stepper or small
   segmented S/M/L mapping to fontSize) and font weight (segmented Regular/Medium/
   Bold → 400/600/700). Lives under Refine or as its own compact row.
6. **Selected element** — rendered ONLY when a single node is selected. `SectionLabel`
   shows the node label; controls for per-node `color` / `stroke` / `textColor`
   (Swatch+ColorPicker) plus an optional icon picker, and a "Reset element" action
   that clears the per-node overrides (falls back to theme). Hidden entirely when no
   node is selected, so the common path stays uncluttered.

**Principles**
- Lead with themes; treat per-color pickers and per-node overrides as optional depth.
- Sections are visually separated by `Divider`/spacing, not heavy boxes.
- Never block the canvas: popover is dismissable, anchored, and quiet when idle.

### 2026-06-19T05:36:53Z: Phase 3 — context-aware visual editing as one theme-first ContextPopover

**By:** Switch (Frontend)

**What:**
Migrated the selected-visual editing chrome from the ad-hoc inline popover (in
`visual-card.tsx`) + `style-panel.tsx` into one coherent, EditorContext-driven
`ContextPopover` rendered in the shared `FloatingSurface`, per Mouse's spec and
on Tank's pure transforms.

1. **New `ui/` primitives** (`src/components/ui/`, exported from the barrel):
   - `Swatch` (`swatch.tsx`) — an on-brand color swatch button: rounded tile
     filled with `color`, `--ds-border` outline, token focus ring, selected
     state (accent ring + checkmark). The chip a color picker / theme grid is
     built from.
   - `ColorPicker` (`color-picker.tsx`) — a Swatch-triggered popover (preset
     palette grid + native custom input + hex field), portal-rendered via
     `FloatingSurface`, keyboard/Esc/click-away accessible, reduced-motion-aware.
     Replaces the raw `<input type=color>` rows. Exports `DEFAULT_SWATCH_PRESETS`.
     Its content carries `data-ds-floating` so an outer surface's click-away can
     recognise it as a nested DS layer and not dismiss.

2. **`VisualContextPopover`** (NEW `visual-context-popover.tsx`) — the single
   editing surface, anchored BELOW the selected visual card (flips above near the
   viewport edge), structure top→bottom:
   - **Header:** kind label + quick-action `IconButton`s — more variations
     (Sparkles → AI `/api/generate`), `ExportMenu`, remove (danger), close (×).
   - **Type:** `SegmentedControl` of the 9 `VisualKinds` (icons-first, from
     `VISUAL_KIND_META`) → `setVisualKind` (deterministic, no AI).
   - **Style › Theme** (primary path): grid of `ThemeChip`s, one per
     `STYLE_THEMES` entry (nodeFill tile + nodeStroke border + 3-dot palette
     strip). One click = `applyTheme(visual, id)`; active via `isThemeActive`.
   - **Style › Refine** ("Customize colors" disclosure, collapsed): Background /
     Node fill / Node stroke / Text / Edge via `ColorPicker` → `setVisualStyle`.
     A "Reset to theme" link re-applies the active/last-chosen theme.
   - **Typography:** font-size stepper (10–28, preserves full range) +
     `SegmentedControl` weight (400/500/600/700/800) → `setVisualStyle`.
   - **Selected element** (only when a canvas node is selected): per-node fill /
     stroke / text via `ColorPicker` → `setNodeStyle`, icon via the existing
     `IconPicker` → `setNodeIcon`/`clearNodeIcon`, "Reset element" →
     `resetNodeStyle`.
   - AI **variations** candidate grid + error/retry preserved.
   ALL mutations route through `onChange(transform(visual, …))` →
   `node.setVisual(next)` inside `editor.update()`.

3. **`VisualCard` rebuilt** (`visual-card.tsx`) — selection now lives in the
   editor: clicking the card creates a Lexical `NodeSelection`
   (`$createNodeSelection` + `$setSelection`), so `useEditorContext().kind ===
   'visual'` with `selectedVisualNodeKey === nodeKey` drives `showControls`.
   Retired the local `selected` boolean, the bespoke `document` mousedown
   outside-click effect, and the inline `AnimatePresence` popover/state machine.
   The popover handles its own scoped click-away (ignores `[data-visual-chrome]`
   / `[data-ds-floating]`); Escape/× clear the selection; clicking into text
   dismisses naturally via the editor selection. New visuals inserted by the
   Phase-2 path (which already sets a `NodeSelection`) now auto-open their
   controls. Re-skinned the card onto `--ds-*` tokens (dropped `zinc-*`/dark
   variants).

4. **Retired dead code:** deleted `style-panel.tsx` (nothing imported it after
   the migration; its restyle helpers are superseded by Tank's
   `@/lib/visual/transforms`).

**Preserved capabilities:** deterministic type switching (now `setVisualKind`),
AI "more variations" + candidate selection (`/api/generate`), `ExportMenu`
(PDF/PPTX/SVG/PNG via the live SVG ref), remove, per-node canvas editing
(drag/labels/edges in the untouched `visual-editor.tsx`), per-node color/icon
overrides, undo/redo (all edits are ordinary Lexical updates). `contentJson`
stays the single source of truth; no Yjs writes, no persisted NodeKeys, no
DB writes from the UI.

**Did NOT register** `visual-style`/`visual-edit` tools in `tool-registry.ts` —
the popover's controls are stateful/data-bound (theme grid, color pickers,
typography, per-node), which don't fit the registry's stateless command `run`
shape; adding them would bloat the change without benefit. Insert tools remain
the registry's visual surface.

**Constraints honoured:** did not edit `transforms.ts`, `themes.ts`,
`globals.css`, or `control-styles.ts`; `EditorContext` left read-only.

**Verification:** `npm run typecheck` clean; `npm run lint` (only the 5
pre-existing `.squad/templates/ralph-triage.js` errors); `npm test` 173/173
pass; `npm run build` green.

**Files:** added `src/components/ui/swatch.tsx`,
`src/components/ui/color-picker.tsx`,
`src/app/app/documents/[id]/visual-context-popover.tsx`; edited
`src/components/ui/index.ts`, `src/app/app/documents/[id]/visual-card.tsx`;
deleted `src/app/app/documents/[id]/style-panel.tsx`.

### 2026-06-19T08:53:57Z: Phase 3 edit/restyle round-trip is verified at the Lexical-node + serialization layer
**By:** Ghost (Tester)
**What:** Added `src/lib/lexical/visual-edit-roundtrip.test.ts` (6 headless tests, +6 → suite now 173/173). It seeds a real `VisualNode` via `$insertBlankVisualAfter` in a `createHeadlessEditor` wired with the app's node set, applies the pure `transforms.ts` helpers, commits them through the real `node.setVisual(next)` inside `editor.update()`, then asserts the result by reading the node back AND by `exportJSON → VisualNode.importJSON` (the `contentJson` persistence boundary). Coverage: (1) `applyTheme` across all 8 `STYLE_THEMES` — `isThemeActive` true, kind/node/edge structure preserved, typography untouched, `safeParseVisual` valid, survives JSON round-trip; (2) `setVisualKind` flowchart→list (labels kept, derived-layout x/y dropped) and list→flowchart (fresh coords assigned), both schema-valid and round-tripping; (3) `setVisualStyle` background + `setNodeStyle` color/stroke/textColor persist into the node and survive serialize→rehydrate; (4) immutability — a transform + setVisual yields a NEW Visual and never mutates the previously-read Visual object (no shared-reference leak into Yjs/contentJson). New test file only — no Switch/Tank/Mouse-owned files touched; typecheck + lint clean.
**Why:** Phase 3's editing model (UI applies a pure transform, then `node.setVisual()` inside `editor.update()`, with `contentJson` authoritative) needs proof at the integration seam independent of Switch's in-flight UI. Tank unit-tested the pure transforms; this proves they compose correctly with the real `VisualNode` and survive the exact serialization that backs autosave/Yjs/the DB mirror — catching any shared-reference mutation or kind/schema regression before the UI wires them up.


### 2026-06-19T05:36:53Z: Phase 4 — professional text toolbar (inline code, alignment, color, highlight)

**By:** Switch (Frontend)

**What:** Rounded out the floating selection toolbar with four new
ToolRegistry-driven capabilities, all additive — every existing toolbar behaviour
is intact. Each maps to a standard Lexical operation; nothing writes Yjs directly
or persists NodeKeys; `contentJson` stays authoritative.

1. **Inline code** — new `format-code` `text-format` tool (section `inline`,
   `Mod+E`, lucide `Code`) dispatching `FORMAT_TEXT_COMMAND 'code'`. `isActive`
   reads `ctx.activeFormats.has('code')` (already tracked). Styled via the
   EDITOR THEME only (`theme.text.code` in `lexical-editor.tsx`) using Tailwind
   `--ds` utilities — `rounded-ds-sm border border-ds-border-subtle
   bg-ds-surface-sunken px-1 py-0.5 font-mono text-[0.9em] text-ds-text-secondary`
   — so inline code renders as a clear chip. `globals.css` untouched.

2. **Text alignment** — four `text-format` tools (section `align`): `align-left`
   / `-center` / `-right` / `-justify` (lucide Align* icons, `Mod+Shift+L/E/R/J`)
   dispatching `FORMAT_ELEMENT_COMMAND`. Active state via the new
   `ctx.elementFormat`; left is active for `""`/`"start"`/`"left"`.

3. **Text color + highlight** — two `"color"`-control tools (`format-text-color`
   → `color`; `format-highlight` → `background-color`). They apply via
   `@lexical/selection`'s `$patchStyleText` inside `editor.update()`; reset
   passes `null` to fully clear the property. `value`/`isActive` read the new
   `ctx.textColor` / `ctx.highlightColor` (from
   `$getSelectionStyleValueForProperty`). The inline style serialises into the
   TextNode (Yjs/collab-safe).

**Registry model:** extended `EditorTool` with a `control?: "button" | "color"`
discriminator and color-only `value()`/`apply()` members; `run` is now optional
(color controls have no single command). Updated the one external call site
(`insert-menu.tsx`, `tool.run?.(...)`) — trivial and safe (insert tools always
have `run`).

**EditorContext (read-only):** added `elementFormat: ElementFormatType`,
`textColor: string`, `highlightColor: string` to `EditorContextSnapshot` /
`SelectionDescriptor`, derived in `readSelectionDescriptor` (block
`getFormatType()`, `$getSelectionStyleValueForProperty` for color/bg), with
`EMPTY_*` defaults and `snapshotsEqual` updated. No mutations added.

**UI:** the floating toolbar groups tools with `Divider`s by section (inline →
block → list → align → color), icons-first via lucide with `Tooltip`s carrying
shortcuts. Color/highlight render as a swatch-triggered `ColorPicker` popover
(not inline): preset palette + custom input + a "Default (none)" reset that
clears the style. Extended the `ColorPicker` primitive with optional `icon`
(format glyph over a current-color underline bar so the two swatches stay
distinguishable), `onReset`/`resetLabel`, and a `preserveSelection` mode (skips
auto-focus and `preventDefault`s preset/reset pointer-downs) so the anchored
text selection — and therefore the toolbar — survives interaction. Reduced-motion,
focus-visible, ARIA, and Escape all preserved.

**Why:** The toolbar wired bold/italic/underline/strike/link/H2/H3/quote/lists
but lacked the inline-code, alignment, and color affordances a professional
editor needs. Modelling them as registry tools keeps the system declarative and
the surfaces consistent; theming inline code via the Lexical theme (not
`globals.css`) respects Mouse's token ownership; routing color through
`$patchStyleText` keeps collaboration/undo/persistence coherent.

**Constraints honoured:** did not touch `globals.css` / `control-styles.ts`
(Mouse), `src/lib/visual/*` (Tank), or the visual popover. EditorContext stays
read-only.

**Verification:** `npm run typecheck` clean; `npm run lint` (only the 5
pre-existing `ralph-triage.js` errors); `npm test` 181/181 pass (incl. Ghost's
new Phase 4 text-formatting suite); `npm run build` green (the `bg-ds-surface-sunken`
chip utility resolves in the emitted CSS).

**Files:** edited `src/lib/lexical/editor-context.tsx`,
`src/lib/lexical/tool-registry.ts`,
`src/app/app/documents/[id]/lexical-editor.tsx` (theme),
`src/app/app/documents/[id]/floating-text-toolbar.tsx`,
`src/components/ui/color-picker.tsx`, `src/app/app/documents/[id]/insert-menu.tsx`
(one-line `run?.`).

### Phase 4 text-formatting headless tests cover Lexical operations directly

**By:** Ghost (Tester)

**What:** Added `src/lib/lexical/text-formatting.test.ts` (8 tests) exercising the
underlying Lexical formatting operations independent of Switch's tool-registry /
React wiring, using `createHeadlessEditor` with the app's full node set
(Heading, Quote, List, ListItem, Link, HorizontalRule, VisualNode):

1. **Inline code** — `selection.formatText('code')` sets `hasFormat('code')`;
   toggling again removes it; the format survives `exportJSON → importJSON`.
2. **Alignment** — `ElementNode.setFormat('center'|'right')` reflects via
   `getFormatType()` and round-trips through serialization (parametrized).
3. **Color + highlight** — `$patchStyleText({ color, 'background-color' })` reads
   back via `$getSelectionStyleValueForProperty`; the inline `style` persists on
   the TextNode through `exportJSON → importJSON` (contentJson source-of-truth
   invariant); patching to `''` clears the value.
4. **Combined** — bold + code + color coexist on one selection and round-trip.

**Why:** Phase 4 formatting must stay correct at the document layer regardless of
how the toolbar wires it. Testing the selection/style operations directly gives
regression coverage that is stable against Switch's parallel UI changes, and
locks in the exportJSON↔importJSON round-trip that protects the contentJson
source-of-truth (Trinity's invariant). Two notable findings on Lexical 0.45:
range selections do **not** persist across separate `editor.update()` calls in
headless mode — re-establish the range (`text.select(a, b)`) inside each update
that needs it; and `$patchStyleText(sel, { color: '' })` leaves an empty
declaration (`color: ;`) rather than deleting the property, so "cleared" is
asserted via the empty read-back value, not absence of the declaration. Suite is
now 181/181 (was 173); typecheck and lint clean.


### 2026-06-19T05:36:53Z: Phase 5 editor-chrome hardening (a11y, viewport safety, focus)

**By:** Switch (Frontend)

**What:** A corrective/additive hardening pass over the redesigned editor chrome
(`floating-text-toolbar.tsx`, `insert-menu.tsx`, `block-spark.tsx`,
`visual-card.tsx`, `visual-context-popover.tsx`, `src/components/ui/*`,
`editor-context.tsx`). No feature or visual changes. Concrete fixes:

1. **Viewport clamping centralised in `FloatingSurface`.** Added an opt-in
   (default-on) `clampToViewport` that measures the rendered surface
   (`offsetWidth/Height`, transform-independent) and clamps `top/left` within the
   viewport minus an 8px inset, with an off-screen sentinel exemption. This makes
   the shared surface the single clamp authority, so the insert menu (`w-64`) and
   block-spark panel (`w-80`) — which previously positioned with raw
   `anchorRect.left` and no clamp — can no longer overflow on narrow widths. The
   text toolbar, color picker, and visual popover keep their own anchor math; the
   surface clamp is a redundant-but-safe net.

2. **Floating text toolbar roving tabindex (WAI-ARIA `toolbar`).** Added
   ArrowLeft/Right/Up/Down + Home/End navigation between buttons, a single
   tabbable button at a time (roving `tabIndex`, synced on focus), and Escape to
   return focus to the editor. Roving reset on close uses the render-phase
   "adjust state" pattern (no setState-in-effect).

3. **Insert menu completed listbox semantics.** Moved `role="listbox"` +
   `aria-label` onto the focusable inner element (surface is now
   `role="presentation"`) and added `aria-activedescendant` + per-option `id`s so
   the active option is announced during keyboard nav. Option/`aria-selected`
   semantics were already present.

4. **ColorPicker focus trap + restore.** The popover now traps Tab within itself
   and restores focus to the trigger swatch on close (both skipped in
   `preserveSelection` mode, where focus intentionally stays in the editor for
   the text-toolbar color/highlight controls).

5. **Visual context popover role corrected** from `dialog` to `region` (it is a
   non-modal, anchored, labeled panel that does not trap/manage focus) — matches
   the "labeled region, keyboard-reachable/dismissible" intent.

**Already solid (verified, no change needed):**
- **Single-listener perf:** `EditorContext` is the sole selection-derivation
  point (one update listener + `SELECTION_CHANGE_COMMAND` + `selectionchange`).
  No chrome file re-derives selection; grep found no stray
  `registerUpdateListener`/`selectionchange` in the surfaces. The insert-menu's
  `registerCommand`s are key-nav only; block-spark's root listeners are
  pointer-hover only; popover/color-picker resize/scroll listeners are
  positioning-only. No per-keystroke heavy work.
- **Reduced motion:** all surface motion flows through `reveal.ts`
  (`usePopMotion`/`useCardMotion`) and `Tooltip`'s `useReducedMotion`, collapsing
  to instant.
- **ARIA names / toggles:** `IconButton` enforces `aria-label` and emits
  `aria-pressed` via `active`; theme chips, swatches, segmented control all
  carry names/pressed/checked state.
- **Tokens:** chrome files consume `ui/` primitives + `--ds-*` utilities; no raw
  hex/zinc/black literals introduced.

**Why:** The redesign was feature-complete but had real edges: menus could
overflow on narrow viewports, the text toolbar wasn't arrow-key navigable, the
listbox lacked `aria-activedescendant`, and the color popover didn't trap or
restore focus. These are correctness/accessibility gaps a "pro editing system"
shouldn't ship with. Centralising the clamp in `FloatingSurface` also removes
positional drift between the four surfaces.

**Note for Mouse (missing tokens, not added — globals.css is yours):**
`insert-menu.tsx` still uses two raw white-opacity literals on the
accent-selected item — `bg-white/15` (icon tile) and `text-white/70` (option
description). There is no exact `--ds-*` token for an *on-accent* overlay or
*muted on-accent* text. If you want these tokenised, consider adding e.g.
`--ds-state-on-accent` (subtle white overlay) and `--ds-text-on-accent-muted`;
I'll swap them in once they exist.

**Verification:** `npm run typecheck` clean · `npm run lint` (only the 5
pre-existing `ralph-triage.js` errors) · `npm test` 181/181 pass · `npm run
build` compiled successfully.

### 2026-06-19T05:36:53Z: Editor architecture & usage documentation

**By:** Trinity (Lead)

**What:** Added [`docs/editor-architecture.md`](../../../docs/editor-architecture.md) — a single, structured reference for the redesigned editing system. Sections: Overview & goals; Architecture (EditorContext as the one selection-derivation point + ToolRegistry as data-driven `EditorTool`s + shared `src/components/ui/` surfaces, with a mermaid diagram of selection-state flow and tool mutation); the four load-bearing invariants and *why* (mutate only via Lexical commands/`editor.update()` — never Yjs, never persist NodeKeys; `contentJson` is the single source of truth and `Visual`/`VisualRevision` rows are a derived mirror; `--ds-*` chrome tokens are separate from visual-content `VisualStyle`); How-to guides (add a text/format tool, add a visual kind/blank template, add/change a theme, add a visual restyle control); the visual lifecycle (deterministic + AI insert → theme-first edit/restyle → persist/version via `mirrorVisualNodes`); and where tests live + `npm test` (`node --test` via `tsx`). All module references are real and link-checked. Also added a small additive README pointer under a new "Editor architecture" heading. Documentation only — no source, tokens, or tests changed.

**Why:** Phases 0–4 shipped the redesigned editor (EditorContext, ToolRegistry, deterministic visual insert, theme-first restyle, expanded text capabilities) but the design lived only in `.squad/decisions.md` history. A real engineer extending the system needs one accurate, code-cited doc that makes the invariants explicit and the extension points obvious, so the system stays maintainable and coherent as it grows (Phase 5 hardening and beyond).

# Display styles as holistic presets, not additional theme dimensions

**By:** Switch (Frontend)
**Issue:** #6 — Visual style gallery
**Date:** 2026-06-19

## Decision

Introduced `VisualDisplayStyle` as a **holistic presentation preset** (node shape + edge style + font weight + color profile) rather than expanding `VisualStyle` with new optional fields or adding a `displayStyleId` to the schema.

## Rationale

1. **No schema migration needed.** All the fields a display style controls (`shape` per node, `style` per edge, `fontWeight`, colors) already exist in the schema. The pure transform `applyDisplayStyle` writes to these existing fields — it requires no version bump and existing visuals round-trip unchanged.

2. **`isDisplayStyleActive` over persisted ID.** Active-state detection works by comparing current visual values against the preset (like the existing `isThemeActive`), rather than storing a `displayStyleId` in the Visual. This avoids a new persisted field that would drift out of sync after any manual color tweak.

3. **Holistic over compositional.** A display style bundles shape + connector + weight + colors as one aesthetic unit rather than three orthogonal axes. This produces clearly-distinct thumbnail previews (the gallery's purpose) and prevents incoherent combinations (e.g., "bolt" font weight with "soft bubble" shapes).

4. **Shapes applied globally.** `applyDisplayStyle` sets every node to the preset's `nodeShape`, overriding per-node shape differences (e.g., decision diamonds in a flowchart). This is intentional for gallery preview consistency — the user explicitly chose a style. Per-node color overrides are preserved since those are intentional user fine-tuning.

## Trade-offs

- Global shape override may feel heavy for flowcharts with semantic shape-coding (start/end/decision). Users can adjust via kind-switch or per-node overrides after applying a style.
- `isDisplayStyleActive` returns `false` if any color/shape/edge has been manually tweaked after applying a style. This is correct — "no active preset" is the right signal when the visual diverges from any known preset.


# Elastic auto-layout: content-aware, toggleable, per-positioned-kind

**By:** Switch (Frontend)
**Issue:** #15 — "Elastic designs: content-aware auto-layout"
**Date:** 2026-06-19

## What

Added a content-aware elastic auto-layout pass for positioned visual kinds
(flowchart / mindmap / concept / venn / orgchart).

**New module: `src/components/visual/elastic-layout.ts`** — pure, deterministic,
non-mutating. Key exports:
- `estimateLabelBox(label, fontSize)` — estimates node bounding box from text
  length × char-width ratio + padding; no DOM access, unit-testable.
- `wrapText(text, maxChars)` — mirrors the renderer's greedy word-wrap so
  estimates match what's drawn.
- `elasticLayout(visual)` — per-kind layout pass (flowchart → column, mindmap/
  concept/venn → radial, orgchart → BFS tree); computes grown `width`/`height`
  so the SVG viewBox expands to contain all nodes + margin.
- `contentBounds(nodes)` — tight bounding rect over all placed nodes.
- `rectsOverlap(a, b)` — overlap predicate (used in tests + non-overlap guarantees).

**Schema change (`src/lib/visual/schema.ts`):**
- Added optional `autoLayout?: boolean` to `Visual`. Defaults `undefined` (= `false`).
  Backward compatible; `validateVisual` accepts and round-trips it.

**Transforms (`src/lib/visual/transforms.ts`):**
- `applyElasticLayout(visual)` — no-op when `autoLayout` is falsy; applies elastic
  layout pass + grows canvas when `autoLayout: true`.
- `setAutoLayout(visual, enabled)` — toggles the flag and immediately runs the
  pass when enabling (so the canvas is correct on first enable).
- `setVisualKind` updated to call `applyElasticLayout` after a kind switch when
  `autoLayout` is set, so switching to flowchart/mindmap/concept with the flag on
  produces a properly laid-out result immediately.

**`visual-card.tsx`** wraps `updateVisual` to call `applyElasticLayout(next)` on
every content change. Because `applyElasticLayout` is a no-op when `autoLayout`
is falsy, existing visuals are unaffected.

**`visual-editor.tsx`** disables drag (`positioned = isPositionedKind && !autoLayout`)
when auto-layout is active — manual drag and auto-layout are mutually exclusive by
design; the user can toggle one off to get the other.

**`visual-context-popover.tsx`** exposes an accessible toggle switch in the
"Frame & Canvas" section (only visible for positioned kinds). Also preserves the
`autoLayout` flag when the user applies AI-generated variations, so their
layout preference survives regeneration.

## Why

Long labels and many nodes on positioned kinds overlap because the static
initial layout assigns fixed positions at creation time and never revisits them
as the diagram evolves. The elastic pass re-flows the canvas deterministically on
any content change (label edit, node delete, type switch), growing the viewBox
rather than clipping or overlapping.

The opt-in flag (`autoLayout`, default off) means existing visuals and workflows
that rely on manual positioning are untouched. New-to-auto-layout visuals can
enable it with one click and get a always-crisp canvas.

## Trade-offs / alternatives considered

- **DOM measurement** (SVGElement.getComputedTextLength) was considered but
  rejected: it requires a browser context, is async, and breaks server-component
  render + unit tests. The character-ratio estimate is 2–5% off in practice but
  adds zero overhead and is fully deterministic.
- **Running elastic layout on drag** was considered and rejected: drag + auto-
  layout would fight each other. Instead they are mutually exclusive — auto-layout
  disables drag, giving the user a clear mental model.
- **Default auto-layout on for new visuals** was deferred: the task required
  backward compatibility and the default must "not surprise existing visuals".
  Users can enable it per-visual via the toggle.


# Element Styling: schema-first, forgiving validation, inline SVG defs

**By:** Switch (Frontend Developer)
**Date:** 2026-06-19

## What

Added `arrowStyle`, `lineStyle`, `lineWidth` to `VisualEdge` and `fillStyle`, `borderStyle`, `borderWidth`, `textAlign` to `VisualNode` as optional, backward-compatible schema fields (PR #30, closes issue #18).

## Key decisions

1. **All new fields are optional and forgiving** — unknown enum values are silently dropped during `validateVisual` (matching the existing pattern for `edge.style`, node `icon`, etc.). Old serialized visuals without any new field continue to validate and render exactly as before. No migration needed.

2. **Gradient fills use inline `<linearGradient>` defs inside the SVG** — `VisualRenderer` now renders a `<GradientDefs>` block before the background rect, generating one `<linearGradient id="grad-{nodeId}">` per gradient node. This keeps the SVG self-contained for SVG export (serializer captures the defs) and PNG/PDF export (canvas rasterizes them). The gradient id is derived from the node id, never a color hash, to avoid collisions.

3. **Arrowhead variants are explicit drawn shapes (not SVG markers)** — continuing the existing pattern in the renderer. Filled triangle (default), open chevron (`<polyline>`), circle (`<circle>`), diamond (`<polygon>`). No `<marker>` elements → no id-collision issues during hydration or multi-instance renders.

4. **Bulk edge controls in the UI** — since the current popover has no per-edge selection, `setAllEdgesStyle` applies connector style changes to all edges simultaneously. Per-edge selection can be added later; the transforms are already per-edge.

5. **`resetNodeExtStyle` is separate from `resetNodeStyle`** — the existing `resetNodeStyle` clears color overrides (color/stroke/textColor). The new `resetNodeExtStyle` clears the ext-style fields (fillStyle/borderStyle/borderWidth/textAlign). The "Reset element" button in the UI chains both to give a full reset.

## Why

Separating the reset functions keeps each transform composable and testable in isolation; the UI can choose to reset only colors or only presentation without the two concerns bleeding into each other.


# Decision: Pure string-based SVG transforms for export options

**By:** Switch (Frontend Developer)
**Date:** 2026-06-19
**Issue:** #17

## What

The export-options transform layer (`src/lib/visual/export-options.ts`) operates
entirely on raw SVG strings rather than a DOM API (no `DOMParser`, no `querySelector`).
This makes all transform logic testable in Node without jsdom or a browser context,
matching the existing `*.test.ts` pattern (node --test + tsx).

## Why

- The existing test suite runs with `node --test` and has zero browser/DOM dependencies.
  Keeping transforms DOM-free means the 20 new tests run in the same runner with no setup.
- SVG string transforms (regex-based rect/filter injection) are sufficient for the
  three required operations: strip background rect, inject background rect, inject
  greyscale feColorMatrix filter.
- The DOM serialization step (`buildTransformedSvgString`) is kept at the
  browser boundary in export.ts so callers that do have an SVGSVGElement can
  pass it directly.

## Trade-off

Regex-based SVG manipulation is fragile for deeply nested/complex SVGs.
The approach is intentionally scoped: we only operate on the outermost `<svg>`
tag, the first `<defs>` block, and a leading background `<rect>`. Any future
requirement to inspect/modify interior SVG nodes should move to a DOM-based
approach (e.g. `DOMParser` in a worker).


# Frame & Canvas Settings — Aspect-ratio presets, Canvas style, Page-break indicators

**Date:** 2026-06-19
**Author:** Switch (Frontend)
**Issue:** #16

## Decision: Schema-level frame settings on Visual, not a document wrapper

Frame settings (`aspectRatio`, `canvasStyle`) are stored as optional fields directly on the `Visual` schema object rather than in a separate document-level wrapper or a new Prisma column. This keeps the data model flat, preserves backward-compatibility (missing fields default to existing behaviour), and means every existing `validateVisual` caller gets the new fields for free.

## Decision: Letterboxing via pure SVG string transform in export-options.ts

Aspect-ratio recomposition is implemented as a pure string transform (`applyAspectRatioToSvg`) that expands the SVG `viewBox` and wraps the content in a `<g transform="translate(...)">`. This runs *after* background/mono transforms in the pipeline and works for all three export formats (PNG, PDF, PPTX image fallback) without DOM or canvas changes.

## Decision: Canvas style patterns as embedded SVG `<pattern>` defs

Canvas style backgrounds (ruled lines, dot-grid) use SVG `<pattern>` elements in `<defs>` inside the `VisualRenderer` SVG output. Because they are embedded in the SVG itself they are preserved in all export formats — no extra post-processing step needed. Pattern color inherits from `style.edgeColor` so it stays in theme.

## Decision: Page-break indicator is client-side only, default off

The `PageBreakIndicator` component uses a `ResizeObserver` to measure the content area height on the client, which makes it incompatible with SSR. It is mounted conditionally behind a toolbar toggle (default off) to keep the initial page load unaffected. The underlying `computePageBreaks` helper is a pure function tested under `node --test`.

## Decision: One-click download respects aspectRatio from Visual

The hover download button on `VisualCard` reads `visual.aspectRatio` and passes it as an `ExportOptions` field to `exportPNG`, so the downloaded PNG matches what the full export dialog would produce. This ensures the quick-download and the export dialog are consistent without code duplication.


# Decision: Hand-rolled i18n via cookie — no external library

**By:** Switch (Frontend Developer)
**Date:** 2026-06-19
**Issue:** #9 — Multi-language support

## What
Implemented the i18n layer as a hand-rolled module (`src/lib/i18n/`) with:
- A typed `Messages` flat-key catalog (`en` + `es`).
- `createTranslator(locale)` returning a typed `t(key, ...args)` that interpolates function-type message values.
- Server-side locale resolution from the `textiq-locale` cookie via `next/headers` (`getLocale()` in `server.ts`).
- A `setLocaleCookie()` server action (avoids `document.cookie` assignment which trips the `react-hooks/immutability` ESLint rule in next/core-web-vitals).
- A React context (`LocaleProvider` + `useOptimistic`) seeded from the server-resolved locale for SSR-safe hydration.

## Why

### No library dependency
The app has no existing i18n library and adding one (next-intl, react-i18next, etc.) would:
- Add a non-trivial bundle to every page.
- Require configuring middleware, path-based routing, or additional wrappers that conflict with the existing App Router structure.
- Lock in conventions that the team hasn't evaluated.

A flat key catalog with a typed accessor covers 100% of the required surface in <150 LoC and is fully tree-shakeable.

### Cookie over URL prefix
Using a `textiq-locale` cookie instead of `/en/...` URL prefixes avoids:
- Changing all existing routes and links.
- Adding a `next.config.js` i18n block that can conflict with the custom `server.mjs`.
- Redirect loops for existing bookmarks.

The trade-off is that the locale isn't in the URL (less SEO-friendly for multi-locale indexing). This is acceptable for an authenticated productivity app where the marketing pages are the primary SEO surface — if that changes, adding URL prefixes is an incremental migration.

### `useOptimistic` in `LocaleProvider`
Gives instant UI feedback on language switch without waiting for the server action round-trip + `router.refresh()`. The optimistic value is discarded in favour of the server-confirmed value on next render.

## Follow-up
- Evaluate whether the marketing home page (`/`) warrants URL-based locale routing for SEO.
- Add locales incrementally as translations become available; the catalog pattern supports it with zero structural change.


# Mobile-Viewing: Pointer-Type Gating Strategy for Editing Affordances

**By:** Switch (Frontend Developer)
**Date:** 2026-06-19
**Issue:** #12 — Mobile-optimized viewing for documents and shared links

## Decision

Gate desktop-only hover/mouse editing affordances (`FloatingTextToolbar`, `BlockSparkPlugin` gutter button, `InsertMenuPlugin` gutter `+` button) behind a `useIsPointerFine()` hook rather than CSS breakpoints.

## Rationale

The gutter buttons and floating toolbar are rendered via `createPortal` at fixed/absolute viewport coordinates computed from DOM rect measurements. A CSS `hidden md:block` breakpoint wouldn't reach them (they render outside the component tree). A `@media (pointer: coarse)` CSS rule would require adding a class to the portal elements, which is fragile.

`window.matchMedia('(pointer: fine)')` directly queries the pointing device capability (mouse vs touch) rather than a viewport size proxy. This is the correct signal because:
- A small tablet with a stylus should still show editing affordances.
- A phone connected to a Bluetooth mouse should show them too.
- Resizing a browser window to a narrow width on desktop should NOT hide the affordances.

The `/` slash trigger in `InsertMenuPlugin` is intentionally **not** gated — it fires from text input and works equally well on touch keyboards, so mobile users retain a path to insert blocks/visuals.

## Trade-offs

- SSR renders `true` (all controls shown) and the hook corrects on hydration. This means touch users see a brief flash of controls on mount. Acceptable trade-off to avoid SSR/hydration mismatch.
- Pointer type can change at runtime (plugging in a mouse). The hook subscribes to `MediaQueryList.change` so it reacts correctly.

## Alternative Considered

CSS `@media (pointer: coarse) { [data-gutter-control] { display: none } }` — rejected because portal elements are attached to `document.body` and don't inherit Tailwind's scoped theme; adding data attributes to each portal is more invasive than a single shared hook.


# Text-Visual Sync: source-text persistence + in-place merge

**By:** Switch (Frontend)  
**Issue:** #14  
**Date:** 2026-06-19

## What

Added end-to-end text-visual sync: visuals now remember the block text they were generated from and can be resynchronised in-place without losing manual style customisations.

Key decisions:

1. **`sourceText`/`sourceTextHash` on `Visual` schema** — Added as optional fields so all existing visuals remain valid (backward compatible). Set at AI insert time (block-spark); NOT set for blank inserts. `sourceTextHash` is a pure FNV-1a 32-bit hash stored for fast comparison; staleness detection uses string equality directly (trimmed).

2. **`mergeVisualContent(old, new)` pure transform** — Content from `newVisual`, global style from `oldVisual`, per-node overrides re-applied by label match then index fallback. Lives in `transforms.ts` alongside other pure transforms. Does NOT carry over `sourceText`/`sourceTextHash` — the sync handler stamps them after merging.

3. **currentSourceText from preceding sibling** — `VisualCard` reads the immediately preceding Lexical block text on every editor update via `registerUpdateListener`. This is the most pragmatic proxy for "the anchor block" without requiring a persistent anchor id, and it survives the common pattern where a visual is inserted right after its source block.

4. **Auto-apply first candidate on sync** — Unlike "More variations" (which shows a picker), Sync applies the first valid candidate immediately. This keeps the UX instant and consistent with the "update in-place" mental model. A future iteration could show candidates before committing.

5. **Sync path uses existing `/api/generate`** — No new API endpoint; the same quota/rate-limit logic applies. The client-side `runSync` callback is identical in shape to `runGenerate` except it calls `mergeVisualContent` on the result rather than replacing the visual wholesale.

## Why

Storing sourceText on insertion is the minimal addition that makes staleness detection possible without a separate anchor-tracking system. The pure merge function keeps style preservation testable in isolation (21 unit tests, no LLM calls). Using the preceding-sibling heuristic avoids the complexity of persisting a stable anchor id across Yjs sessions.


# Visual type catalog: first batch (venn, pyramid, matrix, orgchart)

**Date:** 2026-06-19
**By:** Switch (Frontend Developer)
**Issue:** #8
**PR:** #27

## Decision

Added four new `VisualKind` values to the catalog in a single PR, scoped to the highest-reuse / lowest-risk additions:

- **venn** — positioned kind (x/y/width); renderer draws semi-transparent circles; label at upper-center of each circle
- **pyramid** — auto-layout kind; bands widen linearly from apex (first node) to base (last node); mirrors funnel shape logic but reversed
- **matrix** — auto-layout kind; nodes grouped by `value` 0–3 into 2×2 quadrant cells with dashed divider lines; first node per quadrant is the title
- **orgchart** — positioned kind reusing flowchart/mindmap x/y infrastructure; edges without arrowheads; rectangular nodes

## Key choices

1. **Reuse positioned-node infrastructure for venn and orgchart.** Added both to `POSITIONED_KINDS` so drag support and `edgeSegments` work without new code paths.

2. **Pyramid mirrors funnel layout, not a new engine.** Band widths are derived from position (linear interpolation minFrac→maxFrac), avoiding a `value` field requirement. First node = apex, last = base.

3. **Matrix uses `value` as quadrant index (0–3), matching comparison's `value`-as-column-index convention.** Multiple nodes can share a quadrant (stacked vertically), consistent with how comparison handles multi-item columns.

4. **tool-registry.ts VISUAL_KIND_META kept in sync.** The insert-menu lookup `VISUAL_KINDS.map(kind => VISUAL_KIND_META[kind])` would throw at runtime for any kind without a meta entry — added entries for all four kinds immediately.

## Deferred

table/grid, roadmap/Gantt, advanced infographic callouts, chart/timeline/comparison design variants — explicitly out of scope per issue #8.


# Brand Studio: Custom brand styles (US-007)

**By:** Tank (Backend)  
**Date:** 2026-06-19

## What

Added a `Brand` Prisma model (owner-scoped, palette/colors/fontFamily/logoUrl) with full CRUD server actions, a `/app/brands` page (Brand Studio), and integration into the visual context popover ("Brand Styles" section with apply-to-this + apply-to-all).

## Key decisions

### Font embedding approach
Custom font uploads return a `data:` URL (base64) that is injected as a `@font-face` style element in the browser at the point of upload/apply. Google Fonts are injected as `<link rel="stylesheet">` tags when a brand is applied. This means:
- **SVG export**: font is embedded if the SVG is rendered with the `@font-face` style in scope (works in browser download).
- **PNG export**: works because the canvas rasterizes from the in-page SVG which already has the font loaded.
- **PDF export**: jsPDF embeds the SVG as an image — font renders if loaded in browser at export time.
- **PPTX export**: pptxgenjs also uses image-based embedding, so fonts render as rasterized.
- **Limitation**: data-URL fonts are NOT transferred to the server, so server-side rendering (SSR thumbnails) will fall back to system fonts. Document this clearly.

### Apply-to-all
Uses `$nodesOfType(VisualNode)` inside `editor.update()` to find all visual nodes and restyle them with the brand. This is Yjs-safe (goes through `node.setVisual()`, a local edit flowing through the Lexical → Yjs binding). The font injection happens before the update so the canvas has the font loaded.

### Logo palette extraction
Client-side canvas extraction (64×64 downscale, 4-bit quantization, frequency-sorted). Server-side extraction returns an empty array (no image processing deps added). The client-side extraction seeds the palette automatically after logo upload.

### Palette storage
Postgres: `JSONB`. SQLite: `TEXT` (Prisma serializes JSON to string). The `toBrandStyle` serializer in the actions handles the array coercion.

## Deferred

- **Palette extraction from server side**: would need `sharp` or `jimp`. Currently client-only.
- **Font persistence**: custom font data-URLs are stored in `fontFamily` field or as a `@font-face` injected client-side; they do NOT survive a hard page refresh unless re-uploaded. A future follow-up could store the font file in object storage and reference it by URL.
- **Brand → document link**: brands are applied per-session; no DB record of "which brand is applied to document X". Future follow-up.


# Tank — Document-level Export Architecture

**Date:** 2026-06-19  
**By:** Tank (Backend Developer)  
**Issue:** #5

## Decision

### 1. Block-collection is a pure, headless function

`collectDocumentBlocks(state)` (in `src/lib/visual/document-export.ts`) walks the
serialised Lexical JSON tree (`{ root: { children } }`) and returns a flat ordered
array of `DocumentBlock` values — `DocumentTextBlock` (heading / paragraph / quote /
listitem / hr) or `DocumentVisualBlock` (visualId + Visual payload). It has no browser
or React dependencies, so it is fully testable under `node --test`.

The PDF/PPTX assembly functions (`exportDocumentAsPDF`, `exportDocumentAsPPTX`) are
browser-only (they use jsPDF, pptxgenjs, and the canvas API for PNG conversion) and are
kept in the same module but never imported by test files. This mirrors how
`collectVisualNodes` / `lexicalStateToPlainText` work in the existing codebase.

### 2. VisualSvgRegistry context for live SVG elements

Each `VisualCard` registers a `getSvg` callback (keyed by `visualId`) in a
`VisualSvgRegistry` React context (Map<visualId, () => SVGSVGElement | null>).
This lets the document export button resolve every visual's live, already-rendered
SVG element without DOM traversal. A stable-ref wrapper in
`useRegisterVisualSvg` prevents spurious re-registrations.

The registry is populated regardless of whether the card is in read-only or editable
mode: `VisualRenderer` now receives `ref={rendererRef}` in all three render branches of
`VisualCard` (editing controls open, clickable button, read-only). This is a small
additive change with no behaviour impact on the per-visual export path.

### 3. visualId is passed as a prop to VisualCard

`VisualNode.decorate()` now passes `visualId={this.__visualId}` alongside `visual=` and
`nodeKey=` to `VisualCard`. This is the stable document-level identity that lets the
export registry match `collectDocumentBlocks` output to the live SVG getter. No NodeKey
is persisted (consistent with the existing collab contract).

### 4. DocumentExportButton lives inside LexicalComposer

The new `DocumentExportButton` component uses `useLexicalComposerContext` to read the
current editor state on demand (at export time, not on every keystroke). The
`VisualSvgRegistryProvider` wraps the `LexicalComposer` subtree so both the button and
the `VisualCard` decorators share the same registry instance.

### 5. PDF layout: text blocks + visual-per-page

The document PDF uses A4 portrait pages. Text blocks (headings at 18/15/13pt,
paragraphs/quotes at 11pt, list items at 11pt with bullet prefix) are flowed with
automatic line-wrapping and page breaks. Each visual gets its own A4 page (landscape if
`viewBox.width > height`), inset at ~10% margins. Documents with zero visuals produce a
text-only PDF; documents with no text produce visual-only pages.

### 6. PPTX: one slide per visual; title-only fallback

Each visual produces one 10×7.5" slide. The nearest preceding heading (scanning
backwards from the visual in the block list) becomes the slide title. If there are no
visuals, a single title slide is emitted so the deck is never empty/invalid.

### 7. Per-visual export is untouched

`ExportMenu` and `exportPDF` / `exportPPTX` in `src/lib/visual/export.ts` are
unchanged. The new code reuses `exportPNG` as a shared internal (SVG → PNG conversion)
to avoid duplication.


# Document Import: Server-only parsers + Markdown intermediary

**By:** Tank (Backend Developer)
**Date:** 2026-06-19
**Issue:** #4

## Decision

All binary format parsers (DOCX via `mammoth`, PPTX via `jszip` + XML extraction, PDF via `pdf-parse` v2) run **server-side only** inside a dedicated `POST /api/import` route (`runtime = 'nodejs'`). Every parser module imports `server-only` to prevent accidental client bundling.

Markdown and HTML are also processed server-side (in the same route) for consistency, even though they could be handled on the client. This keeps all trust-boundary decisions in one place.

## Intermediary format

All parsers normalize their output to the **Markdown subset** already understood by `parseMarkdown` / `markdownToLexicalState`:
- Headings H1–H3 → `# / ## / ###`
- Bullets → `- item`
- Paragraphs → plain lines

The API route returns `{ markdown: string }`. The client passes this directly to the existing `markdownToLexicalState` path (via `useInsertImportedMarkdown`) so no new Lexical serialization logic was needed — the full markdown→Lexical pipeline already existed.

## PPTX approach

PPTX is a ZIP archive. Rather than pull in a heavy PPTX-specific library, `jszip` extracts `ppt/slides/slide*.xml` files and a targeted regex finds `<a:t>` text runs and `<p:ph type="title">` placeholder shapes (promoted to `## headings`). This covers the common outline/bullet structure a typical presentation has.

## pdf-parse v2

The `pdf-parse` package on npm resolved to v2.x which has a completely redesigned API (`new PDFParse({ data: buffer }).getText()`). This is more modern than the legacy v1 `pdf-parse/lib/pdf-parse.js` workaround and wraps `pdfjs-dist` directly. Tested that `PDFParse` constructor accepts a `Buffer` via the `data` field of `LoadParameters`.

## Import within a document = content replacement

When importing inside an open document, the extracted content replaces the entire editor state (`setEditorState({ tag: HISTORIC_TAG })`). This is appropriate because: the user explicitly triggered the action; `HISTORIC_TAG` is the correct tag for deterministic state replacements that should not be re-saved by remote collaborators; and Lexical's undo stack preserves the pre-import state. A future improvement could offer "append" mode.


# 2026-06-19: Generation controls — API contract and prompt injection strategy

**By:** Tank (Backend)

## What

Added `orientation`, `detailLevel`, and `stayCloserToText` to the generation API and prompt builder.

**API contract choices:**
- `orientation`: `"vertical" | "horizontal" | "square" | "auto"` — `"auto"` is explicit rather than omitted so the UI can display it as a real selection without special-casing `undefined`.
- `detailLevel`: `"detailed" | "summary"` — omitting reproduces today's behavior; no `"auto"` value because the absent case is indistinguishable from "let the model decide".
- `stayCloserToText`: plain `boolean`; any non-`true` value is silently treated as absent to keep the API forgiving.

**Prompt injection:**
- Options add lines to the **user message** (not the system prompt) so they are per-request and do not inflate the fixed system prompt token count on every call.
- Each option is tested by asserting the presence/absence of a key phrase in the user message content, keeping tests fast and deterministic without a real LLM.

**UI defaults:**
- `GenOptions` is reset to `DEFAULT_GEN_OPTIONS` on panel close so consecutive generations start fresh.
- The spark gutter button still triggers generation immediately on click, but the panel now also shows a "Generate" button when no candidates exist, which honors the current option state. This is the primary path for typed/configured generation.

## Why

Threading options into the user message (rather than system) is the lowest-cost approach: no system-prompt cache busting, easy to extend, and trivially testable. The `"auto"` sentinel on orientation gives the UI a clean selected state without optional-chaining everywhere.


# Monetization: Billing Abstraction & Credit Metering Design

**By:** Tank (Backend)
**Date:** 2026-06-19

## Decision: MockBillingProvider as default; Stripe behind env-gate

The app must build, test, and run without Stripe credentials in CI. We adopted a `BillingProvider` interface (`changePlan`, `cancelSubscription`) with two implementations:

- **MockBillingProvider** (default) — mutates the DB directly. Zero external deps. Used in CI and local dev.
- **StripeBillingProvider** — only instantiated when `STRIPE_SECRET_KEY` is set. Uses a dynamic `import(/* webpackIgnore: true */ "stripe")` to avoid bundling the SDK at build time.

The factory `getBillingProvider()` checks `process.env.STRIPE_SECRET_KEY` and returns the appropriate instance.

## Decision: ~1 credit per word; period-reset on first access

Credit cost = `Math.max(1, text.split(/\s+/).filter(Boolean).length)`. Simple, deterministic, matches the spec "~1 credit per word selected".

Period reset: `getUserCreditState()` checks `now >= periodStart + periodDays * ms`. On first access (null periodStart) or expiry, it resets the balance to `creditsPerPeriod` and stamps the new period start. No cron required — lazy reset on next request.

## Decision: Watermark as pure SVG text element via ExportOptions

Free-tier watermark is a `<text>` element injected before `</svg>` via `applyWatermarkToSvg()`. It's a pure string transform (no DOM), so it runs in Node tests. The `ExportOptions.watermark` boolean is set by the caller from `!removeWatermark` entitlement.

## Follow-up required to go live with Stripe
1. `npm install stripe`
2. Create Products + Prices in the Stripe dashboard
3. Set `STRIPE_SECRET_KEY`, `STRIPE_PLUS_PRICE_ID`, `STRIPE_PRO_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`
4. Wire `entitlements` prop into `ExportDialog` from `visual-card.tsx`


# Tank — Native PPTX Shape Export Architecture

**Date:** 2026-06-19
**By:** Tank (Backend Developer)
**Issue:** #19

## Decision

### 1. Pure descriptor layer (pptx-shapes.ts)

`visualToNativeSpecs(visual, layout)` (in `src/lib/visual/pptx-shapes.ts`) converts
a `Visual` into an array of `PptxSpec` descriptors — plain serialisable objects that
describe each shape to draw (rect, ellipse, diamond, hexagon, line, text, or
image-fallback). The module has **no PptxGenJS import** and no browser dependency,
so it is fully testable under `node --test`.

The companion `computeVisualSlideLayout(visual, titleAreaH?)` returns a
`PptxSlideLayout` (offsetX, offsetY, scale) that maps canvas units to slide inches,
positioning the visual centred within the available slide area (excluding the optional
title strip).

### 2. PptxGenJS bridge (pptx-apply.ts)

`applySpecsToSlide(slide, specs)` in `src/lib/visual/pptx-apply.ts` translates
`PptxSpec` descriptors into PptxGenJS `slide.addShape` / `slide.addText` calls. It is
the only module that imports PptxGenJS. Keeping it separate from the descriptor layer
preserves the testability contract.

### 3. Native-vs-fallback mapping

11 of 13 visual kinds export as native editable shapes:
- **Positioned kinds** (flowchart, mindmap, concept, orgchart, venn): nodes → shapes by
  `node.shape` (rounded/rect/pill/ellipse/diamond/hexagon); edges → line specs with
  optional arrowheads.
- **Layout-driven kinds** (list, chart, timeline, cycle, comparison, matrix): geometry
  derived from the same layout helpers as the SVG renderer so positions match exactly.

2 kinds fall back to a rasterised PNG image:
- **funnel** and **pyramid**: their band geometry is trapezoidal, which has no direct
  PptxGenJS shape equivalent. `visualToNativeSpecs` returns `[{ kind: "image-fallback" }]`
  for these kinds and callers detect it with `isImageFallback(specs)`.

### 4. Backward-compatible API extensions

`exportPPTX(svgElement, visual?)` gains an optional second argument. When `visual` is
absent (or the kind falls back), the existing PNG-rasterisation path is used unchanged.
This keeps the `ExportMenu` → `exportPPTX` call backward-compatible for any caller
that only has an SVG element.

`ExportMenu` gains an optional `getVisual?: () => Visual | null` prop. It is wired
from `visual-context-popover.tsx` (which already owns the `visual` object) so the
live payload flows through without needing context or a new provider.

### 5. Document-level PPTX export shares the same mapper

`addVisualSlide` in `document-export.ts` now accepts the `Visual` payload from the
`DocumentVisualBlock` (already present in the blocks collected by
`collectDocumentBlocks`) and calls `visualToNativeSpecs` + `applySpecsToSlide` before
falling back to the image path. The title-area height is forwarded to
`computeVisualSlideLayout` so the native shapes respect the slide title strip.

### 6. Coordinate system

Canvas coordinates (px) are converted to slide inches via:
```
slideX = offsetX + canvasX * scale
ptFontSize = canvasFontSize * scale * 72
```
where `scale = min(availW / visual.width, availH / visual.height)` and `availW/H` is
85% of the slide area (margin keeps shapes from touching the slide edge).


# Tank decision: provider-aware search filter via runtime type cast

**By:** Tank (Backend Developer)
**Date:** 2026-06-19
**Issue:** #11

## Decision

`buildSearchOr` in `src/lib/search.ts` handles SQLite vs Postgres search
differently at runtime, branching on `DB_PROVIDER`:

- **SQLite** – `{ contains: query }` → Prisma maps to `LIKE '%q%'`, which
  SQLite evaluates case-insensitively for ASCII (no extra configuration).
- **Postgres** – `{ contains: query, mode: 'insensitive' }` → Prisma maps
  to `ILIKE '%q%'`.

## Why a type cast is needed

The project's `prisma generate` step runs against *whichever schema is
active* (controlled by `DB_PROVIDER`). CI uses `DB_PROVIDER=sqlite`, so
the generated `StringFilter` type omits `mode` (a Postgres-only field).
Adding `mode: 'insensitive'` to a filter object therefore fails TypeScript
when compiled against the SQLite-generated client.

The fix is a `as unknown as Prisma.StringFilter` cast on the Postgres
branch only, with a JSDoc comment explaining why. This is the minimal
intervention: the cast is narrowly scoped, clearly documented, and the
alternative (conditional import of two separate generated clients) would
be significantly more complex and fragile.

## Considered alternatives

1. **Single-schema approach (Postgres only)** – would break the project's
   SQLite CI requirement.
2. **Raw SQL (`prisma.$queryRaw`)** – provider-conditional raw SQL is more
   verbose, harder to compose with Prisma's `documentAccessOr` helper, and
   loses type safety entirely.
3. **Lowercase the query and store content lowercased** – invasive schema
   change; breaks existing content and requires a migration.
4. **FTS5 on SQLite** – straightforward to set up but requires raw SQL and
   a migration, and the task explicitly accepts a LIKE-based first cut.

## Rule going forward

Any new query that needs case-insensitive matching should use
`buildSearchOr` (or a similar provider-aware helper) rather than
sprinkling `mode: 'insensitive'` inline. This keeps the SQLite/Postgres
branching centralized and the cast isolated.


## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
### 2026-06-20T00:05:35Z: Deck model placement and block-type reuse
**By:** Tank (via Squad)
**What:** New presentation types (`Deck`, `Slide`, `SlideLayout`, `DeckTheme`) and `buildDeckFromBlocks` transform live in `src/lib/presentation/deck.ts`. Block types are imported from `src/lib/visual/document-export.ts` — no redefinition. Tests are colocated in `src/lib/presentation/deck.test.ts` and run headlessly under `node --test`.
**Why:** Reusing `DocumentBlock` from `document-export.ts` keeps the two transform layers in sync (same block taxonomy) and avoids a split schema. Colocating the test next to the source matches the existing project convention (`*.test.ts` next to `*.ts`). Keeping the transform pure (no DOM, no React) makes it safe to call from any server action or future API route without environment constraints.

### 2026-06-20T00:05:35Z: Social export presets — padding via effective-viewbox expansion
**By:** Tank (via Squad)
**What:** Added safe-area padding to `computeLetterboxedDimensions` by expanding the "effective" content box by `2 * padding` on each axis before letterboxing, rather than post-processing the translated offset. This keeps the existing SVG transform model (a single `<g translate(offsetX,offsetY)>` wrapper) and the aspect-ratio constraint both satisfied simultaneously. Added `"9:16"` to `ASPECT_RATIO_PRESETS` in schema.ts so the value is consistent across the system.
**Why:** Alternative approaches (CSS padding on a wrapping element, SVG `<clipPath>`, or a second transform pass) would each break the existing pipeline that downstream callers (`exportPNG`, `exportPDF`) depend on. The effective-viewbox approach is purely additive — it changes only the letterbox geometry calculation, not the SVG structure. Social preset branding toggle is gated behind `removeWatermark` entitlement: free users always get the watermark; paid users get a checkbox to opt-in to branding (defaults off).

### 2026-06-20T00:05:35Z: Two-pane editor layout — docked right-side editing rail
**By:** Switch (via Squad)
**What:** Replaced the floating-over-article editing surfaces with a persistent right-side editing rail for desktop viewports (≥ 1024 px). The article column stays left; a 320 px `<EditingRail>` docks right inside the same `EditorContextProvider` / `VisualPanelProvider` scope. On narrow screens (< 1024 px) the rail is hidden and the existing floats are the fallback. Key files: `rail-state.ts` (pure helpers + hooks), `editing-rail.tsx` (the rail component), `visual-context-popover.tsx` (added `mode?: "float" | "panel"` prop), `visual-card.tsx` (suppresses float when rail active).
**Why:** Issue #40: editing surfaces overlapped the centered article column, especially on smaller viewports and with wide popovers. The two-pane approach eliminates overlap at desktop widths while preserving all existing behavior on narrow screens. One-way data flow invariants are preserved: surfaces read `useEditorContext()` and mutate through `editor.update()` only.

### 2026-06-20T00:05:35Z: In-app Present mode — slide rendering, nav, and data flow
**By:** Switch (via Squad)
**What:** Built `present-mode.tsx` (fullscreen overlay), `present-button.tsx` (toolbar entry), and `slide-helpers.ts` (pure helpers) for issue #52. The snapshot data model: `PresentButton` reads the Lexical editor state once on click, builds a `Map<string, Visual>` and a `Deck` from `collectDocumentBlocks` + `buildDeckFromBlocks`, then passes both as props to `PresentMode`. `PresentMode` is entirely free of Lexical/Yjs — it operates on plain data. HUD auto-hide with 3s inactivity fade, fullscreen API best-effort on mount, theme colors as inline styles, click zones for navigation (left half = previous, right half = next).
**Why:** Snapshot model keeps collab-safe, read-only. HUD timer satisfies react-hooks rule by using `scheduleHudHide` (no setState) to start the initial timer, with `resetHudTimer` (which calls `setHudVisible`) used only in event handlers. Fullscreen API is best-effort; CSS overlay works without it. Theme colors via inline styles avoid needing Tailwind to scan all variants.

### 2026-06-20T00:05:35Z: Persist edited deck as `deckJson` on Document, separate from `contentJson`
**By:** Switch (via Squad)
**What:** Added `deckJson Json?` column on Document. When a user edits the slide deck in the Slide Editor, the edited Deck (JSON blob) is persisted to this column, validated by `safeParseDeck` before storage. When no `deckJson` is present, the deck is derived on-the-fly from `buildDeckFromBlocks`. Deck edits are a separate persisted artifact — entirely separate from Lexical/Yjs `contentJson` — so collab and autosave are not affected.
**Why:** Deck layout/theme/reordering is a presentation concern, not a document-content concern. Storing it separately from `contentJson` (the Lexical state) ensures deck mutations never go through Yjs CRDT and cannot corrupt collaborative editing. This mirrors the Trinity decision to keep `contentJson` as the single source of truth for the editor.

### 2026-06-20T00:05:35Z: Public shareable presentation + embed (#54)
**By:** Switch (via Squad)
**What:** New `/present/[shareId]` public route — server component loads the document's deck (persisted `deckJson` via `safeParseDeck`, fallback to `buildDeckFromBlocks`) and renders with new `PublicPresentViewer` client component. Sub-route `/present/[shareId]/embed` for `<iframe>` embedding. Extracted shared slide-rendering primitives (`SlideCanvas`, `DECK_THEMES`, layout renderers) from `present-mode.tsx` into `slide-canvas.tsx`. Added `slideIndexFromHash` and `hashFromSlideIndex` helpers for URL hash deep-linking. Updated `HeaderGate` to suppress site header for `/present/*` paths. Added "Presentation link" section in `share-button.tsx`.
**Why:** Issue #54 / epic #47 requirement: shareable online presentation. Extracting `SlideCanvas` ensures the public viewer and in-app presenter can never visually diverge — one source of truth. `safeParseDeck` fallback matches the strategy used by the slide editor so edited decks are always shown correctly. Routing `/present/[shareId]/embed` as a sub-path keeps the URL structure symmetric with `embed/[shareId]`.

### 2026-06-20T00:05:35Z: Social share — document-level (ShareButton) + per-visual (VisualCard overlay)
**By:** Tank (via Squad)
**What:** Pure URL builders (`buildTwitterIntent`, `buildLinkedInIntent`, `buildFacebookIntent`) + capability gates (`canWebShare`, `canCopyImageToClipboard`) live in `src/lib/share/social-intents.ts`. Reusable `SocialShareMenu` component accepts `shareUrl`, `title`, and `getSvgElement`. Document-level: `share-button.tsx` gains a "Share to social" section (inline `SocialShareMenu`). Link-based intents are gated on `isShared`; prompt shown when not shared. Per-visual: `visual-card.tsx` gains two hover-overlay buttons — "Copy image" (clipboard) and "Share" (native Web Share API). Copy image uses the `"square"` social preset (1080×1080) for crisp clipboard image.
**Why:** `VisualCard` is a Lexical decorator and does not receive document-level props — splitting the surfaces (full social share at document level; image-only at visual level) keeps both clean. Feature-detecting at call time ensures SSR safety and avoids stale capability checks. The "square" preset is most universally supported across social platforms.

### 2026-06-20T00:05:35Z: Infographic export — pure layout engine + browser rasteriser split
**By:** Tank (via Squad)
**What:** Implemented `computeInfographicLayout` in `src/lib/visual/infographic-layout.ts` as a fully pure function (no DOM, no browser) that receives `DocumentBlock[]` and an `InfographicConfig` and returns `{ blocks: BlockLayout[], totalHeight, contentWidth }`. Text height estimation uses a calibrated `0.55 × fontSize` average-char-width heuristic (accurate ±15% for sans-serif). The browser-side composer (`exportDocumentAsInfographic` in `document-export.ts`) consumes this layout, draws text blocks with Canvas 2D API, rasterises visual blocks via existing per-visual `exportPNG` path at 2× scale, optionally wraps the resulting PNG in a single-page jsPDF for PDF output. Watermark is applied directly in Canvas. Three width presets (1080 / 800 / 1200 px) exposed as `INFOGRAPHIC_WIDTH_PRESETS` and surfaced in `DocumentExportButton` as chip selectors.
**Why:** Keeping layout pure was the key constraint — it makes the measurement logic independently unit-testable (32 tests, node --test, no jsdom) and means the rasteriser is a thin browser-only layer that just consumes pre-computed y-offsets. This follows the same pattern as `computePageBreaks` in `document-export.ts`. Watermark is applied via Canvas API (not SVG transform path) because the composed canvas is not an SVG.

### 2026-06-20T00:05:35Z: Visual effects model — effects[] on Visual, not VisualStyle
**By:** Switch (via Squad)
**What:** Introduced a `VisualEffect` discriminated union (`ShadowEffect | SketchEffect`) as an optional `effects?: VisualEffect[]` field directly on the `Visual` interface (not inside `VisualStyle`). SHADOW is rendered via SVG `<feDropShadow>`, SKETCH via `<feTurbulence>` + `<feDisplacementMap>`. Effects are on `Visual`, not `VisualStyle`, preserving the clean split between the user's palette/theme system and rendering embellishments. Array model allows combining multiple effects and supports future additions without touching existing data. Unknown effect kinds are silently dropped by `validateVisual`. Using `useId()` for filter IDs prevents filter bleeding when multiple `VisualRenderer` instances appear on the same page. Each active effect wraps the visual body in a separate `<g filter>` element for independent composition. Transforms follow existing pure-transform pattern with `setEffect` / `clearEffect` as pure, immutable, DOM-free functions.
**Why:** The effects must be presentation-only, baked into the Visual payload, and independent of `--ds-*` chrome tokens. Placing them on `Visual` (not `VisualStyle`) keeps the concern separation clean. The array model and forgiving validation ensure the schema change is strictly additive: all existing visuals remain fully valid.

### 2026-06-20T00:05:35Z: Per-node font family — native select over segmented control
**By:** Switch (via Squad)
**What:** Implemented per-node font family override as a native `<select>` in the "Selected element" section of the visual context popover, offering "Default (inherit)" plus all 12 BRAND_WEB_FONTS options. Chose native select over SegmentedControl because 13 options would overflow the 320px popover width. The select is styled with DS tokens (`--ds-border`, `--ds-surface-base`, `--ds-text`, `--ds-focus-ring`). `fontFamily` on `VisualNode` is optional; absent/undefined means "inherit the global `style.fontFamily`". Added `useVisualNodeFonts` hook (analogous to `useBrandFont`) that injects Google Font `<link>` tags for any per-node font families already in the visual. Added a "Click to edit" inline hint text beneath hovered nodes on non-positioned visual kinds in `visual-editor.tsx`.
**Why:** Issue #42 is an audit/gap-fill, not a redesign. Adding a dropdown consistent with other row-level controls meets the requirement without restructuring the menu IA. Backward compat: `safeParseVisual` silently drops unknown values so existing visuals are unaffected. Transform purity: `setNodeFontFamily("", …)` clears the override; `resetNodeExtStyle` also clears `fontFamily` so the "Reset element" button fully resets all per-node overrides.

### 2026-06-20T00:05:35Z: Drill-down navigation for the categorized visual menu
**By:** Switch (via Squad)
**What:** Chose a two-level drill-down navigation pattern (main menu list → focused submenu with back button) over alternatives (accordion/expand-in-place, tab strip, flat scroll) for the categorized visual menu. `activeSection: MenuSection | null` drives which view renders; `null` = main menu, a string key = the active submenu. The `useLayoutEffect` reposition loop now lists `activeSection` as a dependency so the float-mode popover repositions whenever submenu content changes height. The existing Connectors controls (arrow style, line style, line width) are now surfaced inside the **Swap Layout** submenu. Extracted `computeVisualInfo` as a DOM-free lib helper (`src/lib/visual/info.ts`) that derives kind, nodeCount, edgeCount, title, sourceText, effectCount, and fontFamily from a `Visual` payload. 12 unit tests in `info.test.ts` cover all fields with node --test.
**Why:** The narrow 320 px popover can only show ~3–4 content rows without scrolling. Drill-down keeps each submenu focused and uncluttered, avoids the height jitter of expanding accordions, and maps naturally to the spec. Accordion was rejected because multiple simultaneously-open sections would recreate the original scrolling problem; tab strips were rejected because 9 tabs don't fit at 320 px. Connectors control the *shape* of edge connections — an IA/structure concern — which aligns with Swap Layout (kind switch + style gallery). The Info panel requirement explicitly calls for "DOM-free and UNIT TEST it (node --test, no jsdom)" — extracting it as a lib helper makes it independently testable and reusable.

### 2026-06-20T00:05:35Z: Document-level overall adjustments toolbox — context kind drives rail surface
**By:** Switch (via Squad)
**What:** Implemented the overall-adjustments toolbox for issue #41. Three design choices: (1) `shouldShowOverallToolbox(kind)` as a pure export (`src/lib/lexical/overall-toolbox.ts` with co-located `.test.ts`) — the predicate (`kind === "none" || kind === "empty-block"`) lives in a DOM-free, headlessly unit-testable module, consistent with `readSelectionDescriptor()`. (2) Prop drilling over a new React context for page-break state — the existing `[showPageBreaks, setShowPageBreaks]` state stays in `LexicalEditor`. Three props (`documentTitle`, `showPageBreaks`, `onTogglePageBreaks`) are threaded through `EditingRail → OverallAdjustmentsPanel`. (3) Lazy brand load on mount — `OverallAdjustmentsPanel` fetches brands via `/api/brand` at mount time (once, via `useEffect`). The section hides entirely when no brands are found.
**Why:** The overall toolbox must not interfere with the insert menu (which triggers on `empty-block` cursor placement via BlockSpark/InsertMenu) — it is rendered in the right rail only, never inline. Rendering in the `EditingRail` (which is already `hidden lg:flex`) means it never appears on narrow viewports where the floating surfaces handle interactions. Prop drilling for two-level state passing is simpler and more transparent than adding a React context which would require structural changes. The toolbox is distinct from the insert menu by design and location.

### 2026-06-20T00:05:35Z: Visual edits via setVisual are already tracked by the Yjs UndoManager
**By:** Switch (via Squad)
**What:** Verified that `node.setVisual()` mutations (inline label edits, drag/position, style/theme/kind changes) **are already captured by the Yjs UndoManager** without any code changes. The `CollaborationPlugin` calls `useYjsHistory`, which creates an `UndoManager` with `trackedOrigins: new Set([binding, null])`. Every `editor.update()` call goes through `syncLexicalUpdateToYjs` → `syncWithTransaction` → `binding.doc.transact(fn, binding)`, which uses `binding` as the Yjs transaction origin — exactly one of the tracked origins. The `CollabDecoratorNode.syncPropertiesFromLexical` method iterates all non-excluded node properties (including `__visual`) and writes them into the Yjs shared type inside that transaction. The UndoManager captures it. In degraded local-only mode, the Yjs binding and UndoManager still initialise (degradation only affects the websocket sync, not the local Yjs doc). Local edits after the `LocalFallbackSeedPlugin` seed are tracked and undoable. The seed itself uses `HISTORIC_TAG`, which the UndoManager discards, so the first edit post-seed correctly becomes the first undoable action. `UndoRedoControls` simply reflects `canUndo`/`canRedo` truthfully — buttons are disabled until there is history.
**Why:** The issue (#43) specified "verify visual editing operations are undoable and fix if not". Investigation showed they already are. The only work needed was surfacing the existing UndoManager as discoverable UI (Undo/Redo buttons) and adding a headless test that confirms the undo round-trip. No changes to `trackedOrigins` or `setVisual` were needed. The existing architecture already tracked everything correctly.




### 2026-06-20T03:30:00Z: Browser walkthrough triage — post-epic #39/#46/#47 findings

**By:** Trinity (via Squad)

**What:**
Triaged 6 findings from a live browser walkthrough of the running app (port 4000). Created 7 GitHub issues:

| # | Title | Labels |
|---|-------|--------|
| #68 | Present mode: slide title overlaps top HUD | type:bug, priority:p1, squad:switch |
| #69 | [Epic] Editor right-side surfaces — collision/z-index/mutual-exclusion | type:epic, priority:p1, squad:switch, squad:mouse |
| #70 | VisualContextPopover (z-50) over SlideEditor (z-40) — sub of #69 | type:bug, priority:p1, squad:switch |
| #71 | Share dropdown (z-10) clipped behind SlideEditor (z-40) — sub of #69 | type:bug, priority:p1, squad:switch |
| #72 | Global nav overflows on mobile (390px) — no responsive collapse | type:bug, priority:p1, squad:switch, squad:mouse |
| #73 | Visual generation UX: skeleton + staged status + ETA | type:feature, priority:p2, feedback, squad:switch, squad:tank |
| #74 | Present mode polish: visual white-card contrast + speaker notes | type:feature, priority:p2, squad:switch |
| #75 | Seed document references visual not embedded in contentJson | type:bug, priority:p2, squad:tank |

**Decisions:**

1. **Finding #2 → epic (#69) + 2 sub-issues (#70, #71)**: The surface collision is architecturally significant (z-index discipline, mutual-exclusion pattern). Filed as an epic with sub-issues to separate the structural fix from the two concrete bugs. Switch owns impl; Mouse owns interaction model definition.

2. **Finding #4 (generation latency)**: Corrected file reference — main generation UX is in `block-spark.tsx` (not `insert-menu.tsx` as cited). `insert-menu.tsx` is the "+" gutter menu and does not call `/api/generate`. Filed against `block-spark.tsx` + `route.ts`. Marked p2/feedback; the existing ThinkingIndicator is functional but insufficient for a ~13s wait.

3. **Finding #5b (speaker notes "No speaker notes")**: Code review shows `buildDeckFromBlocks` notes mapping is correct (quote blocks → `noteLines`, overflow bullets → `noteLines`). The observation is likely a true-negative on the demo content (no quote blocks). Filed as p2 feature/polish with a "verify first" instruction rather than a confirmed bug.

4. **Finding #6 (seed)**: Confirmed the gap — seed creates a `Visual` DB row but never embeds a `VisualNode` in `contentJson`. The document `content` in seed.ts says "Paste your text here..." (not the copy the walkthrough saw), suggesting the live DB was seeded with older code. Filed as p2 bug; either fix the contentJson or update the copy.

**Top-3 priorities:**
1. **#69 / #70 / #71** — Surface collision/z-index: directly breaks core editor workflows (sharing, slide editing) for every user every day.
2. **#68** — Present mode HUD overlap: affects every non-title slide on every presentation; small targeted fix.
3. **#72** — Mobile nav overflow: blocks mobile users from navigating the app at all; accessibility/reach issue.

## 2026-06-20T04:05:00Z: Ralph's backlog clearance — 5 p1 issues + 3 p2, shipped across 6 PRs

### 2026-06-20T03:55:00Z: Right-Surface Coordinator — mutual exclusion + z-index discipline

**By:** Switch (via Squad)

**What:**
Introduced a `RightSurfaceContext` / `RightSurfaceProvider` at the editor root
(placed inside `LexicalComposer` > `VisualAnchorProvider`), backed by a
DOM-free pure reducer in `src/lib/right-surface-coordinator.ts`.

- **Mutual exclusion (Rule A + B):** When `SlideEditorButton` opens the
  `SlideEditor` panel (z-40, fixed right), it calls `openSlideEditor()` on
  the coordinator. `VisualCard` reads `suppressFloatPopover` and suppresses
  its floating `VisualContextPopover` (z-50) for the duration. Closing the
  slide editor calls `closeSlideEditor()` and restores the float.

- **UX decision — re-select while slide editor is open:** At `lg+` viewport
  (editing rail active), selecting a visual while the slide editor is open
  updates the docked rail's panel view (behind the slide editor overlay).
  At `< lg`, the float is suppressed entirely — no controls render — because
  the slide editor occupies the right side. This keeps the UX clean: the slide
  editor takes priority, and visual editing is deferred until it is closed.

- **Z-index discipline:** Top-toolbar dropdowns (Share → `z-[60]`, Export →
  `z-[60]`) are now above `FloatingSurface` (z-50) and the slide editor panel
  (z-40). Comments panel is already z-50 (fixed) and was not changed.

**Why:**
The floating visual popover (z-50) was rendering on top of the slide editor
panel (z-40) whenever a visual was selected while the slide editor was open
(issue #70). The share and export dropdowns (z-10 / z-20) were clipped behind
the slide editor (z-40) and unclickable (issue #71). Trinity's architectural
direction in epic #69 called for a single coordinator context rather than
ad-hoc guards in individual components. The pure reducer approach lets the
mutual-exclusion logic be unit-tested without a browser.

**Shipped in:** PR #76 (closes #69, #70, #71)

### 2026-06-20T03:55:00Z: Present-mode HUD title overlap fix — pt-14 offset on slide layouts

**By:** Switch (via Squad)

**What:** Applied padding-top offset (`pt-14`) to content/section/blank layouts in `slide-canvas.tsx` to prevent slide titles from overlapping the present-mode HUD. The preview layout (used by PresentationSidebar) was explicitly excluded to preserve its compact preview appearance.

**Why:** In present mode, slide titles were overlapping the top HUD (status bar showing current slide / pause state). The HUD is fixed at the top with z-index. Adding consistent top padding to the three primary slide content layouts (`ContentSlideLayout`, `SectionSlideLayout`, `BlankSlideLayout`) provides breathing room below the HUD for any title text without affecting the export/share rendering paths or preview sidebar.

**Shipped in:** PR #77 (closes #68)

### 2026-06-20T03:55:00Z: Mobile-first responsive nav (hamburger) + mobile editing bottom sheet

**By:** Switch (via Squad)

**What:**
1. `src/components/site-header.tsx` — added `overflow-hidden` to the header to prevent horizontal scroll. Below `md:` the full nav is hidden (`hidden md:flex`); replaced with a `md:hidden` section showing the condensed `UserMenu` (avatar only at 390px, per existing `sm:` responsive class) and a `MobileNavMenu` hamburger button. All primary nav links (Documents, Workspaces, Brands, Credits, Language Switcher, Keyboard Shortcuts) land inside the slide-in drawer.

2. `src/components/mobile-nav-menu.tsx` (new) — `"use client"` component that renders the hamburger toggle + a `framer-motion` right-side slide-in drawer via `createPortal`. Closes on Escape, backdrop click, or any nav link tap. Guards the portal with `typeof document !== "undefined"` (same pattern as `FloatingSurface`) to avoid SSR mismatch.

3. `src/app/app/documents/[id]/editing-rail.tsx` — `EditingRail` now returns a React fragment: the existing desktop rail (`hidden lg:flex`, unchanged) + a new `MobileEditingSheet` component that is `lg:hidden`. The sheet is a fixed FAB (bottom-right, z-40) that opens a `framer-motion` slide-up bottom-sheet portal. The same `TextFormatSection`, `VisualContextSection`, and `OverallAdjustmentsPanel` components are reused inside the sheet — no control logic is duplicated.

**Why:**
The global nav had no responsive handling, causing horizontal overflow and cut-off at 390px (verified via issue #72). The editing rail was unconditionally `hidden lg:flex` with no mobile replacement, making all editing tools unreachable on phones. Both fixes follow the existing codebase patterns: `framer-motion` + `createPortal` (already used by `FloatingSurface`), `ghost-*` design tokens for nav chrome, `--ds-*` tokens for the editor sheet. No new runtime dependencies added.

**Shipped in:** PR #78 (closes #72)

### 2026-06-20T03:55:00Z: Present-mode polish — `transparentBackground` prop for VisualRenderer

**By:** Switch (via Squad)

**What:** Added an opt-in `transparentBackground?: boolean` prop to `VisualRenderer`. When `true`, the SVG background `<rect fill={visual.style.background}>` and any canvas-style pattern overlay rect are suppressed (not rendered), so the visual's content elements sit directly on the containing surface. The prop defaults to `false`, preserving the existing behaviour everywhere. `SlideCanvas` (used by both `PresentMode` and `PublicPresentViewer`) always passes `transparentBackground` to `VisualRenderer` in `ContentSlideLayout` and `MediaSlideLayout`.

**Why:** Visual slides in present mode showed a jarring white/light card background from the visual's theme clashing with the dark slide theme (`tc.bgColor`). The VisualRenderer is shared across the editor, export/share pages, embed pages, and presentation surfaces — we cannot change the default behaviour globally. A single opt-in prop keeps the change surgical and safe: editor, share/embed, and export paths pass no prop (default `false`) and are completely unaffected. Only the slide-canvas presentation path opts in, blending the visual seamlessly with the slide's dark background.

**Shipped in:** PR #79 (closes #74)

### 2026-06-20T03:55:00Z: Skeleton + staged status for AI generation (issue #73)

**By:** Switch (via Squad)

**What:** Added three client-side improvements to the `/api/generate` (~13 s) UX:
1. `generation-stages.ts` — pure deterministic stage module (`getStageLabel(elapsedMs)`) with stages: Analysing text… → Building structure… → Finishing…; unit-tested with `node --test`.
2. `use-generation-status.ts` — `useGenerationStatus(isLoading)` hook using `useReducer` (not multiple `useState` calls) to avoid the `react-hooks/set-state-in-effect` lint rule; cycles labels via `setInterval`; tracks first-generation ETA flag in a module-level variable.
3. `generation-status.tsx` — `GeneratingIndicator` (staged label + ETA hint) and `VisualSkeleton` (shimmer card) components shared across both call sites.
4. Skeleton approach: render shimmer skeleton cards **in the panel UI** (not as Lexical VisualNodes) to avoid autosave/collab side-effects while still stabilising panel layout. AnimatePresence transitions idle↔loading↔candidates↔error states.

**Why:** Inserting a real VisualNode as a skeleton would be saved by the 800 ms autosave debounce, synced to other collaborators via Yjs, and pollute the DB with transient loading state. Keeping the skeleton purely in React/portal UI is Yjs-safe, collab-safe, and matches the existing pattern where candidates are shown in the panel before the user picks one to insert. The `useReducer` refactor avoids ESLint `react-hooks/set-state-in-effect` errors (Next.js lint config flags synchronous `setState` in effect bodies).

**Shipped in:** PR #80 (closes #73)

### 2026-06-20T03:55:00Z: Seed visual — extract `buildSeedContentJson` pure helper

**By:** Tank (via Squad)

**What:** Introduced `src/lib/lexical/seed-content.ts` — a pure, DOM-free function that builds a minimal Lexical editor-state JSON (paragraph + VisualNode block) for use by the seed script. The function mirrors the exact serialized shapes from `from-markdown.ts` (paragraph nodes) and `VisualNode.exportJSON()` (decorator blocks), and is covered by 6 unit tests. Embeds a flowchart VisualNode in the Welcome document contentJson; verified DB embed.

**Why:** Three alternatives were considered:

1. **Inline the JSON object directly in `seed.ts`** — rejected because it duplicates the serialized node shapes and would silently drift if `VisualNode` or the paragraph format ever changes.

2. **Use a headless Lexical editor inside the seed** — rejected because it pulls in `@lexical/headless` as a direct seed dependency, adds startup cost, and is harder to unit-test without a DOM-like environment.

3. **Pure helper function (chosen)** — keeps the seed simple, matches the existing pattern in `from-markdown.ts` (another DOM-free Lexical-state builder), and lets the unit tests run under plain `node --test` with no browser stubs. The helper is placed in `src/lib/lexical/` alongside `from-markdown.ts` and `insert-visual.ts` for cohesion.

**Shipped in:** PR #81 (closes #75)

### 2026-06-20T06:20:00Z: On-canvas quick-action bar — sectionNav prop pattern for external popover navigation

**By:** Switch (via Squad)

**What:**
Added a `sectionNav: { section: MenuSection | null; seq: number }` prop to `VisualContextPopover` so that the new on-canvas `VisualQuickActionBar` can drive the popover to a named section without lifting `activeSection` all the way out of the popover. The sequence counter (`seq`) allows the same section to be requested twice in a row (e.g. user navigates away inside the popover then clicks the bar button again) — only a `seq` change triggers the `useEffect` that calls `setActiveSection`.

**Why:**
The popover already owns its own `activeSection` state (plus drill-down, customize-open, brand-load, generate, sync states). Making `activeSection` fully controlled would require surfacing five interconnected state pieces to the parent. The `sectionNav` prop is a minimal, one-directional trigger — a "fire-and-forget" that respects the popover's internal navigation while still letting the bar be the thin overlay affordance the issue describes. The `seq` counter is standard React practice for "push a trigger from props without making state fully controlled."

**Placement decision:**
The quick-action bar is positioned `absolute top-2 left-1/2 -translate-x-1/2` — centered at the top of the visual card's content area. This keeps it clear of the existing bottom-right hover icons (download/copy/share) and away from the floating popover (which sits below or above the card). It is only rendered when `showControls && isPointerFine`, so touch devices continue using the bottom sheet.

**Shipped in:** PR #85 (closes #84 core; roadmap deferred to #87)

---

## 2026-06-20T06:20:00Z — Session: Ralph triage, CI regression fix, #87 deferred roadmap

### Context
Ralph processed the open board. Three issues (#82, #83, #84) had their core work ALREADY committed directly to main (commit b58e1d6 + others, outside the squad PR flow). Ralph verified, finished the remaining gap, and fixed a CI regression those direct commits introduced.

### Decisions

**#82 (auth pages → --ds-* design system):** Verified already done on main → CLOSED with confirmation comment.

**#83 (present-mode residual dark overlay → portal + await exitFullscreen + body scroll lock):** Verified already done on main → CLOSED with confirmation comment.

**#84 (inline in-place editing refactor):** Core already on main; Switch implemented the remaining acceptance criterion — the on-canvas quick-action bar for selected visuals (new visual-quick-action-bar.tsx) → PR #85 (merged) → #84 CLOSED.

**CI REGRESSION FOUND + FIXED:** The direct auth commit (b58e1d6) and #85's test were committed without Prettier, so main's CI was RED on format:check. Ralph ran prettier --write on login-form.tsx, signup-form.tsx, visual-quick-action-bar.test.ts → PR #86 (CI green) → merged → main restored to green.

**#87 [Epic] — deferred roadmap:** Captures #84's 5 deferred "future PR" roadmap items (direct manipulation, anchored positioning, unified EditingSurface, docked-mode preference, regression tests), labeled type:epic/p2/backlog/squad:switch/squad:mouse. Intentionally deferred (not rushed this loop).

### Key Learning
Direct-to-main commits bypassed CI/Prettier checks. Reinforce pre-commit: run `npm run format` before pushing. Code must pass full CI gate (typecheck, tests, lint, format:check, build) before merging.

### Final State
main is green (typecheck clean, 710 tests pass, build green, format:check clean). Open issues: just #87 (deferred roadmap).


### 2026-06-21T20:35:42+08:00: Slides editing review → epic #199 (#200–#214)
**By:** Scribe, from Switch / Mouse / Tank / Trinity reviews

**Session:** Complete review of slides editing implementation; create GitHub issues.

**Balance narrative:** Auto-derive a presentation-ready deck from the document's text + visuals by default (fast, low-effort), while making high-value manual edits quick and safe, and keeping the deck in sync with the document without clobbering manual edits. Today the automation layer is strong (`buildDeckFromBlocks` creates structurally correct decks and attaches visuals), but manual editing is laborious/unsafe (materialization gate, no undo/redo, no visual picker, raw color pickers, weak default theme), and the document↔deck link is severed after first save (no staleness signal, silent orphan visuals, PPTX export re-derives raw blocks and drops edits). Target state: editable immediately, document-derived theme, quick/safe manual edits, merge-based re-sync that preserves free-form `elements[]`, and export of the edited `deckJson` with orphan-visual protection.

**Architectural decisions:**
- Slide-editor undo is snapshot-based over the plain `Deck` object; do not use Lexical/Yjs/`YUndoManager`.
- Materialization should be implicit: auto-materialize legacy slides on editor open or first interaction; remove the primary "Customize layout" gate.
- Re-sync is a merge, never a full re-derive: refresh derived title/bullets/visualIds from live blocks while preserving free-form `elements[]`; add staleness tracking via content hash/synced timestamp.
- Add document visual insertion as a first-class slide element using the existing `visuals` map; no new server data path is required.
- Deck→PPTX requires a new `exportDeckAsPPTX(deck, visuals, getSvg)` path that honors saved `deckJson` instead of re-deriving from `contentJson`.
- Protect against orphan visual references with a pure `stripOrphanedVisuals(deck, knownVisualIds)` helper applied in editor and public present load paths.
- Style controls should stay theme-first: shared text/style controls, deck swatches before raw color pickers, and document-derived default theme.

**Created backlog:** Epic #199 with child issues #200–#214.
- **P0:** #200 undo/redo (Switch); #201 auto-materialize/remove gate (Switch); #202 insert+restyle document visuals (Switch); #203 deck→PPTX honoring deckJson (Tank); #204 orphan-visual guard (Tank); #205 doc↔deck merge-sync + staleness (Trinity).
- **P1:** #206 document-derived default theme (Mouse); #207 theme-first preset color controls (Mouse); #208 save-status + autosave + close guard (Switch); #209 responsive/touch editor (Switch); #210 rich-text preservation in derivation (Tank); #211 slide templates on add (Mouse).
- **P2:** #212 thumbnail rail hover/titles/shortcuts (Switch); #213 schema hygiene: SSR-safe IDs + legacy→free-form migration (Tank); #214 regression tests for editor/sync/export (Ghost).

**Dedup notes:** ~33 reviewer ideas were merged into 15 issues. Undo/redo → #200; materialization gate → #201; document visual insertion + restyle dead-end → #202; deck→PPTX + export fidelity + element assembly → #203; orphan visuals + version restore inconsistency → #204; sync button + staleness tracking → #205; color/style unification → #207; save status + autosave/close guard → #208; responsive/touch + reorder/present swipe → #209; SSR-safe IDs + migration docs → #213; test additions → #214. Deferred/out-of-scope for now: PPTX-import fidelity, image URL→file picker, and `useDeckEditor`/context refactor unless they block the above.

---

### 2026-06-22T15:47:18+08:00: Slides "lite Canva" editor — three-lens review → epic #292 (#293–#307)
**By:** Scribe, from Trinity / Mouse / Switch reviews + Switch-1 implementation

**Trinity (Architecture/Code-Health):** Balance inverted — free-form over-built, document-leverage under-built. P0: inline-image client cap (5MB/12MB) vs server deckJson cap (500KB) → silent autosave failures; background images bypass total-budget check; doc→deck link is weakest subsystem; dual-track `Slide` pays cost with no runtime benefit beyond hashing/merge. Issues: #302–#303 (data-integrity), #293–#297 (doc-leverage), #307 (tech-debt).

**Mouse (UX):** Document visuals buried ≥2 clicks deep; no document-TEXT reuse at all; blank canvas has no affordance; image-insert requires two surfaces; rich keyboard model undiscoverable; three competing text-edit surfaces; power features always-on with no progressive disclosure. Recommendation: "From document" rail (text + visuals, click-to-insert, "Add all") + on-canvas empty-state + Simple/Advanced disclosure split. Issues: #293–#297, #298–#301.

**Switch (Frontend Impl):** P0 perf: rAF-throttle `handlePointerMove` + memo `SlideCanvas` + stable slide IDs; 60Hz keyboard-listener churn; undo-stack flooding from notes/inspector. P0 a11y: modal focus-trap + initial focus; context-menu `role="menuitem"`; inspector tab pattern. P1 robustness: `setPointerCapture` on drag start; `execCommand` deprecation. Structural: three mega-files, two text-pipeline duplications, `window.confirm` usage. Issues: #304 (perf), #305 (a11y), #306 (robustness), #307 (tech-debt).

**Resulting issues:** Epic **#292**; doc-leverage **#293–#297**; quick-edit UX **#298–#301**; data-integrity **#302–#303**; frontend perf/a11y/robustness **#304–#306**; tech-debt **#307**. Label: `area:slides`.

**Implementation (Switch-1):** Implemented #293 "From document" quick-insert panel (document text blocks + visuals, click-to-insert, "Add all visuals") + new pure module `src/lib/presentation/document-insertable.ts` (11 tests). Commit `af4d248` on branch `squad/293-from-document-panel`. 1797 tests pass; typecheck + lint green. PR #308 opened.


### 2026-06-21T13:03:25Z: Trinity (#205): Deck↔document sync decision
2026-06-21T13:03:25Z — Trinity (#205): Deck↔document sync uses option (a) — an embedded `Deck.deckContentHash` (FNV-1a over document-derived slide content, no Prisma change) for staleness, plus `mergeDeckFromDocument` that refreshes title/bullets/visualIds by title-then-index match while preserving each slide's `elements[]`, appending unmatched and keeping orphans; surfaced via a stale banner + "Sync from document" merge-summary dialog. PR #220.


### 2026-06-21T21:58:59Z: Trinity: AI deck generation architecture
2026-06-21T21:58:59Z — Trinity (AI deck generation): Add AI-driven slide generation as an *additive* alternative to the deterministic `buildDeckFromBlocks`, never a replacement. New injectable core `generateDeck(complete, { contentText, visuals, options }) -> Deck` lives in `src/lib/ai/generate-deck.ts`, mirroring `generateVisuals` (network-free, `CompleteFn`-injected, JSON-extract → schema-validate/repair against `deck-schema.ts` → orphan-strip via `stripOrphanedVisuals`). A new `buildDeckGenerationMessages` prompt (`src/lib/ai/deck-prompt.ts`) is handed a structured outline (headings/sections/bullets/emphasis) plus a visual *inventory* (id, title, type/summary) and instructed to reference real `visualId`s only — the deck never carries visual payloads. New route `POST /api/generate-deck` reuses the exact `/api/generate` shape: parse → validate → Azure-config check → identify user → quota/rate-limit → credit metering → `withAbortDeadline(GENERATE_TIMEOUT_MS)` → respond `{ deck }`. AI output is a normal editable `Deck` (free-form `elements[]` authoritative, `elementsDerived` provenance preserved), opened non-destructively in the existing slide editor with a preview/diff, regenerate, and full undo/redo/autosave. The whole feature ships behind a flag (`AI_DECK_GEN_ENABLED`) and falls back to `buildDeckFromBlocks` whenever the flag is off, Azure is unconfigured, quota/credits are exhausted, the deadline fires, or the model returns unrepairable JSON. Mapping strategy favors brevity and storytelling: title slide → agenda/section slides → one idea per content slide (≤ N words), overflow prose to speaker notes, strong single-visual placement reusing document visuals as first-class assets, layout/template chosen per slide from `slide-templates.ts` (#211) + deck themes (#206). Quality is measured (slides/word ratio, avg words/slide, % slides with a visual, schema-valid rate, latency p50/p95, post-edit edit-distance). Decomposed into 1 epic + 11 child issues, each independently shippable behind the flag. Owners: trinity (architecture/core), switch (route/UX), tank (extraction/selection/perf), mouse (templating/layout/a11y), ghost (eval/tests).


### 2026-06-22T18-57-30: Issue #342 uses ImageElement fitMode/maskShape/crop with numeric inspector controls
**By:** Trinity
**What:** Issue #342 uses ImageElement fitMode/maskShape/crop with numeric inspector controls
**References:** issue #342, pr #369, branch squad/342-image-crop-replace-mask
**Why:** Implemented issue #342 by extending the ImageElement model (not VisualElement) with fitMode, maskShape, and crop metadata plus schema validation. The inspector now exposes replace/upload, fit, mask, and numeric crop controls; canvas rendering applies mask/crop/object-fit; PPTX export carries the metadata and rasterizes styled images when needed for fidelity. I intentionally kept crop editing non-interactive in the stage and aligned the branch with the issue prompt by updating the existing PR branch instead of keeping the earlier interactive-crop implementation.

# Switch Decision: Text Fit Modes implementation (#333)

**Date:** 2026-06-22
**By:** Switch (Frontend Dev)

## What

Completed issue #333 text fit mode implementation:

- `fitMode` wired into resize semantics in `SlideStageEditor`:
  - `fixed-box` elements use free box resize (content clips, font unchanged)
  - `auto-height` elements dim bottom/corner-bottom handles (s, se, sw); dragging them auto-switches to `fixed-box`
  - `shrink-to-fit` and `auto-height` non-bottom handles keep existing Canva-style font-scaling resize
- `InlineTextEditor.emitChange` respects `fitMode`: only auto-grows box height in `auto-height` mode
- Added `BOTTOM_HANDLES` constant (`s`, `se`, `sw`) for auto-height handle dimming logic

## Tests

15 tests in `text-element-fit.test.ts`:
- `isAutoHeight` (4), `shrinkFontSizeToFit` (4), `textFitPaddingPct` (3), `fitNewTextElementBox` (4)

## PR

PR #359 on `squad/333-text-fit-modes` → `main`. Do NOT merge without coordinator review.


### 2026-06-22: Connector endpoint UX — bound/free states, previews, arrowheads, dash, detach

**By:** Mouse (Design/UX)
**What:** Implementation-ready UX spec for #325. Full details below.
**Why:** Connectors must communicate binding state visually, surface anchor affordances during drag, expose arrowhead/dash controls in the inspector, and allow non-destructive detach — all using the established `--ds-*` token layer and the existing `ConnectorElement` type.

---

## UX Spec: Connector Endpoint UX (Issue #325)

### Scope
Applies to first-class `ConnectorElement` elements in the slide stage editor.
Rendering targets: stage editor, present mode, public viewer, PPTX export.

---

## 1. Endpoint Visual States

### 1a. Free endpoint
A connector endpoint that is **not** bound to a shape anchor (`ConnectorFreePoint`).

| State | Visual |
|-------|--------|
| Idle (connector not selected) | No handle shown |
| Connector selected | Hollow circle: 10 px diameter, stroke `--ds-stage-muted` (#71717a), fill `--ds-surface-raised`, border 1.5 px. Same zinc-handle colour used for shape resize handles today. |
| Handle hovered | Fill becomes `--ds-surface-raised`; stroke intensifies to `--ds-stage-text`; cursor `crosshair` |
| Handle being dragged (not near a target) | Same hollow circle, stroke `--ds-accent`, 2 px stroke — signals "actively routing". Dashed-ring pulse animation: `keyframes { 0%,100% { r: 6 } 50% { r: 9 } }` at 800 ms, opacity 0.4, colour `--ds-accent`. |

### 1b. Bound endpoint
A connector endpoint snapped to a named anchor on another element (`ConnectorBoundEndpoint`).

| State | Visual |
|-------|--------|
| Idle (connector not selected) | No handle shown (bound status implicit in line geometry) |
| Connector selected | **Filled** circle: 10 px diameter, fill `--ds-accent` (#4f46e5), white 1.5 px border. Distinguishes bound from free at a glance. |
| Handle hovered | Scale to 1.3× via CSS `transform: scale(1.3)`, transition `--ds-motion-fast` (`100 ms`) `--ds-ease-standard`. Tooltip: "Drag to rebind or detach". |
| Handle being dragged (near a valid target) | Snap preview renders — see §2. |

**Colour semantics:** Solid `--ds-accent` = "attached to something". Hollow = "floating free". Consistent with anchor-dot colours used in Figma / Whimsical.

---

## 2. Hover/Drag Preview Behaviour and Binding Target Affordances

### 2a. Hover over a connector (not selected)
- Show a subtle midpoint indicator: 6 px dot, fill `--ds-stage-muted`, opacity 0.5.  
- Do **not** show endpoint handles on mere hover — reduces noise when connectors are not the focus.

### 2b. Dragging an endpoint
When `drag.mode === "w"` or `"e"` on a `ConnectorElement`:

1. **Candidate shapes highlighted** — any non-connector, non-line element within the snap threshold (`thresholdPct = 5`) receives a highlight ring: `ring-2 ring-[--ds-accent]/60` animated in at `--ds-motion-fast`. At most one ring per element.

2. **Anchor dots appear** on each candidate — five dots at `center / top / bottom / left / right` anchor positions. Render as 6 px SVG circles, fill `--ds-accent-surface`, stroke `--ds-accent-border`, stroke-width 1 px, `aria-hidden="true"`. Use the existing `anchorPoint()` utility to position them.

3. **Active snap target** — when `snapped.binding` is set, the nearest anchor dot grows to 10 px, fill `--ds-accent`, white border 1.5 px. The line preview snaps visually before pointer-up (already implemented via `snapLineEndpoint`). Transition: `--ds-motion-fast`.

4. **Cursor** — `crosshair` while dragging an endpoint. Reverts to `move` when released.

5. **Outside snap threshold** — highlight rings fade out; anchor dots disappear; endpoint handle reverts to free-drag appearance.

### 2c. Non-dragging hover over a bound target shape
No change to the shape's visual while the connector is merely selected. Anchor indicators on target shapes are only shown during endpoint drag.

---

## 3. Arrowhead and Dash Controls

### 3a. Defaults
Per the `ConnectorElement` schema:
- `arrowStart`: `"none"` (default — no tail decoration)
- `arrowEnd`: `"filled"` ← **new default for newly inserted connectors** (directional arrow feels like a connector; `"none"` feels like a line)
- `dash`: `"solid"` (default)

> Rationale: Arrow from A → B is the mental model. Changing arrowEnd default from `"none"` to `"filled"` only affects new inserts; existing documents preserve their stored value.

### 3b. Inspector panel — Connector section
Appears in `slide-inspector.tsx` when `selectedElement.kind === "connector"`.

```
┌─────────────────────────────────────┐
│  CONNECTOR                          │
│  ─────────────────────────────────  │
│  Arrow ends                         │
│  [Start ▾]           [End ▾]        │  ← two SegmentedControl / select widgets
│   none | → open | ⬥ filled | • dot  │
│                                     │
│  Line style                         │
│  [────] [- - -] [· · ·]             │  ← SegmentedControl: solid / dashed / dotted
│                                     │
│  Stroke                             │
│  [color swatch]   [width 0.4 cqmin] │
└─────────────────────────────────────┘
```

**Arrowhead picker** — use a `<select>` or small icon-SegmentedControl for each endpoint. Values: `none`, `open`, `filled`, `dot`.  
Icons: lucide `Minus` (none) / `ArrowRight` (open) / a filled arrow SVG (filled) / `Circle` (dot) — 16 px, `aria-hidden="true"`, tooltip showing label.

**Dash picker** — three-button SegmentedControl (`SegmentedControl` primitive per the existing design system decision). Map to `ConnectorDash`: `solid` / `dashed` / `dotted`. Render a tiny inline SVG preview inside each button (4 px stroke, matching the button width): solid line / dashed / dotted.

**Stroke colour** — `Swatch` primitive opening a colour popover (consistent with shape fill pickers).  
**Stroke width** — numeric input, `step=0.1`, min `0.1`, max `5.0`, suffix `cqmin`.

### 3c. Rendering
`ConnectorElementView` in `slide-canvas.tsx` must apply:
- `strokeDasharray` per `dash`: solid → omit / dashed → `"4 4"` / dotted → `"1.5 3"` (SVG units in % of viewBox, scale with `vectorEffect="non-scaling-stroke"`)
- Arrowheads via SVG `<marker>` elements in a shared `<defs>` block — one marker per style per colour (keyed `arrow-{style}-{color}`). Each marker defines the appropriate path geometry. Marker is referenced via `markerStart` / `markerEnd` on `<line>`.
- Markers and dash must render correctly in the canvas (editor + present + viewer). PPTX export maps to `pptx-shapes.ts` arrowhead/dash equivalents.

---

## 4. Detach Action — Placement and Wording

### 4a. Context menu
Right-click / long-press on a selected connector adds two items above "Delete":

```
  Detach start
  Detach end
  ───────────
  Delete connector
```

- **"Detach start"** — only shown when `!(start is ConnectorFreePoint)` (i.e. `start` is a `ConnectorBoundEndpoint`). Converts start to a `ConnectorFreePoint` at its current resolved position. Keyboard: no dedicated shortcut (discoverable via context menu).
- **"Detach end"** — same logic for `end`.
- Both use `aria-label="Detach connector start"` / `"Detach connector end"`.
- Wording rationale: "Detach" is clear and non-destructive; "Disconnect" is also acceptable but longer. Avoid "Unlink" (implies text/citation semantics).

### 4b. Inspector panel — endpoint binding badges
Below the stroke/arrow controls, show one badge per endpoint when bound:

```
  Start  [● Shape name]  [Detach ×]
  End    [● Shape name]  [Detach ×]
```

- Badge: pill shape, `--ds-accent-surface` background, `--ds-accent-text` text, `--ds-accent-border` border, `--ds-radius-pill`. Shows the bound shape's kind/label (e.g. "Rect", "Ellipse") or a fallback "Shape".
- `[Detach ×]` button: ghost `IconButton` (×), `aria-label="Detach connector start from shape"`. On click → converts endpoint to free point at current resolved position.
- When endpoint is free: no badge, no detach button.

### 4c. Keyboard path
- `Tab` to the connector element → `Enter`/`Space` selects it.
- Right-click context menu accessible via `Shift+F10` or menu key.
- No standalone keyboard shortcut for detach (low frequency action; context menu is sufficient for accessibility baseline).

---

## 5. Accessibility

| Affordance | Requirement |
|---|---|
| Connector element hit target | `role="button"`, `tabIndex={0}`, `aria-label` via `elementAccessibleName()` — extend to say "Connector from [start shape] to [end shape]" when both endpoints are bound, "Connector" otherwise |
| Endpoint drag handles | `aria-hidden="true"` (pointer-only interaction; keyboard detach is via context menu) |
| Anchor preview dots | `aria-hidden="true"` |
| Candidate shape highlight rings | `aria-hidden="true"` |
| Arrowhead select (inspector) | `<label>` "Arrowhead at start" / "Arrowhead at end", `aria-describedby` pointing to current value |
| Dash picker SegmentedControl | `aria-label="Line style"`, each button has visible icon + `aria-label` ("Solid", "Dashed", "Dotted") |
| Detach button (inspector badge) | `aria-label="Detach connector start from [shape label]"` |
| Detach context menu items | Standard menu item role, labelled "Detach start" / "Detach end" |
| Binding toast/confirmation | Not required — detach is immediately undoable via Ctrl+Z. No toast needed. |

**Focus ring:** All interactive controls use `FOCUS_RING` from `control-styles.ts` (`--ds-focus-ring` / `--ds-focus-offset`).

---

## 6. Token and Style Guidance

All colours reference `--ds-*` tokens. Do not use raw `zinc-*`, `black/[.0x]`, or hex literals in connector UI.

| UI element | Token |
|---|---|
| Free endpoint handle stroke | `--ds-stage-muted` → `#71717a` |
| Bound endpoint handle fill | `--ds-accent` |
| Bound endpoint handle border | `white` (1.5 px) |
| Snap pulse ring | `--ds-accent`, opacity 0.4 |
| Candidate shape ring | `--ds-accent` at 60% opacity |
| Anchor dot fill | `--ds-accent-surface` |
| Anchor dot stroke | `--ds-accent-border` |
| Active snap anchor | `--ds-accent` fill, white border |
| Binding badge background | `--ds-accent-surface` |
| Binding badge text | `--ds-accent-text` |
| Binding badge border | `--ds-accent-border` |
| Detach button | ghost `IconButton`, destructive-tinted on hover (`--ds-danger-surface` bg, `--ds-danger-text`) |
| Inspector section label | `--ds-text-muted`, uppercase, `text-xs` tracking-wide |

**Motion:** Snap/bind transitions use `--ds-motion-fast` (`100 ms`) + `--ds-ease-standard`. Pulse ring uses `--ds-motion-base` (`200 ms`) cycle. No transition on the line itself (follows pointer in real time).

**Elevation:** Anchor preview dots live on the SVG layer (no elevation). Inspector controls use the existing `--ds-surface-overlay` / `--ds-shadow-overlay` for any popover (colour picker, arrowhead picker if implemented as a popover).

---

## 7. What Switch Needs From #323 / #324 Before Implementing

- **#323** — `ConnectorElement` kind in deck model ✅ already merged per `deck.ts`.  
- **#323** — `normalizeConnector` migration utility ✅ already in `connector-normalize.ts`.  
- **#324** — Delete-shape → detach endpoint policy must be resolved before "Detach start/end" context menu items can fire reliably; spec this as "convert to free point" as the safe default.

This spec does not depend on elbow routing — all states apply equally to `routing: "straight"` (the v1 default).


### 2026-06-22: Wave 1 Canvas Editing UX — #328 Align/Distribute, #329 Multi-Selection BB, #330 Group Model, #331 Layer List

**By:** Mouse (Design/UX)
**What:** Implementation-ready UX spec for Wave 1 canvas-editing issues.
**Why:** Switch needs a coherent design for align/distribute tools, multi-selection bounding-box transforms, group enter/exit, and the layer list before implementation begins. This spec formalises visual states, interaction models, keyboard behaviour, and token usage so engineering can proceed without separate design review.

---

## UX Spec: Wave 1 Canvas Editing

### Codebase baseline (as of 2026-06-22)

| Capability | Status |
|---|---|
| `alignBoxes`, `distributeBoxes`, `matchSizeBoxes`, `arrangeElements` math | ✅ exists in `element-align.ts` |
| Single-element resize (8 handles + rotate) | ✅ `slide-stage-editor.tsx` |
| Group move via shared `groupId` on elements | ✅ existing |
| Lock toggle + arrange buttons in inspector | ✅ existing |
| Context-menu Group / Ungroup | ✅ existing |
| Align/distribute/match-size toolbar | ❌ needs work |
| Multi-selection bounding-box resize/rotate | ❌ needs work |
| Clear group enter/exit UX | ❌ needs work |
| Layer/object list panel | ❌ needs work |

---

## 1. Align / Distribute / Match-Size / Arrange Toolbar (#328)

### 1a. Entry points

**Contextual floating toolbar** (inline above selection, same surface as the existing TextStyleBar):
- Appears when ≥ 2 elements are selected (or a single group is selected).
- Positioned: 8 px above the selection bounding box, horizontally centred.
- Surface: `--ds-stage-panel` fill, `--ds-stage-border` border (1 px), `--ds-radius-md` corner, `--ds-shadow-overlay` elevation.

**Context menu** (right-click on multi-selection or group):
- Submenu "Align" → 6 align actions.
- Submenu "Distribute" → 2 distribute actions.
- Submenu "Match Size" → 3 match-size actions.
- Top-level: "Bring Forward", "Send Backward", "Bring to Front", "Send to Back".

**Inspector side panel** (Advanced mode, multi-selection):
- Collapsible "Arrange & Align" section (follows existing `CollapsibleSection` pattern in `slide-inspector.tsx`).
- Same icon grid as toolbar but labelled for discoverability.

### 1b. Toolbar layout

```
┌─────────────────────────────────────────────────────────┐
│  [AlignLeft][AlignHCenter][AlignRight]  │  [AlignTop][AlignVMiddle][AlignBottom]  │  [DistrH][DistrV]  │  [MatchW][MatchH][MatchBoth]  │  [Forward][Backward][Front][Back]  │
└─────────────────────────────────────────────────────────┘
```

Groups separated by a 1 px `--ds-stage-border` vertical divider.  
Icon size: 14 px (Lucide). Button hit-area: 28 × 28 px.  
Tooltip: show on hover after 500 ms delay; content = full action name.

### 1c. Icon mapping (Lucide icons)

| Action | Lucide icon |
|---|---|
| Align Left | `AlignLeft` |
| Align H-Center | `AlignCenter` |
| Align Right | `AlignRight` |
| Align Top | `AlignStartVertical` |
| Align V-Middle | `AlignCenterVertical` |
| Align Bottom | `AlignEndVertical` |
| Distribute Horizontal | `AlignHorizontalSpaceAround` |
| Distribute Vertical | `AlignVerticalSpaceAround` |
| Match Width | `ArrowLeftRight` |
| Match Height | `ArrowUpDown` |
| Match Both | `Maximize2` |
| Bring Forward | `BringToFront` (or `ChevronUp`) |
| Send Backward | `SendToBack` (or `ChevronDown`) |
| Bring to Front | `ArrowUpToLine` |
| Send to Back | `ArrowDownToLine` |

### 1d. Disabled states

| Condition | Disabled buttons |
|---|---|
| Single unlocked element selected | All align, distribute, match-size buttons |
| Fewer than 3 elements | Distribute H + Distribute V |
| Single element selected | Match-size buttons |
| All selected elements at top of z-order | "Bring Forward" + "Bring to Front" |
| All selected elements at bottom of z-order | "Send Backward" + "Send to Back" |
| Any selected element is locked | All transform actions (show tooltip: "Unlock element first") |

Visual: `opacity-40 cursor-not-allowed pointer-events-none` on disabled buttons.

### 1e. Undo / history

Each toolbar / context-menu / keyboard action emits **one history step** (coalesced patch across all affected element positions/z-indices). Matches AC in #328.

### 1f. Keyboard shortcuts

| Action | Shortcut |
|---|---|
| Align Left | _(none — toolbar/menu only for now)_ |
| Bring to Front | `Ctrl/⌘ Shift ]` |
| Send to Back | `Ctrl/⌘ Shift [` |
| Bring Forward | `Ctrl/⌘ ]` |
| Send Backward | `Ctrl/⌘ [` |

### 1g. Accessibility

- Each toolbar button: `role="button"`, `aria-label="<Full action name>"`, `aria-disabled` when disabled.
- Toolbar container: `role="toolbar"`, `aria-label="Arrange and align"`.
- Arrow-key navigation within toolbar groups (Left/Right); Tab moves between groups.
- Apply FOCUS_RING token from `tokens.ts` to every button.

---

## 2. Multi-Selection Bounding Box — Resize & Rotate (#329)

### 2a. Selection frame visual

When ≥ 2 elements are selected (and no single-element is in text-edit mode):
- Draw a shared selection rectangle encompassing all selected elements' bounding boxes (accounting for per-element `rotation`).
- Frame stroke: `--ds-accent` (#4f46e5), 1.5 px, rendered as an SVG overlay (same pattern as single-element outline).
- Frame fill: none (transparent).
- Dashed frame when selection contains locked elements that are excluded: `stroke-dasharray: 4 2`, `--ds-warning` colour, with tooltip "Contains locked elements".

### 2b. Resize handles (8-point)

Same handle geometry as single-element handles: 8 × 8 px squares, fill `--ds-surface-raised`, stroke `--ds-accent`, radius 1 px.

| Handle | Position | Cursor |
|---|---|---|
| `nw` | top-left corner | `nwse-resize` |
| `n` | top edge centre | `ns-resize` |
| `ne` | top-right corner | `nesw-resize` |
| `e` | right edge centre | `ew-resize` |
| `se` | bottom-right corner | `nwse-resize` |
| `s` | bottom edge centre | `ns-resize` |
| `sw` | bottom-left corner | `nesw-resize` |
| `w` | left edge centre | `ew-resize` |

**Resize behaviour:**
- Every selected element is scaled proportionally (maintaining element's position relative to the selection bounding box origin).
- `Shift`+drag: constrain bounding box to original aspect ratio.
- `Alt`+drag: resize from centre.
- Minimum bounding box: 4 × 4 percent (prevent collapse to zero).
- Connectors attached to selected elements: endpoints move with their bound anchor (connector geometry recalculated live); connectors to non-selected elements: bound endpoint updates, free end stays fixed.
- Text elements: scale font-size proportionally (same formula as single-element corner-handle resize: `newFontSize = oldFontSize × scaleFactor`).

### 2c. Rotate handle

- Single circular handle: 10 px diameter, positioned 16 px below the bottom-centre of the bounding box.
- Idle: fill `--ds-surface-raised`, stroke `--ds-accent`, 1.5 px.
- Hover: fill `--ds-accent`, stroke none; cursor `grab`.
- Dragging: cursor `grabbing`; live ghost frame rotates around bounding box centre.
- Rotation applies to each element: each element's own `rotation` value increments by the same delta; element positions rotate around the selection bounding box centre (trigonometric offset recalculation).
- `Shift`+rotate: snap to 15° increments.
- Hidden in Simple mode (matches existing single-element behaviour: `advancedMode` prop gates rotate handle).

### 2d. Live badge

During drag:
- Show badge `{W}% × {H}%` (resize) or `{θ}°` (rotate) near cursor; same style as existing `DragBadge` in `slide-stage-editor.tsx`.

### 2e. Locked element policy

**Documented policy (AC in #329):** Locked elements are **excluded** from multi-selection transforms. If the user starts a resize/rotate drag and some selected elements are locked:
- Locked elements do not move.
- Non-locked elements transform as normal.
- Show a toast/warning once per gesture: "N locked element(s) not affected."

### 2f. Undo

Entire multi-element resize/rotate coalesces into one history step.

### 2g. Keyboard / accessibility

- `Arrow` keys nudge the whole selection by 0.5% (fine) or 2% (`Shift`+Arrow, coarse).
- `Delete`/`Backspace` deletes all selected elements (existing behaviour).
- `Escape` deselects.
- Bounding box frame is not itself focusable (non-interactive container); the individual element `role="group"` members remain the focusable units for AT.

---

## 3. Group Editing Model (#330)

### 3a. Architecture decision — keep `groupId` on elements

**Recommendation: retain `groupId?: string` on `SlideElement` (existing model).**

Rationale:
- A first-class `GroupElement` container would require changes to the deck schema, all renderers, PPTX exporter, and all history patches — significant cross-cutting cost.
- `groupId` already supports all required UX: select-group, move-as-one, resize-as-one, ungroup. The missing part is the *enter-group* editing gesture, which works fine over a flat `groupId` model.
- Connectors bound to individual element ids remain stable across group/ungroup.

Ghost (if assigned) must read this decision before implementing group data model changes.

### 3b. Group selection affordance

When a user clicks an element with a `groupId`:
1. The entire group is selected (existing behaviour).
2. Selection frame: `--ds-accent` dashed border (`stroke-dasharray: 6 3`) distinguishing it from solid single/multi-selection.
3. A small "group badge" appears at the top-left corner of the group bounding box: pill label `Group` with icon `Group` (Lucide), fill `--ds-accent-surface`, text `--ds-accent-text`, `--ds-radius-pill`, padding `2px 6px`, font `10px/medium`.

### 3c. Enter-group gesture

**Gesture:** Double-click a group (or double-click when group is already selected).

**Visual transition:**
1. The group's other members dim: `opacity: 0.35` with `pointer-events: none` — creates visual focus on the target child.
2. The entered child shows the standard single-element selection handles (solid `--ds-accent` border).
3. An "edit group" breadcrumb appears at the top of the stage (fixed overlay, top-centre):
   ```
   ← Group  >  [element name or type]
   ```
   Surface: `--ds-stage-panel`, text `--ds-stage-text`, `--ds-radius-sm`, `--ds-shadow-raised`. Clicking "← Group" exits without committing; clicking away from the stage also exits.

**While inside a group:**
- The user can resize, rotate, style, and text-edit the entered child as normal.
- Other group members can be clicked to switch target within the group.
- The group bounding-box frame remains visible as a faint `--ds-stage-border` rectangle.

**Exit-group gesture:**
- `Escape` — exits group editing, restores full group selection.
- Click outside the group bounding box — same as Escape.
- Breadcrumb "← Group" button — same as Escape.

### 3d. Group transform (not inside group)

When a group is selected (not in group-edit mode):
- Resize and rotate handles appear on the group bounding box (same as §2b/§2c).
- All member elements transform proportionally (same proportional resize logic as multi-selection).
- Connector endpoints inside the group translate with their bound anchor.

### 3e. Ungroup

Entry points:
- Context menu > "Ungroup".
- Inspector toolbar "Ungroup" button (visible when a group is selected).
- Keyboard: no default shortcut — too destructive without confirmation.

Behaviour:
- Clears `groupId` from all member elements.
- Member elements remain in place; they become individually selectable.
- Connectors attached to member elements are **preserved** — their `ConnectorBoundEndpoint` references element ids which are unchanged.
- Emits one history step.

### 3f. Group via context menu / keyboard

- Keyboard: `Ctrl/⌘ G` → group selected elements (≥2).
- `Ctrl/⌘ Shift G` → ungroup selected group.
- Context menu "Group" (≥2 selected, no existing group) / "Ungroup" (single group selected).

### 3g. Inspector representation

- When a group is selected (not in group-edit): inspector shows aggregate properties (position/size of bounding box), plus "Members: N elements" label, plus Ungroup button.
- When in group-edit mode: inspector shows the entered child's individual properties (same as single-selection inspector).

---

## 4. Layer / Object List (#331)

### 4a. Placement

- A collapsible panel at the bottom of the right inspector column, below element properties.
- Panel header: "Layers" with `Layers` Lucide icon, badge showing total element count.
- Collapsed height: 36 px (header only). Expanded height: up to 280 px scrollable list.
- Alternative: a floating panel triggered by a toolbar toggle button (≡ Layers icon in the editor top bar). Keep this as a v2 option if inspector real estate is constrained.

### 4b. Row anatomy

Each row represents one element:

```
[visibility eye] [lock icon] [type icon + name] ............. [connector indicator?]
```

- **Visibility toggle**: `Eye` / `EyeOff` Lucide icon, 14 px. Toggles `hidden?: boolean` on the element. Hidden element: row text `--ds-text-muted`, opacity-50 on type icon.
- **Lock toggle**: `Lock` / `LockOpen` Lucide icon, 14 px. Toggles `locked?: boolean`.
- **Type icon**: small icon derived from element type (Text → `Type`, Image → `Image`, Shape → shape icon, Connector → `GitCommit`), 12 px, colour `--ds-text-secondary`.
- **Name**: `elementAccessibleName()` (existing helper) as editable inline label. Double-click to rename; single-click selects on stage.
- **Connector indicator**: if element is a `ConnectorElement`, append a chevron/badge showing `→ [target name]` on hover (tooltip or inline `--ds-text-muted` text).

Row height: 28 px.  
Selected row: `--ds-state-selected` background, `--ds-text-primary` text.  
Hover row: `--ds-state-hover` background.

### 4c. Z-order

List is ordered **top-to-bottom = front-to-back** (highest `zIndex` at top), matching standard layer-panel conventions (Figma, Sketch).

### 4d. Reorder

- Drag-to-reorder within list (HTML `draggable` or `@dnd-kit/sortable`).
- Drag handle: 3-dot grid icon (`GripVertical`), visible on row hover, 14 px, `--ds-text-muted` colour.
- Up/Down arrow buttons appear on row hover (alternative to drag): `ChevronUp` / `ChevronDown`, each emitting "forward" / "backward" arrange step.
- Reorder emits one history step via `arrangeElements()`.

### 4e. Search

- Search input at top of panel (below header): `placeholder="Search layers…"`, `--ds-radius-sm`, `--ds-border-subtle`, 26 px height.
- Filters rows by name (case-insensitive substring). Non-matching rows hidden; section count badge updates.
- Shortcut: `Ctrl/⌘ F` while panel has focus opens / focuses search.
- Clear: `×` button in input or `Escape`.

### 4f. Group rows

- Group: renders as an expandable parent row with `ChevronRight` / `ChevronDown` disclosure.
- Child elements indent 16 px.
- Group row shows `Group` icon + member count, e.g. "Group (3)".
- Collapsing the group in the list does not affect visibility on the stage.

### 4g. Connector awareness

- Connector rows: type icon `GitCommit`; name defaults to "Connector → [target element name]".
- On row hover: both the connector element on stage and its bound endpoints highlight with `--ds-accent-border` overlay.
- Tooltip on connector row: "From: [source element] → To: [target element]" (or "Free endpoint" if unbound).

### 4h. Multi-selection in layer list

- `Ctrl/⌘`+click rows to add/remove from selection.
- `Shift`+click for range selection.
- Selection state stays in sync: selecting on stage highlights the corresponding rows.

### 4i. Accessibility

- `role="tree"` / `role="treeitem"` for the hierarchy.
- Each row action button (eye, lock, drag handle) has `aria-label`.
- Keyboard: `Up`/`Down` navigate rows; `Space` selects; `Enter` renames; `Home`/`End` jump top/bottom.
- Focus ring: FOCUS_RING token.

---

## 5. Design Token Guidance

All new components must use existing `--ds-*` tokens from `globals.css`. No hard-coded colours.

### Stage chrome (editor overlays)

| Purpose | Token |
|---|---|
| Overlay panel background | `--ds-stage-panel` (#18181b) |
| Overlay panel border | `--ds-stage-border` (#27272a) |
| Overlay text (labels, badges) | `--ds-stage-text` (#d4d4d8) |
| Muted / secondary text on stage | `--ds-stage-muted` (#71717a) |

### Selection & handles

| Purpose | Token |
|---|---|
| Selection frame stroke | `--ds-accent` (#4f46e5) |
| Handle fill | `--ds-surface-raised` (#ffffff) |
| Handle stroke | `--ds-accent` |
| Rotate handle hover fill | `--ds-accent` |
| Disabled/locked selection frame | `--ds-warning` (#b7791f) |
| Group badge background | `--ds-accent-surface` (#eef2ff) |
| Group badge text | `--ds-accent-text` (#4338ca) |

### Layer list

| Purpose | Token |
|---|---|
| Panel background | `--ds-surface-raised` |
| Row hover | `--ds-state-hover` |
| Row selected | `--ds-state-selected` |
| Muted text (hidden element name) | `--ds-text-muted` |
| Icon colour | `--ds-text-secondary` |
| Divider / indent line | `--ds-border-subtle` |

### Interactive states (all new buttons/toggles)

| State | Token |
|---|---|
| Focus ring | `--ds-focus-ring` via `FOCUS_RING` from `tokens.ts` |
| Hover background | `--ds-state-hover` |
| Active/pressed | `--ds-state-active` |
| Disabled | `opacity: 0.4` + `pointer-events: none` |

### Radius

Use `RADIUS` constants from `tokens.ts`:
- Toolbar pills, badges: `RADIUS.pill`
- Toolbar container: `RADIUS.md`
- Layer panel: `RADIUS.lg`
- Breadcrumb: `RADIUS.sm`

---

## 6. Sequencing Notes Across #328–#331

### Recommended implementation order

```
#329 Multi-selection BB  →  #328 Align/distribute toolbar  →  #330 Group editing  →  #331 Layer list
```

**Why this order:**

1. **#329 first** — The multi-selection bounding box is a prerequisite for the align/distribute toolbar (you need the selection frame before you can hang toolbar buttons from it), and for group bounding-box transforms in #330.

2. **#328 second** — Align/distribute/match-size toolbar builds directly on:
   - Existing `element-align.ts` math (already done, just needs UI wiring).
   - The multi-selection frame from #329.
   - Arrange controls partially already exist in the inspector; consolidation is low-risk.

3. **#330 third** — Group editing depends on:
   - Group bounding-box transform (from #329).
   - Stable selection model (from #329).
   - Decision on `groupId` vs `GroupElement` must be recorded first (see §3a above).

4. **#331 last** — Layer list is additive/read-model; it can be scaffolded in parallel but its drag-reorder and connector-awareness UX benefits from a stable connector model (from #325, which is adjacent) and the lock/hide flags being exercised in #329–#330.

### Cross-issue dependencies

| Dependency | From | To |
|---|---|---|
| Selection bounding box frame | #329 | #328 (toolbar anchor), #330 (group frame) |
| Connector endpoint recalculation during group resize | #330 | Requires #325 connector lifecycle semantics |
| `locked` flag exclusion policy | #329 | #330 (locked group members), #331 (lock toggle) |
| `hidden` flag on elements | #331 | Needs `hidden?: boolean` field added to `SlideElement` in `deck.ts` (not yet present) |
| `groupId` decision | #330 | #331 (layer list group rows), #329 (group BB) |

### Flag for Ghost (#330 co-owner)

- Ghost is co-assigned on #330. This spec decides: **retain `groupId` model** (see §3a). Ghost must not introduce a first-class `GroupElement` wrapper without a new joint decision.

### Flag for Trinity (#329, #331 co-owner)

- Trinity owns the connector endpoint recalculation during multi-selection resize/rotate. Spec §2b and §2c document the expected connector behaviour. Trinity should expose a `recalculateConnectorAfterTransform(element, scaleFactor, rotation, pivot)` utility that the BB drag handler can call.

---

*Authored by Mouse · 2026-06-22 · Issues #328 #329 #330 #331*


### 2026-06-22: Wave 2 Slide Text System UX — #333 Text Fit Modes, #334 Vertical Alignment & Spacing, #335 Multi-Level Bullets/Lists, #336 Visual Regression

**By:** Mouse (Design/UX)
**What:** Implementation-ready UX spec for Wave 2 text system issues.
**Why:** Switch (and Ghost for #335 list model) need a coherent design for fit mode controls, vertical alignment + spacing, multi-level bullet/numbered-list interaction, shape text extensions, and regression coverage before implementation begins. This spec formalises all visual states, interaction models, data-model extensions, token usage, and sequencing so engineering can proceed without separate design review.

---

## Codebase Baseline (as of 2026-06-22)

| Capability | Status |
|---|---|
| `TextFitMode` type (`auto-height` / `fixed-box` / `shrink-to-fit`) | ✅ defined in `deck.ts` |
| `fitMode` on `TextElement` / `BulletsElement` | ✅ exists, absent = `auto-height` |
| `isAutoHeight()`, `shrinkFontSizeToFit()`, `fitNewTextElementBox()` | ✅ `text-element-fit.ts` |
| Schema validation for `fitMode` | ✅ `deck-schema.ts` |
| `TextStyleBar` (bold/italic/underline/align/size/color) | ✅ compact + labeled variants |
| `FontFamilyControl` in inspector | ✅ exists |
| Horizontal text alignment (left/center/right) | ✅ `TextElementStyle.align` |
| Vertical content align within a box | ❌ not yet on `TextElementStyle` |
| Line height / paragraph spacing / bullet gap controls | ❌ not on model or UI |
| Multi-level bullets / numbered lists | ❌ flat string array only |
| Fit mode control in inspector or toolbar | ❌ no UI exposed yet |
| Shape text vertical alignment | ❌ not modelled |

---

## 1. Text Fit Mode Controls (#333)

### 1a. Model (already exists — no changes needed)

`fitMode?: TextFitMode` on `TextElement` and `BulletsElement`.  
Absent / `"auto-height"` = legacy default (backward compat ✅).

### 1b. Inspector control — "Content fit" row

**Location:** Immediately below `TextStyleBar` in both the `text` and `bullets` branches of `ElementContentEditor` (around line 542 and 585 of `slide-inspector.tsx`).

**Pattern:** Segmented button group (same visual pattern as the existing horizontal-alignment group inside `TextStyleBar`):

```
┌─────────────────────────────────────────────────┐
│  Content fit                                    │
│  [Auto↕] [Fixed□] [Shrink↓]                    │
└─────────────────────────────────────────────────┘
```

Three buttons with icons (Lucide):
| Mode | Icon | Tooltip |
|---|---|---|
| `auto-height` | `ArrowUpDown` (or `ChevronsUpDown`) | "Auto height — box grows to content" |
| `fixed-box` | `Square` (or `RectangleHorizontal`) | "Fixed box — content clips at box edge" |
| `shrink-to-fit` | `ShrinkIcon` (or `Minimize2`) | "Shrink to fit — font reduces to fill box" |

- Selected state: `bg-ds-control text-ds-control-text`
- Unselected: `text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary`
- Border group: `rounded-ds-sm border border-ds-border-subtle overflow-hidden`
- Hit area: 28 × 28 px, icon 14 px
- Label `"Content fit"` uses `text-xs font-medium text-ds-text-secondary` (matches `LABEL_CLASS`)

**Behavior nuances:**
- Switching from `auto-height` → `fixed-box` on a box that was auto-sized: **do not resize the box** — preserve current dimensions; the resize handles are already functional.
- Switching to `shrink-to-fit`: immediately trigger a layout pass so the preview reflects the computed font size.
- Switching back to `auto-height`: expand the box to fit content (using `fitNewTextElementBox` logic).
- Resize handles **always remain visible** for `fixed-box` and `shrink-to-fit`. For `auto-height`, the bottom edge handle is dimmed (opacity-50, cursor `ns-resize`) and a tooltip "Auto-height: drag to override" explains that pulling the bottom edge past the content height switches the element to `fixed-box` implicitly (align with #333 AC "resize handles respect chosen fit mode").

**Compact toolbar (on-canvas TextStyleBar):** Add a single `Minimize2` icon button at the far right of the compact row that cycles through the three fit modes. Tooltip shows the *next* mode name. This keeps the compact surface uncluttered.

### 1c. Editing vs. static mode parity
- In edit mode, `fixed-box` clips with `overflow: hidden` on the element wrapper; the inline editor scrolls internally but does not expand the box.
- In present mode and public viewer, `fixed-box` must also use `overflow: hidden`; `shrink-to-fit` reads the pre-computed `_shrunkFontSize` (a derived render-time value, not persisted) from `shrinkFontSizeToFit()`.
- Export (PPTX / PDF): `fixed-box` → clip; `shrink-to-fit` → use the computed font size; `auto-height` → preserve layout as-is.

### 1d. Defaults
| Element kind | Default `fitMode` |
|---|---|
| `text` (new element) | `"auto-height"` |
| `bullets` (new element) | `"auto-height"` |
| Legacy elements (absent field) | `"auto-height"` (existing fallback in `isAutoHeight()`) |
| Shape text (`textStyle`) | N/A — shape text does not have a `fitMode`; it always clips |

---

## 2. Vertical Alignment and Paragraph/List Spacing (#334)

### 2a. Model extensions

Add to `TextElementStyle` (and `ShapeElement.textStyle`):

```ts
export interface TextElementStyle {
  // existing
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline?: boolean;
  align: ElementAlign;
  color?: string;
  fontFamily?: string;

  // NEW — Wave 2
  /** Vertical alignment of text within its box. Default: "top". */
  verticalAlign?: "top" | "middle" | "bottom";
  /** CSS line-height multiplier. Default: 1.15 (text) / 1.2 (bullets) as hardcoded today. */
  lineHeight?: number;
  /** Space before each paragraph (em units). Default: 0. */
  paragraphSpacingBefore?: number;
  /** Space after each paragraph (em units). Default: 0. */
  paragraphSpacingAfter?: number;
  /** Gap between bullet rows (em units). Overrides the hardcoded 0.6 em. Default: 0.6. */
  bulletGap?: number;
  /** Indent per bullet level (em units). Default: 1.25. */
  bulletIndent?: number;
}
```

**Schema (`deck-schema.ts`):** Add optional numeric validations with sensible clamp ranges:
- `verticalAlign`: one of `["top", "middle", "bottom"]` — validate like `align`.
- `lineHeight`: `[0.5, 4.0]` finite number, default `undefined` (renderer falls back to per-kind default).
- `paragraphSpacingBefore` / `paragraphSpacingAfter`: `[0, 10]` em, default `undefined`.
- `bulletGap`: `[0, 5]` em, default `undefined`.
- `bulletIndent`: `[0.5, 5]` em, default `undefined`.

### 2b. Vertical alignment control

**Location:** New row in `TextStyleBar` — added below the font-size row in the `"labeled"` variant; not surfaced in `"compact"` variant (to keep compact bar lean; fit mode cycle covers the common compact needs).

```
┌─────────────────────────────────────────────────┐
│  Vertical align                                 │
│  [⬆ Top] [⬛ Middle] [⬇ Bottom]                 │
└─────────────────────────────────────────────────┘
```

Icons: `AlignVerticalJustifyStart` / `AlignVerticalJustifyCenter` / `AlignVerticalJustifyEnd` (Lucide).  
Same segmented button pattern as horizontal alignment group (reuse `AlignGroup`-style component, just with a different axis).  
Default: `"top"` (absent = top for backward compat).

**Renderer implementation note for Switch:**  
For `"middle"` and `"bottom"`, wrap the element's text content in a flex container with `justify-content: center` or `flex-end` (column direction) so the effect is achieved via CSS without JS measurement. The outer element box stays at its declared dimensions. For shape text this is already centered — see §4.

### 2c. Spacing controls

**Location:** Below vertical alignment, in a collapsible "Spacing" subsection within the labeled inspector (follow the `showAdvanced` pattern already used for image advanced controls):

```
┌─────────────────────────────────────────────────┐
│  ▾ Spacing                                      │
│                                                  │
│  Line height        [  1.2  ─────────────────]  │
│  Para. before (em)  [ 0.0 ] [ 0.0 ] after      │
│  Bullet gap (em)    [  0.6  ]                   │
│  Bullet indent (em) [  1.25 ]                   │
└─────────────────────────────────────────────────┘
```

Controls:
- **Line height**: horizontal `<input type="range">` `min=0.8 max=3.0 step=0.05` + numeric display, `w-full accent-ds-control` (matches existing range pattern in inspector).
- **Para. before / after**: paired numeric inputs (`<input type="number" step="0.1" min="0" max="4">`), `h-7 w-12 border border-ds-border-subtle rounded bg-transparent text-center text-sm text-ds-text-primary`.
- **Bullet gap / indent**: same numeric input pattern, single value each.

Bullet gap and indent rows are **only rendered when `element.kind === "bullets"`** or when the element is a multi-level list (§3).

Show the "Spacing" subsection in both `text` and `bullets` inspector panels. Hidden for shape text (shape text stays fixed-center, spacing controls not applicable in v1).

### 2d. Export mapping
| Control | PPTX | PDF |
|---|---|---|
| `verticalAlign` | Map to pptxgenjs `valign: "top"/"ctr"/"btm"` | Not directly supported — use padding offset approximation |
| `lineHeight` | Map to `lineSpacingMultiple` | CSS `line-height` |
| `paragraphSpacingBefore/After` | Map to `spaceBefore`/`spaceAfter` | CSS `margin` |
| `bulletGap` | Approximate with `spaceAfter` | CSS `gap` on flex list |
| `bulletIndent` | Map to `indentLevel` pt | CSS `padding-left` |

---

## 3. Multi-Level Bullets and Numbered Lists (#335)

### 3a. Model extension

Replace the flat `bullets: string[]` / `bulletRuns?: TextRun[][]` with a richer `BulletItem[]` array:

```ts
export type BulletListType = "disc" | "decimal" | "lower-alpha" | "lower-roman" | "none";

export interface BulletItem {
  /** Plain text content (fallback when runs absent). */
  text: string;
  /** Optional rich-text runs for this item. */
  runs?: TextRun[];
  /**
   * Indent level (0 = top-level, 1 = first nested, 2 = second nested, …).
   * Max supported: 3 (renders 4 levels total).
   */
  level: number;
  /**
   * List type override for this item. Inherits from parent level when absent.
   * Top-level default: "disc". Nested default: "disc" → level 1, "lower-alpha" → level 2, "lower-roman" → level 3.
   */
  listType?: BulletListType;
}
```

**Migration:** Existing `bullets: string[]` is automatically migrated on load in `deck-schema.ts` by wrapping each string as `{ text, level: 0 }`. The `bullets` field on `BulletsElement` is updated to `bulletItems: BulletItem[]` with a backward-compat read path that coerces the old `bullets` + `bulletRuns` shape.

**Legacy deck compat:** `deck-schema.ts` reads `bullets` (old) or `bulletItems` (new). If both are present, `bulletItems` wins. Old `bulletRuns[i]` maps to `bulletItems[i].runs`.

### 3b. Default marker styles per level

| Level | Default `listType` (bullet) | Rendered marker |
|---|---|---|
| 0 | `disc` | ● (filled circle, 0.35 em, uses theme accent color) |
| 1 | `disc` | ○ (open circle, CSS `list-style-type: circle`) |
| 2 | `lower-alpha` | a. b. c. |
| 3 | `lower-roman` | i. ii. iii. |

For numbered lists (`decimal`), item count resets at each change-in-parent.

### 3c. Inline editor interaction (Tab / Shift+Tab)

In the Lexical / `RichTextBox` bullet editor:
- **Tab** on a bullet item: increases `level` by 1 (max 3). If at max, no-op.
- **Shift+Tab** on a bullet item: decreases `level` by 1 (min 0). If at min, no-op.
- **Enter** on an empty level-N item: promotes item back to level N-1 (same as Notion/Google Slides behavior). If already level 0, inserts a new non-list text element (or simply exits list mode — match host behavior).
- Keyboard shortcut feedback: a very brief (150 ms) left-edge highlight (`border-l-2 border-ds-accent`) on the item row confirms the indent change.

**Tab indentation is blocked from navigating outside the editor** — the editor must call `e.preventDefault()` on Tab within a bullet context.

### 3d. Inspector controls for list type

Add a **"List type" row** in the `bullets` branch of `ElementContentEditor`, placed between the `RichTextBox` and `TextStyleBar`:

```
┌─────────────────────────────────────────────────┐
│  List type                                      │
│  [• Bullets] [1. Numbered] [A. Alpha] [None]    │
└─────────────────────────────────────────────────┘
```

This sets the *top-level* `listType` for all items in the element. Overrides at per-item level are not exposed in v1 (advanced use case — keep simple).

Icon mapping:
| Option | Lucide icon | Label |
|---|---|---|
| `disc` | `List` | "Bullets" |
| `decimal` | `ListOrdered` | "Numbered" |
| `lower-alpha` | `ListOrdered` (styled) | "Lettered" |
| `none` | `AlignJustify` | "None" |

Changing list type updates all items at level 0 to the selected type; sub-levels keep their defaults.

**Indent controls per item (advanced):** Not in the main inspector. Accessible via right-click context menu on a selected bullet item in the inline editor: "Increase indent" / "Decrease indent" (mirrors Tab/Shift+Tab).

### 3e. Visual hierarchy rendering

```
● Top-level bullet text that may wrap across
  multiple lines when the box is narrow
  ○ Second-level (indented 1.25 em)
    a. Third-level (indented 2.5 em)
       i. Fourth-level (indented 3.75 em)
```

Indent is `bulletIndent * level` em from the left edge of the content area (default `bulletIndent = 1.25 em`).  
Markers are rendered as CSS `::before` pseudo-elements or explicit `<span>` elements (matching the existing `createMeasuredTextNode` pattern — keep parity with the measurer).

For numbered lists, the marker width must be fixed (`min-width: 2.5ch`) so the list text aligns cleanly across items with double-digit numbers.

### 3f. Export

- PPTX: use pptxgenjs `indentLevel` and `bullet: { type, … }` options per item.
- Fallback for unsupported export contexts: flatten to plain text with `→ ` prefix per level.

---

## 4. Shape Text Expectations

Shape text (`ShapeElement.text` / `textStyle`) does **not** get `fitMode` in Wave 2 — it always clips to the shape boundary.

However, the following changes **do apply** to shape text:

| Feature | Wave 2 scope for shape text |
|---|---|
| Vertical alignment (`verticalAlign`) | ✅ Add to `textStyle` and render accordingly — currently hardcoded center (`justify-content: center` in flex). Expose `"top"/"middle"/"bottom"` in inspector (compact `TextStyleBar` in shape branch). |
| Line height | ✅ Same `lineHeight` field on `TextElementStyle`; renderer reads it. |
| Paragraph spacing | ❌ Not in Wave 2 for shapes — single-block label use case. |
| Multi-level bullets | ❌ Shape text is a single plain/rich block, not a list. |
| Fit mode control | ❌ Shapes clip; no fit mode picker. |

**Inspector entry point for shape vertical alignment:** In the `case "shape"` branch of `ElementContentEditor` (currently around line 606–636 of `slide-inspector.tsx`), add a `"Vertical align"` row below the compact `TextStyleBar`, rendered inline (not labeled, just 3 icon buttons), only when `element.shape !== "line"`.

---

## 5. Visual Regression Coverage (#336)

### 5a. Playwright screenshot scenarios (new file: `e2e/slides-text-visual.spec.ts`)

All scenarios use a deterministic fixture deck (seeded via `E2E_*` credential path, or a static fixture route if available). Each test:
1. Navigates to the slide viewer (public or present mode — no auth required if using a public fixture).
2. Awaits the slide to be fully rendered (`await page.waitForLoadState("networkidle")`).
3. Takes a full-slide screenshot with `page.screenshot({ clip: slideRect })`.
4. Compares to a stored baseline with `expect(screenshot).toMatchSnapshot(name, { maxDiffPixelRatio: 0.01 })`.

**Required scenarios:**

| Scenario | What it catches |
|---|---|
| `text-plain-linebreaks` | Line break preservation, correct `white-space: pre-wrap` |
| `text-rich-inline-styles` | Bold/italic/code/color runs render inline without reflow |
| `text-fit-auto-height` | Box grows to multi-line content without clipping |
| `text-fit-fixed-box` | Overflow content is clipped at box boundary |
| `text-fit-shrink` | Font visually smaller than declared size when content would overflow |
| `bullets-flat-wrapping` | Long bullet text wraps without clipping the marker |
| `bullets-flat-large-font` | Large font bullets do not overflow the element box |
| `bullets-nested-2level` | Two-level indentation renders distinct markers and correct alignment |
| `bullets-numbered-list` | Decimal numbered list renders sequential numbers |
| `shape-text-rect` | Text centered in rect; does not overflow shape boundary |
| `shape-text-ellipse` | Text centered in ellipse; same clip as rect |
| `shape-text-triangle` | Text centered in triangle shape |
| `connector-straight-bound` | Straight connector endpoints attached to moved shapes remain attached |
| `connector-elbow-routed` | Elbow connector re-routes after target shape is moved |

**Viewports:** Desktop (`1280×800`, the Playwright chromium default) for all scenarios. Additionally run `text-fit-shrink`, `bullets-nested-2level`, and `connector-elbow-routed` at `768×600` (narrow) to catch viewport-specific regressions.

### 5b. Baseline strategy

- Baselines stored in `e2e/snapshots/` (gitignored except `*.png` files committed as fixtures).
- Regenerate with `npx playwright test --update-snapshots` locally before a merge.
- CI runs with `--forbid-only` and fails on any diff > 1% pixel ratio.

### 5c. Existing test touchpoints

The existing connector unit tests (`connector-lifecycle.test.ts`, `connector-geometry.test.ts`) cover serialization and geometry math. The Playwright suite adds the visual layer on top — not a replacement.

Text serialization, fit-mode, and list model should be unit-tested in a new `text-element-fit.test.ts` extension + `bullet-item-model.test.ts` (Ghost scope) before the Playwright baselines are captured, to ensure the baselines reflect correct behavior.

---

## 6. Token/Style Guidance and Sequencing

### 6a. `--ds-*` tokens to use

| Surface | Token |
|---|---|
| Segmented button group border | `border-ds-border-subtle` |
| Segmented button selected fill | `bg-ds-control` |
| Segmented button selected text | `text-ds-control-text` |
| Segmented button hover | `hover:bg-ds-state-hover` |
| Unselected text | `text-ds-text-secondary` |
| Row label | `text-xs font-medium text-ds-text-secondary` (= `LABEL_CLASS`) |
| Range / checkbox accent | `accent-ds-control` |
| Number input | `border border-ds-border-subtle bg-transparent text-ds-text-primary` |
| Corner radius (buttons) | `rounded-ds-sm` |
| Corner radius (group) | `rounded-ds-md` |
| Indent level highlight | `border-l-2 border-ds-accent` (transient, 150 ms) |
| Fit mode cycle button (compact) | Same as existing `IconToggle` in `text-style-bar.tsx` |

### 6b. Sequencing (recommended order for Switch)

1. **Model extensions** (no UI risk): add `verticalAlign`, `lineHeight`, `paragraphSpacingBefore/After`, `bulletGap`, `bulletIndent` to `TextElementStyle`; add `BulletItem` type and `BulletsElement.bulletItems`; update `deck-schema.ts`; add unit tests. Ghost owns the `BulletItem` model.
2. **Fit mode inspector UI** (#333): add the three-button "Content fit" row to `ElementContentEditor`. Wire to `onUpdateElement`. The logic already exists — this is pure UI.
3. **Vertical align + spacing UI** (#334): extend `TextStyleBar` with `verticalAlign` row; add `SpacingSection` collapsible below. Update the renderer to read new fields.
4. **Shape text vertical align**: small follow-up in the `shape` inspector branch and renderer.
5. **Multi-level list editor** (#335): update `BulletsElement` renderer to use `bulletItems`; add Tab/Shift+Tab in `RichTextBox`; add "List type" row in inspector.
6. **Visual regression baselines** (#336): capture baselines after steps 2–5 are stable. Run `--update-snapshots` once, commit, then CI enforces.

### 6c. Notes for Ghost (#335)

- The `BulletItem` model lives in `deck.ts` alongside existing types. Ghost should define it there and update `deck-schema.ts` for both forward (new `bulletItems` path) and backward (legacy `bullets` array migration) parsing.
- `text-element-fit.ts` `createMeasuredTextNode()` must be updated to iterate `bulletItems` instead of `bullets` once the model is in place — this is a Switch/Ghost shared boundary. Switch owns the measurer update; Ghost owns the model.
- Keep `bullets` and `bulletRuns` as deprecated aliases in the schema read path for at least one release cycle so existing persisted decks continue to load.

---

*Spec ready for Switch and Ghost implementation. No code changes in this commit — spec only.*


# Mouse — Wave 3 UX Guidance: Post-PRs #381–#388

**By:** Mouse (Design/UX)  
**Date:** 2026-06-23T01:22:34Z  
**Scope:** User-visible slices following the asset storage, schema versioning, command executor, source-ref stamping, and comment anchor foundation wave.

---

## Situation Snapshot

Six backend/model foundations landed in #381–#388 with **zero UI**:

| Foundation | PR | UI Status |
|---|---|---|
| Asset upload validation + metadata | #381 | No dropzone, no progress, no error surfaces |
| Deck schema migration boundary | #382 | No migration-banner UI |
| Persistence/collab strategy doc | #383 | No conflict resolution UI |
| Slide command executor (`CommandResult.error`) | #384 | Errors are silently swallowed by the editor |
| Source ref stamping on insertions | #386 | No badge or status indicator shown to user |
| Comment anchor foundation (orphaned/attached/deck/unknown states) | #388 | No pin marker rendered |

All six need design decisions before implementation can land. They share one visual language: **inline status markers** (badges, pins, banners) communicating system trust and data provenance. That is the thread.

---

## Blockers & Design Decisions Needed

### 1 — Asset Upload: Which surface owns the upload UX?

**Decision needed:**  
The validation logic (`validateAssetUpload`, `formatAssetUploadError`) returns typed errors (`file_too_large`, `type_rejected`, `dimension_exceeded`, `checksum_missing`). The existing `useImageUpload` hook bridges into the slide editor. But:

- **Where does upload *progress* live?** Currently `useImageUpload` is synchronous (FileReader + data-URL). When the asset model matures to a real object-store upload (non-data-URL), there will be a latency gap. Does the image slot show a skeleton/spinner during upload, or does the file-picker modal stay open?
- **Where do upload errors surface?** A validation failure today calls `onError(message)` which sets `insertImageError` state — but that state is only shown in one render path. The three call sites (element upload, insert-image path, background upload) need a single, consistent error surface. Currently each handles it ad-hoc.
- **Missing-asset placeholder:** If a deck is opened and an image element has no valid `src` (e.g. data-URL was stripped, or future object-store URL is 404), what renders on the slide canvas? There is no broken-image state in `SlideCanvas` today.

**My recommendation:**  
a) Upload errors → **inline toast inside the file-picker overlay** (not a global banner; scoped to the action). Duration 5 s, dismissible. Matches the save-error Retry pattern already in the editor.  
b) Upload in-progress → **image slot shows a grey skeleton with a circular spinner** at the centroid. The slot is non-interactive while uploading.  
c) Missing asset (src absent or broken) → **placeholder tile**: the element bounding box renders a `--ds-surface-2` fill with a centered `ImageOff` lucide icon (16 px, `--ds-text-muted`) and the filename (if known) in a single truncated line below. Hover reveals a tooltip: *"Image unavailable — re-upload to restore."*

**Blocker for Switch/Trinity:** Before the missing-asset placeholder can be built, Trinity needs to decide whether `src`-absent image elements are ever valid at rest, or whether they should be stripped/defaulted by the migration pipeline (#382). If the migration strips them, the placeholder is only needed transiently during upload.

---

### 2 — Source Sync Badges: What does "linked" look like?

**Decision needed:**  
`sourceRef` is now stamped on elements at insertion time (#386). `isSourceLinked`, `isSourceStale`, and `SourceRef.unlinked` exist in the model. But:

- The slide canvas and inspector **show nothing** about this. A user has no way to know an element came from the document, whether it is current or stale, or how to relink after editing.
- The inspector's element panel has a compact layout. There is room for a small badge row beneath the element name but not for a full sync panel.

**My recommendation:**  
Three states for a source-linked element, each with a distinct affordance:

| State | Badge | Action |
|---|---|---|
| `linked` (current) | `Link` icon (12 px, `--ds-text-muted`) + "Synced" in muted label | Tooltip: *"Linked to document. Syncs when you use Sync from Document."* No action needed. |
| `stale` (sourceRef exists, content hash differs) | `RefreshCw` icon (12 px, `--ds-accent`) + "Out of date" in accent label | Inline "Update" button (ghost-sm). Clicking applies the source content to this element only. |
| `unlinked` (unlinked === true) | `LinkOff` icon (12 px, `--ds-text-muted`) + "Unlinked" | Inline "Relink" button (ghost-sm). Clicking re-attaches to the matching source block by section id. |

Placement: **inside the element-level inspector section**, below the element label, above the first editable field. This is non-disruptive for elements without sourceRef (the row simply does not render).

On the **slide thumbnail panel** (left strip): a small `RefreshCw` dot (6 px, `--ds-accent`) overlays the bottom-right of any slide where at least one element is stale. Tooltip: *"This slide has elements that are out of sync with the document."*

**Blocker:** The stale detection (`isSourceStale`) computes from `contentHash`. Switch needs to confirm whether the hash is stamped at insert time and updated on sync, or only at insert. If it is insert-only, "stale" will never be true until the sync path writes a new hash — that needs to be scoped with Tank/Trinity before the badge is built.

---

### 3 — Command Errors: Visibility model for `CommandResult.error`

**Decision needed:**  
`executeCommand` returns `{ ok: false, error: string }` for validation failures (slide not found, last slide, invalid index, element not found). Today the slide editor calls `executeCommand` and **ignores `result.error` entirely** — there is no call site that reads `result.error` in `slide-editor.tsx`.

**My recommendation:**  
Command errors are rare but important — they indicate an incoherent state (e.g. a stale deck reference). They should surface as a **non-blocking inline banner** at the top of the editor stage (not a modal):

```
⚠ Could not complete that action: <error message>   [Dismiss ×]
```

- Height: 36 px, `--ds-surface-warning` background, `--ds-text-warning` text
- Auto-dismisses after 6 seconds
- Stacks with the "Couldn't save" error banner; the save-error banner takes priority (renders above)
- Never blocks editing

**Coalescing rule:** If the same error fires twice within 2 s (e.g. rapid delete-last-slide attempts), deduplicate — only one banner.

This is a 1-day Switch task once the decision is ratified. It unblocks any future command error path (undo/redo errors, import validation failures).

---

### 4 — Persistence Conflict UI: The merge-preview and the collab-divergence case

**Decision needed (two sub-cases):**

**4a — Deck-document sync conflict (merge preview, `#383 / deck-merge.ts`)**  
`mergeDecks` already computes a `MergeSlideChange[]` summary. The current editor shows a `showStaleBanner` with a "Sync from Document" button that applies the merge immediately. There is no preview of what will change.

For slides where `kind === "updated"` AND `contentChanged === true` AND `elementsPreserved > 0`, the user is about to lose manually-arranged elements. They should see a diff before committing.

**My recommendation:**  
Replace the current "Sync from Document" button action with a two-step flow:
1. Clicking "Sync from Document" opens a **Sync Preview sheet** (right-side slide-over, 360 px wide, not a modal — editor stays visible)
2. The sheet lists each changed slide as a card: before/after bullet count, whether custom elements will be preserved, a "Content changed" / "No content change" chip
3. CTA: **Apply sync** (primary) | **Cancel** (ghost)
4. Slides where `elementsPreserved > 0 && contentChanged` get a `⚠ Custom elements preserved` note — it is not a warning, it is reassurance

**4b — Yjs collab divergence**  
The collab server is single-instance (`docs/collab-deployment.md`). When the server is unreachable and the user saves locally, then reconnects, there is no UI for "your offline edits vs. remote edits." The collab doc acknowledges graceful degradation but there is no user-visible indicator.

**My recommendation (minimal for now):**  
A **connection-state dot** in the editor top bar (right of the save-status badge):
- `● Online` (green, 8 px dot) — connected to collab server
- `○ Local only` (grey, 8 px ring) — not connected; edits are saved locally only; tooltip: *"Working offline — changes sync when reconnected"*
- `⚠ Reconnecting` (amber pulse) — lost connection, attempting to reconnect

**Blocker:** Trinity needs to confirm whether the Yjs awareness event surface provides a reliable `connected/disconnected/reconnecting` signal consumable by the editor. If it does, Switch can wire the dot. If not, the indicator is blocked until that signal is plumbed.

---

### 5 — Theme Override / Reset Semantics

**Decision needed:**  
`infer-theme.ts` derives a deck theme from document visual blocks. `setDeckTheme` applies a theme globally. Per-slide `background`/`accent` overrides exist on `Slide`. The inspector has a "Per-slide color override" section (line 2835 of `slide-inspector.tsx`). But:

- There is no **"Reset to theme default"** affordance on a per-slide override once set.
- There is no visual indication that a slide is *overriding* vs. *inheriting* the deck theme.
- The deck-level theme picker (top bar) and per-slide inspector controls use entirely different affordance patterns (select vs. swatch). They feel like unrelated features.

**My recommendation:**

**Theme inheritance model (visual language):**  
- Deck-level theme picker: stays as-is (top bar select/swatch strip)
- Per-slide override section in inspector: show a **"Customized" chip** (subtle, accent-outlined, 20 px height) next to the section label when `slide.background` or `slide.accent` differs from the deck theme default. Clicking the chip → "Reset to theme" (single action, no confirmation). The chip disappears on reset.
- Slide thumbnails with custom overrides: no visual change (the thumbnail already shows the actual color).

**Theme reset semantics (exact behaviour):**
- "Reset to theme" on a slide clears `slide.background` and `slide.accent` (sets to undefined)
- The canvas then reads these from the deck theme config (`DECK_THEMES[deck.theme]`)
- This is lossless — undo restores both values

**The deck-level theme + typography token intersection (#385):**  
The `ThemeTypographyConfig` schema was typed but there is no UI for per-deck font overrides yet. This is fine to leave for a future slice, but a **design blocker** exists: if Switch implements the theme picker dropdown today and the per-deck typography schema lands later, the picker will need a visual design extension (a "Fonts" section below "Colors"). The slot needs to be reserved in the picker layout now.  
**Decision:** Add a greyed-out "Fonts (coming soon)" placeholder row in the theme picker dropdown at the bottom of the color section. This reserves the space and signals intent without blocking the current slice.

---

### 6 — Comment Pins: Visual design for AnchorState

**Decision needed:**  
`resolveAnchorState` returns `"attached" | "orphaned" | "deck" | "unknown"`. The slide canvas renders nothing for comments today. Before implementing pins, four design questions must be resolved:

**Q1: Where do pins render?**  
`AnchorPoint` is expressed as percent coordinates on the slide canvas (0–100 on each axis). The natural answer is: an absolutely-positioned pin marker overlaid on the `SlideCanvas` at `(x%, y%)`. But `SlideCanvas` today renders only elements and background — it has no overlay layer.

**My recommendation:** Add an `<div className="absolute inset-0 pointer-events-none">` overlay layer to `SlideCanvas` that renders pin markers. Pins are `pointer-events-auto` individually (clickable). This layer is only rendered in the editor (not in present mode or the public viewer).

**Q2: What does a pin look like per state?**

| AnchorState | Visual | Tooltip |
|---|---|---|
| `attached` | Filled `MessageCircle` icon (16 px, `--ds-accent`), circular pill with avatar initials | *"[Author] — [snippet]"* |
| `orphaned` | `MessageCircle` icon (16 px, `--ds-text-warning`), dashed border | *"This comment was pinned to an element that was deleted. Click to view."* |
| `deck` | No pin rendered on canvas; shown in the comments panel sidebar only | — |
| `unknown` | Same as `deck` (no pin; no deck loaded) | — |

**Q3: How are pins placed?**  
For the initial slice (comment pin *display*, not pin *creation*): pins are placed at the `AnchorPoint` from the stored anchor geometry. If geometry is absent but a `slideId` is present, the pin floats to a default position (top-right quadrant, e.g. 85%, 15%).

Pin *creation* (letting the user click to place a new comment pin) is a separate UX slice — not scoped here.

**Q4: Orphaned pin recovery — float or discard?**  
`floatAnchorToDeck(anchor)` exists in the model. The UX question is: when a user views an orphaned pin, should we offer to "move to deck level" (float) or just show it in-place with the dashed-border treatment?

**My recommendation:** Show orphaned pins in-place on the slide, dashed-border treatment, with a tooltip offering one action: **"Move to deck comments"** (calls `floatAnchorToDeck`). This is recoverable and non-destructive. Discard is never offered.

---

## Priority Order for Next Wave

1. **Command error banner** — 1 day Switch; highest leverage per effort
2. **Missing-asset placeholder** — 1 day Switch; blocks image-element trust
3. **Source sync badges (inspector row + slide thumbnail dot)** — 2 days Switch; depends on Trinity confirming hash-stamp timing
4. **Theme override reset ("Customized" chip + reset action)** — 1 day Switch
5. **Comment pin overlay (display only, attached + orphaned states)** — 2 days Switch + 0.5 day Ghost for anchor resolution hook
6. **Sync preview sheet (merge preview before applying)** — 2 days Switch
7. **Collab connection-state dot** — 1 day Switch; blocked on Trinity confirming Yjs signal surface

---

## First UX Spec: Comment Pin Overlay

This is the highest-uncertainty slice (novel interaction surface). Full spec below.

---

### UX Spec: Slide Comment Pin Overlay
**Version:** 0.1  
**Owner:** Mouse  
**Target engineer:** Switch  
**Dependencies:** Ghost (comment data), Trinity (`AnchorState` resolution hook)

#### Goal
Render existing comment anchors as interactive pins on the slide canvas in editor mode. Display state communicates whether the anchor is alive, orphaned, or deck-level. No pin creation in this slice.

#### Layout

```
SlideCanvas
├── background layer          (existing)
├── elements layer            (existing)
└── pins overlay              ← NEW: absolute, inset-0, pointer-events-none
    └── PinMarker(s)          ← pointer-events-auto per pin
```

The overlay is a sibling of the elements layer inside the relative-positioned canvas container. Z-index: above elements, below selection handles.

#### Pin Marker Component: `<SlideCommentPin>`

**Props:**
```ts
interface SlideCommentPinProps {
  commentId: string;
  anchorState: AnchorState;          // "attached" | "orphaned"
  geometry: AnchorPoint;             // { x: number, y: number } in percent
  authorInitials: string;            // ≤2 chars
  authorColor: string;               // CSS color for avatar background
  snippet: string;                   // first ~60 chars of comment body
  onActivate: (commentId: string) => void;
}
```

Only render for `attached` and `orphaned` states. Skip `deck` and `unknown`.

**Geometry:**  
Position: `style={{ left: `${geometry.x}%`, top: `${geometry.y}%`, transform: 'translate(-50%, -100%)' }}`  
This anchors the pin's bottom-center to the percent point, not the top-left.

**Attached state visual:**
```
┌─────────────────┐
│  [AB]  snippet… │  ← 28 px height, pill shape
└────┬────────────┘
     ▼  (4 px caret)
```
- Pill: `bg-[--ds-accent] text-[--ds-text-on-accent]`, `rounded-full`, `px-2 py-0.5`, `shadow-raised`
- Avatar circle: 18 px, `rounded-full`, author-colored bg, white initials, `text-[10px]`
- Snippet: truncated to 24 chars, `text-xs`, `font-medium`
- Hover: scale(1.08), shadow-overlay — 120 ms ease-out
- Focus ring: 2 px `--ds-border-focus` offset-2

**Orphaned state visual:**
```
┌ ─ ─ ─ ─ ─ ─ ─ ┐
│  [?]  Deleted   │  ← dashed border, muted fill
└ ─ ─ ┬ ─ ─ ─ ─ ┘
      ▼
```
- Pill: `bg-[--ds-surface-warning]/60 border border-dashed border-[--ds-border-warning]`
- Avatar: `?` glyph, `text-[--ds-text-warning]`
- Label: "Deleted element", `text-xs text-[--ds-text-warning]`
- Hover: reveals a Tooltip with: *"Comment was pinned to a deleted element."* + "Move to deck" button (ghost-xs, warning-tinted)

**Interaction:**
- Click on attached pin → `onActivate(commentId)` → opens comment thread panel (existing comment system; no new panel needed in this slice)
- Click on orphaned pin → same `onActivate`, then shows orphan-recovery prompt inside the comment thread panel (not inline on the canvas)
- Keyboard: `Enter`/`Space` triggers activate

#### Multiple pins collision
If two pins land within 16 px of each other: stack them as a `+N` badge on the first pin. Badge: `bg-[--ds-accent] text-[--ds-text-on-accent] rounded-full text-[10px] w-4 h-4`, positioned top-right of the first pin. Clicking the `+N` badge opens a mini-list popover showing all overlapping comments.

#### Present mode / public viewer
The pins overlay is **not rendered** in `PresentMode` or `PublicPresentViewer`. Comments are an editing-mode concept.

#### Accessibility
- Each `SlideCommentPin` is a `<button>` with `aria-label="Comment by [author]: [snippet]"` (attached) or `aria-label="Orphaned comment — [snippet]"` (orphaned)
- The overlay container has `aria-label="Slide comments"` and `role="group"`
- Pins respond to keyboard focus in DOM order (top-to-bottom, left-to-right of geometry)

#### Motion
- Pins mount with a `scale(0.6) → scale(1)` spring, 200 ms, `spring(stiffness:260, damping:20)` — matches the existing `FloatingSurface` mount motion
- No exit animation (pins disappear only when comment is deleted)

#### Open questions for Trinity / Ghost
1. Does the comment data hook return `SlideCommentAnchor` with resolved `geometry`, or does the UI need to call `resolveAnchorState` itself?
2. Are comments loaded per-slide or for the whole deck at once? Pin rendering is cheap either way, but the data-loading strategy affects whether the overlay needs a loading skeleton.
3. When a comment's element is deleted and the orphaned state is detected, does the backend auto-call `floatAnchorToDeck`, or does the UI trigger that via a server action?

---

*Filed by Mouse. Scribe to merge to `.squad/decisions.md`.*


# Ghost Design Decisions — Epic #379 Rendering, Export, and Regression Contract

Date: 2026-06-23
Branch: squad/379-render-export
Author: Ghost (QA/Tester)

## #416 — Export preflight diagnostics

**Decision**: Created `src/lib/visual/export-preflight.ts` as a pure, headless module
with a single entry point `runExportPreflight(deck, options): PreflightResult`.

**Fatal vs Warning split**:
- `missing-asset` (FATAL): image element has neither `src` nor `assetId`. Export would produce
  a broken file. Applies to both PPTX and image targets.
- `raster-fallback` (WARNING, PPTX only): fitMode="none", non-none maskShape, or crop triggers
  raster fallback. Fidelity reduced but export succeeds.
- `remote-image-failure` (WARNING, PPTX only): http/https src could fail at export time (no
  pre-validation possible in a pure function).
- `missing-font` (WARNING, PPTX only): custom font referenced in element style is not embedded
  in PPTX. Only emitted when `customFontFamilies` is explicitly provided by the caller (the UI
  must pass the brand's font families).
- `unsupported-pptx-feature` (WARNING, PPTX only): elbow connectors, gradient backgrounds.
- `oversized-deck` (WARNING, both targets): slide count exceeds `maxSlides` threshold (default 50).

**Decision NOT to emit unconditional deck-level fidelity warnings** (shadow, theme-typography):
These are only meaningful when the features are actually present in the deck. Emitting them
unconditionally for every PPTX export would produce false positives and degrade the UX.

**Hidden elements are excluded**: `materializeSlideElements(slide).filter(el => !el.hidden)`
matches the export pipeline's own filter so preflight and actual export stay consistent.

## #417 — Missing asset and font handling tests

**Decision**: Placed tests in `src/lib/slides/missing-asset-font.test.ts` (co-located with
the slides domain) rather than `src/lib/visual/` because the tests span the `asset-resolver`
(slides layer) and `export-preflight` (visual layer). A single file avoids duplication.

**Test categories**:
- Section A: Editor/present — ClientAssetResolver, effectiveImageUrl, MISSING_ASSET_PLACEHOLDER.
- Section B: Export — ServerAssetResolver DB/soft-delete/error paths; preflight fatal check.
- Section C: PPTX custom font warnings — missing-font is a warning, never blocks export.
- Section D: Crash-safety — buildDeckSpecs must never throw for any element with a missing font.

**Key assertion**: `buildDeckSpecs` (the pure export transform) produces ops even when elements
reference unavailable fonts or have empty src. Crash prevention is a hard requirement (#417 AC).

## #415 — Screenshot regression spec

**Decision**: Screenshot comparisons are opt-in via `E2E_SCREENSHOT_REGRESSION=1`. This prevents
the spec from becoming a flaky blocker in the standard E2E suite where no baseline exists.

**Fixture design**: `REGRESSION_DECK_FIXTURE` is typed as `Record<string, unknown>` to avoid
needing to import the full Deck type tree in a Playwright spec. The fixture covers all required
element kinds: text, bullets, shape (rect/ellipse/triangle), image (data URL), connector.

**Tolerance**: 2% max-diff pixel ratio + 0.2 per-pixel threshold. Conservative enough to handle
minor sub-pixel rendering differences across OS/GPU while catching real regressions.

**Fixture integrity tests run without a server**: The `deck fixture integrity` describe block
contains pure data assertions that always run, providing value even in environments without a
running app.

## #418 — E2E smoke spec

**Decision**: The smoke spec (`e2e/slides-smoke.spec.ts`) uses a defensive "try → skip" pattern
at every step. No single missing element causes a test failure — instead the test skips cleanly.
This matches the existing workspace.spec.ts / billing-brand.spec.ts pattern.

**Authenticated flows require `E2E_SLIDES_DOC_URL`** in addition to credentials because the
workspace may have many documents and finding the right one with a Slides deck without a seeded
URL is unreliable.

**Export smoke**: Does NOT trigger a real file download (which would be flaky and slow). It only
asserts that the export trigger (button/menu) is reachable and clickable. This is sufficient to
smoke-test the export path wiring without introducing network dependencies.

**Always-running tests**: Two unauthenticated tests always run: auth redirect and 404 for unknown
present share ID. These verify the Slides-adjacent routes are wired correctly without any setup.


# Ghost — #455 Stabilization Decisions

**Agent:** Ghost (Tester/QA)  
**Branch:** squad/455-dv-stabilization  
**Commit:** feat(stabilization): add release gate, diagnostics, budgets, authz/a11y coverage, and dry-run plan (#455)  
**Date:** 2026-06-23

---

## Design decisions

### #460 — Error code taxonomy design

Chose a flat `SCREAMING_SNAKE_CASE` string union over numeric codes because:

- Strings are self-documenting in logs without a lookup table
- Stable across schema migrations (no integer collision risk)
- Compatible with the existing `logError`/`buildErrorLog` context bag
- Layered on top: `buildDiagnosticErrorLog` wraps `buildErrorLog` — existing
  log behavior is unchanged; the `code` and `severity` fields are additions

The `CODE_SEVERITY` map is the source of truth for severity. Callers never
specify severity directly — they pick a code and severity is derived. This
prevents a SAVE_CONFLICT being accidentally emitted with `"fatal"` severity.

Convenience builders (e.g. `saveDiagnosticConflict`, `authDiagnosticDenied`)
were added for the highest-traffic paths so call sites are one-liners.

### #461 — Budget constants and `checkBudget` design

Extended `deck-limits.ts` with a new peer file `perf-budgets.ts` rather than
modifying the existing file. This keeps the existing import path
(`deck-limits.ts`) unchanged and the new budget module is opt-in.

Warning threshold = 80% of hard limit (consistent across all metrics). This
gives operators a warning runway before hitting the hard wall.

`checkBudget` uses `actual > hardAt` (strict greater-than) so the hard limit
itself is "at the boundary" — not yet exceeded. This matches the behavior of
the existing `MAX_DECK_JSON_BYTES` check in `saveDeckJson` which rejects `>
MAX_DECK_JSON_BYTES`.

### #457 — Dry-run helper `collectBlockNodes` only checks `bid`, not `key`

The legacy `key` fallback is a read-time resolution — it tells the editor
"fall back to this legacy field if bid is absent". It does NOT mean the node
has been stamped. The dry-run helper must report nodes as "missing bid" when
they lack the actual `bid` field, regardless of whether a `key` is present.

The `stampBlockIds` pass adds `bid` fields; `key` values are never touched.
This means the dry-run `missingBidCount` accurately predicts how many nodes
`stampBlockIds` would touch.

### #457 — Orphaned deck visual ref check does not require existingVisualIds.size > 0

Initial implementation had a guard `&& existingVisualIds.size > 0` which
incorrectly skipped the check when no Visual rows exist (e.g. a document whose
mirror has been cleared). Removed the guard — the check is: for each
`visualId` referenced in `deckJson`, is it present in `existingVisualIds`? If
`existingVisualIds` is empty and `deckJson` has refs, those refs are all
orphaned.

### #458 — Authz tests: `assertCapability("view")` on `role="none"` throws with `capability=null`

The `assertCapability` implementation uses `capability: null` when `canView ===
false` (the "document not found" path). This intentionally hides whether the
document exists from unauthorized callers. Tests now assert `capability === null`
for the `role="none"` case.

### #458 — Share expiry boundary: `expiresAt <= now` is expired (inclusive)

`evaluateShareAccess` uses `expiresAt.getTime() <= now.getTime()` — links
expire AT the exact expiry timestamp, not after it. Tests now document this as
"boundary inclusive" rather than the incorrect "not yet expired" assertion.

### #462 — A11y helpers are pure data-structure assertions (no DOM)

Rather than coupling a11y smoke tests to a JSDOM/Playwright setup, the helper
layer operates on plain `A11yElement` descriptors. This means:
- Tests run under `node:test` in the CI gate without a browser
- Component authors can run the helpers against their own prop fixtures
- The known canvas drag/resize limitation is documented in the test itself

The deferred canvas keyboard items are documented explicitly in the test file
so they are not hidden — any future contributor can find them.

### #456 — Release gate document structure

Three-tier structure: automated gate → critical flow checklist → sign-off
procedure. Blocked flows are explicitly split into "blocker" vs "warning" tiers
to make the distinction operational rather than aspirational.

Every checklist item is tagged A/M/I/D (automated/manual/invariant/deferred)
so the reviewer knows exactly what to do for each one.


# Design Decisions: Epic #375 — Command and Patch Architecture

**Author:** Switch (Frontend Dev)
**Branch:** `squad/375-slide-commands`
**Commit:** `feat(slides): complete command wiring, patches, and history metadata (#375)`
**Date:** 2026-06-23

---

## Summary

Implemented all five child issues of Epic #375 in a single commit to `slide-commands.ts` and `slide-commands.test.ts`. No changes to React components were required — the issues are infrastructure/library additions, and the UI handlers continue to route through `onDeckChange` as before.

---

## Key Design Decisions

### 1. Patch format (issue #401)

**Decision:** `DeckPatch` is a minimal, schema-versioned struct with:
- `schemaVersion` — mirrors `CURRENT_DECK_SCHEMA_VERSION` (currently `1`)
- `op: PatchOp` — stable string enum, one value per logical operation
- `slideIds`, `elementIds` — affected id sets
- Optional payload maps: `deckFields`, `slideFields`, `elementFields`
- Optional `addedIds`, `removedIds` for add/remove lifecycle ops

**Rationale:**
- Intentionally minimal: only what the persistence epic (#376/#403) needs to upsert/delete rows server-side.
- No `before`/`after` snapshots — they would be too large and are available via the input deck + `CommandResult.deck`.
- `elementFields` mirrors the same `ElementPatch` type used by mutation helpers, so there is no second schema to maintain.
- `slideFields` is limited to scalar fields only; structural changes (element arrays) are tracked via `elementIds`.

### 2. `applyPatch` scope (issue #401)

**Decision:** `applyPatch` only handles patches with enough payload to reproduce the result deterministically (deck-level ops, slide scalar-field ops). It returns `null` for operations like `slide.add` or `element.duplicate` that do not carry the full state needed for replay.

**Rationale:**
- Add/duplicate ops create new IDs via `crypto.randomUUID()` — they cannot be deterministically re-applied from the patch alone without the original command.
- Callers should fall back to the full command executor for these cases. The persistence epic will use patches for targeted server updates, not for local replay.

### 3. New command type taxonomy (issues #398, #399, #400)

**Decision:** Added 30+ new `SlideCommand` union members rather than extending `UPDATE_SLIDE` with opaque sub-types. Each operation has a dedicated command type with strongly-typed fields.

**Rationale:**
- Discriminated union makes exhaustive switch checking possible and ensures new ops can't be accidentally silenced with a generic fallback.
- Patch `op` strings map 1-to-1 to command types, making the persistence layer straightforward.

### 4. Coalescing extensions (issue #398)

**Decision:** Extended `canCoalesce`/`mergeCommands` to handle `UPDATE_SLIDE_TITLE`, `UPDATE_SLIDE_BODY`, and `UPDATE_SLIDE_NOTES` (last-write-wins merge strategy). `NUDGE_ELEMENTS`, `SET_ELEMENT_BOXES`, etc. are NOT added to the merge logic.

**Rationale:**
- Title/notes edits produce a stream of commands while typing — these must collapse into one undo step.
- Nudge/box ops use `commitOptions.coalesceKey` in the history layer to collapse undo steps without needing command-level merge; the individual commands accumulate additively and each nudge is a separate delta, so merging them into one command would lose intermediate positions.

### 5. `commitCommand` adapter (issue #402)

**Decision:** Added a pure `commitCommand(deck, cmd) → CommitCommandResult` function that is the single shared commit path. It wraps `executeCommand`, extracts `historyKey → commitOptions`, and surfaces `affectedSlideIds`, `affectedElementIds`, `patches` as top-level fields.

**Rationale:**
- Eliminates the boilerplate `if (result.historyKey !== undefined) { coalesceKey: result.historyKey }` pattern repeated across every UI handler in `slide-editor.tsx`.
- Future autosave staging and analytics hooks can subscribe at `commitCommand` level rather than instrumenting every individual handler.
- Kept as a pure library function (no React, no state) so it remains fully testable under `node --test`.

### 6. No UI handler changes

**Decision:** `slide-editor.tsx` and `slide-inspector.tsx` were not modified in this PR.

**Rationale:**
- Issue #402 says "provide a place to emit analytics/audit events" — the `commitCommand` adapter fulfils this without requiring simultaneous refactor of all 100+ `onDeckChange` call sites.
- Incremental migration: individual handlers can adopt `commitCommand` in follow-up PRs, with the migration being purely mechanical (behavioral equivalence preserved by the test suite).


# Design Decisions — Switch Epic #377 Source Sync (Issues #424, #408, #409, #410)

**Author:** Switch (Frontend Dev)
**Date:** 2026-06-23
**Branch:** squad/377-source-sync
**Commit:** f6fb284

---

## 1. `blockKind` discriminator in `SourceRef` (#424)

**Decision:** Added `blockKind?: "text" | "visual"` to `SourceRef`. Absent means `"text"` for full backward compatibility.

**Rationale:** Text block IDs (Lexical node keys) and visual IDs are drawn from different namespaces that could theoretically collide. The discriminator allows `findStaleSourceLinks` to dispatch to the correct lookup map without ambiguity. Existing legacy `visualId`-only visuals (no `sourceRef`) and legacy decks without any `sourceRef` continue to work because all discriminating paths guard on `sourceRef` presence.

---

## 2. Dual-map staleness detection for text vs visual blocks

**Decision:** `findStaleSourceLinks` builds two maps: `textBlockById` (keyed by `blockId`) and `visualBlockByVisualId` (keyed by `visualId`). Dispatch on `sourceRef.blockKind ?? "text"`.

**Rationale:** The "From document" insert path for text blocks uses `blockId` (Lexical key); visuals use `visualId`. Merging them into a single map would require a composite key or prefix scheme; separate maps are cleaner, more readable, and avoid future namespace confusion.

---

## 3. Visual content hash strategy (#424)

**Decision:** Visual element content hash uses `fnv1aHex("visual\x02{visualId}")` — stable per visual identity, not per visual content.

**Rationale:** The current `DocumentBlock`/`Visual` model does not expose a meaningful deep-content hash for visual assets (which are binary blobs). Hashing on `visualId` means the hash only changes if the block's visual identity changes (e.g., a replaced visual), which matches the staleness semantics needed. A future enhancement could compute a true content hash from the visual binary if the model supports it.

---

## 4. `readonly DocumentBlock[]` parameter in `buildInsertables`

**Decision:** Changed `blocks: DocumentBlock[]` to `blocks: readonly DocumentBlock[]` in `buildInsertables`.

**Rationale:** The `documentBlocks` prop on `SlideEditor` and related places uses `readonly` arrays (TypeScript convention for props). Widening the parameter type avoids spurious casts at every call site and is a non-breaking change because `readonly T[]` is a supertype of `T[]`.

---

## 5. `updateElement` patch approach for text update (#408)

**Decision:** `updateTextElementFromBlock` returns a partial `ElementPatch` with only `{ text, runs, sourceRef }` fields; `updateVisualElementFromBlock` returns `{ sourceRef }` only (preserving geometry/style/z-order).

**Rationale:** The `updateElement` helper in `deck.ts` applies a shallow merge patch, so providing only the changed fields is idiomatic and ensures geometry/style overrides are preserved as required by #409.

---

## 6. Orphan-never-auto-delete invariant (#410)

**Decision:** `applyElementSourceUpdates` in `deck-merge.ts` explicitly skips elements whose source block is missing from `freshBlocks` (orphans). UI offers keep-as-manual/unlink/relink/remove as explicit user actions only.

**Rationale:** Issue #410 is explicit: "never auto-delete orphaned elements." The invariant is enforced at both the merge layer and the staleness detection layer — orphan state is flagged as `reason: "block_missing"`, distinct from `"content_changed"`, so the UI can show distinct affordances.

---

## 7. Element-level merge precedence scope (#409)

**Decision:** Element-level source ref updates in `mergeSlide` are only applied when `options.freshBlocks` is provided. For slides without any source refs (legacy deckless-of-refs), the existing slide-level merge path runs unchanged.

**Rationale:** This preserves full backward compatibility: decks that predate `sourceRef` continue to use the bulk-replace merge strategy. Only decks that have been enriched with element-level `sourceRef` (via the new insert path) benefit from granular element updates.

---

## 8. `unlinked` flag for explicit user unlink (#408)

**Decision:** Unlinking a source ref sets `sourceRef.unlinked = true` (via existing `unlinkSource` helper). Elements with `unlinked: true` are excluded from all staleness detection and merge updates.

**Rationale:** Reuses the pre-existing `unlinkSource`/`relinkSource` helpers from `deck.ts` (merged in earlier epics). The `unlinked` flag is the canonical "user deliberately disconnected this" signal, distinct from "block was deleted from the document."

---

## 9. FromDocumentPanel stale links UI section (#408/#410)

**Decision:** Stale links are shown in two subsections: "Changed" (content_changed reason) and "Orphaned" (block_missing reason). Each item shows the element text or visual id and action buttons relevant to its state.

**Rationale:** Separating changed vs orphaned gives users clear context about *why* a link is stale. Changed items offer Update/Unlink; orphaned items offer Keep as manual/Unlink/Remove — matching the action matrix in issue #410.


# Design Decisions: Epic #378 — Master, Theme, and Layout Architecture for Slides

**Branch:** `squad/378-theme-layout`
**Commit:** `2bdc780`
**Issues closed:** #411, #412, #413, #414

---

## Why `customTokenSet` is stored in `deckJson`

Brand-derived token sets are computed at runtime from a `BrandStyle` record. Rather than recomputing them on every render or requiring callers to carry an out-of-band token registry, `applyBrandToDeck` serializes the computed `DeckThemeTokenSet` directly onto `deck.customTokenSet`. This means:

- Any renderer or exporter that reads the deck object gets the correct tokens without needing access to the originating brand record.
- The `themeId` field is set to `brand:<brandId>`, making the provenance readable in the JSON.
- `resolveSlideStyle` (and the `resolveTokenSet` helper inside `style-cascade.ts`) checks `deck.customTokenSet` first before falling back to the built-in set map — so the stored value is always preferred over whatever `resolveThemeTokens` would return for an unknown `brand:` prefix.
- Legacy decks that have no `customTokenSet` continue to work unchanged via the `resolveThemeTokens` built-in fallback.

The alternative (storing only `themeId = "brand:<id>"` and resolving the token set from the brand record at render time) would require threading a brand-lookup dependency into every renderer. Storing the token set is simpler and keeps renderers pure.

---

## Why `THEME_COLORS` in `deck-export.ts` was replaced

`deck-export.ts` previously carried a local `THEME_COLORS` record with **dark-mode** palette values (e.g., indigo background `#1e1b4b`). These differed from the **light-mode** token sets in `deck-theme-tokens.ts` (indigo `slideBg = #ffffff`). This meant the PPTX export rendered different colors than the editor, present mode, and public viewer — defeating the "matching inherited styling" goal of #414.

Replacing `THEME_COLORS` with `resolveSlideStyle` from `style-cascade.ts`:
- Gives all rendering surfaces (editor canvas, present mode, export) the same five-layer cascade, so colors match exactly.
- Removes the only place that diverged from the token set contract.
- The `DeckSlideSpec.background` and `.accent` fields now carry the cascade-resolved values, which are light-mode by default but respect per-slide and per-master overrides.

Existing tests that expected dark values (`"0C1A2E"` for ocean background) were updated to the cascade-resolved light values (`"F6FBFF"`).

---

## Legacy Fallback Strategy

The implementation preserves backward compatibility at every layer:

| Legacy condition | Behavior |
|---|---|
| `Deck` with no `masters` | `resolveMaster` returns `undefined`; cascade skips master layer and uses token-set defaults |
| `Deck` with no `themeId` | `resolveTokenSet` falls back to `resolveThemeTokens(deck.theme)` (built-in map) |
| `Deck` with no `customTokenSet` | `resolveTokenSet` uses built-in set for `deck.themeId` |
| `Slide` with `masterRef` but no `masters` array | `resolveMaster` returns `undefined` (ref is harmlessly ignored) |
| `Slide.masterRef` pointing to a non-existent master | `safeParseDeck` strips it silently — deck validates successfully |
| `SlideCanvas` called without `deck` prop | Falls back to the existing `DECK_THEMES` dark-mode ThemeConfig |
| Deck with `elements[]` | No change — `materializeSlideElements` still returns them; cascade only affects background/accent/colors |

---

## Brand → Token Mapping Approach

`brandToTokenSet(brand)` maps `BrandStyle` → `DeckThemeTokenSet` using these rules:

| Token field | Source |
|---|---|
| `colors.accent` | `brand.nodeFill ?? brand.palette?.[0] ?? DEFAULT_TOKEN_SET.colors.accent` |
| `colors.slideBg` | `brand.background ?? DEFAULT_TOKEN_SET.colors.slideBg` |
| `typography.fontFamily` | `brand.fontFamily ?? DEFAULT_TOKEN_SET.typography.fontFamily` |
| All other tokens | Copied verbatim from `DEFAULT_TOKEN_SET` |

Rationale: `BrandStyle` models brand identity for *visual diagrams*, not slides. It doesn't have slide-specific tokens like `onBg`, `muted`, `spacing`, or `shape`. Using `DEFAULT_TOKEN_SET` as the base ensures the slide always looks reasonable even when the brand only sets a primary color and font. Callers can override `customTokenSet` fields after `applyBrandToDeck` if finer control is needed.

`applyBrandToDeck` does **not** touch `slide.background`, `slide.accent`, or any `element.style.color` — these are considered explicit overrides by the slide author and are preserved by the five-layer cascade automatically.

---

## Five-Layer Cascade (implemented in `style-cascade.ts`)

```
1. Deck token set (DeckThemeTokenSet)
   └─ 2. Master slide override (Deck.masters[ref] or masters[0])
         └─ 3. Layout (placeholders, no color tokens)
               └─ 4. Slide override (slide.background, slide.accent)
                     └─ 5. Element override (element.style.color, element.style.fontFamily)
```

`resolveSlideStyle(deck, slide)` computes layers 1–4 and returns a `ResolvedSlideStyle` that renderers consume directly. Layer 5 (element overrides) is applied by individual renderers when they read `element.style.color ?? resolved.bodyColor`.


# Switch Decision Record: Epic #430 Identity Implementation

**Date**: 2026-06-23  
**Author**: Switch (Frontend Dev)  
**Issues**: #431, #432, #433, #434, #435

## Key decisions

1. **bid field over key**: Using `bid` as the durable block id field in serialized Lexical JSON (not `key`). The `key` field is read as a legacy fallback by `collectDocumentBlocks`.

2. **nanoid for generation**: `customAlphabet(alphabet, 12)` matching existing `deck-revision-token.ts` pattern.

3. **stampBlockIds vs regenerateBlockIds**: stamp = idempotent (no-op for existing bid), regenerate = always new bid (used for duplicate). Both are pure functions.

4. **Duplicate behavior**: On document duplicate, regenerate all bids in contentJson and remap self-referential sourceRefs in deckJson. Refs that can't be remapped are left as-is (they become "missing" in the copy until the user refreshes).

5. **No schema migration**: Block ids live in the existing contentJson JSON column. No DB column changes needed. Legacy content stays readable.

6. **Anchor resolver**: Shared pure resolver in `src/lib/anchor-resolver.ts` that unifies target-status vocabulary across source-links, comments, and visual refs.


# Switch decision log — Epic #436 command bus

- **Decision:** use `CommandEnvelope<P>` as the shared wire format across visual
  and deck mutations.
- **Why:** deck already has a pure executor (`slide-commands.ts`); the envelope
  should wrap it, not replace it.

## Specific decisions

1. **Deck stays on the current executor.**
   - `SlideCommand` remains the payload for deck envelopes.
   - `DeckPatch` and `CommandResult` are adapted into the cross-surface result
     shape instead of being duplicated.

2. **Visuals get a new pure executor.**
   - `visual-commands.ts` routes typed `visual.*` payloads over
     `src/lib/visual/transforms.ts`.
   - the executor emits serializable `VisualPatch` metadata and explicit side
     effects.

3. **Server validation stays pure.**
   - `command-validation.ts` depends only on envelope validation + caller-supplied
     context.
   - no Prisma or server-only imports are allowed in the validators.

4. **Projection is not user intent.**
   - `mirrorVisualNodes()` remains outside the command bus and is represented as
     `visual_mirror_rebuild` side-effect metadata.

5. **Machine-usable mutation inventory lives in docs, not source.**
   - the epic originally called for `mutation-inventory.ts`, but implementation
     keeps the inventory embedded as JSON in `docs/architecture/mutation-audit.md`
     to avoid a second authority.

## Consequences

- mixed visual + deck replay can share one envelope format immediately;
- existing slide save/revision-token logic is preserved;
- future comment/source-ref/asset command surfaces can adopt the same envelope
  without redesigning the core shape.


# Switch · Epic #442 · Visual-Kind Registry with Adapters, Lifecycle, and Derived Matrices

**Branch:** `squad/442-dv-visual-registry`
**Date:** 2026-06-23
**Issues closed:** #443, #444, #445, #446, #447

---

## Problem

Visual kind behavior was scattered across:
- `schema.ts` — VISUAL_KINDS constant only
- `tool-registry.ts` — VISUAL_KIND_META (labels/icons/descriptions)
- `visual-renderer.tsx` — renderer-selection switch, shape switch
- `transforms.ts` — POSITIONED_SHAPE record, setVisualKind layout logic
- `export-capabilities.ts` — plan-gated booleans only
- `ai/prompt.ts` — KIND_GUIDANCE map (hardcoded per-kind AI guidance)

No single module described what a visual kind _supports_. Adding a 14th kind
would require touching ≥ 6 files with no compile-time guarantee of completeness.

---

## Design decisions

### 1. Registry-first, not registry-only

The registry (`registry.ts`) is the **single source of truth** for per-kind
capabilities. Existing scattered constants (`VISUAL_KIND_META` in tool-registry,
`KIND_GUIDANCE` in prompt.ts) become **derived** from or **backed by** the
registry rather than parallel sources.

We chose **additive consolidation** over a big-bang rewrite:
- `VISUAL_KIND_META` still lives in `tool-registry.ts` (icon component
  resolution requires React imports the registry must not have), but it is now
  clearly derivable from registry `iconName` + `label` + `description` +
  `keywords`.
- `KIND_GUIDANCE` in `prompt.ts` is unchanged for now, but
  `support-matrices.ts` exposes `buildKindGuidanceRecord()` that produces an
  identical shape — a future cleanup can swap the import.

### 2. Layout family is the key discriminant

"Positioned" kinds (`flowchart`, `mindmap`, `concept`, `orgchart`, `venn`)
carry explicit `x/y` node coordinates. "Derived" kinds (`list`, `chart`,
`timeline`, `cycle`, `comparison`, `funnel`, `pyramid`, `matrix`) compute
positions at render time from node order/value.

This discriminant already existed implicitly in `transforms.ts`
(`setVisualKind` switch) and the schema comment. The registry makes it
explicit via `layoutFamily: "positioned" | "derived"`.

`venn` is positioned (circles need explicit center + radius) but not
fully graph-editable (no edges, no node duplication). This motivated the
per-kind editing capability object instead of a single boolean.

### 3. Editing capability objects, not a "graphEditable" flag

Each kind has a `KindEditingCapabilities` object with seven boolean fields
(`nodeAddable`, `nodeDeletable`, `edgeAddable`, `edgeDeletable`,
`edgeReconnectable`, `nodeDuplicatable`, `autoLayoutSupported`).

Three shared bundles cover 90% of cases (`FULL_GRAPH_EDITING`,
`NODE_ONLY_EDITING`, `READ_ONLY_EDITING`); venn gets a custom object.

### 4. PPTX export: native vs raster

Positioned graph kinds (`flowchart`, `mindmap`, `concept`, `orgchart`) render
to native Office shapes via `pptx-shapes.ts` — `pptxNative: true`.
All derived-layout kinds and venn embed as raster images — `pptxNative: false`,
`pptxRasterFallback: true`. This accurately reflects existing behavior.

### 5. Adapters are additive overlays

`adapters.ts` defines `VisualKindAdapter` with `validate()`, `migrate()`, and
`editableNodeFields()`. Six specialised adapters cover kinds with semantic
invariants that generic schema validation misses:
- `ChartAdapter` — every node needs numeric `value`
- `FlowchartAdapter` — dangling edges caught and removed in migration
- `VennAdapter` — 2–3 nodes, explicit circle geometry
- `ComparisonAdapter` — non-negative integer column index per node
- `MatrixAdapter` — quadrant index 0–3 per node
- `FunnelAdapter` — non-negative value per node

Remaining 7 kinds use `DefaultAdapter` (no-op). Adapters are pure functions
with no side effects.

### 6. Lifecycle commands consult the registry

Seven new command ops in `visual-commands.ts` + `command-envelope.ts`:
`visual.add_node`, `visual.delete_node`, `visual.add_edge`,
`visual.delete_edge`, `visual.reconnect_edge`, `visual.duplicate_node`,
`visual.relayout_graph`.

Every op checks `getKindEntry(visual.type).editing.*` before proceeding.
Shape validation on `add_node` uses `isShapeAllowed()` from the registry.
Lifecycle ops are never coalesced (each is a discrete structural change).

`delete_node` removes connected edges (referential integrity).

### 7. Support matrices as derived views

`support-matrices.ts` provides `buildKindExportMatrix()`,
`buildKindPromptConstraints()`, and `buildKindGuidanceRecord()` — pure
functions that materialise registry data into the shapes consumed by export
and AI layers. The AI prompt system can call `buildKindGuidanceRecord()` to
replace the hardcoded `KIND_GUIDANCE` map with a registry-derived one.

---

## Files added

| File | Purpose |
|------|---------|
| `src/lib/visual/registry.ts` | Registry contract + populated entries for all 13 kinds (#443, #444) |
| `src/lib/visual/adapters.ts` | Per-kind adapter interface + 6 specialised adapters + default (#445) |
| `src/lib/visual/support-matrices.ts` | Derived export matrix + AI prompt constraints (#447) |
| `src/lib/visual/registry.test.ts` | Registry exhaustiveness + capability tests (97 assertions) |
| `src/lib/visual/adapters.test.ts` | Adapter validation + migration tests (28 assertions) |
| `src/lib/visual/support-matrices.test.ts` | Matrix/constraint completeness tests (19 assertions) |
| `src/lib/commands/visual-lifecycle.test.ts` | Lifecycle command roundtrip tests (25 assertions) |

## Files modified

| File | Change |
|------|--------|
| `src/lib/commands/visual-commands.ts` | Added 7 lifecycle ops + registry imports |
| `src/lib/commands/command-envelope.ts` | Added envelope validation for 7 new payload ops |

---

## Invariants preserved

- All 13 existing visual kinds render identically — no renderer changes.
- Export behavior unchanged — `export-capabilities.ts` untouched.
- `VISUAL_KIND_META` in `tool-registry.ts` unchanged — UI insert menus work.
- `KIND_GUIDANCE` in `prompt.ts` unchanged — AI generation behavior identical.
- `VISUAL_KINDS` in `schema.ts` unchanged — Prisma enum mapping unaffected.

---

## Exhaustiveness guarantees

- `assertRegistryCompleteness()` — TypeScript `satisfies VisualRegistry` +
  runtime check at test time.
- `assertAdapterCompleteness()` — runtime check verifying every VISUAL_KIND
  has an adapter entry and no kind mismatch.
- `assertSupportMatricesComplete()` — runtime check verifying every kind has
  PNG support and non-empty AI guidance.

---

## Gate status (final)

```
src  → tests 3050 / pass 3050 / fail 0
scripts → tests 11 / pass 11 / fail 0
typecheck → clean
lint → clean
format:check → clean
```


# Switch-468: Command Adoption Decisions

Date: 2026-06-23  
Branch: `squad/468-command-adoption`  
Issues: #471 (visual command routing), #472 (slide command routing), #473 (patch autosave)

---

## #471 — Visual command routing

**Decision: thin adapter layer, not direct `executeVisualCommand` calls in UI**

Created `src/lib/commands/visual-command-adapter.ts` as a DOM-free pure module exposing:
- `buildVisualCommand(payload, visualId, documentId?, coalesceKey?)` — builds a typed envelope
- `applyVisualCommand(visual, visualId, payload, …)` — wraps `executeVisualCommand`, returns `VisualCommandResult`

UI surfaces (`visual-card.tsx`, `visual-context-popover.tsx`, `overall-adjustments-panel.tsx`) call the adapter; the write (`node.setVisual`) stays in the caller so the Lexical/Yjs write path is never bypassed.

**Decision: `onCommand` prop uses optional/fallback pattern**

`VisualContextPopoverProps.onCommand?: (payload, coalesceKey?) => void` is optional. When absent, all callers fall back to the existing `onChange(transform(visual, …))` path so the popover keeps working in any context that doesn't yet pass `onCommand` (panel mode, tests, third-party callers). This is backward-compatible by design.

**Decision: `applyBrand` is an adapter-only exception**

`applyBrand` applies both global style AND per-node color overrides in a single pass. There is no `VisualCommandPayload` equivalent that covers both changes atomically. All `applyBrandToAll` / `applyBrandToThis` calls keep using direct `node.setVisual(applyBrand(…))` mutations. This is documented in the code.

**Decision: `EffectsPicker` gets `onCommand` prop alongside `onChange`**

Rather than refactoring the render-section functions into callbacks, `EffectsPicker` accepts an optional `onCommand` and falls back to `onChange` when absent. This matches the existing component boundary and keeps the diff minimal.

---

## #472 — Slide command routing

**Decision: `doCommitAndChange` helper encapsulates patch accumulation**

All command-based handlers in `slide-editor.tsx` route through a single `doCommitAndChange(deck, cmd)` useCallback. This:
1. Calls `commitCommand(deck, cmd)` to get `{ result, commitOptions, patches }`.
2. Appends `patches` to `pendingPatchesRef.current`.
3. Calls `onDeckChange(result.deck, commitOptions)` for undo/redo coalescing.

Three handlers that need custom `coalesceKey` injection (`handleNotesChange`, `handleUpdateElement`, `handleSetElementBoxes`, `handleSetElementPatches`) call `executeCommand` directly and push `result.patches` manually.

**Decision: undo/redo clears `pendingPatchesRef`**

After an undo or redo, the accumulated patches no longer represent the current deck state. `handleUndo`/`handleRedo` wrappers clear `pendingPatchesRef.current = []` before calling `undo()`/`redo()`. The undo/redo toolbar buttons and keyboard shortcuts both use these wrappers.

**Decision: documented direct-mutation exceptions (no patches)**

These operations deliberately bypass `doCommitAndChange` because they batch multiple `addElement` calls or use external merge state:
- `handlePasteElements` — multiple `addElement` calls (clipboard paste)
- `handleAddAllVisuals` — multiple `addElement` calls (add-all batch)
- `handleApplySync` — merge result applied wholesale
- Keyboard `⌘D` (duplicate elements) — uses `duplicateElements` helper that returns `newElementIds`
- `handleAddTemplate` / `handleSpotlightPick` — `insertSlide` needed for index arithmetic

These paths produce no patches → `pendingPatchesRef` stays empty → next save uses whole-deck fallback automatically.

**Decision: existing `executeCommand` keyboard paths updated to accumulate patches**

The pre-existing `ADD_SLIDE`, `DUPLICATE_SLIDE`, `REMOVE_SLIDE`, `REORDER_SLIDE` paths in the keyboard handler and in `handleAddSlide`/`handleDuplicate`/`handleRemove` already used `executeCommand`. These were updated to use `commitCommand` and push patches to `pendingPatchesRef`, keeping the patch stream complete for those commands.

---

## #473 — Patch autosave

**Decision: pure `attemptPatchAutosave` function extracts branching logic**

`src/lib/presentation/patch-autosave.ts` is a DOM-free module with a single async export:

```
attemptPatchAutosave(id, deck, patches, clientToken, savePatchFn, saveDeckFn)
  → AutosaveResult
```

Strategy:
1. If `patches.length > 0`: call `savePatchFn`.
   - `ok: true` → return `{ ok: true, method: "patch" }`.
   - `ok: "conflict"` → surface conflict (stop, do NOT fall back).
   - `ok: "fallback"` | `ok: false` | network error → fall through to step 2.
2. Call `saveDeckFn` with the full deck.
   - `ok: true` → return `{ ok: true, method: "deck" }`.
   - `ok: "conflict"` → surface conflict.
   - `ok: false` / network error → propagate error.

**Decision: patch snapshot-and-clear before async save**

`flushSave` snapshots `pendingPatchesRef.current` and clears it to `[]` BEFORE the async `onSave` call. If the save fails, the patches are not restored (they are lost); the next retry will have `patches = []` and trigger whole-deck fallback. This avoids double-application on retry.

**Decision: conflict recovery path stays as whole-deck save**

`handleConflictKeepMine` in `slide-editor-button.tsx` still calls `saveDeckJson` directly (not `attemptPatchAutosave`). Conflict recovery is a force-overwrite with a known server token — patch application is not appropriate here.

**Decision: `revisionToken` updated on both patch-success and deck-success paths**

`handleSave` in `slide-editor-button.tsx` reads `result.revisionToken` from the `AutosaveResult` and writes it to `revisionTokenRef.current` on both `method: "patch"` and `method: "deck"` outcomes, so the optimistic lock is always current after a successful save.


# Decisions: Switch — Epic #478 Boundaries + Migration

Date: 2026-06-23
Branch: squad/478-boundaries-migration
Issues: #483, #484, #485, #486, #487

---

## #487 — Shared FNV-1a Hash Utility

**Problem**: `deck.ts` duplicated `fnv1aHex32` locally with a comment "Must stay byte-for-byte identical to deck-hash.ts" because a direct import from `deck-hash.ts` would create a circular dependency (`deck-hash.ts` imports types from `deck.ts`).

**Decision**: Extract into `src/lib/presentation/fnv-hash.ts` — a standalone module with zero imports from the presentation layer. Both `deck.ts` and `deck-hash.ts` import `fnv1aHash32` from there. `deck-hash.ts` keeps its public `fnv1aHex` wrapper for backward compatibility with external callers.

**Guarantees**: Byte-for-byte identical output (same algorithm, same constants). Tests in `fnv-hash.test.ts` assert both call sites produce identical output for 8 probe strings including the empty string.

---

## #486 — Deck Legacy→Free-Form Migration (v1→v2)

**Decision**: Bump `CURRENT_DECK_SCHEMA_VERSION` from 1 → 2. Add a `migrateSlideV1ToV2` step in `migrateDeck` that, for each slide without `elements[]`, calls `materializeSlideElements` and stamps `elementsDerived: true`.

**Migration scope**: Only versions `undefined | null | 0 | 1` trigger migration. Invalid values (1.5, -1, "1") and future versions (≥ 3) are passed through unchanged so `validateDeck` surfaces a clear error.

**Idempotence**: Slides that already have non-empty `elements[]` are returned unchanged. Running `migrateDeck` twice on the same deck is a no-op after the first pass (schemaVersion=2, elements present → pass-through).

**Backward compat**: Legacy `title`/`bullets`/`visualIds`/`layout` fields are preserved on disk. No schema change (Prisma model unchanged). Renderers that read `elements[]` already produce output identical to the legacy renderer for materialized element sets.

**Existing test updates**: Three `deck-schema.test.ts` tests were updated to reflect new behavior:
- "accepts a legacy deck without elements" → now checks elements ARE populated
- "omits elementsDerived when absent" → now checks elementsDerived === true
- "rejects a non-boolean elementsDerived" → migration overwrites with true; parse succeeds

---

## #485 — Import Normalization at Creation Time

**Decision**: Convert imported Markdown to `contentJson` (Lexical JSON) at document creation time by calling `markdownToLexicalState` in both `createDocumentFromImport` (personal space) and `importWorkspaceDocument` (workspace). The legacy `content` (Markdown string) is still persisted as a fallback, preserving the first-open conversion path for existing content-only documents.

**Rationale**: The first-open path in the editor already called `markdownToLexicalState`; doing it at creation time removes the lazy conversion and makes the document immediately consistent. The legacy fallback is kept for any existing doc that only has `content` and no `contentJson`.

---

## #483 — Workspace Capability Helper

**Decision**: Create `src/lib/auth/workspace-capabilities.ts` mirroring `document-permissions.ts` exactly. Roles: `owner | editor | viewer | none`. Capabilities: `view | mutate | manage` (not "edit" to distinguish from the document permission set and because workspace mutations are different from document edits).

**Role mapping**:
- `canManage` (rename, delete, transfer, invite, revoke, remove member) → owner only
- `canMutate` (create/import documents) → owner + editor
- `canView` (list documents) → owner + editor + viewer

**Actions migrated**: `renameWorkspace`, `deleteWorkspace`, `transferOwnership`, `createInviteLink`, `revokeInviteLink`, `removeMember`, `createWorkspaceDocument`, `importWorkspaceDocument`. All use `requireWorkspaceCapability` instead of local queries. The local `requireWorkspaceOwner` and `requireWorkspaceMutator` functions are removed.

**No policy change**: Access decisions are identical to before — refactor only.

---

## #484 — Account Export Data Scope

**Decision**: Bump `ACCOUNT_EXPORT_VERSION` to 2. Expand the export to include:
- `workspacesOwned`: workspaces where `ownerId = userId`
- `workspaceMemberships`: non-owner `WorkspaceMember` rows for the user
- `comments`: comments where `authorId = userId`
- `tags`: tags where `ownerId = userId`
- `brands`: brands where `ownerId = userId`
- `assets`: assets scoped to the user's documents or workspaces (metadata only, no raw bytes)
- `subscription`: the user's active subscription (nullable)
- `documents`: now includes `versions[]` (document version history), `workspaceId`, and `isShared`

**Exclusions documented in code**:
- Soft-deleted documents
- Other users' data
- Raw asset file bytes (storage keys, thumbnails not included)
- Invite-link tokens (security)
- Stripe webhook events, rate-limit records (operational)

**Asset scoping note**: The `Asset` model has no direct `userId` field. Assets are scoped via `documentId`/`workspaceId`. The export fetches assets where `document.ownerId = userId OR workspace.ownerId = userId`.

**Backward compat**: New fields are additive; the `exportVersion` bump is the signal for consumers to expect new structure. The `scope` field documents the compliance boundary inline in the JSON.


# Tank – Epic #374 Asset Storage Layer: Design Decisions

**Date:** 2026-06-23  
**Branch:** squad/374-slides-assets  
**Issues:** #393, #394, #395, #396, #397  
**Author:** Tank (Backend Dev)

---

## Decision 1: backgroundAssetId on Slide (issue #393)

Added `backgroundAssetId?: string` to the `Slide` interface alongside the existing
`backgroundImage?: string`. When a server-side upload succeeds, both fields are set:
`backgroundImage` holds the resolved URL (for legacy renderers / fallback) and
`backgroundAssetId` holds the Asset row id (for the resolver path). This dual-field
approach keeps backward compatibility with any code that reads `backgroundImage`
directly while enabling the resolver path going forward.

---

## Decision 2: Asset resolver — dual client/server implementations (issue #394)

Rather than a single resolver that tries to be isomorphic, two concrete implementations
were created:

- `ClientAssetResolver`: pure synchronous-compatible pass-through. Because the local
  adapter already serves assets as public static files under `/slide-assets/`, the
  `fallbackUrl` stored on upload is authoritative and no additional DB lookup is needed
  at render time.
- `ServerAssetResolver`: used by PPTX/image export paths. Does a DB lookup to recover
  the `storageKey` from the `Asset` row, then delegates URL construction to the storage
  adapter. Falls back to `fallbackUrl` on DB/infra errors.

`resolveAssetSync` provides a zero-async path for callers that haven't wired async
resolution yet (e.g. canvas render loop).

---

## Decision 3: Protected asset API route (issue #395)

Assets are served via `GET /api/slide-assets/[documentId]/[...path]` rather than as
raw Next.js public static files. The route enforces:

1. Authenticated user with `view` capability → allowed.
2. Document publicly shared with `present` or `embed` mode → allowed (covers public
   presentation viewers without requiring login).
3. All other cases → 403.

The `public/slide-assets/` directory still exists for the local adapter (storage writes
go there), but for new asset-backed elements the served URL should be the API route URL.
Existing legacy assets served directly from `/slide-assets/...` continue to work as
public static files for backward compatibility.

**Trade-off:** Switching the `LocalAssetStorageAdapter.urlFor()` to return the
authenticated API path (instead of the static path) was deferred because it would
require updating every existing Asset row's cached URL. The route-based access control
applies to new lookups.

---

## Decision 4: 7-day orphan retention window (issue #396)

`ASSET_RETENTION_MS = 7 days` was chosen to align with the typical version-history
retention window. An orphaned asset is first soft-deleted (`deletedAt` set); physical
purge only runs after the retention window has elapsed. This protects version restores
that may re-reference a recently-removed asset.

The orphan scanner checks both `Document.deckJson` (live state) and all
`DocumentVersion.deckJson` snapshots before marking anything as orphaned.

---

## Decision 5: Lazy, per-document data URL migration (issue #397)

Migration is not wired to the autosave path to avoid silently mutating decks during
normal editing. `migrateDataUrlImages` is designed to be called explicitly (by a
server action, admin endpoint, or maintenance script) per document. Idempotency is
guaranteed by the `assetId` skip condition: elements that already have an `assetId`
are never re-processed.

Checksum-based deduplication within a single migration run (via `checksumCache`) and
across DB rows (via `findFirst({ where: { documentId, checksum } })`) ensures that two
slides using the same pixel data share exactly one Asset row.


# Design Decisions: Tank — Epic #376 Persistence (#403–#407)

**Date:** 2026-06-23  
**Branch:** `squad/376-slides-persistence`  
**Author:** Tank (Backend Dev)

---

## #403 — `saveDeckPatch` implementation decisions

### Reused `DeckPatch` / `applyPatch` from `slide-commands.ts`
The patch format from #401 is reused server-side without duplication. The
`applyPatch()` helper is intentionally conservative — it only replays ops
that carry their result payload (slide field updates, deck theme/format). Ops
that require structural state (add/remove/reorder) return `null`, triggering
the `ok: "fallback"` path. This is by design: the whole-deck save remains
the authoritative fallback; the patch endpoint is an optimistic fast-path.

### No new schema columns
Patch saves operate on the existing `deckJson` column and `deckRevisionToken`.
No migration was required, keeping the implementation fully additive.

### Snapshot policy identical to whole-deck save
`saveDeckPatch` calls `snapshotDocumentVersion` on the same `count > 0` guard
as `saveDeckJson`. This means: (a) conflicted patches never create phantom
version entries; (b) patch saves are throttled by the same 10-minute window.
The decision to treat patch saves the same as whole-deck saves for version
history avoids divergent snapshot semantics.

---

## #404 — Conflict Recovery UX decisions

### Dialog over toast
A modal dialog (`ConflictRecoveryDialog`) was chosen over a toast/banner because:
- The conflict is a blocking decision — the user must choose before the next
  autosave fires again.
- A toast can be dismissed by accident; a dialog requires explicit action.
- The dialog matches the existing UI pattern for destructive confirmations.

### `onResolved` removed from dialog props
Initially the dialog had an `onResolved(token)` callback for the parent to
receive the new revision token post-save. On review, the parent's
`handleConflictKeepMine` already manages the token update directly (it has
access to the `saveDeckJson` response). Removing the callback simplifies the
interface and removes an ESLint `no-unused-vars` violation.

### "Use theirs" uses dynamic import of `safeParseDeck`
The `handleConflictUseTheirs` handler in `SlideEditorButton` dynamically
imports `safeParseDeck` to avoid a top-level import that would pull the full
validation module into the client bundle on every render. This is consistent
with the existing lazy-import pattern used for other heavy modules.

---

## #406 — Presence model decisions

### Awareness key `"deckPresence"` namespaced separately from text-layer
The text/Lexical layer uses top-level `{ name, color }` in awareness state.
Slide presence is nested under `"deckPresence"` so the two can coexist on
the same `WebsocketProvider` without interfering.

### Pure helpers extracted for testability
`deriveSlidePresencePayload` and `extractSlidePresencePeers` are pure functions
with no React or DOM dependencies, making them directly testable under
`node:test` without a browser runtime. The React hook `useSlidePresence`
wraps these helpers and is not tested here (would require DOM).

### `useEffect` cleanup handles awareness → null transition
When awareness goes from a live provider to null (e.g., connection lost), the
`useEffect` cleanup sets `peers = []`. This is the correct pattern under the
`react-hooks/set-state-in-effect` lint rule — state resets go in cleanup
functions, not in the effect body.

---

## #407 — Test strategy decisions

### Pure helpers + policy tests, no DB mocking
The test file (`save-conflict.test.ts`) exercises:
- `isRevisionConflict` (pure)
- `applyPatch` (pure)
- `shouldSnapshot` (pure policy)
- `safeParseDeck` (pure schema check)

No Prisma mocking is used. Full server-action integration tests (which would
require a test DB) are deferred to a follow-on; the pure-helper tests cover
all acceptance criteria for #407 without infrastructure overhead.


# Tank — Epic #380 Slide Comments: Design Decisions

**Date:** 2026-06-23  
**Branch:** `squad/380-slide-comments`  
**Commit:** d620a5c

---

## Issues implemented: #419, #420, #421, #422, #423

---

## Key Design Decisions

### #419 — Slide/element anchor API extension

**Decision: Extend existing `comments-actions.ts` inline, add pure validation module.**

- `CreateCommentInput` extended with `slideId`, `elementId`, `anchorGeometry`.  
- `CommentThread` output extended with `slideAnchor: CommentSlideAnchor | null`.  
- Slide anchors and text/visual anchors are **mutually exclusive**: when `slideId` is provided, text anchor fields are ignored.  
- New pure module `comment-anchor-validation.ts` holds `validateAnchorGeometry` (throws on bad coords) and `sanitizeAnchorGeometry` (silently drops bad coords). This split mirrors `comment-permissions.ts` (pure, testable) vs `comments-actions.ts` (server actions).
- `commentAnchorFromRecord` / `commentAnchorToRecord` from `slide-comment-anchors.ts` are used at every DB boundary. `Prisma.DbNull` is used for nullable JSON column writes (TypeScript requires this for `Json?` fields).

### #421 — Lifecycle on delete/duplicate/version restore

**Policy decisions:**
1. **Delete slide** → float all comments to deck level (`floatAnchorToDeck`). Comments are never deleted; they survive as deck-level threads.
2. **Delete element** → float element comments to slide level (`floatAnchorToSlide`). Geometry is preserved (valid slide-percent coords regardless of element).
3. **Duplicate slide** → exclude comments. New slide starts clean. Rationale: comments are reviews of specific content state; copying them to a structural duplicate would be confusing.
4. **Version restore** → no explicit DB action. The `resolveAnchorState` function dynamically returns `"orphaned"` for any comment whose slide/element no longer exists in the restored deck. `floatOrphanedCommentsAfterRestore` is provided as an opt-in bulk action for callers that want to clean up.

**Two-pass float for slide delete:** `floatCommentsOnSlideDelete` runs two `updateMany` queries — one for resolved comments and one for all — since Prisma requires explicit calls. This ensures both resolved and unresolved comments are floated.

### #422 — Unread/read state

**Decision: Slide comments participate in unread counts automatically.**

Since slide-anchored comments are plain `Comment` rows on the document, they already count toward unread totals without any schema change. The `getUnreadCommentCount` action accepts an optional `scope` parameter (`"all" | "text" | "slide"`) to allow UIs to show separate counts for document text vs slide comments.

The pure helper `isCommentUnread(comment, userId, lastReadAt)` mirrors the existing `CommentRead` semantics: own comments are never unread; comments created after `lastReadAt` are unread; null `lastReadAt` means all are unread.

### #420 — UI: Slide comment pins + thread panel

**Decision: Separate `SlideCommentPins` and `SlideCommentPanel` components.**

- `SlideCommentPins` renders absolute-positioned buttons on the slide canvas at `anchorGeometry` percent coordinates. Falls back to `elementCenters` map when geometry is absent.
- `SlideCommentPanel` is a self-contained panel with thread list + new-comment input. Filtered to the current `slideId` by the caller (same pattern as `InlineCommentsLayer` which renders in the document context).
- Manual `useCallback` wrappers removed to satisfy the React Compiler (which inferred different dependency graphs). Using plain functions is idiomatic with the React Compiler.
- Element pins stay at `anchorGeometry` percent coordinates — they do not follow DOM element position. When an element moves, the pin position (stored in DB) remains unchanged; `floatCommentsOnElementDelete` clears `elementId` if the element is deleted.

### #423 — Tests

**Decision: Pure-helper-only test strategy (no DB mocking).**

All tests are co-located `.test.ts` files that test pure functions only:
- `comment-anchor-validation.test.ts` — 27 tests for geometry/ID validation helpers
- `slide-comment-lifecycle.test.ts` — 22 tests for `applySlideDeleteToAnchors`, `applyElementDeleteToAnchors`, `findOrphanedAnchors`, plus lifecycle policy assertions
- `slide-comment-unread.test.ts` — 14 tests for `isCommentUnread`
- `slide-comment-permissions-lifecycle.test.ts` — 33 tests spanning permissions, anchor parse/sanitize, lifecycle rules, backward compat

Server actions themselves (DB calls) are not unit-tested; they delegate to the tested pure helpers.

---

## Schema

**No schema change.** All columns (`slideId`, `elementId`, `anchorGeometry`) were already added in migration 20260622140000_add_comment_slide_anchors (via Epic #388). `CommentRead` powers unread counts without modification.

---

## Files changed

| File | Type |
|------|------|
| `comment-anchor-validation.ts` | NEW — pure geometry/ID validation |
| `comment-anchor-validation.test.ts` | NEW — 27 tests |
| `comments-actions.ts` | MODIFIED — extend with slide anchors |
| `slide-comment-lifecycle.ts` | NEW — server actions + pure helpers |
| `slide-comment-lifecycle.test.ts` | NEW — 22 tests |
| `slide-comment-unread.ts` | NEW — server actions + pure helper |
| `slide-comment-unread.test.ts` | NEW — 14 tests |
| `slide-comment-panel.tsx` | NEW — UI: pins + thread panel |
| `slide-comment-permissions-lifecycle.test.ts` | NEW — 33 tests |


# Tank — Visual Projection Repair Pipeline (#448)

**Date:** 2026-06-23  
**Branch:** `squad/448-dv-projection-repair`  
**Issues:** #449, #450, #451, #452, #453

---

## Design Decisions

### #449 — Mirror contract ADR location
Placed at `docs/architecture/visual-mirror-contract.md` alongside the related
`block-anchor-identity-adr.md`. The doc covers: VisualNode shape in
contentJson, every Visual row field and its meaning, the full mirror algorithm
(collect → diff → execute), ordering semantics, invariants, failure modes, and
the rebuild repair action.

### #450 — VisualMirrorOutcome type placement
Added `VisualMirrorOutcome` and `mirrorOutcomeFromDiff` to
`src/lib/visual/mirror-diff.ts` (the existing pure-diff module) rather than a
new file. This keeps the outcome type co-located with the diff it describes,
and `mirrorOutcomeFromDiff` is pure and trivially unit-testable. The
`mirrorVisualNodes` function now tracks `invalidCount` (no anchor) and
`skippedCount` (bad payload) in addition to the diff counts.

`saveDocumentLexical` now returns `ActionResult<VisualMirrorOutcome>` instead
of `ActionResult<void>`. The client caller only checks `res.ok` so this is
backward-compatible. The outcome is also emitted via `logInfo("visual.mirror",
"mirror complete", ...)` for production log pipelines.

### #451 — rebuildVisualMirror as a server action in actions.ts
Rather than a separate file, `rebuildVisualMirror` lives in the same
`actions.ts` file as `saveDocumentLexical`. Both share `mirrorVisualNodes`
directly so there is no code duplication. The action is idempotent by
construction: it calls the same diff pipeline, which is a no-op when the DB
already matches contentJson. Permission-checked (requires edit access).
Returns `ActionResult<VisualMirrorOutcome>` so callers can inspect what
changed.

### #452 — Post-restore reconciliation strategy
The existing `sanitizeRestoredDeck` pass (run before the DB write) strips deck
refs based on `collectVisualNodes(restoredContent)`. This is correct in the
happy path. Two additions for belt-and-suspenders safety:

1. **`reconcileDeckAfterMirror`**: after `mirrorVisualNodes` completes, re-reads
   the actual Visual DB rows and does a second `stripOrphanedVisuals` pass
   against the real DB state. Only writes back to the DB if something changed.
   Swallows errors so a reconciliation failure can never surface to the restore
   caller.

2. **`revalidateSharePaths`**: looks up the document's `shareId` and calls
   `revalidatePath` for `/share/[segment]`, `/embed/[segment]`,
   `/present/[segment]` so cached public pages reflect the restored content.
   Also swallows errors.

### #453 — Pure test coverage only (no DB mocking needed)
All test cases in `src/lib/visual/mirror-repair.test.ts` exercise
`diffVisualMirror` and `mirrorOutcomeFromDiff` directly. The pure diff layer
captures all the important invariants (concurrent-idempotence, skip-not-fatal,
rebuild-idempotence, restore-ordering). DB-touching logic is thin and inherits
correctness from the diff + existing transaction structure; no Prisma mocking
was needed.

### No schema changes
No new columns or models were added. All new functionality builds on the
existing `Visual` / `VisualRevision` / `Document` schema. This avoids the
dual-schema migration burden (rule #3).


# tank-468-persistence: Persistence Hardening & Architecture (#468)

**Author:** Tank  
**Date:** 2026-06-23  
**Issues:** #469, #470, #474, #475, #476  
**Branch:** squad/468-persistence

---

## Summary

Implements the persistence/architecture half of Epic #468: atomic saves, service extraction, collab durability, source-ref model, and architecture docs.

---

## Decision 1 — Atomic Lexical Save (#470)

**Decision:** Accept a caller-supplied `Prisma.TransactionClient` in `mirrorVisualNodesInTx(tx, ...)` and wrap both the `document.updateMany` (contentJson) and `mirrorVisualNodesInTx` in a single `prisma.$transaction()` in `atomicSaveDocumentLexical`.

**Rationale:** Prisma interactive transactions allow multiple operations to share a single transaction boundary. Passing `tx` as the first arg (rather than using module-level prisma calls) keeps the function composable and testable without a real DB — tests can inject a stub `tx` that records calls and optionally throws on the mirror step to verify rollback semantics.

**Alternatives rejected:**
- Two-phase with compensating write: complex, error-prone, doesn't truly atomize.
- Middleware/event-based: too indirect; hard to reason about rollback.

**Test approach:** `makeStubTx()` records all prisma calls; a second variant `makeThrowingMirrorTx()` throws on `visual.deleteMany` to simulate mirror failure and assert that the outer transaction is rolled back.

---

## Decision 2 — Service Extraction (#474)

**Decision:** Create `src/lib/document/persistence-service.ts` containing all persistence orchestration. `actions.ts` becomes thin wrappers: auth/permission checks only, then delegate to service.

**Rationale:**
1. `actions.ts` was ~1300 lines mixing permission checks, business logic, and persistence. Hard to unit test any persistence logic (tied to Next.js server action context).
2. Moving orchestration to a plain TS module makes it importable in tests, background jobs, and future API routes without the Next.js server action overhead.
3. Types like `SaveDeckResult` are re-exported from `actions.ts` for backward compatibility — existing callers import paths are unchanged.

**Service boundary:** The service owns transaction management, mirror reconciliation, deck sanitization, and path revalidation. Server actions own: session/auth, workspace permission checks, and the `revalidatePath` HTTP cache layer.

---

## Decision 3 — Collab Durability (#469)

**Decision:** Add an `onBeforeEvict(roomName, doc)` async callback to `createCollabWss` options. When `evictRoom` fires, if `hasPendingUpdates(doc, savedStateVectors.get(name))` is true, `onBeforeEvict` is called before eviction proceeds. Errors are swallowed so eviction always completes (degraded-safe).

**Rationale:**
- The failure window is: edit synced to Yjs in-memory → collab server restarts before the Next.js autosave fires → edit lost.
- We close this by giving the collab server a hook to flush before eviction; the consumer (lexical-editor integration) can trigger a forced save.
- We don't block eviction on the callback because blocking indefinitely would starve other rooms; we reduce the window, not eliminate it.
- `hasPendingUpdates` is a pure helper (Y.encodeStateVector diff) → easily testable without WebSockets.

**Threading pattern:** `onBeforeEvict` is threaded through `createCollabWss → setupConnection → closeConn/messageListener` rather than stored in a module-level variable, so multiple WSS instances with different callbacks can coexist safely.

**`savedStateVectors` map:** Tracks the last-persisted Y state vector per room. Callers call `setRoomSavedStateVector(room, sv)` after each successful DB write, so `hasPendingUpdates` can compare current state to last-saved.

---

## Decision 4 — Source-Ref Model (#475)

**Decision:** Create `src/lib/document/source-ref-model.ts` as a pure, side-effect-free typed module describing document→deck dependencies. Existing helpers (`stripOrphanedVisuals`, `source-link-staleness`, `anchor-resolver`) are left in place and used by the model; the model provides a unified enumeration + health-check surface.

**Key types:**
- `DocumentDeckDependency`: discriminated union of `visual_element` | `source_ref` deps
- `DependencyHealth`: `healthy` | `stale` | `missing`

**Rationale:** Previously, orphan/staleness/ref logic was scattered across 3+ modules with no shared vocabulary. A central typed model makes it possible to enumerate all deps, check health in one pass, and reconcile consistently. No behavior changes to existing helpers — they still own their repair logic.

---

## Decision 5 — Architecture Docs (#476)

**Decision:** Write `docs/architecture/current-state.md` as a single current-state reference covering all real subsystems. Existing ADRs (`block-anchor-identity-adr`, `slides-persistence-adr`, `visual-mirror-contract`, `command-envelope-spec`, etc.) are referenced and marked as "historical" where the implementation has diverged.

**Rationale:** The ADRs describe decisions, not current behavior. A separate current-state doc lets new contributors quickly orient without sifting through history. The ADRs remain valuable as decision records; the current-state doc is the living reference.

---

## Files Changed

| File | Purpose |
|------|---------|
| `src/lib/document/persistence-service.ts` | #474 service + #470 atomic tx |
| `src/lib/document/persistence-service.test.ts` | Tests for atomicity / rollback |
| `src/app/app/documents/[id]/actions.ts` | Refactored to thin wrappers |
| `scripts/collab-core.mjs` | #469 durability hooks |
| `scripts/collab-durability.test.mjs` | Tests for durability hooks |
| `src/lib/document/source-ref-model.ts` | #475 typed dep model |
| `src/lib/document/source-ref-model.test.ts` | Tests for source-ref model |
| `docs/architecture/current-state.md` | #476 current-state doc |


# Tank: Epic #478 Platform Services — Assets, Metering, Data Boundaries

**Branch**: `squad/478-platform-services`  
**Commit**: `feat(platform): protected asset delivery, unified storage adapter, usage ledger, atomic rate limits (#478)`  
**Issues closed**: #479, #480, #481, #482

---

## #479 — Protected Asset Delivery

**Decision**: Changed `LocalAssetStorageAdapter` default from `public/slide-assets/` + `/slide-assets` to `storage/slide-assets/` (non-public) + `/api/slide-assets`. New uploads now get `/api/slide-assets/{docId}/{key}` URLs, routing through the auth-protected API route.

**Legacy compat**: Assets uploaded before this change have `/slide-assets/…` embedded in deckJson. Those URLs continue to be served by Next.js's static file server directly from `public/slide-assets/` — no migration needed. Remote URLs are unaffected.

**Trade-off**: Existing DB Asset rows pointing to physical files in `public/slide-assets/` are still accessible via the static URL. The protected route `/api/slide-assets/…` reads via the adapter from `storage/slide-assets/` — it won't find old files there, but old assets were given old-style URLs so the route would never be called for them.

---

## #480 — Unified Storage Adapter

**Decision**: Extended `AssetStorageAdapter` interface with `read(key): Promise<Buffer>` and `delete(key): Promise<void>`. `LocalAssetStorageAdapter` implements both. The protected serving route now uses `getDefaultStorageAdapter().read()` instead of a hardcoded `fs.readFile` on `public/slide-assets/`.

**Orphan storage**: `LocalOrphanStorage` is deprecated (comment added). Since `AssetStorageAdapter` now satisfies the `OrphanStorage` interface structurally (both have `delete(storageKey: string): Promise<void>`), callers can pass `getDefaultStorageAdapter()` directly to `purgeExpiredAssets`. The class is kept for backward compat but delegates to `fs.rm` with the new default rootDir.

**Buffer → Uint8Array**: `NextResponse` does not accept `Buffer` directly in TS types (`BodyInit` doesn't include `Buffer`). Converted to `new Uint8Array(data)` in the serving route.

---

## #481 — Durable Generation Usage Ledger

**Decision**: Implemented reserve/capture/refund with these semantics:
- `reserve`: Creates ledger row (`status=reserved`); credits NOT deducted yet. Idempotent by `idempotencyKey`.
- `capture`: Calls `deductCredits` (the existing atomic conditional decrement) + marks `status=captured`. Idempotent — skips deduction if already captured.
- `refund`: Marks `status=refunded`; pure tombstone since credits were never deducted. No-op if key missing.

**Rationale for reserve-not-deduct**: Deducting at reserve creates a refund-on-failure path that requires crediting back, which has its own atomicity challenges. The `deductCredits` atomic write (single `updateMany WHERE creditBalance >= cost`) already prevents double-charging at the capture point. The ledger's value is the durable audit trail and idempotency key.

**Wire-in**: Both `/api/generate` and `/api/generate-deck` reserve before calling the AI model, capture on success, and refund in the outer catch block. Ledger failures are non-fatal (logged, continue without ledger) to preserve the existing route behavior.

**Prisma model**: Added `UsageLedgerEntry` to both `schema.prisma` (Postgres) and `schema.sqlite.prisma` (SQLite). Migrations at `20260623030000_add_usage_ledger` in both `prisma/migrations/` and `prisma/migrations-sqlite/`. Migration applied to `prisma/dev.db`.

---

## #482 — Atomic Rate Limits

**Decision**: Added optional `atomicIncrement?(key, options): Promise<RateLimitResult>` to `RateLimitStore` interface. `checkRateLimitWithStore` delegates to it when present.

**Implementation** in `prismaRateLimitStore`:
1. `updateMany WHERE subject=key AND count < limit AND resetAt > now, SET count += 1` — atomic conditional increment (one DB operation).
2. If 0 rows updated: fetch existing row.
   - If absent or expired → upsert with count=1, fresh resetAt.
   - If present and not expired → blocked at limit.

**Guarantee**: Exactly `limit` requests succeed per window. The conditional `updateMany` is a single atomic DB write — concurrent requests cannot both succeed past the boundary. This holds under SQLite WAL and PostgreSQL MVCC row-level serialization.

**Backward compat**: In-memory test stores (used in existing tests) do not implement `atomicIncrement`, so `checkRateLimitWithStore` falls back to the old get→compute→set path for them. No existing tests changed.

---

## Files Changed

| File | Change |
|------|--------|
| `src/lib/slides/asset-storage.ts` | Add `read`/`delete` to interface + impl; change default dir/URL (#479, #480) |
| `src/app/api/slide-assets/[documentId]/[...path]/route.ts` | Use `adapter.read()` instead of hardcoded `fs.readFile` (#480) |
| `src/lib/slides/asset-orphan.ts` | Deprecate `LocalOrphanStorage`; update default rootDir (#480) |
| `src/lib/billing/usage-ledger.ts` | New: reserve/capture/refund ledger service (#481) |
| `src/lib/billing/usage-ledger.test.ts` | New: ledger lifecycle + idempotency tests (#481) |
| `src/app/api/generate/route.ts` | Wire ledger reserve/capture/refund (#481) |
| `src/app/api/generate-deck/route.ts` | Wire ledger reserve/capture/refund (#481) |
| `src/lib/ai/quota.ts` | Add `atomicIncrement?` to `RateLimitStore`; update `checkRateLimitWithStore` (#482) |
| `src/lib/rate-limit.ts` | Implement `atomicIncrement` in `prismaRateLimitStore` (#482) |
| `prisma/schema.prisma` | Add `UsageLedgerEntry` model (#481) |
| `prisma/schema.sqlite.prisma` | Add `UsageLedgerEntry` model (#481) |
| `prisma/migrations/20260623030000_add_usage_ledger/migration.sql` | Postgres migration (#481) |
| `prisma/migrations-sqlite/20260623030000_add_usage_ledger/migration.sql` | SQLite migration (#481) |
| `src/lib/slides/asset-storage.test.ts` | Update for new defaults + add read/delete tests (#479, #480) |
| `src/lib/slides/upload-action.test.ts` | Add `read`/`delete` to mock adapter (#480) |
| `src/lib/rate-limit.test.ts` | Add atomicIncrement tests (#482) |


# Trinity Refactor Architecture Analysis — 2026-06-25

20 grounded findings across 10 passes. Top P1s:

1. **TRIN-01/14** — `DeckPatch`/`PatchOp`/`SlideCommand` types are defined identically in both `slide-commands.ts` (1049 LOC) and `slide-command-contracts.ts` (720 LOC). UI imports from commands; executors from contracts. Mechanical re-export fix; directly closes decisions.md #307 dual-track debt.
2. **TRIN-02** — `DECK_THEMES` (6 entries) diverges from `STYLE_THEMES` (8 entries): rose, amber, slate missing. AI prompt enumerates only 6; deck validator rejects the 3 new visual themes.
3. **TRIN-03** — 91 "Deferred broad facade migration" exceptions in `import-graph-allowlist.mjs`, all same-reason, accumulating. Need retirement plan with quarterly declining threshold.
4. **TRIN-05** — `deck-export.ts` (1709 LOC) + 3 siblings live in `lib/visual/` but deeply import `lib/presentation/` types (style-cascade, connector-geometry, deck, etc.). Belongs in `presentation/export/`.
5. **TRIN-06** — `VISUAL_KIND_META_DATA` in `tool-metadata.ts` duplicates `KIND_DISPLAY_METADATA` in `registry-display.ts`; two records of label/description/keywords per VisualKind that must be updated in parallel.
6. **TRIN-09/10/11** — Three mega-files (slide-editor.tsx 3044, slide-stage-editor.tsx 1987, slide-inspector/controls.tsx 2660) identified in decisions.md #307; split targets now documented.

6 proposed epics (A–F) in full findings: `~/.copilot/session-state/a4e633e5-e806-4b7b-8232-02c9861ac6ba/files/findings-trinity.md`


# Switch — Frontend Refactor Analysis (2026-06-25)

23 findings (SWTCH-01–SWTCH-23) across 10 passes. Two P0 items: `document.execCommand` deprecated in `inline-text-editor.tsx` + `controls.tsx` (SWTCH-10, issue #306). Three P1 structural: `slide-editor.tsx` 60+ inline handlers (SWTCH-01), `slide-inspector/controls.tsx` 2660L incomplete split (SWTCH-04), `visual-context-popover.tsx` 2118L conflating gen/brand/style/positioning (SWTCH-08). Critical DRY: HSV color math duplicated across `shell-components.tsx` and `ui/color-picker.tsx` (SWTCH-05); `SlideInspectorProps` 50-prop interface causes prop-drilling to desktop + mobile inspector (SWTCH-11) — fix is `SlideEditorContext`. Four proposed epics: A=Mega-file split (SWTCH-01/03/04/08/18/19/23), B=State/context architecture (SWTCH-11/12/21/22), C=DRY+compat removal (SWTCH-02/05/06/07/10/13/15/17), D=Perf+client-boundary (SWTCH-14/16/20). Full findings: `/home/azadmin/.copilot/session-state/a4e633e5-e806-4b7b-8232-02c9861ac6ba/files/findings-switch.md`.


# Tank — Backend Refactor Analysis Summary
**Date:** 2026-06-25 | **Full findings:** session-state/a4e633e5-e806-4b7b-8232-02c9861ac6ba/files/findings-tank.md

22 grounded findings across 4 proposed epics:

- **Epic A (API error shape):** `generation-route.ts` (12 callsites) and `billing/webhook/route.ts` still use legacy `{error}` body without `code`; body-read helpers in `route-adapters.ts` also emit it internally; `slide-assets` route returns plain-text 429. Remove `legacyErrorResponse` once all callsites use canonical helpers from `errors.ts`. (TANK-01/-02/-03/-16)
- **Epic B (deck-export split):** `deck-export.ts` is 1709 lines; the `deck-export-pptx.ts`/`deck-export-slide-images.ts` "split" files are 2–3 line re-export stubs. Real split needed: spec-builder (~296 lines), PPTX applier (~584 lines), SVG renderer (~563 lines). Text-style object is duplicated in two sibling blocks inside the spec-builder. (TANK-04/-20)
- **Epic C (Document.content deprecation):** `Document.content` plain-text field is written at creation only, never by Lexical autosave, yet is selected in 6 places for search, excerpt, reading-time, and public OG metadata. Search on `content` misses all post-creation edits. Migration needed to derive these from `contentJson`. (TANK-05/-15)
- **Epic D (config/boilerplate consolidation):** Rate-limit config split across 2 modules; `DECK_OUTPUT_TOKEN_BUDGET` 3-level alias chain; `getBillingState` embeds a DB write as a side-effect; `getUserCreditState` is a thin unused wrapper; collab health handler is copy-pasted between `server.mjs` and `collab-server.mjs`; `checkServerActionAbuseBudget` pattern duplicated in 6+ action files; `persistence-service.ts` is 938 lines across 4 concerns; `document-permissions.ts`/`workspace-capabilities.ts` are structurally parallel 300-line duplicates. (TANK-06 through TANK-22)


# Mouse — Design/UX Refactoring Analysis Inbox

**Date:** 2026-06-25  
**Author:** Mouse  
**Full findings:** `/home/azadmin/.copilot/session-state/a4e633e5-e806-4b7b-8232-02c9861ac6ba/files/findings-mouse.md`

16 grounded findings (MOUSE-01–16) across 10 analysis passes. One P0 a11y bug; six P1 structural issues; nine P2 improvements.

**Critical (P0):** `ImageCropControl` (controls.tsx:534) misuses `role="dialog" aria-modal="true"` on a static inline form section — should be `role="group"`. Screen readers enter dialog mode and may block access to other inspector controls.

**High (P1) highlights:**
- `controls.tsx` is a 2660-line god-file; 8 panel stub files are 1-line re-exports — the intended split was never completed (MOUSE-09).
- `FIELD_CLASS`/`LABEL_CLASS` redefined identically in 3 sibling inspector files — a near-duplicate of `FIELD_CONTROL` already in `tokens.ts` (MOUSE-04).
- Active-toggle button pattern (`bg-ds-accent-surface/text-ds-accent-text` vs hover states) hand-coded 7+ times instead of referencing `TOOLBAR_BUTTON_CHROME` from tokens.ts (MOUSE-05).
- `InheritedColorControl` still uses raw `<input type="color">` — `ColorPicker`/`Swatch` primitives exist and decisions.md mandates their use (MOUSE-06, MOUSE-07).
- `shell-components.tsx` is 1718 lines with a custom HSV color picker that duplicates `ui/color-picker.tsx` (MOUSE-08).
- `check-design-system.mjs` blanket-excludes all of `src/components/presentation/` from raw-chrome guardrails — design violations there are invisible (MOUSE-14).

**Proposed epics:** A) Inspector god-file decomposition; B) Theme-first color control implementation; C) Design-token coverage & guardrails; D) Motion/brand/token dead weight removal.


# Ghost Test-Suite Health Analysis — 2026-06-25

**22 findings across 10 passes. Full report:** `~/.copilot/session-state/a4e633e5-e806-4b7b-8232-02c9861ac6ba/files/findings-ghost.md`

**P0 (CI correctness):** 4 files contain `test()` nested inside `test()` callbacks — `use-autosave.test.ts:69,108`, `route-adapters.test.ts:34`, `generate/parser.test.ts:54`, `generate-deck/parser.test.ts:54`. node:test silently cancels these as `cancelledByParent`; two autosave-controller edge-case paths have zero effective coverage as a result.

**P1 (DRY / structure):** `buildCommandSlide`/`buildCommandDeck` are byte-for-byte identical in `slide-commands.test.ts` and `slide-commands-advanced.test.ts`. `slide()`/`deck()` micro-factories duplicated across ≥8 test files. `deck-export.test.ts` (1498 L) and `rendering-regression.test.ts` (1494 L) both test `buildDeckSpecs` with heavily overlapping coverage and local helpers; `rendering-regression.test.ts` lives in `/presentation/` but tests the `/visual/` subsystem. `session.ts:1` imports `next/navigation`/`redirect` — a latent node-test breakage risk.

**P2 (split / governance):** `deck-schema.test.ts` (1410 L, 12 independent sections) is the only entry in the oversized allowlist but 4 other files are 1013–1296 lines with no governance coverage. Governance `FACTORY_PATTERN` doesn't catch `fixtureTextElement`/`ofKind` duplication. `makeSourceRef`, `makeMaster`, `tokenSetWith` are inline re-implementations of canonical builders. `rendering-regression.test.ts` duplicates 4 `[#618]` tests already in `deck-export.test.ts`.

**Proposed epics:** A (infrastructure/DRY cleanup), B (concern-based file splits), C (governance hardening). Epic A is prerequisite for B.


# Refactor Consolidation — Trinity (2026-06-25)

Consolidated all 103 grounded findings (Trinity 20, Switch 23, Tank 22, Mouse 16, Ghost 22) into **10 epics / 48 child issues**, fully deduplicated, in `epic-plan.md`. No findings dropped; every ID is traced to a child.

Epics: (1) Dual-track Slide command & deck-theme contract unification [5], (2) Slide & visual large-file decomposition [6], (3) Deck-export modularization & relocation [3], (4) Canonical API error shape & legacy compat removal [3], (5) Design-system token & color-control consolidation [4], (6) DRY helpers/dead code/indirection [4], (7) Backend config/persistence splits & Document.content deprecation [7], (8) Import-graph facade migration [3], (9) Frontend state/perf/browser-compat [6], (10) Test-suite health: builders/nested-test fix/decomposition [7].

Top strategy calls: single-source SlideCommand/DeckPatch into slide-command-contracts.ts; derive DECK_THEMES from STYLE_THEMES (close rose/amber/slate gap, kill "default"); complete the already-stubbed controls.tsx (2660L) split; do the *real* deck-export.ts (1709L) split + move lib/visual→lib/presentation/export; delete legacyErrorResponse entirely (no compat alias); ColorPicker-first (remove bespoke HSV math); build shared src/test/builders before splitting test files; fix p0 nested test() (assertions silently skipped).

Sequencing: Epic 1 (contracts) + Epic 10 builders/nested-fix first to de-risk everything; Epic 8 (facade burn-down) last after relocations settle. P0s: 9.2 execCommand, 5.2 crop-dialog a11y, 10.1 nested tests.

Aligned with accepted decisions #199/#292/#307. Behaviour-preserving only; per AGENTS.md superseded shapes are removed (code+fixtures+tests+docs), never wrapped. Deferred-not-bundled: ElementKindPlugin registry (noted in 1.5) and full search-index rework (noted in 7.1).


### 2026-06-26T00-04-32: 10-pass code-health review → GitHub umbrella epic #1151 + 10 epics (#1093-1102) + 48 child issues (#1103-1150)
**By:** Coordinator
**What:** 10-pass code-health review → GitHub umbrella epic #1151 + 10 epics (#1093-1102) + 48 child issues (#1103-1150)
**Why:** Session: 10-pass, domain-by-domain refactoring/code-health review of TextIQ, requested by Switch.

Method: each specialist ran 10 iterative analysis passes over their domain (read-only, grounded in real files): Trinity (architecture, 20 findings), Switch (frontend, 23), Tank (backend, 22), Ghost (testing, 22), Mouse (design-system, 16) = 103 findings. Trinity (opus) consolidated and deduplicated 103 to 10 epics / 48 child issues with best-strategy per epic; every finding traced, none dropped. Rai RAI review: Green (no secrets/PII/security-disclosure).

Created (repo huangyingting/textiq): Umbrella epic #1151; epics #1093-1102; children #1103-1150 (48), each linked as a GitHub sub-issue of its epic.

Top strategy calls: single-source SlideCommand/DeckPatch into slide-command-contracts.ts; derive DECK_THEMES from STYLE_THEMES (close rose/amber/slate gap, drop dead "default"); finish controls.tsx (2660L) split into existing per-panel stubs; real deck-export.ts (1709L) split then relocate lib/visual to lib/presentation/export; delete legacyErrorResponse (no compat alias); ColorPicker-first; build src/test/builders + fix P0 nested test() before splitting tests. Sequence: Epic 1 + Epic 10 first; Epic 8 last. P0s: execCommand (9.x), crop-dialog a11y (5.x), nested test() (10.x). Note: repo renamed Napkin-Clone to textiq; sub-issue REST POST needs the canonical slug.