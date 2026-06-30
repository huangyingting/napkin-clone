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
│  Stage (flex-1)                              │  Right Inspector      │
│                                              │  (320px, resizable)   │
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
│  Bottom Filmstrip (104px)                                            │
│  [ 1 ] [ 2 ] [ 3* ] [ 4 ] …  +Add   Dup   Del  |  Zoom  Notes       │
└──────────────────────────────────────────────────────────────────────┘
```

The current v7 editor has the slide rail on the **left** (156 px vertical
column). This migration moves it to a **bottom horizontal filmstrip** to match
the legacy editor's structural intent (the legacy `SlideRail` in
`shell-components.tsx` is a collapsible horizontal strip with `max-h-32`). The
left column space becomes fully available to the stage.

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
│  height: 104px  |  overflow-x: auto  |  bg: ds-surface-sunken              │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Height:** 104 px (8 px padding top + bottom; 88 px for thumbnail + label).
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

## Implementation Blockers

The following issues must be resolved during implementation. They are not
blocking the documentation, but they block specific implementation slices.

### 1. `SlideCanvasVNext` has no `hiddenNodeIds` prop

The inline text editor needs to hide the rendered node while the overlay editor
is active (to avoid double rendering). `SlideCanvasVNext` accepts no
`hiddenNodeIds`/`hiddenElementIds` prop today. **Action:** add
`hiddenNodeIds?: Set<string>` to `SlideCanvasVNextProps` and propagate to
`slide-node-renderer.tsx`.

### 2. `SlideCanvasVNext` container lacks `data-slide-toolbar-anchor="true"`

The context toolbar positioning engine queries for
`data-slide-toolbar-anchor="true"` to find the scroll container bounds. The v7
stage `div` needs this attribute. **Action:** add
`data-slide-toolbar-anchor="true"` to the stage canvas wrapper in the editor
shell.

### 3. No `onNodeDoubleClick` callback on `SlideCanvasVNext`

The inline editor is triggered by double-click on a node. `SlideCanvasVNext`
currently fires `onNodeClick` but not `onNodeDoubleClick`. **Action:** add
`onNodeDoubleClick?: (nodeId: string, event: MouseEvent) => void` to the canvas
props.

### 4. `SlideChildNode` has no `autoHeight` / `minHeight` layout field

The inline text editor needs to grow the text box when text overflows. The v7
`LayoutBox` schema currently has `frame: { x, y, w, h }` + `zIndex`. **Action:**
discuss with Trinity whether to add `autoHeight?: boolean` to `LayoutBox` or
handle text overflow via a different strategy. See data-model/deck.md.

### 5. Bottom filmstrip drag-to-reorder needs pixel-accurate bounds

`moveSlide` requires a target index. Computing the correct index from pointer
position requires reading the DOM bounding rects of filmstrip cells at drag
time. The filmstrip must be in a stable scroll container with known cell widths.
**Action:** filmstrip cells must have a `data-slide-index` attribute; the drag
hook reads these via `querySelectorAll`.

### 6. `ThemePackageV1` inline text font resolution

`InlineTextEditorVNext` needs to render text in the same font as the v7 canvas.
The v7 canvas uses CSS custom properties from `ThemePackageV1.tokens`. The inline
editor must read these from the resolved node's `style` in the render tree, or
from the theme package tokens, to avoid font-swap jank. **Action:** expose a
`resolveNodeFontCss(node, themePackage)` helper (port of
`src/lib/presentation/slide-fonts.ts` → `resolveElementFontCss`) for v7.

---

## Related Documents

- [slide-editor.md](../presentation/slide-editor.md) — legacy editor runtime
  reference
- [v7-slide-editor-implementation-plan.md](../presentation/v7-slide-editor-implementation-plan.md) — workstream plan
- [semantic-slide-design-system.md](../presentation/semantic-slide-design-system.md) — vNext data model
- [slide-stage-interactions.md](../presentation/slide-stage-interactions.md) — stage hit-testing rules
- [rendering-and-export.md](../presentation/rendering-and-export.md) — render tree and export
