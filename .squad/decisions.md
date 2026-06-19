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
**Why:** Napkin's value is "great-looking visual in one move." Most users should restyle by picking a theme, not by tuning five color inputs. Presets first keeps the common path one click while preserving full control for power users.

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

**Why:** Napkin's core value is "great-looking visual in one move." Most users
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
- Server-side locale resolution from the `napkin-locale` cookie via `next/headers` (`getLocale()` in `server.ts`).
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
Using a `napkin-locale` cookie instead of `/en/...` URL prefixes avoids:
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
