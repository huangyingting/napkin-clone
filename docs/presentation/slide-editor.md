# Slide Editor Runtime

**Status:** Current  
**Last updated:** 2026-06-27

This document describes the runtime architecture of the slide editor. It is
about interaction and UI ownership, not the persisted deck schema. For the JSON
contract, see [../data-model/deck.md](../data-model/deck.md). For detailed
stage hit-testing, hover preselection, overlap handling, connector targeting,
and pointer state rules, see
[slide-stage-interactions.md](slide-stage-interactions.md).

## Source Files

| Area               | Source                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Editor shell       | [`src/components/presentation/slide-editor.tsx`](../../src/components/presentation/slide-editor.tsx)             |
| Stage interactions | [`src/components/presentation/slide-stage-editor.tsx`](../../src/components/presentation/slide-stage-editor.tsx) |
| Stage hit testing  | [`src/lib/presentation/stage-hit-test.ts`](../../src/lib/presentation/stage-hit-test.ts)                         |
| Stage targeting    | [`src/lib/presentation/stage-targeting.ts`](../../src/lib/presentation/stage-targeting.ts)                       |
| Stage chrome       | [`src/lib/presentation/stage-chrome.ts`](../../src/lib/presentation/stage-chrome.ts)                             |
| Select-under       | [`src/lib/presentation/stage-select-under.ts`](../../src/lib/presentation/stage-select-under.ts)                 |
| Stage decisions    | [`src/lib/presentation/stage-interaction.ts`](../../src/lib/presentation/stage-interaction.ts)                   |
| Media hit geometry | [`src/lib/presentation/media-hit-geometry.ts`](../../src/lib/presentation/media-hit-geometry.ts)                 |
| Text hit geometry  | [`src/lib/presentation/text-hit-geometry.ts`](../../src/lib/presentation/text-hit-geometry.ts)                   |
| Read-only canvas   | [`src/components/presentation/slide-canvas.tsx`](../../src/components/presentation/slide-canvas.tsx)             |
| Inspector          | [`src/components/presentation/slide-inspector.tsx`](../../src/components/presentation/slide-inspector.tsx)       |
| Layer list         | [`src/components/presentation/layer-list.tsx`](../../src/components/presentation/layer-list.tsx)                 |
| Text style toolbar | [`src/components/presentation/text-style-bar.tsx`](../../src/components/presentation/text-style-bar.tsx)         |
| Deck commands      | [`src/lib/presentation/slide-commands.ts`](../../src/lib/presentation/slide-commands.ts)                         |
| Deck mutations     | [`src/lib/presentation/deck-mutations.ts`](../../src/lib/presentation/deck-mutations.ts)                         |
| Patch autosave     | [`src/lib/presentation/patch-autosave.ts`](../../src/lib/presentation/patch-autosave.ts)                         |
| Slide presence     | [`src/lib/presentation/use-slide-presence.ts`](../../src/lib/presentation/use-slide-presence.ts)                 |

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

| Surface        | Responsibility                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| Top toolbar    | Deck/session menus: Add, Insert, Design, Source, View, plus undo/redo, save, and close.                   |
| Canvas popover | Frequent verbs for the current object: slide verbs, element formatting, arrange, object actions.          |
| Stage          | Direct manipulation of slide elements on a fixed-format canvas.                                           |
| Inspector      | One active task panel (Slide/Arrange/Text/Appearance/Effects/Source/Notes/Layers) for the current object. |
| Bottom dock    | Zoom, notes, rail toggle, and status.                                                                     |
| Slide rail     | Select, duplicate, remove, and reorder slides.                                                            |

On smaller surfaces, the inspector can render as a sheet while the stage remains
the same controlled editor surface.

## Top Toolbar

The top toolbar is a compact deck/session command surface. It uses stable
first-level text controls:

```text
Add | Insert | Design | Source | View                    Undo Redo | Save status | Save | Close
```

- **Add** opens the slide template picker and creates a new slide from built-in
  or deck-local custom templates.
- **Insert** creates new current-slide objects through slide commands: text,
  image, shape, visual, connector when two connectable objects are selected, and
  document text/visuals when insertable source content exists. Newly inserted
  objects become selected so the canvas popover and inspector take over editing.
- **Design** owns deck canvas size, presentation theme/tokens, current-slide
  background, current-slide accent, clearing current-slide background/accent
  overrides, and applying the selected solid/gradient background or accent
  across the deck.
- **Source** owns document sync status, sync from document, stale-link review,
  and source-link actions that apply to the selected linked element.
- **View** owns view toggles and shortcuts: thumbnails, snap to grid, and the
  keyboard shortcut dialog. Zoom remains in the bottom dock.

Fine-grained selected-element formatting stays out of the top toolbar. The
canvas popover and inspector continue to own text style, arrangement,
appearance, effects, notes, layers, and detailed source review for the current
object.

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

The canvas is fully keyboard operable (ADR 0002; issues #530–#535). The pure
decision logic lives in `src/lib/presentation/canvas-a11y.ts` (unit-tested by
`canvas-a11y.test.ts`); the editors keep only thin wiring.

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
`Slide / Arrange / Text / Appearance / Effects / Source / Notes / Layers` — with
a compact in-panel switcher for moving between the panels available to the
current selection. The panel open state is persisted in local storage; wide
screens default open when no preference exists, while narrow screens use a
bottom sheet. `Layers` is a normal panel rather than a separate inspector mode.

The available panel set is computed from the selection by `availablePanels`
(`slide-panel-ui.ts`), which also powers the canvas toolbar `...` menu so the two
never drift. With no element selected the current object is the slide
(`Slide / Notes / Layers`); a single element exposes its kind-specific panels
plus `Arrange`, `Effects`, and `Layers`, with `Source` only when the element has
a `source`; a multi-selection exposes `Arrange / Effects / Layers`. There is
no fallback routing: when the selection changes so the active panel no longer
applies, `SlideEditor` closes the right panel instead of guessing a replacement.
The object-identity header names the current object but no longer exposes a
permanent `Name` input — element naming lives in `Layers`.

`SlideInspector` receives callbacks for every action:

- slide duplicate/remove;
- template apply/reapply;
- create/delete deck-local custom templates;
- update a deck-local custom template from the current slide;
- slide master assignment;
- create/delete masters and set the deck default master;
- master background, footer, page number, logo, watermark, and apply-to-all
  controls;
- element patch/remove/duplicate;
- z-order, arrange, align, distribute, match-size;
- group/ungroup;
- hide/lock/rename layer-list operations;
- slide `designOverrides.background` and accent updates;
- image upload through the slide asset action when `documentId` is available.

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
- hand-authored slides preserve their `elements[]`;
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
5. Element content, design, and source-link edits write v6 element fields.
6. Autosave writes through the same patch/whole-deck retry pipeline.
7. Conflicts are resolved by revision token, not by presence.

## Primary Tests

- [`src/lib/presentation/slide-commands.test.ts`](../../src/lib/presentation/slide-commands.test.ts)
- [`src/lib/presentation/deck-mutations.test.ts`](../../src/lib/presentation/deck-mutations.test.ts)
- [`src/lib/presentation/patch-autosave.test.ts`](../../src/lib/presentation/patch-autosave.test.ts)
- [`src/lib/presentation/autosave-hardening.test.ts`](../../src/lib/presentation/autosave-hardening.test.ts)
- [`src/lib/presentation/deck-merge.test.ts`](../../src/lib/presentation/deck-merge.test.ts)
- [`src/lib/presentation/source-link-staleness.test.ts`](../../src/lib/presentation/source-link-staleness.test.ts)
- [`src/lib/presentation/use-slide-presence.test.ts`](../../src/lib/presentation/use-slide-presence.test.ts)
- [`e2e/slides-smoke.spec.ts`](../../e2e/slides-smoke.spec.ts)
