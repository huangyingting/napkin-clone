# Slide Editor Runtime

**Status:** Current  
**Last updated:** 2026-06-23

This document describes the runtime architecture of the slide editor. It is
about interaction and UI ownership, not the persisted deck schema. For the JSON
contract, see [../data-model/deck.md](../data-model/deck.md). For detailed
stage hit-testing, hover preselection, overlap handling, connector targeting,
and pointer state rules, see
[slide-stage-interactions.md](slide-stage-interactions.md).

## Source Files

| Area               | Source                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Editor shell       | [`src/components/presentation/slide-editor.tsx`](../../../src/components/presentation/slide-editor.tsx)             |
| Stage interactions | [`src/components/presentation/slide-stage-editor.tsx`](../../../src/components/presentation/slide-stage-editor.tsx) |
| Stage hit testing  | [`src/lib/presentation/stage-hit-test.ts`](../../../src/lib/presentation/stage-hit-test.ts)                         |
| Stage targeting    | [`src/lib/presentation/stage-targeting.ts`](../../../src/lib/presentation/stage-targeting.ts)                       |
| Stage chrome       | [`src/lib/presentation/stage-chrome.ts`](../../../src/lib/presentation/stage-chrome.ts)                             |
| Select-under       | [`src/lib/presentation/stage-select-under.ts`](../../../src/lib/presentation/stage-select-under.ts)                 |
| Stage decisions    | [`src/lib/presentation/stage-interaction.ts`](../../../src/lib/presentation/stage-interaction.ts)                   |
| Text hit geometry  | [`src/lib/presentation/text-hit-geometry.ts`](../../../src/lib/presentation/text-hit-geometry.ts)                   |
| Read-only canvas   | [`src/components/presentation/slide-canvas.tsx`](../../../src/components/presentation/slide-canvas.tsx)             |
| Inspector          | [`src/components/presentation/slide-inspector.tsx`](../../../src/components/presentation/slide-inspector.tsx)       |
| Layer list         | [`src/components/presentation/layer-list.tsx`](../../../src/components/presentation/layer-list.tsx)                 |
| Text style toolbar | [`src/components/presentation/text-style-bar.tsx`](../../../src/components/presentation/text-style-bar.tsx)         |
| Deck commands      | [`src/lib/presentation/slide-commands.ts`](../../../src/lib/presentation/slide-commands.ts)                         |
| Deck mutations     | [`src/lib/presentation/deck-mutations.ts`](../../../src/lib/presentation/deck-mutations.ts)                         |
| Patch autosave     | [`src/lib/presentation/patch-autosave.ts`](../../../src/lib/presentation/patch-autosave.ts)                         |
| Slide presence     | [`src/lib/presentation/use-slide-presence.ts`](../../../src/lib/presentation/use-slide-presence.ts)                 |

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

## Surface Layout

The desktop editor is a three-surface workflow:

| Surface    | Responsibility                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| Slide rail | Select, duplicate, remove, and reorder slides.                                                            |
| Stage      | Direct manipulation of slide elements on a fixed-format canvas.                                           |
| Inspector  | Slide settings, element settings, layout controls, upload controls, layer list, and multi-select actions. |

On smaller surfaces, the inspector can render as a sheet while the stage remains
the same controlled editor surface.

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
- inline-edit text and bullet elements;
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
  end / start endpoint anchor. Free-draw routing remains pointer-only.
- **Help:** `?` (or the toolbar keyboard button) opens the shortcut help dialog
  (`canvasShortcutHelp`).

## Canvas Contract

`SlideCanvas` is read-only. It renders the current `slide.elements[]` with the
resolved theme/style cascade. The stage wraps it with editing affordances, but
rendering itself is shared with present/public viewers.

The editor can pass `hiddenElementIds` to hide elements during inline editing or
layer-list visibility toggles. The `editable` flag affects empty-image treatment
only; it does not make `SlideCanvas` mutate state.

## Inspector Runtime

`SlideInspector` owns editing controls, not deck state. It receives callbacks for
every action:

- slide duplicate/remove;
- layout apply/reset;
- element patch/remove/duplicate;
- z-order, arrange, align, distribute, match-size;
- group/ungroup;
- hide/lock/rename layer-list operations;
- slide background, gradient, image, background asset, and accent updates;
- image upload through the slide asset action when `documentId` is available.

The inspector must not infer missing context. If a workflow requires full source
document blocks or document id, those values are passed by `SlideEditor`.

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

Some source-link operations call deck helpers directly because they are still
specialized element/source-ref workflows. They still end at the same deck change
and autosave pipeline.

All element mutations clear `elementsDerived` for the affected slide so later
document sync preserves authored geometry and style.

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

- slides with `elementsDerived === true` are rebuilt from fresh document
  content;
- hand-authored slides preserve their `elements[]`;
- active `sourceRef` elements can refresh content or content hashes in place;
- orphaned source blocks are surfaced to the user instead of being silently
  removed.

Source-link controls support update, unlink, relink, and orphan removal. Source
refs must carry explicit `blockKind`.

## Invariants

1. `SlideEditor` is the only presentation component that owns deck state.
2. `SlideStageEditor`, `SlideInspector`, and `LayerList` are controlled views.
3. `SlideCanvas` is shared and read-only.
4. Element geometry stays in percentage units.
5. User-authored element edits clear derived provenance.
6. Autosave writes through the same patch/whole-deck retry pipeline.
7. Conflicts are resolved by revision token, not by presence.

## Primary Tests

- [`src/lib/presentation/slide-commands.test.ts`](../../../src/lib/presentation/slide-commands.test.ts)
- [`src/lib/presentation/deck-mutations.test.ts`](../../../src/lib/presentation/deck-mutations.test.ts)
- [`src/lib/presentation/patch-autosave.test.ts`](../../../src/lib/presentation/patch-autosave.test.ts)
- [`src/lib/presentation/autosave-hardening.test.ts`](../../../src/lib/presentation/autosave-hardening.test.ts)
- [`src/lib/presentation/deck-merge.test.ts`](../../../src/lib/presentation/deck-merge.test.ts)
- [`src/lib/presentation/source-link-staleness.test.ts`](../../../src/lib/presentation/source-link-staleness.test.ts)
- [`src/lib/presentation/use-slide-presence.test.ts`](../../../src/lib/presentation/use-slide-presence.test.ts)
- [`e2e/slides-smoke.spec.ts`](../../../e2e/slides-smoke.spec.ts)
