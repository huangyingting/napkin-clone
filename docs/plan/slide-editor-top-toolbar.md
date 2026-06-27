# Slide Editor Top Toolbar Plan

**Status:** Planning proposal  
**Last updated:** 2026-06-27

This note records the agreed design direction for the slide editor's top menu
toolbar. It is based on the current slide editing data model, command envelope,
and existing editor surface boundaries. It is intentionally a plan, not a claim
about current shipped behavior.

## Source Anchors

| Area                                          | Source                                                                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Deck facade and public deck types             | [`src/lib/presentation/deck.ts`](../../src/lib/presentation/deck.ts)                                                                             |
| Persisted deck, slide, master, template shape | [`src/lib/presentation/deck-core.ts`](../../src/lib/presentation/deck-core.ts)                                                                   |
| Slide element families and element fields     | [`src/lib/presentation/deck-elements.ts`](../../src/lib/presentation/deck-elements.ts)                                                           |
| Slide command contract                        | [`src/lib/presentation/slide-command-contracts.ts`](../../src/lib/presentation/slide-command-contracts.ts)                                       |
| Slide command executor facade                 | [`src/lib/presentation/slide-commands.ts`](../../src/lib/presentation/slide-commands.ts)                                                         |
| Slide editor shell                            | [`src/components/presentation/slide-editor.tsx`](../../src/components/presentation/slide-editor.tsx)                                             |
| Shell-only editor state                       | [`src/components/presentation/slide-editor/use-slide-editor-shell.ts`](../../src/components/presentation/slide-editor/use-slide-editor-shell.ts) |
| Slide editor current-object UI helpers        | [`src/lib/presentation/slide-panel-ui.ts`](../../src/lib/presentation/slide-panel-ui.ts)                                                         |
| Current runtime documentation                 | [../presentation/slide-editor.md](../presentation/slide-editor.md)                                                                               |
| Deck data contract documentation              | [../data-model/deck.md](../data-model/deck.md)                                                                                                   |

## Agreed Direction

The top toolbar should be a deck-level and session-level toolbar. It should not
be the primary surface for editing a selected element. The editor already has a
selected-object in-context toolbar and a right-side inspector; those surfaces
should continue to own immediate object editing and detailed object properties.

The top toolbar should become a compact multi-menu toolbar with stable text
labels instead of a loose row of unrelated buttons. The agreed first-level
structure is:

```text
Add | Insert | Design | Source | View                    Undo Redo | Save status | Save | Close
```

`Add` remains a dedicated emphasized button. `Insert`, `Design`, `Source`, and
`View` are first-level menu buttons with text labels. The right side remains a
fixed session/status cluster.

## Data Model Rationale

The current deck model is not just a flat collection of slide pixels. It has
separate first-class objects and concerns:

- `Deck.canvas` controls the deck-wide slide format.
- `Deck.design` controls the presentation theme and global theme overrides.
- `Deck.masters`, `Deck.defaultMasterId`, and `Deck.customTemplates` describe
  reusable deck-owned structure.
- `Deck.slides[]` is the ordered slide list.
- `Deck.deckContentHash` records the source document state used to derive or
  sync the deck.
- `Slide.title`, `Slide.notes`, `Slide.masterId`, `Slide.templateId`,
  `Slide.designOverrides`, `Slide.elements`, and `Slide.source` are slide-level
  fields.
- `SlideElement` objects have geometry and edit state such as `box`, `zIndex`,
  `opacity`, `rotation`, `locked`, `hidden`, `groupId`, `source`, and
  `designOverrides`.

The command contract mirrors those boundaries. There are command families for
slide lifecycle, element lifecycle and geometry, deck-level theme/canvas,
background/accent changes, masters/templates, and source-link operations. The UI
should make these boundaries legible instead of mixing them into one generic
formatting toolbar.

## Surface Ownership

The agreed ownership split is:

| Surface            | Owns                                                                                                          | Does not own                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Top toolbar        | Deck/session actions, current-slide creation entry points, global design/source/view menus, save state, close | Fine-grained selected-element editing   |
| In-context toolbar | Immediate actions for the current slide or selected element(s)                                                | Persistent global deck/session controls |
| Right inspector    | Detailed slide, element, arrange, text, appearance, effects, source, notes, and layers panels                 | Global menu discovery                   |
| Bottom dock        | Zoom, notes shortcut, thumbnail rail toggle, and slide/view status                                            | Full top-menu structure                 |
| Slide rail         | Slide selection, reordering, duplicate, remove                                                                | Deck design/source/session controls     |

The key rule is:

```text
Top toolbar = overall deck/session and creation menus
In-context toolbar = selected object quick editing
Right inspector = detailed current-object editing
```

## First-Level Toolbar Structure

### Add

`Add` should remain a dedicated primary button because adding a slide is one of
the most frequent deck-level actions. It changes the deck structure, not a
selected element.

Clicking `Add` should open the existing slide template picker. The picker should
continue to cover templates such as blank, title, section, content, media,
visual spotlight, comparison, and deck-local custom templates when available.

Boundary:

```text
Add = add a slide to the deck
Insert = add an element to the current slide
```

### Insert

`Insert` belongs in the top toolbar even though it mutates the current slide. It
creates new objects; it is not editing an already selected object.

The first implementation should expose only real, wired actions:

- Text
- Image
- Shape
- Connector
- Visual
- From document, when source document text blocks or visuals are available

After insertion, the newly created element should become selected so the
in-context toolbar and inspector take over detailed editing.

### Design

`Design` should combine deck-wide presentation design and current-slide design
overrides in one menu, separated into clear sections. This matches the design
cascade: deck theme and canvas settings are the upper layer, while slide
background/accent are local overrides.

Recommended menu sections:

| Section       | Items                                                                | Command/data boundary                                                |
| ------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Canvas        | Size / aspect ratio                                                  | `SET_CANVAS_FORMAT`, `Deck.canvas.format`                            |
| Presentation  | Theme, theme tokens/overrides, reset custom overrides                | `SET_PRESENTATION_THEME`, `UPDATE_THEME_OVERRIDES`, `Deck.design`    |
| Current Slide | Background, accent, clear slide overrides                            | `SET_SLIDE_BACKGROUND*`, `SET_SLIDE_ACCENT`, `Slide.designOverrides` |
| Apply         | Apply this background to all slides, apply this accent to all slides | repeated slide background/accent commands                            |

The first implementation should not expose decorative placeholders. If a design
item is not wired to an existing handler, it should be omitted until it can be
implemented. Existing background helpers can support applying solid or gradient
backgrounds across the deck.

### Source

`Source` should be a first-level menu because source linkage is now a first-class
part of the deck model rather than just a warning banner.

Relevant model fields include:

- `Deck.deckContentHash`
- `Slide.source`
- `SlideElement.source`

Relevant commands include source refresh, unlink/relink, and orphan removal via
the source command family.

Recommended menu contents:

- Sync from document, when a fresh derived deck is available.
- Status line such as `Up to date` or `N stale links`.
- Review stale links, opening the relevant right-side source/layers workflow
  when enough UI support exists.
- Refresh selected source, only when the selected element is source-linked and
  refreshable.
- Unlink selected source, only when the selected element is source-linked.
- Remove orphaned source element, only when the selected element's source block
  is missing.

The stale banner remains useful as a proactive alert, but it should not be the
only discoverable entry point for document synchronization.

### View

`View` should contain view toggles and shortcuts, not detailed element editing.

Recommended first implementation:

- Toggle thumbnails / slide rail.
- Toggle snap to grid.
- Keyboard shortcuts.
- Optional quick commands such as fit to screen or 100 percent, if they can be
  wired without moving the full zoom control.

The full zoom control should stay in the bottom dock. Zoom is a continuous
canvas-view adjustment, and the bottom dock is closer to the stage while keeping
the top toolbar compact.

### Right Session Cluster

The right side of the top toolbar should stay fixed and compact:

- Undo
- Redo
- Sync/status affordance when needed by the final menu design
- Save status
- Save / retry
- Keyboard shortcut help if not moved fully into `View`
- Close

Undo/redo, keyboard help, grid, and close can remain icon buttons because each
is a single concrete action. The first-level menus should use text labels
because they define information architecture rather than one-off commands.

## Explicit Non-Goals For The First Implementation

The first version should not add these top-level items:

- A top-level `Arrange` menu. Arrange is selection-dependent and belongs in the
  in-context toolbar and right inspector.
- A full PowerPoint-style ribbon. The toolbar should remain lightweight and
  menu-based.
- Placeholder menu items that are visible but not wired.
- Full master/template administration in the top toolbar. Master and template
  management can stay in inspector workflows until a dedicated, real menu design
  is ready.
- Bulk refresh-all source-link operations unless the command path and UI state
  are already stable.
- Moving the full zoom slider/menu from the bottom dock to the top toolbar.

## Enablement And Visibility Rules

The conservative first implementation should prefer real available actions over
disabled clutter.

- Show top-level menus consistently so users can learn the toolbar shape.
- Hide or omit menu items that have no wired implementation yet.
- Disable items only when the user can understand the reason from current state,
  such as `Sync from document` being unavailable because there is no fresh deck.
- Source-specific selected-element actions should appear only when they apply to
  the current selection.
- `Arrange` actions should not be duplicated into the top toolbar. Selection
  state should route users to the in-context toolbar or right inspector.
- On narrow screens, keep first-level text labels and allow horizontal overflow
  before replacing labels with ambiguous icons. Prefer hiding secondary status
  text before hiding the menu labels.

## Accessibility And Interaction Requirements

The implementation should preserve the editor's existing accessibility model:

- Use labelled menu buttons with `aria-haspopup` and accurate expanded state.
- Keep icon-only actions labelled with `aria-label` and tooltips.
- Keep menu contents keyboard reachable.
- Preserve Escape behavior for closing menus/dialogs before closing the editor.
- Do not let toolbar pointer events steal canvas selection unexpectedly.
- Keep save status announced through the existing status region.
- Avoid text overflow in compact widths; labels should remain readable or move
  into horizontal overflow rather than overlapping.

## Implementation Notes

The first implementation should be a reorganization of existing capabilities,
not a data-model migration.

Expected code touch points:

- `src/components/presentation/slide-editor.tsx` for top toolbar composition and
  wiring existing handlers into `Insert`, `Design`, `Source`, and `View` menus.
- `src/components/presentation/slide-editor/shell-components.tsx` for reusable
  menu/button shell helpers if keeping the JSX in `slide-editor.tsx` becomes too
  dense.
- `src/components/presentation/slide-editor/use-slide-editor-shell.ts` if new
  menu open state needs to be centralized with the existing shell-only state.
- Existing command hooks such as `use-slide-insert-commands.ts`,
  `use-slide-background-commands.ts`, `use-slide-management-commands.ts`, and
  `use-slide-source-link-commands.ts` should remain the mutation boundaries.

The implementation should keep all deck mutations routed through the existing
command/commit path so undo/redo, pending patches, telemetry, and autosave remain
consistent.

## Acceptance Criteria

The first implementation is acceptable when:

1. The top toolbar presents `Add`, `Insert`, `Design`, `Source`, and `View` as
   stable first-level controls.
2. `Add` opens the slide template picker and remains visually primary.
3. `Insert` creates elements through existing command handlers and selects the
   inserted object.
4. `Design` exposes wired deck canvas/theme and current-slide background/accent
   controls without fake menu items.
5. `Source` exposes document sync/status and only real source-link actions.
6. `View` contains rail/grid/help view controls while zoom remains in the bottom
   dock.
7. No top-level `Arrange` menu is added.
8. Selected-object formatting still lives in the in-context toolbar and right
   inspector.
9. Save, retry, undo, redo, and close keep their current behavior.
10. The change introduces no deck schema migration and no alternate mutation
    path outside slide commands.

## Suggested Verification

For the implementation change, use the narrowest reliable checks for the touched
files:

```bash
npx prettier --write docs/plan/README.md docs/plan/slide-editor-top-toolbar.md docs/README.md
npm run docs:check
npx eslint src/components/presentation/slide-editor.tsx src/components/presentation/slide-editor/shell-components.tsx
npm run typecheck
```

For the documentation-only plan captured here, `npm run docs:check` is the main
validation step.
