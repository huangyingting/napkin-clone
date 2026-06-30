# V7 Slide Editor UI Design

**Status:** Design spec — implementation ready  
**Last updated:** 2026-06-30  
**Author:** Mouse (Design/UX)

This document specifies the UI design for the v7/vNext slide editor migration. It
defines the target surface layout, component inventory, interaction states,
inline editing capability, keyboard expectations, editing flows, and a
verification plan. Implementation follows this document; do not implement until
this spec is accepted.

The behavioral and visual reference is the legacy editor
(`src/components/presentation/slide-editor.tsx` and its sub-tree). All mutations
remain on `DeckV7` through `editor-commands.ts`. No v6 runtime compatibility
layers are introduced.

---

## Guiding Principles

1. **Copy the product experience, not the old data shape.** The v7 editor should
   look and feel like the mature legacy editor while all mutations target
   `DeckV7`.

2. **Surfaces appear in context, not permanently.** The context/popover toolbar
   only shows when something is selected or being edited; the canvas is calm
   while the user is reading or idle.

3. **Reuse before rewriting.** Legacy shell, inspector, and stage overlay
   components express the right patterns — adapt them for v7 nodes rather than
   building anew.

4. **One render tree feeds every surface.** Editor canvas, present mode, public
   viewer, HTML prototype, and export all consume `resolveDeckRenderTree`.

5. **Local user edits outrank theme.** User `localStyle`, content, geometry, and
   source metadata survive theme changes unless the user explicitly resets.

6. **All mutations flow through `editor.update()` / `editor-commands.ts`.** No
   command writes v6 `Slide.elements[]` or touches the DB directly.

---

## Target Surface Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  Top Toolbar (44px)                                                  │
│  Deck title | Insert group | Theme picker | Undo/Redo | Save | Close │
├──────────────────────────────────────────────────────────────────────┤
│                                              │                       │
│  Stage (flex-1)                              │  Inspector overlay    │
│                                              │  (right-4, 320px)     │
│   ┌────────────────────────────────────┐     │                       │
│   │  Context / Popover Toolbar         │     │  Context-aware panel  │
│   │  (floats above selection, portal)  │     │  router:              │
│   └────────────────────────────────────┘     │  Slide / Text / Shape │
│                                              │  Image / Visual /     │
│   ┌──────────── Slide Canvas ──────────┐     │  Connector / Table /  │
│   │  (SlideCanvasVNext + edit overlays)│     │  Group / Arrange /    │
│   │                                    │     │  Effects / Source /   │
│   └────────────────────────────────────┘     │  Notes / Layers       │
│                                              │  + vNext additions    │
├──────────────────────────────────────────────┴───────────────────────┤
│  Bottom Filmstrip (84px)                                             │
│  [ 1 ] [ 2 ] [ 3* ] [ 4 ] …  +Add   Dup   Del  |  Zoom  Notes       │
└──────────────────────────────────────────────────────────────────────┘
```

The legacy editor keeps the stage as the owning layout surface and floats the
desktop inspector on top of it (`absolute right-4 z-panel`) instead of letting
the inspector resize the stage. The v7 editor should preserve that contract:
top toolbar and bottom filmstrip/status chrome are fixed-height siblings, while
the stage remains the full middle surface and owns floating stage chrome.

---

## 1. Top Toolbar

### Responsibility

Deck-wide and session-level commands. **No element-level formatting here** —
those live in the context toolbar and inspector.

### Layout

```
[ Deck title / slide count ]  ·  [ Insert ▾ ]  [ Theme ▾ ]  [ Ratio ▾ ]
                                                       ⋯
[ ? ]  [ ⟲ Undo ]  [ ↷ Redo ]  |  [ Save status ]  [ Save ]  [ Export ▾ ]  [ × Close ]
```

| Group    | Controls                                                                             | Notes                                                                                                     |
| -------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Identity | Deck title (truncated), slide count, active theme name                               | Read-only label; click deck title to rename inline                                                        |
| Insert   | Drop-down menu: Text · Shape · Image · Visual · Connector · Table                    | Currently flat icon buttons in v7; consolidate into a single labelled trigger `Insert ▾` with a `Popover` |
| Deck     | Theme package picker (`select` → `SelectMenu`) · Slide ratio (`RectangleHorizontal`) | Move insert buttons out; consolidate deck chrome                                                          |
| Arrange  | Snap toggle, Keyboard shortcuts (`?`)                                                | Icon buttons, `Tooltip` on hover                                                                          |
| Edit     | Undo (`Undo2`) · Redo (`Redo2`)                                                      | Disabled when not available                                                                               |
| Persist  | Save status label · Save button · Export PPTX (`FileDown`)                           | Save status uses `StatusPill` token                                                                       |
| Session  | Close (`X`)                                                                          | Prompts if `hasUnsavedWork`                                                                               |

**Current v7 state:** the toolbar already renders all of the above controls but
the insert buttons are mixed in as flat 32 px icon buttons with no grouping.
The migration separates deck-level from insert-level and introduces an `Insert`
drop-down matching the pattern from
`shell-components.tsx` → `InsertMenuButton` + `SlideTemplatePicker`.

### Legacy reference

- `SlideEditorTopToolbar` —
  `src/components/presentation/slide-editor/shell-components.tsx` (exported but
  lives in the same file as `SlideRail`, `SlideBottomDock`, etc.)
- `InsertMenuButton` — same file, line ~1206
- `SlideTemplatePicker` — same file, line ~990

### V7 target file

`src/components/presentation-vnext/slide-editor-vnext.tsx` — `<header>` region,
lines 1301–1500 (current). Extract to
`src/components/presentation-vnext/toolbar/top-toolbar.tsx`.

---

## 2. Context / Popover Toolbar

### Responsibility

Frequent verbs for the **current object** (selected element(s) or slide). The
popover toolbar surfaces the most-used actions without requiring the inspector
panel. It is **mutually exclusive** with any other floating surface and
**disappears** when nothing is selected.

### Trigger Model

| Selection state                              | Toolbar shown                                              |
| -------------------------------------------- | ---------------------------------------------------------- |
| Nothing selected                             | Hidden                                                     |
| Single text node selected (not in edit mode) | Text format + arrange group                                |
| Single text node in inline edit mode         | Text format group only; arrange and delete hidden          |
| Single shape node selected                   | Shape color + arrange group                                |
| Single image node selected                   | Image + arrange group                                      |
| Single visual node selected                  | Visual style + arrange group                               |
| Single connector node selected               | Connector routing + arrange group                          |
| Single table node selected                   | Table + arrange group                                      |
| Decoration node selected (layers mode)       | Decoration: Detach · arrange                               |
| Multi-selection (2+ nodes)                   | Align · Distribute · Match size · Group · Z-order · Delete |
| Slide selected (no element)                  | Slide background · Add slide actions                       |

### Positioning

The toolbar portals to `document.body` and floats **above** the selection
bounding box, centered horizontally over the selection, with a fixed 12 px gap
(`STAGE_FLOATING_TOOLBAR_GAP = 12`). It tracks the selection rect on every
animation frame during transitions (stage resize, inspector open/close) exactly
as the legacy `StageFloatingToolbar` does (see `shell-components.tsx` lines
162–349). On narrow viewports where it would clip the toolbar edge, it clamps
horizontally to `STAGE_FLOATING_TOOLBAR_EDGE_INSET = 8`.

The popover must be anchored to `data-slide-toolbar-anchor="true"` on the stage
container element. The v7 `SlideCanvasVNext` wrapper in the stage area must
carry this attribute (currently it does not — this is a required change).

### Tool groups by node type

**Text node:**

```
[ Bold | Italic | Underline | Strikethrough ]  |  [ H1 | H2 | Body | Quote | Bullet | Numbered ]
  |  [ Left | Center | Right ]  |  [ Color ▾ ]  |  [ Font size ▾ ]  |  [ Link ]
  |  [ … More ▾ : Arrange | Lock | Duplicate | Delete ]
```

**Shape node:**

```
[ Fill color ▾ ]  [ Border color ▾ ]  [ Opacity ]  |  [ Arrange ▾ ]  |  [ Duplicate ]  [ Delete ]
```

**Image node:**

```
[ Replace ]  [ Crop ]  |  [ Arrange ▾ ]  |  [ Duplicate ]  [ Delete ]
```

**Visual node:**

```
[ Style theme ▾ ]  [ Restyle ]  |  [ Arrange ▾ ]  |  [ Duplicate ]  [ Delete ]
```

**Connector node:**

```
[ Routing: straight | curved | step ]  [ Arrow start ▾ ]  [ Arrow end ▾ ]  |  [ Color ▾ ]
  |  [ Arrange ▾ ]  |  [ Duplicate ]  [ Delete ]
```

**Table node:**

```
[ Insert row ↓ ]  [ Insert col → ]  [ Delete row ]  [ Delete col ]  |  [ Style ▾ ]
  |  [ Arrange ▾ ]  |  [ Duplicate ]  [ Delete ]
```

**Multi-selection:**

```
[ Align ▾ ]  [ Distribute ▾ ]  [ Match size ▾ ]  |  [ Group ]  [ Ungroup ]
  |  [ Bring forward ] [ Send backward ]  |  [ Duplicate ]  [ Delete ]
```

**Slide (no element selected):**

```
[ Background ▾ ]  |  [ Add slide ]  [ Duplicate slide ]  [ Delete slide ]
```

### Component model

The context toolbar is implemented as a `FloatingSurface`
(`src/components/ui/floating-surface.tsx`) with a `role="toolbar"` inner
container. Each button group uses `ToolbarButton`
(`src/components/ui/chrome.tsx`) with `Tooltip`. Color pickers use the existing
`ColorPicker` and `Swatch` primitives. The `…` overflow menu uses
`ToolbarMenuItem` in a `Popover`.

Commands dispatch to the `onDeckChange` / `editor-commands.ts` path — not to
the inspector.

### Legacy reference

- `StageFloatingToolbar` (positioning engine) —
  `src/components/presentation/slide-editor/shell-components.tsx` lines 162–349
- `ElementToolbarContent` (text/shape/image/connector/visual/table tool groups) —
  `src/components/presentation/slide-stage/element-overlays.tsx`
- `TextStyleBar` (text format strip) —
  `src/components/presentation/text-style-bar.tsx`

### V7 target files

| File                                                                  | Description                                                                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/components/presentation-vnext/toolbar/context-toolbar.tsx`       | New — floating selection toolbar shell (port `StageFloatingToolbar`)                  |
| `src/components/presentation-vnext/toolbar/text-toolbar-group.tsx`    | New — text format group (adapt `TextStyleBar` + `ElementToolbarContent` text section) |
| `src/components/presentation-vnext/toolbar/shape-toolbar-group.tsx`   | New — shape color/border group                                                        |
| `src/components/presentation-vnext/toolbar/arrange-toolbar-group.tsx` | New — align/distribute/z-order group                                                  |
| `src/components/presentation-vnext/toolbar/slide-toolbar-group.tsx`   | New — slide background/add/dup/delete                                                 |

---

## 3. Right Properties Panel (Inspector)

### Responsibility

Detailed editing of the current object. Exposes one active panel at a time. The
available panel set is derived from the selection type. When selection changes
and the active panel no longer applies, the inspector resets rather than
guessing a replacement.

### Panel routing (current object → available panels)

| Current object                | Available panels                                     |
| ----------------------------- | ---------------------------------------------------- |
| No selection (slide)          | Slide · Notes · Layers                               |
| Text node                     | Text · Arrange · Effects · Source · Layers           |
| Shape node (with text)        | Shape · Text · Arrange · Effects · Source · Layers   |
| Shape node (no text)          | Shape · Arrange · Effects · Source · Layers          |
| Image node                    | Image · Adjust · Arrange · Effects · Source · Layers |
| Visual node                   | Visual · Arrange · Source · Layers                   |
| Connector node                | Line · Arrange · Effects · Layers                    |
| Table node                    | Table · Arrange · Effects · Source · Layers          |
| Group node                    | Arrange · Effects · Layers                           |
| Multi-selection               | Arrange · Effects · Layers                           |
| Decoration node (layers mode) | Decoration · Arrange · Layers                        |

The panel header renders the object identity ("Text", "Shape", "Slide 3", etc.)
and a horizontal tab strip showing the available panels for the current object.

### Panel definitions

#### Slide panel

- Background: solid/gradient/image picker (reuse `ColorThemePanel` from
  `shell-components.tsx`)
- Accent color override for this slide
- Clear overrides (reset to deck/theme defaults)
- vNext: Tone · Density · Emphasis · Chrome (decoration toggle)
- vNext: Template kind + layout picker (select controls, already in v7 editor)

#### Notes panel

- Plain `<textarea>` bound to `slide.notes`
- Used by present mode / speaker view

#### Text panel

- Font size, weight, style (bold/italic/underline/strikethrough)
- Text color (swatch + picker)
- Paragraph alignment (left/center/right)
- Line height
- List type (none/bullet/numbered) + indent controls
- vNext: Style ref picker + variant

#### Shape panel

- Shape kind picker (rect/ellipse/triangle/line)
- Fill color + opacity
- Stroke color + weight + dash style
- Corner radius (for rect/ellipse)
- vNext: Style ref + local override badge

#### Image panel

- Asset preview thumbnail + Replace button
- Fit mode: contain/cover/fill/crop
- Alt text input

#### Adjust panel

- Brightness, contrast, saturation, blur sliders
- Opacity slider
- Reset adjustments

#### Visual panel

- Visual theme picker (swatch chips)
- Per-channel color overrides
- Replace visual action

#### Line panel (connector)

- Routing: straight/curved/step
- Start arrowhead/End arrowhead selectors
- Stroke color, weight, dash
- vNext: Style ref

#### Table panel

- Column/row count controls
- Header row toggle
- Alternating row color toggle
- Caption text

#### Arrange panel

- Position (x, y) inputs
- Size (w, h) inputs + aspect-lock toggle
- Rotation input
- Flip horizontal/vertical
- Z-index: Bring to front · Send to back · Forward · Backward
- Align + Distribute (multi-select only)
- Group / Ungroup
- Lock / Unlock
- Hide / Show

#### Effects panel

- Shadow toggle + offset/blur/color
- Opacity
- Blend mode

#### Source panel

- Source document link status
- Linked block kind (text/visual/table)
- Update from document · Unlink · Relink actions
- Stale indicator

#### Layers panel

- Flat list of all nodes in z-order (top to bottom)
- Each row: node type icon + auto-name + lock/hide toggles
- Click to select; drag to reorder z-index
- Decorations shown separately when in layers mode

#### vNext panels

| Panel           | Content                                                            |
| --------------- | ------------------------------------------------------------------ |
| Style binding   | Style ref picker, variant selector                                 |
| Local overrides | Override badge + Reset to theme button, per-property override diff |
| Diagnostics     | Grouped diagnostic cards with repair action buttons                |

### Inspector shell

The inspector panel router lives in `SlideInspector` (legacy) and
`src/components/presentation-vnext/inspector/index.ts` (v7 partial). The v7
inspector needs:

1. A panel tab strip component (currently missing — the v7 editor renders
   panels sequentially, not via tabs).
2. Panel routing logic (`availablePanels` helper function equivalent to
   `src/lib/presentation/slide-panel-ui.ts`).
3. A compact `PanelSurface` wrapper using `src/components/ui/chrome.tsx` →
   `PanelSurface`.

### Legacy reference

| Component                            | File                                                                  |
| ------------------------------------ | --------------------------------------------------------------------- |
| `SlideInspector` (router + shell)    | `src/components/presentation/slide-inspector.tsx`                     |
| `ElementEditor` (node-level routing) | `src/components/presentation/slide-inspector/element-editor.tsx`      |
| `SlidePanel`                         | `src/components/presentation/slide-inspector/slide-panel.tsx`         |
| `TextPanel`                          | `src/components/presentation/slide-inspector/text-panel.tsx`          |
| `ShapePanel`                         | `src/components/presentation/slide-inspector/shape-panel.tsx`         |
| `ImagePanel`                         | `src/components/presentation/slide-inspector/image-panel.tsx`         |
| `VisualPanel`                        | `src/components/presentation/slide-inspector/visual-panel.tsx`        |
| `TablePanel`                         | `src/components/presentation/slide-inspector/table-panel.tsx`         |
| `TextStyleControls`                  | `src/components/presentation/slide-inspector/text-style-controls.tsx` |
| `EffectsPanel`                       | `src/components/presentation/slide-inspector/effects-panel.tsx`       |
| `MultiSelectTools`                   | `src/components/presentation/slide-inspector/multi-select-tools.tsx`  |
| `InspectorControls` (primitives)     | `src/components/presentation/slide-inspector/controls.tsx`            |
| `InspectorPrimitives`                | `src/components/presentation/slide-inspector/primitives.tsx`          |
| `AvailablePanels` logic              | `src/lib/presentation/slide-panel-ui.ts`                              |

### V7 target files

| File                                                                  | Description                                                      |
| --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `src/components/presentation-vnext/inspector/index.ts`                | Already exists — expand exports                                  |
| `src/components/presentation-vnext/inspector/inspector-shell.tsx`     | New — tab strip + panel router                                   |
| `src/components/presentation-vnext/inspector/slide-panel.tsx`         | New — background/template/vNext controls                         |
| `src/components/presentation-vnext/inspector/text-panel.tsx`          | New — text format panel                                          |
| `src/components/presentation-vnext/inspector/shape-panel.tsx`         | New — shape panel                                                |
| `src/components/presentation-vnext/inspector/image-panel.tsx`         | New — image + adjust panel                                       |
| `src/components/presentation-vnext/inspector/visual-panel.tsx`        | New — visual style panel                                         |
| `src/components/presentation-vnext/inspector/line-panel.tsx`          | New — connector panel                                            |
| `src/components/presentation-vnext/inspector/table-panel.tsx`         | New — table panel                                                |
| `src/components/presentation-vnext/inspector/arrange-panel.tsx`       | New — arrange + z-order                                          |
| `src/components/presentation-vnext/inspector/effects-panel.tsx`       | New — effects panel                                              |
| `src/components/presentation-vnext/inspector/source-panel.tsx`        | New — source link panel                                          |
| `src/components/presentation-vnext/inspector/notes-panel.tsx`         | New — speaker notes                                              |
| `src/components/presentation-vnext/inspector/layers-panel.tsx`        | Already exists — extend                                          |
| `src/components/presentation-vnext/inspector/style-binding-panel.tsx` | Already exists                                                   |
| `src/components/presentation-vnext/inspector/local-style-panel.tsx`   | Already exists                                                   |
| `src/components/presentation-vnext/inspector/diagnostics-panel.tsx`   | Already exists                                                   |
| `src/lib/presentation-vnext/inspector-panel-ui.ts`                    | New — panel routing logic (v7 equivalent of `slide-panel-ui.ts`) |

---

## 4. Bottom Thumbnail Filmstrip

### Responsibility

Navigate between slides, see the deck at a glance, add/duplicate/delete/reorder
slides.

### Layout spec

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2px top border (ds-border-subtle)                                           │
│  [ ← ↑ ] [ 1 │ ████ ] [ 2 │ ████ ] [ 3* │ ████ ] [ 4 │ ████ ] [ + Add ]   │
│  Drag handles                                        ↑ active               │
│  height: 84px   |  overflow-x: auto  |  bg: transparent                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Height:** 84 px (compact vertical padding around a 72 px thumbnail).
- **Each thumbnail cell:** 16:9 aspect thumbnail (width ~108 px at 16:9 = ~61 px
  tall), slide number label below, active slide ring `ring-ds-accent-border`,
  hover ring `ring-ds-border`.
- **Add button:** `+ Add slide` cell at the end of the strip, icon-only or
  labelled on wider screens.
- **Context actions on active cell:** small overlay buttons at top-right: Dup ·
  Del · ↑ ↓ (reorder). These overlay the thumbnail on hover/active-slide, same
  pattern as the current v7 left rail `ChevronUp/Down` buttons
  (`slide-editor-vnext.tsx` lines 1628–1654).
- **Drag-to-reorder:** pointer drag (not HTML5 drag, for reliability with portal
  canvases). On `pointerdown` on a thumbnail, attach a `pointermove` listener;
  compute hover target index; show a reorder drop indicator; on `pointerup`,
  call `moveSlide`. This matches the legacy rail's `useSlideRailController` at
  `src/components/presentation/slide-editor/use-slide-rail-controller.ts`.

### Transition

The filmstrip can be **collapsed** by a `▲` toggle button in the bottom-right
dock area. Collapsed state persists in `localStorage`. When collapsed, a thin
32 px status bar shows slide count and zoom. Same `max-h` / `opacity` /
`translate-y` transition pattern as the legacy `SlideRail` (lines 363–388 in
`shell-components.tsx`).

### Keyboard

- `←` / `→` arrow keys on the filmstrip navigate between slides.
- `Enter` or `Space` on a focused thumbnail selects the slide.
- `Delete` on a focused thumbnail deletes the slide (prompts if only one slide).

### Legacy reference

| Component                | File                                        | Notes                              |
| ------------------------ | ------------------------------------------- | ---------------------------------- |
| `SlideRail`              | `shell-components.tsx` lines 352–388        | Collapsible container shell        |
| `SlideBottomDock`        | `shell-components.tsx` (later in file)      | Bottom area with zoom + toggle     |
| `useSlideRailController` | `slide-editor/use-slide-rail-controller.ts` | Rail state: open/closed, animation |
| `ThumbnailAction`        | `shell-components.tsx`                      | Per-thumbnail action overlay       |

### V7 target files

| File                                                                | Description                                |
| ------------------------------------------------------------------- | ------------------------------------------ |
| `src/components/presentation-vnext/filmstrip/filmstrip.tsx`         | New — filmstrip shell + scroll             |
| `src/components/presentation-vnext/filmstrip/filmstrip-slide.tsx`   | New — individual slide cell                |
| `src/components/presentation-vnext/filmstrip/use-filmstrip-drag.ts` | New — drag-to-reorder hook                 |
| `src/components/presentation-vnext/filmstrip/bottom-dock.tsx`       | New — zoom, notes toggle, filmstrip toggle |

---

## 5. Slide Inline Editing

### Overview

Inline editing lets users double-click a text or shape node on the stage and
edit its text content directly, without opening the inspector. The canvas
renders the node read-only; the inline editor overlays a `contenteditable`
region with identical geometry.

This is the most significant missing capability in the current v7 editor.

### Entering inline edit mode

1. User double-clicks a text or shape node on the stage canvas.
2. The stage emits `onNodeDoubleClick(nodeId)` to the editor shell.
3. The editor shell sets `inlineEditNodeId` state and passes it as a prop to the
   stage area.
4. The stage renders `InlineTextEditorVNext` positioned over the node bounds.
5. The canvas hides the underlying text node via `hiddenNodeIds` (equivalent to
   the legacy `hiddenElementIds` prop on `SlideCanvas`). `SlideCanvasVNext` needs
   a `hiddenNodeIds?: Set<string>` prop added.
6. The context toolbar switches to **text format mode** (text format group only,
   no arrange/delete).

### Exiting inline edit mode

- **Escape** or click outside → commit current text to `node.content.paragraphs`,
  call `onDeckChange(updateNodeContent(...))`, clear `inlineEditNodeId`.
- Tab and Shift+Tab → commit and move to the next/previous text node in the
  slide's reading order.
- No text entered + Escape → no-op, stays in selection mode.

### Commit path

```
InlineTextEditorVNext.onCommit(paragraphs)
  → editor shell handleInlineEditCommit(nodeId, paragraphs)
  → onDeckChange(updateNodeContent(deck, slideId, nodeId, { paragraphs }))
```

All v7 text content lives in `SlideChildNode.content.paragraphs[]` (type
`text`) or `SlideChildNode.content.text` (shape text). The commit writes
`content.paragraphs` for text nodes and `content.text` for shape nodes.

### InlineTextEditorVNext design

The inline editor is a `contenteditable div` absolutely positioned inside the
stage's coordinate space (relative to the slide canvas frame at 100% width).
Its `left/top/width/height` are derived from the node's `layout.frame`
percentage values converted to pixels using the live canvas bounding rect.

```
framePx = {
  left:   frame.x / 100 * canvasWidth,
  top:    frame.y / 100 * canvasHeight,
  width:  frame.w / 100 * canvasWidth,
  height: frame.h / 100 * canvasHeight,
}
```

The text inside the editor uses the same resolved CSS font (family, size,
weight, line-height) as the v7 canvas renderer so the switch from render to edit
mode is visually seamless.

### Rich text in the inline editor

Paragraphs are stored as `{ id, text, runs? }` where `runs` carry bold/italic
spans. The inline editor syncs with the `contenteditable` via
`getSelection().getRangeAt(0)` on every `input` event, building run records.
This mirrors the legacy `InlineTextEditor`'s `mergeRuns`, `runsToHtml`,
`serializeRichText` helpers at
`src/components/presentation/slide-stage/inline-text-editor.tsx`.

Text format commands (bold, italic, underline, color, font size, align) are
dispatched to the inline editor via a custom DOM event
`textiq:inline-text-command-v7` carrying `InlineTextCommandPayload`. The context
toolbar dispatches this event; the inline editor handles it with
`document.execCommand` equivalents or direct run mutation.

### Auto-height

When a text node has `layout.autoHeight: true`, the inline editor grows to fit
content and the node frame is updated on commit (replaces `AUTO_FIT_PADDING_PCT`
/ `clampBox` logic from the legacy inline editor). The v7 `SlideChildNode` does
not currently have an `autoHeight` flag — this must be added to the schema or
handled via a `minHeight` layout property.

### Legacy reference

| File                                                             | Relevant concepts                                                                                               |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `src/components/presentation/slide-stage/inline-text-editor.tsx` | Core `InlineTextEditor` component, `INLINE_TEXT_COMMAND_EVENT`, run serialization, auto-height, font resolution |
| `src/components/presentation/slide-stage/element-overlays.tsx`   | `ElementToolbarContent` — dispatches `INLINE_TEXT_COMMAND_EVENT` from context toolbar                           |
| `src/lib/presentation/rich-text-html.ts`                         | `mergeRuns`, `runsToHtml`, `serializeRichText`, `splitRunsIntoLines`                                            |
| `src/lib/presentation/rich-text-commands.ts`                     | `applyBoldOrItalic`, `insertTextAtCursor`                                                                       |
| `src/lib/presentation/stage-interaction.ts`                      | `isInlineEditableStageElement` predicate                                                                        |

### V7 target files

| File                                                       | Description                                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/components/presentation-vnext/inline-text-editor.tsx` | New — `InlineTextEditorVNext` component                                               |
| `src/lib/presentation-vnext/rich-text.ts`                  | New — run serialization helpers (adapt from `rich-text-html.ts`; no DOM manipulation) |
| `src/lib/presentation-vnext/inline-text-commands.ts`       | New — `INLINE_TEXT_COMMAND_EVENT_V7`, `InlineTextCommandPayload` type                 |

---

## Component Inventory

### Reusable legacy UI components (direct reuse or close adaptation)

| Legacy component                 | File                                             | How to reuse                                                                                       |
| -------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `StageFloatingToolbar`           | `slide-editor/shell-components.tsx:162`          | Port positioning + transition engine to `context-toolbar.tsx` (remove v6-specific toolbar content) |
| `SlideRail`                      | `slide-editor/shell-components.tsx:352`          | Port collapsible shell to `filmstrip.tsx` (change axis from vertical to horizontal)                |
| `SlideBottomDock`                | `slide-editor/shell-components.tsx`              | Port zoom + notes + toggle to `bottom-dock.tsx`                                                    |
| `ThumbnailAction`                | `slide-editor/shell-components.tsx`              | Port per-thumbnail overlay to `filmstrip-slide.tsx`                                                |
| `InsertMenuButton`               | `slide-editor/shell-components.tsx:1206`         | Reuse directly in v7 Insert `Popover` menu                                                         |
| `SlideTemplatePicker`            | `slide-editor/shell-components.tsx:990`          | Port to v7 `SemanticTemplateV1` (replace `Deck` type references)                                   |
| `ColorThemePanel`                | `slide-editor/shell-components.tsx:715`          | Reuse in v7 Slide background inspector panel                                                       |
| `ElementToolbarContent`          | `slide-stage/element-overlays.tsx`               | Port tool groups to v7 context toolbar; replace `ElementPatch` with `editor-commands` calls        |
| `TextStyleBar`                   | `text-style-bar.tsx`                             | Reuse or adapt in `text-toolbar-group.tsx`                                                         |
| `InlineTextEditor`               | `slide-stage/inline-text-editor.tsx`             | Port core logic to `InlineTextEditorVNext`; replace v6 `Paragraph` type with v7                    |
| `KeyboardShortcutHelpDialog`     | `slide-editor/keyboard-shortcut-help-dialog.tsx` | Port dialog with v7-specific shortcuts                                                             |
| `useSlideRailController`         | `slide-editor/use-slide-rail-controller.ts`      | Port open/close/animation state to filmstrip                                                       |
| `InspectorControls` (primitives) | `slide-inspector/controls.tsx`                   | Reuse `FieldRow`, `SectionLabel`, `NumberInput`, `ChoiceRow` etc. in v7 inspector panels           |
| `InspectorPrimitives`            | `slide-inspector/primitives.tsx`                 | Reuse panel layout helpers                                                                         |

### Existing v7 / ds-system components (already available)

| Component                                               | File                                      | Used in                              |
| ------------------------------------------------------- | ----------------------------------------- | ------------------------------------ |
| `ToolbarButton`, `ToolbarMenuItem`                      | `src/components/ui/chrome.tsx`            | Context toolbar, top toolbar buttons |
| `IconButton`, `Button`                                  | `src/components/ui/button.tsx`            | All toolbar buttons                  |
| `FloatingSurface`                                       | `src/components/ui/floating-surface.tsx`  | Context toolbar shell                |
| `Popover`                                               | `src/components/ui/popover.tsx`           | Insert menu, color pickers           |
| `ColorPicker`                                           | `src/components/ui/color-picker.tsx`      | Fill/stroke/text color pickers       |
| `Swatch`                                                | `src/components/ui/swatch.tsx`            | Preset color swatches                |
| `Tooltip`                                               | `src/components/ui/tooltip.tsx`           | All toolbar buttons                  |
| `SegmentedControl`                                      | `src/components/ui/segmented-control.tsx` | Routing/fit-mode picker              |
| `SelectMenu`                                            | `src/components/ui/select-menu.tsx`       | Theme picker, ratio picker           |
| `Tabs`                                                  | `src/components/ui/tabs.tsx`              | Inspector panel tabs                 |
| `PanelSurface`, `FieldRow`, `FormField`, `SectionLabel` | `src/components/ui/chrome.tsx`            | Inspector panel wrappers             |
| `StatusPill`                                            | `src/components/ui/chrome.tsx`            | Save status indicator                |
| `Divider`                                               | `src/components/ui/divider.tsx`           | Toolbar group separators             |
| `Dialog`                                                | `src/components/ui/dialog.tsx`            | Keyboard shortcut help               |
| `Surface`                                               | `src/components/ui/surface.tsx`           | Panel surfaces                       |
| `tokens.ts`                                             | `src/components/ui/tokens.ts`             | `FOCUS_RING`, `cx`, etc.             |

### Existing v7 inspector panels (extend, not replace)

| File                                 | Current state                      | Extension needed                     |
| ------------------------------------ | ---------------------------------- | ------------------------------------ |
| `inspector/slide-controls-panel.tsx` | Tone/density/emphasis/chrome       | Add background + accent controls     |
| `inspector/slide-settings-panel.tsx` | Name + notes + source + localStyle | Keep as-is                           |
| `inspector/node-geometry-panel.tsx`  | x/y/w/h/zIndex/lock/hidden         | Add rotation, flip, aspect-lock      |
| `inspector/node-content-panel.tsx`   | Text/shape content fields          | Extend to table, connector specifics |
| `inspector/local-style-panel.tsx`    | Per-property style overrides       | Keep as-is                           |
| `inspector/style-binding-panel.tsx`  | Style ref + variant                | Keep as-is                           |
| `inspector/layers-panel.tsx`         | Node list + select/lock/hide       | Add drag-to-reorder                  |
| `inspector/local-override-badge.tsx` | Reset badge                        | Keep as-is                           |
| `inspector/diagnostics-panel.tsx`    | Diagnostic cards                   | Keep as-is                           |

---

## Interaction States

### Stage interaction states

| State              | Visual indicator                                                  | User action                             |
| ------------------ | ----------------------------------------------------------------- | --------------------------------------- |
| No selection       | Canvas bare, no overlays                                          | Click empty canvas to remain deselected |
| Hover (pre-select) | Thin `ring-ds-border` on hovered node                             | Pointer moves over a node               |
| Single selected    | Blue `ring-ds-accent-border` + resize handles (8 corners + edges) | Click node                              |
| Multi-selected     | Each selected node has ring; selection bbox shown                 | Shift/Cmd+click or marquee              |
| Drag               | Node follows pointer; alignment guides appear on snap             | Pointer down + move on selected node    |
| Resize             | Handle being dragged highlighted; live frame updates              | Pointer down on resize handle           |
| Marquee            | Dashed rect from drag origin                                      | Pointer down on empty canvas + drag     |
| Inline edit        | Node hidden from canvas; `InlineTextEditorVNext` overlaid         | Double-click text/shape node            |
| Locked             | Node ring dashed/grey; move/resize disabled                       | Node `locked: true`                     |
| Hidden             | Node not rendered in canvas; visible in layers panel              | Node `hidden: true`                     |

### Context toolbar states

| State                       | Toolbar visibility                                              |
| --------------------------- | --------------------------------------------------------------- |
| Nothing selected            | Hidden (opacity 0, pointer-events none)                         |
| Selection present           | Visible, anchored above selection bbox                          |
| Drag in progress            | Hidden (re-appears on pointer up)                               |
| Inline edit active          | Text format strip only (arrange/delete hidden)                  |
| Inspector panel open (wide) | Toolbar remains visible (not mutually exclusive with inspector) |

### Inspector panel states

| State                                      | Inspector behavior                          |
| ------------------------------------------ | ------------------------------------------- |
| No selection                               | Shows Slide panel + Notes + Layers          |
| Selection type changes                     | Active panel resets to default for new type |
| Active panel inapplicable to new selection | Panel closes; router picks default          |
| Diagnostics present                        | Badge on tab + Diagnostics panel available  |

---

## Accessibility / Keyboard

### Canvas navigation

These expectations match the existing `canvas-a11y.ts` contract (tested in
`canvas-a11y.test.ts`). The v7 editor must achieve the same outcomes:

| Key                           | Action                                                 |
| ----------------------------- | ------------------------------------------------------ |
| `Tab` / `Shift+Tab`           | Cycle selection among stage elements (roving tabindex) |
| `Arrow` keys                  | Nudge selection by 1%                                  |
| `Shift+Arrow`                 | Nudge by 5%                                            |
| `Alt+Arrow`                   | Resize by 1%                                           |
| `Alt+Shift+Arrow`             | Resize by 5%                                           |
| `Delete` / `Backspace`        | Delete selected nodes (with focus restoration)         |
| `Cmd/Ctrl+D`                  | Duplicate selected nodes                               |
| `Cmd/Ctrl+G`                  | Group selection                                        |
| `Cmd/Ctrl+Shift+G`            | Ungroup selection                                      |
| `]` / `[`                     | Bring forward / send backward                          |
| `Cmd/Ctrl+]` / `[`            | Bring to front / send to back                          |
| `Cmd/Ctrl+C` / `V`            | Copy / paste nodes                                     |
| `Escape`                      | Clear selection (or exit inline edit)                  |
| `?`                           | Open keyboard shortcut help dialog                     |
| `Enter` / `Double-click`      | Enter inline edit mode on selected text/shape node     |
| `←` / `→` (filmstrip focused) | Navigate slides                                        |

### Context toolbar

- All buttons have `aria-label` and `title`.
- `Tooltip` on hover/focus.
- `role="toolbar"` on the toolbar container.
- Arrow key navigation within the toolbar (`roving tabindex`).
- `Escape` dismisses any open popover within the toolbar and returns focus to
  the triggering button.

### Inspector

- `role="region"` + `aria-label="Inspector"` on the aside.
- Tab strip is a `role="tablist"` with `role="tab"` items.
- `aria-selected` on the active tab.
- Panel content has `role="tabpanel"` + `aria-labelledby`.
- Numeric inputs (`x`, `y`, `w`, `h`, font size) are `<input type="number">`
  with `aria-label` and `min`/`max` constraints.

### Filmstrip

- `role="listbox"` on the scroll container; each thumbnail is `role="option"`.
- `aria-selected` on the active slide thumbnail.
- `aria-label="Slide N"` on each thumbnail button.
- `← →` arrow keys navigate; `Enter`/`Space` selects.
- Delete key on focused thumbnail → delete that slide (prompt if last).

### Announcements

A visually-hidden `aria-live="polite"` region in the stage shell announces:

- Selection changes: "Text node selected", "2 nodes selected", etc.
- Move results: "Moved 5 nodes left".
- Delete results: "Deleted 1 node, 3 remaining".

---

## Editing Flows

### Flow: Insert a text element and type

1. Click `Insert ▾` in top toolbar → pick `Text`.
2. Default text node inserted at center of slide; selected immediately.
3. Context toolbar appears with text format group.
4. Press `Enter` or double-click → inline edit mode; cursor at end of default
   text.
5. Type new content.
6. Press `Escape` → commits content, returns to selection.

### Flow: Change slide background

1. Click empty canvas to deselect all elements; slide is current object.
2. Context toolbar shows `[ Background ▾ ]` for slide.
3. Click `Background ▾` → `ColorThemePanel` popover opens.
4. Pick solid or gradient → `onDeckChange(updateSlideLocalStyle(...))`.
5. Or: open inspector Slide panel → same Background controls.

### Flow: Apply a vNext theme and see updated styles

1. Click `Theme ▾` in top toolbar → `SelectMenu` of `ThemePackageV1` options.
2. Pick new theme → `onDeckChange(setThemePackage(deck, packageId))`.
3. Canvas re-renders with new theme tokens.
4. Inspector shows `LocalOverrideBadge` on nodes with local overrides.
5. Click "Reset to theme" on the badge → clears `node.localStyle`.

### Flow: Reorder slides

1. In filmstrip, pointer-down on a thumbnail.
2. Drag left/right; drop indicator appears between target cells.
3. Pointer-up → `onDeckChange(moveSlide(deck, slideId, targetIndex))`.
4. Or: click ↑/↓ arrows on the active slide thumbnail overlay.

### Flow: Multi-select and align

1. Click first node; Shift+click second node (or marquee drag).
2. Context toolbar shows multi-select group: `Align ▾ · Distribute ▾ · Group ·
Delete`.
3. Click `Align ▾` → alignment options; pick `Align left`.
4. `onDeckChange(updateNodeLayouts(...))` updates all frames.

### Flow: Edit inline text rich formatting

1. Double-click a text node on stage → inline edit mode.
2. Context toolbar switches to text format strip.
3. Select text in the inline editor (mouse drag or keyboard).
4. Click `Bold` in context toolbar → dispatches `textiq:inline-text-command-v7`
   with `{ command: "bold" }`.
5. `InlineTextEditorVNext` handles the event, applies `document.execCommand("bold")`.
6. On `Escape` → serializes runs → `onDeckChange(updateNodeContent(...))`.

### Flow: Inspect and repair a diagnostic

1. Render diagnostics appear in the inspector `Diagnostics` panel (red badge on
   tab).
2. Click the `Diagnostics` tab.
3. Diagnostic card shows: "Unknown style ref `text.hero`" with action `Replace
style ref`.
4. Click `Replace style ref` → `onDeckChange(updateNodeStyleBinding(...))` sets
   a safe known ref.
5. Diagnostic clears from the panel.

---

## Verification Plan

### Unit tests

| Test                       | File                                                                     | What to check                                                                  |
| -------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Panel routing              | `src/lib/presentation-vnext/inspector-panel-ui.test.ts`                  | `availablePanels(selection)` returns correct tab set for every node type       |
| Inline text commit         | `src/components/presentation-vnext/inline-text-editor.test.tsx`          | Content serialized to `paragraphs[]` correctly; `onCommit` called on Escape    |
| Filmstrip drag             | `src/components/presentation-vnext/filmstrip/use-filmstrip-drag.test.ts` | `moveSlide` called with correct target index                                   |
| Context toolbar visibility | `src/components/presentation-vnext/toolbar/context-toolbar.test.tsx`     | Shown when selection present; hidden when empty; text-only when inline editing |

### Component integration tests (React Testing Library)

| Test                            | What to check                                                          |
| ------------------------------- | ---------------------------------------------------------------------- |
| Top toolbar renders Insert menu | All 6 insert items trigger correct `onDeckChange` calls                |
| Slide background flow           | Background popover → `updateSlideLocalStyle` called with correct patch |
| Inspector tab navigation        | Tab press cycles panels; active panel content matches selection type   |
| Filmstrip navigation            | Arrow keys → `setActiveSlideIndex`; Enter selects slide                |

### Smoke / E2E

Extend `e2e/slides-smoke.spec.ts`:

- Open editor, verify toolbar, filmstrip, inspector are all visible.
- Double-click text node, type text, Escape → verify persisted.
- Insert a shape, change fill color via context toolbar.
- Add a slide via filmstrip `+ Add`, reorder it, verify deck slide count.

### Visual regression

- Screenshot the editor at three breakpoints (1280, 1440, 1920) after each
  major surface lands.
- Baseline: current v7 editor. Target: layout matches the spec diagram above.

---

## Current Implementation Gap Audit

**Audit date:** 2026-06-30  
**Scope:** Current `v7-ui` implementation compared against this document, with
special focus on the middle slide editing surface: stage interaction, inline
editing, context toolbar behavior, canvas keyboard access, and editing flows.

The current implementation has the main v7 editing skeleton in place and several
stage-editing gaps have now been closed: focusable stage nodes, hover/focus
visuals, locked-state visuals, multi-selection bounds, richer inline text
commands, image insert/replace, connector endpoint resolution, targeted table
operations, source metadata actions, and toolbar/inspector accessibility
improvements. The tables below distinguish remaining runtime gaps from coverage
or product/API follow-up; rows whose remaining gap is browser/component coverage
are not blocking runtime implementation.

### Layout And Z-Order Gap Audit

| Capability from legacy       | Current implementation state                                                                                                            | Remaining gap                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Stage owns middle layout     | Implemented: the main editor body is a full middle stage surface rather than a flex row split by inspector                              | Add visual regression coverage at the 1280/1440/1920 breakpoints                          |
| Floating desktop inspector   | Implemented: inspector is an `absolute right-4 top-4 bottom-4 z-panel` overlay, matching the legacy desktop shell contract              | Add visual coverage for inspector-open stage fit                                          |
| Mobile inspector sheet       | Implemented: below `lg`, a `tiq-safe-fab` opens a `z-modal` bottom sheet with focus trap, backdrop, Escape close, and shared inspector  | Add mobile browser coverage                                                               |
| Explicit stage chrome layers | Implemented in `src/lib/presentation-vnext/stage-chrome.ts` with legacy-equivalent selected/preselected/frame/guide/marquee ordering    | Keep new stage chrome additions routed through this module                                |
| Stage chrome containment     | Implemented with an isolated stage stacking context so high numeric canvas chrome cannot draw over the `z-panel` inspector              | Add browser coverage for preselect/selection frames near the inspector edge               |
| Selection/hover chrome       | Implemented as separate canvas overlay frames instead of node-owned outlines, so content z-order remains independent from editor chrome | Add browser coverage for overlapped nodes where selected/hover frames must remain visible |
| Context toolbar stacking     | Implemented with the tooltip layer so it floats above stage frames/guides like legacy `StageFloatingToolbar`                            | Add interaction coverage during inspector transition/reflow                               |
| Inline text editor stacking  | Implemented with the stage chrome inline-editor layer above marquee/guides                                                              | Add inline-edit visual coverage over selected/overlapped nodes                            |
| Fit-based zoom semantics     | Implemented in `src/lib/presentation-vnext/stage-fit.ts`: 100% means fit-to-stage and only >100% zoom should create scroll              | Add browser coverage for 100%, 150%, and inspector-open zoom states                       |

### Stage Interaction Gaps

| Capability from spec          | Current implementation state                                                               | Gap                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Hover pre-select ring         | Implemented with hovered node tracking and separate stage overlay frames                   | Add visual regression coverage                                                                    |
| Single selection visual state | Selected nodes render rings and resize handles; locked nodes render dashed/grey affordance | Tune final token names against the accepted design system                                         |
| Multi-selection bbox          | Implemented as a combined multi-selection bounding box                                     | Add component/integration coverage                                                                |
| Drag state                    | Pointer drag updates frames, shows guides, and suppresses toolbar immediately              | Add final move announcements with richer remaining-context copy                                   |
| Resize state                  | Pointer handles resize selected node frames; active handle is highlighted                  | Add component coverage for active-handle state                                                    |
| Marquee state                 | A marquee rectangle is rendered while dragging on empty canvas                             | Confirm styling against the dashed-rect target and add focused tests for selecting multiple nodes |
| Locked state                  | Locked nodes are skipped by move/resize and show disabled/dashed affordances               | Add keyboard tests for locked-node nudge/resize behavior                                          |
| Hidden state                  | Hidden nodes are excluded from the render tree and remain manageable through layers mode   | Add tests for hide action focus restoration                                                       |
| Stage node focus              | Stage nodes render with role/name/tabIndex and mutation focus restoration                  | Add roving-focus integration tests                                                                |

Relevant files:

- `src/components/presentation-vnext/slide-editor-vnext.tsx`
- `src/components/presentation-vnext/slide-canvas.tsx`
- `src/components/presentation-vnext/slide-node-renderer.tsx`
- `src/components/presentation-vnext/selection-model.ts`

### Inline Text Editing Gaps

| Capability from spec | Current implementation state                                                          | Gap                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Double-click entry   | `onNodeDoubleClick`, `inlineEditNodeId`, and `hiddenNodeIds` are wired                | Entry path exists; add tests covering text and shape text entry                                                |
| Font parity          | Inline editor uses shared `resolveNodeFontCss` mapping for resolved text styles       | Extend helper to consume theme-package font tokens directly if future render styles stop carrying concrete CSS |
| Rich text runs       | Commit serialization stores basic runs; format commands use Range-based DOM ops       | Add full selection-aware run mutation tests and nested-list/link-edit coverage                                 |
| Format commands      | Toolbar dispatches custom DOM events handled by local Range/Selection operations      | Extract command helpers into a tested pure-ish DOM command module if complexity grows                          |
| Lists and links      | Basic list commands, list indent/outdent, link apply/removal, and serialization exist | Add full DOM command tests                                                                                     |
| Escape behavior      | Empty text cancels; non-empty text commits                                            | Reconfirm desired Escape semantics and align implementation with the final interaction contract                |
| Auto-height          | `layout.autoHeight` exists and commit can update height                               | Add visual tests for growth, clamping, and shape text behavior                                                 |
| Tab navigation       | Inline Tab/Shift+Tab moves between inline-editable nodes                              | Add reading-order tests and focus/caret restoration expectations                                               |

Relevant files:

- `src/components/presentation-vnext/inline-text-editor.tsx`
- `src/lib/presentation-vnext/inline-text-commands.ts`
- `src/lib/presentation-vnext/rich-text.ts`
- `src/components/presentation-vnext/slide-editor-vnext.tsx`

### Context Toolbar Gaps

| Capability from spec     | Current implementation state                                                                                                           | Gap                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Positioning engine       | Toolbar positions from selected node rects and tracks with RAF while visible                                                           | Add visual/browser coverage during inspector transitions                                               |
| Design-system primitives | Tooltip, Popover, and ColorPicker are used; some local button/select wrappers remain                                                   | Replace remaining local wrappers with `ToolbarButton`/`ToolbarMenuItem` when extracting toolbar groups |
| Text group               | Bold/italic/underline/strike/list indent/align/color/font/link apply/remove controls exist                                             | Add DOM command tests                                                                                  |
| Image group              | Replace uses a file picker and writes `DeckV7.assets.images`; crop writes/renders values and selected images expose stage crop handles | Add browser coverage for drag-crop behavior                                                            |
| Visual group             | Transparent background, style theme picker, and optional visual replacement port exist                                                 | Add product visual picker implementation at the host layer and final per-channel rendering/export use  |
| Connector group          | Straight/curved/step, arrowheads, color, width exist and render from endpoints                                                         | Polish routing/arrow menus into final segmented/menu primitives                                        |
| Table group              | Add/delete row/column, header toggle, table style, and targeted row/column operations exist                                            | Add table-cell selection context if dedicated table-cell editing lands                                 |
| Overflow menu            | `More` overflow includes lock/hide actions                                                                                             | Expand with duplicate/delete/more arrange actions if toolbar density requires it                       |
| Keyboard access          | Arrow/Home/End/Escape toolbar key handling exists                                                                                      | Add focus-restoration tests                                                                            |

Relevant files:

- `src/components/presentation-vnext/toolbar/context-toolbar.tsx`
- `src/components/presentation-vnext/slide-editor-vnext.tsx`

### Canvas Keyboard And Accessibility Gaps

| Capability from spec     | Current implementation state                                                             | Gap                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Roving tabindex          | Stage nodes render with role/name/tabIndex and editor Tab moves focus/selection          | Add integration tests for focus cycling                                    |
| Arrow nudge              | Arrow and Shift+Arrow move selected nodes                                                | Add focused tests and ensure locked/hidden behavior is consistent          |
| Alt+Arrow resize         | Alt+Arrow and Alt+Shift+Arrow resize selected nodes                                      | Add tests and ensure aspect-lock/min-size behavior matches legacy contract |
| Delete/focus restoration | Delete restores focus to the next sensible stage node or canvas anchor                   | Add integration tests                                                      |
| Announcements            | A live region announces selection, move, resize, and delete with remaining counts        | Tune final copy and add tests                                              |
| Toolbar a11y             | Buttons have labels/title/tooltips; toolbar has role and roving key handling             | Add focus-restoration tests                                                |
| Inspector tabs           | Tab ids and `aria-controls`/`aria-labelledby` are wired through `Tabs` and panel content | Add accessibility tests                                                    |
| Diagnostics tab badge    | Diagnostics tabs render a count badge when diagnostics are active                        | Add browser coverage for long tab strips with badges                       |

Relevant files:

- `src/components/presentation-vnext/slide-editor-vnext.tsx`
- `src/components/presentation-vnext/slide-node-renderer.tsx`
- `src/components/ui/tabs.tsx`
- `src/components/presentation-vnext/inspector/inspector-shell.tsx`

### Inspector Editing Gaps

| Capability from spec                      | Current implementation state                                                                                                  | Gap                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Text/Shape/Image/Visual/Line/Table panels | Generic content/local-style panels cover many fields                                                                          | Split or deepen panel implementations so each panel matches the per-node UX in this spec      |
| Image panel                               | Asset preview, replace picker, asset id, fit, alt, crop, adjustments, and stage crop handles exist                            | Add drag-crop and reset behavior tests                                                        |
| Visual panel                              | Visual id, asset id, alt, transparent background, style theme, channel color overrides, and style binding exist               | Add product visual picker implementation at the host layer and document visual insertion flow |
| Line panel                                | Routing, endpoint coordinates, node-anchor endpoint binding, and connector style controls exist                               | Polish dash/arrow menus                                                                       |
| Table panel                               | Column/row labels, cell text, targeted insert/delete, style menu, alternating row controls, header/caption exist              | Add table-cell selection context if needed                                                    |
| Arrange panel                             | Geometry, rotation, flip, aspect lock, z-index, lock/hidden, align, distribute, match-size, group, and z-order controls exist | Add focus/keyboard tests                                                                      |
| Source panel                              | Metadata fields, link status, mark updated, unlink, and relink exist                                                          | True update-from-document and stale/orphan detection require document-block fetch/hash APIs   |
| Effects panel                             | Opacity, shadow, blur/glow/glass, and blend mode controls exist                                                               | Ensure export/render parity for every supported effect                                        |

Relevant files:

- `src/components/presentation-vnext/inspector/inspector-shell.tsx`
- `src/components/presentation-vnext/inspector/node-content-panel.tsx`
- `src/components/presentation-vnext/inspector/local-style-panel.tsx`
- `src/components/presentation-vnext/inspector/node-geometry-panel.tsx`
- `src/components/presentation-vnext/inspector/node-source-panel.tsx`

### Bottom Filmstrip And Status Dock Gap Audit

| Capability from spec / legacy | Current implementation state                                                                                                               | Remaining gap                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Collapsible rail transition   | Implemented as an animated transparent `max-height`/opacity/translate rail shell with persisted collapsed state                            | Add browser coverage for transition/focus behavior                            |
| Bottom dock controls          | Implemented inside a transparent footer status row as slide toggle, inspector-routed Notes, slide count label, zoom slider, zoom menu, Fit | Add visual coverage against the single-row footer layout                      |
| Zoom range/presets            | Implemented with 25-200% range, 5% step, descending presets, and Fit action                                                                | Confirm product meaning of Fit if future stage auto-fit differs from 100%     |
| Thumbnail action overlay      | Implemented inside each thumbnail on hover/focus with duplicate/delete actions; reorder is drag/keyboard only                              | Add component/browser coverage for non-active hover actions                   |
| Thumbnail sizing              | Implemented with cells sized to the ratio-fitted thumbnail frame, so active ring, badges, drag preview, and spacing match the canvas size  | Add visual coverage for dense decks, ratio changes, and horizontal overflow   |
| Drag visual feedback          | Implemented with drag threshold, source dim/scale, drop indicator, floating drag preview, click-select fallback, and edge auto-scroll      | Add pointer-drag tests once a DOM-capable component test harness exists       |
| Filmstrip keyboard            | Implemented with Arrow/Home/End navigation, Enter/Space select, Delete/Backspace focused-slide delete, and Alt+Arrow reordering            | Add keyboard integration tests for focus restoration after delete/reorder     |
| Add slide affordance          | Implemented with icon-only compact mode and `Add` text on wider screens                                                                    | Add responsive visual coverage                                                |
| Delete last slide             | Implemented with disabled delete buttons and a polite live-region keyboard guard for the final slide                                       | Add visible toast/status feedback if the final product shell standardizes one |

Relevant files:

- `src/components/presentation-vnext/filmstrip/filmstrip.tsx`
- `src/components/presentation-vnext/filmstrip/filmstrip-slide.tsx`
- `src/components/presentation-vnext/filmstrip/use-filmstrip-drag.ts`
- `src/components/presentation-vnext/slide-editor-vnext.tsx`

### Verification Gaps

The verification plan in this document is still mostly ahead of the current
test coverage. The following tests should be added before treating the stage
editing migration as complete:

| Missing test                                                             | Purpose                                                                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `src/components/presentation-vnext/inline-text-editor.test.tsx`          | Commit, cancel, rich runs, lists, links, auto-height, Tab/Shift+Tab traversal                           |
| `src/components/presentation-vnext/toolbar/context-toolbar.test.tsx`     | Visibility states, inline-edit text-only mode, node-type tool groups, keyboard navigation               |
| `src/components/presentation-vnext/filmstrip/use-filmstrip-drag.test.ts` | Target index calculation and `moveSlide` calls                                                          |
| Stage keyboard tests                                                     | Roving focus, nudge, resize, delete focus restoration, announcements                                    |
| Inspector integration tests                                              | Tab routing, multi-select arrange, image adjust, slide background, source actions                       |
| `e2e/slides-smoke.spec.ts` extension                                     | Open editor, double-click text edit, change formatting, insert shape/image/table, filmstrip add/reorder |
| Visual regression screenshots                                            | 1280, 1440, and 1920 px editor layout with toolbar, inspector, and filmstrip visible                    |

### Remaining Blocked Runtime Items

The following target behaviors still need lower-level product/API support before
they can be implemented honestly in the v7 editor UI:

| Behavior                                | Current blocker                                                                                                                                                                                                                                                             |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persistent image upload/storage handoff | The editor exposes an optional `onUploadImage(file)` port and falls back to data URLs when absent. The document editor host wires this port to the protected `uploadSlideAsset` server action; other host surfaces should pass an equivalent durable upload implementation. |
| Visual replacement picker               | The editor exposes an optional `onPickVisual()` port and toolbar action. The document editor host provides a lightweight picker backed by current document visual blocks; richer AI generation/asset browsing can reuse the same port.                                      |
| Per-channel visual color rendering      | `VisualStyle.channelColors` and inspector controls exist. Visual renderers/exporters still need to interpret those channels for specific visual asset types.                                                                                                                |
| True source refresh/staleness repair    | The editor exposes an optional `onRefreshSource(...)` port. The document editor host refreshes from its initial document blocks by `blockId`; live editor-state refresh, cross-document fetch, and stale/orphan detection still need host-level data plumbing.              |

---

## Resolved Implementation Blockers

The early implementation blockers below are now resolved in the current v7
editor runtime. They remain documented here only as migration history.

| Former blocker                                  | Resolution                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| `SlideCanvasVNext` lacked `hiddenNodeIds`       | Implemented and propagated to node rendering so inline edit can hide the canvas node |
| Stage lacked `data-slide-toolbar-anchor="true"` | Implemented on the vNext stage shell for context toolbar positioning                 |
| `SlideCanvasVNext` lacked `onNodeDoubleClick`   | Implemented and wired to inline text editing                                         |
| `LayoutBox` lacked auto-height support          | `layout.autoHeight` is available and inline edit can commit height changes           |
| Filmstrip drag required pixel bounds            | Filmstrip cells expose `data-slide-index` and drag reads cell rects                  |
| Inline editor font resolution needed v7 helper  | `resolveNodeFontCss` is implemented and used by the inline editor                    |

---

## Related Documents

- [slide-editor.md](../presentation/slide-editor.md) — legacy editor runtime
  reference
- [v7-slide-editor-implementation-plan.md](../presentation/v7-slide-editor-implementation-plan.md) — workstream plan
- [semantic-slide-design-system.md](../presentation/semantic-slide-design-system.md) — vNext data model
- [slide-stage-interactions.md](../presentation/slide-stage-interactions.md) — stage hit-testing rules
- [rendering-and-export.md](../presentation/rendering-and-export.md) — render tree and export
