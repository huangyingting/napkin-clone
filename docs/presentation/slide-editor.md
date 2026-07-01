# Slide Editor Runtime

**Type:** Architecture  
**Status:** Current  
**Last updated:** 2026-07-01

This document describes the runtime architecture of the slide editor. It is
about interaction and UI ownership, not the persisted deck schema. For the JSON
contract, see [../data-model/deck.md](../data-model/deck.md). For detailed
stage hit-testing, hover preselection, overlap handling, connector targeting,
and pointer state rules, see
[slide-stage-interactions.md](slide-stage-interactions.md).

## Source Files

| Area               | Source                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Editor shell       | [`src/components/presentation-vnext/slide-editor-vnext.tsx`](../../src/components/presentation-vnext/slide-editor-vnext.tsx)               |
| Read-only canvas   | [`src/components/presentation-vnext/slide-canvas.tsx`](../../src/components/presentation-vnext/slide-canvas.tsx)                           |
| Node renderer      | [`src/components/presentation-vnext/slide-node-renderer.tsx`](../../src/components/presentation-vnext/slide-node-renderer.tsx)             |
| Inspector          | [`src/components/presentation-vnext/inspector/inspector-shell.tsx`](../../src/components/presentation-vnext/inspector/inspector-shell.tsx) |
| Context toolbar    | [`src/components/presentation-vnext/toolbar/context-toolbar.tsx`](../../src/components/presentation-vnext/toolbar/context-toolbar.tsx)     |
| Filmstrip          | [`src/components/presentation-vnext/filmstrip/filmstrip.tsx`](../../src/components/presentation-vnext/filmstrip/filmstrip.tsx)             |
| Stage fit          | [`src/lib/presentation-vnext/stage-fit.ts`](../../src/lib/presentation-vnext/stage-fit.ts)                                                 |
| Stage chrome       | [`src/lib/presentation-vnext/stage-chrome.ts`](../../src/lib/presentation-vnext/stage-chrome.ts)                                           |
| Stage guides       | [`src/lib/presentation-vnext/stage-guides.ts`](../../src/lib/presentation-vnext/stage-guides.ts)                                           |
| Selection geometry | [`src/lib/presentation-vnext/selection-geometry.ts`](../../src/lib/presentation-vnext/selection-geometry.ts)                               |
| Deck commands      | [`src/lib/presentation-vnext/editor-commands.ts`](../../src/lib/presentation-vnext/editor-commands.ts)                                     |
| Source links       | [`src/lib/presentation-vnext/source-links.ts`](../../src/lib/presentation-vnext/source-links.ts)                                           |
| Presence state     | [`src/lib/presentation-vnext/slide-editor-collaboration-state.ts`](../../src/lib/presentation-vnext/slide-editor-collaboration-state.ts)   |

## Ownership Model

`SlideEditor` is the stateful shell. It owns:

- the current deck value exposed to the parent through `onDeckChange`;
- undo/redo history;
- selected slide and selected element ids;
- pending `DeckPatch[]` records since the last confirmed save;
- dirty/saving/error save state;
- source-link staleness and document-sync actions;
- mobile vs desktop placement of the inspector.

Child components are controlled. They receive slide/element state plus callbacks
and never mutate `Deck` objects directly.

## Current Object Model

The editor always has one current object:

```text
current object = selected element(s) ?? current slide
```

Deck-level controls never participate in selection. They stay in the top
toolbar. When the element selection is empty, the slide itself is the current
object and the canvas popover plus inspector target slide background, notes,
template provenance, master assignment, and slide actions. When one element, a
group, or a multiset is selected, those surfaces target that selection.

## Surface Layout

The desktop editor is a current-object workflow:

| Surface        | Responsibility                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Top toolbar    | Deck/session controls: theme, deck chrome, add slide, ratio, source, snap, shortcuts, undo/redo, save, and close.            |
| Canvas popover | Frequent verbs for the current object: slide verbs, element formatting, arrange, object actions.                             |
| Stage          | Direct manipulation of slide elements on a fixed-format canvas.                                                              |
| Inspector      | One active task panel (Slide/Text/Label/Shape/Image/Adjust/Line/Arrange/Effects/Source/Notes/Layers) for the current object. |
| Bottom dock    | Zoom, notes, rail toggle, and status.                                                                                        |
| Slide rail     | Select, duplicate, remove, and reorder slides.                                                                               |

On smaller surfaces, the inspector can render as a sheet while the stage remains
the same controlled editor surface. The bottom dock also compacts for narrow
viewports: rail toggle, Notes, and zoom stay visible; save/diagnostics/mode
details collapse into a keyboard-reachable status popover; and the dock applies
bottom safe-area padding when pinned to the viewport edge.

## Top Toolbar

The top toolbar is a compact deck/session command surface. It uses stable
first-level text controls where space matters and icon buttons for compact view
commands:

```text
Slide kit | Deck chrome | Add slide | Slide ratio | Source | Snap | Shortcuts       Undo Redo | Save status | Save | Close
```

- **Slide kit** selects the active theme package: theme tokens, package
  templates, and the deck chrome baseline. The visible label includes the
  current kit name.
- **Deck chrome** opens global master chrome controls for deck-level frame,
  header/footer, and shared master styling.
- **Add slide** opens the slide template picker and creates a new slide from the
  active slide kit templates, deck-local custom templates, or fallback built-in
  templates. The picker updates automatically after the slide kit changes.
- **Slide ratio** changes the deck format through the ratio selector.
- **Insert actions** live in the current-object surfaces: slide templates come
  from Add slide, while text, image, shape, visual, connector, and document
  text/visual insertion are exposed through the canvas popover and inspector.
  Newly inserted objects become selected so those surfaces take over editing.
- **Design/style controls** own deck canvas size, slide kit style
  customization, presentation theme tokens, current-slide background,
  current-slide accent, clearing current-slide background/accent overrides, and
  applying the selected solid/gradient background or accent across the deck.
  Deck-level theme controls are reached from Slide kit and Deck chrome; selected
  object styling remains in the canvas popover and inspector.
- **Source** owns document sync status, sync from document, stale-link review,
  and source-link actions that apply to the selected linked element.
- **Snap** toggles snap-to-grid directly from the toolbar.
- **Shortcuts** opens the keyboard shortcut dialog. Zoom remains in the bottom
  dock.

Fine-grained selected-element formatting stays out of the top toolbar. The
canvas popover and inspector continue to own text style, object-specific
editing, arrangement, effects, notes, layers, and detailed source review for the
current object.

## Stage Runtime

`SlideStageEditor` renders `SlideCanvas` and overlays editing chrome. The stage
is responsible for pointer/keyboard interaction only; deck mutations are routed
through callbacks owned by `SlideEditor`.

Current stage capabilities:

- select one or many elements;
- marquee select;
- move, resize, and rotate elements;
- drag connector endpoints and snap them to element anchors;
- snap boxes to guides/grid;
- inline-edit text elements, including paragraph/list text;
- create a text element by double-clicking empty canvas;
- copy/cut/paste/duplicate/delete selected elements;
- group and ungroup elements;
- enter a group for member editing;
- hide advanced controls in simple mode.

Geometry is percentage-based (`ElementBox`) so the same deck renders consistently
at thumbnail, editor, present, and export sizes.

## Keyboard Accessibility

The canvas is fully keyboard operable (see
[slide canvas keyboard accessibility](../system/slide-canvas-keyboard-accessibility.md);
issues #530–#535). Pure
selection, geometry, stage-fit, and stage-guide helpers live under
`src/lib/presentation-vnext/` and `src/components/presentation-vnext/`; the
editor shell keeps thin wiring around those helpers.

- **Move:** Arrow nudges the selection by `1%`, Shift+Arrow by `5%`.
- **Resize:** Alt+Arrow resizes by `1%`, Alt+Shift+Arrow by `5%` — Right/Down
  grow the right/bottom edge, Left/Up shrink them (`resizeBoxByStep`, applied via
  `SET_ELEMENT_BOXES`).
- **Traversal:** Tab / Shift+Tab select the next / previous element in a
  deterministic reading order (`orderedElementIds` + `nextElementId`) while a
  canvas element has focus, backed by a roving tabindex (the primary selection,
  or the first element in reading order, is the single Tab stop). Escape releases
  canvas focus so users are never trapped.
- **Focus restoration:** after move/resize the moved element keeps focus; after
  delete the next/previous survivor (or the stage container) is focused
  (`focusTargetAfterDelete`); after duplicate the new copy; after group the group
  primary. Driven by an imperative `focusRequest` prop into the stage.
- **Announcements:** a visually-hidden `aria-live="polite"` region in the stage
  announces selection, move, resize and delete results (`announce*` builders);
  focused elements show a distinct `focus-visible` ring.
- **Connectors (interim):** with two connectable elements selected, `C` inserts a
  default-endpoint connector; with a connector selected, `C` / `Shift+C` cycle its
  end / start endpoint anchor. Free-draw routing remains pointer-only and is
  tracked in #930.
- **Help:** `?` (or View > Keyboard shortcuts) opens the shortcut help dialog
  (`canvasShortcutHelp`).

## Canvas Contract

`SlideCanvas` is read-only. It renders the current
`ResolvedSlideRenderModel`, including master background chrome, slide elements,
and master foreground chrome. The stage wraps it with editing affordances, but
rendering itself is shared with present/public viewers.

The editor can pass `hiddenElementIds` to hide elements during inline editing or
layer-list visibility toggles. The `editable` flag affects empty-image treatment
only; it does not make `SlideCanvas` mutate state.

## Inspector Runtime

`SlideInspector` owns editing controls, not deck state. It is a task-panel
router that renders exactly one active panel at a time —
`Slide / Text / Label / Shape / Image / Adjust / Line / Arrange / Effects / Source / Notes / Layers` — with
a compact in-panel switcher for moving between the panels available to the
current selection. The panel open state is persisted in local storage; wide
screens default open when no preference exists, while narrow screens use a
bottom sheet. `Layers` is a normal panel rather than a separate inspector mode.

The available panel set is computed from the selection by `availablePanels`
(`slide-panel-ui.ts`), which also powers the canvas toolbar `...` menu so the two
never drift. With no element selected the current object is the slide
(`Slide / Notes / Layers`); a single element exposes its kind-specific panels
(`Text`, `Label` + `Shape`, `Image` + `Adjust`, or `Line`) plus `Arrange`,
`Effects`, and `Layers`, with `Source` only when the element has a `source`; a
multi-selection exposes `Arrange / Effects / Layers`. There is no fallback
routing: when the selection changes so the active panel no longer applies,
`SlideEditor` closes the right panel instead of guessing a replacement.
The object-identity header names the current object but no longer exposes a
permanent `Name` input — element naming lives in `Layers`.

`SlideInspector` receives callbacks for every action:

- slide duplicate/remove;
- template apply/reapply;
- create/delete deck-local custom templates;
- update a deck-local custom template from the current slide;
- element patch/remove/duplicate;
- z-order, arrange, align, distribute, match-size;
- group/ungroup;
- hide/lock/rename layer-list operations;
- slide `designOverrides.background` and accent updates;
- image upload through the slide asset action when `documentId` is available.

Deck-level chrome is not edited in the right inspector. The top toolbar
`Deck chrome` popover owns global logo, footer, page number, watermark, border,
and safe-area configuration. Those controls update DeckV7 chrome state; normal
slide editing hit-testing, selection, clipboard, z-order, and layer-list
mutations operate only on slide child nodes.

The inspector must not infer missing context. If a workflow requires full source
document blocks or document id, those values are passed by `SlideEditor`.

## Popover Runtime

The canvas popover is anchored to the current object: the selected union bbox for
element selections and the slide top edge when the slide is current. Text edit
mode keeps the popover anchored to the text bbox and hides object actions so a
caret edit cannot accidentally delete or reorder the whole element.

Single-element popovers expose frequent kind-specific verbs: text styling and
list controls, shape color, connector routing/dash/arrowheads, image replace and
crop bridge, and visual replace/restyle. Multi-select popovers expose alignment,
distribution, match-size, z-order, group/ungroup, duplicate, delete, and the
panel bridge.

## Mutation Flow

Most user actions flow through slide commands:

```text
UI event
  -> SlideEditor handler
  -> executeCommand / commitCommand
  -> Deck + CommandResult + DeckPatch[]
  -> onDeckChange
  -> pending patch buffer
  -> autosave
```

Source-link operations route through `UPDATE_ELEMENT_SOURCE` / source commands
and end at the same deck change and autosave pipeline.

Element content updates write `element.content`; element formatting writes
`element.designOverrides`; source-link updates write `element.source`.
Master mutations are deck-owned commands: `CREATE_MASTER`, `UPDATE_MASTER`,
`DELETE_MASTER`, `SET_DEFAULT_MASTER`, `SET_SLIDE_MASTER`, and
`UPDATE_MASTER_ELEMENT`. Template mutations are explicit blueprint commands:
`ADD_SLIDE_FROM_TEMPLATE`, `APPLY_SLIDE_TEMPLATE`, `CREATE_CUSTOM_TEMPLATE`,
`UPDATE_CUSTOM_TEMPLATE`, and `DELETE_CUSTOM_TEMPLATE`. Template reapply can
replace materialized elements or preserve matching element content while
refreshing the template structure.

## Autosave And Conflict Handling

The editor buffers `DeckPatch[]` between successful saves. A debounced autosave
delegates to `attemptPatchAutosave`:

1. If patches exist, call `saveDeckPatch`.
2. If patch save succeeds, clear pending patches and store the new revision
   token.
3. If patch save returns conflict, surface `ConflictRecoveryDialog`.
4. If patch replay is unavailable, retry with `saveDeckJson` and the full deck.
5. If whole-deck save succeeds, clear pending patches and store the new token.

Conflict recovery has three user outcomes:

| Choice             | Behavior                                                     |
| ------------------ | ------------------------------------------------------------ |
| Keep my version    | Save the local deck against the server's latest token.       |
| Use server version | Fetch/accept the server deck and replace local editor state. |
| Dismiss            | Keep local unsaved changes and leave the editor dirty.       |

Presence is advisory only. It shows who has the deck open and which slide they
are viewing, but optimistic revision tokens are the conflict authority.

## Document Sync And Source Links

`SlideEditor` receives both:

- `freshDeck`: a deck derived from the current document;
- `documentBlocks`: the full current document block list.

Sync from document uses `mergeDeckFromDocument`:

- document-derived slide content can be re-materialized from fresh document
  content when source provenance still points at the same document section;
- hand-authored slides preserve their `children`;
- active `source` elements can refresh content or content hashes in place;
- orphaned source blocks are surfaced to the user instead of being silently
  removed.

Source-link controls support update, unlink, relink, and orphan removal. Source
refs must carry explicit `blockKind`.

## Invariants

1. `SlideEditor` is the only presentation component that owns deck state.
2. `SlideStageEditor`, `SlideInspector`, and `LayerList` are controlled views.
3. `SlideCanvas` is shared and read-only.
4. Element geometry stays in percentage units.
5. Node content, local style, and source-link edits write DeckV7 node fields.
6. Autosave writes through the same patch/whole-deck retry pipeline.
7. Conflicts are resolved by revision token, not by presence.

## Primary Tests

- [`src/lib/presentation-vnext/editor-commands.test.ts`](../../src/lib/presentation-vnext/editor-commands.test.ts)
- [`src/lib/presentation-vnext/source-links.test.ts`](../../src/lib/presentation-vnext/source-links.test.ts)
- [`src/lib/presentation-vnext/stage-chrome.test.ts`](../../src/lib/presentation-vnext/stage-chrome.test.ts)
- [`src/lib/presentation-vnext/slide-editor-collaboration-state.test.ts`](../../src/lib/presentation-vnext/slide-editor-collaboration-state.test.ts)
- [`src/components/presentation-vnext/slide-canvas-render.test.ts`](../../src/components/presentation-vnext/slide-canvas-render.test.ts)
- [`e2e/slides-smoke.spec.ts`](../../e2e/slides-smoke.spec.ts)
