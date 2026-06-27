# Slide Editor Panel Taxonomy

**Status:** Implemented  
**Last updated:** 2026-06-27

This document records the accepted design for decoupling the slide editor's
right-side editing surface into one explicit panel per major property category.
The design is now implemented; the runtime contract is summarised in
[slide-editor.md](slide-editor.md), and the availability logic lives in
`src/lib/presentation/slide-panel-ui.ts`.

## Summary

The right-side slide editor panel should stop behaving like one long contextual
property scroll. It should instead render exactly one active task panel at a
time. Each task panel owns one broad class of properties, and both the floating
toolbar `...` menu and the in-panel switcher use the same dynamic list of panels
available for the current selection.

The accepted panel set is:

```text
Slide / Arrange / Text / Appearance / Effects / Source / Notes / Layers
```

`Appearance` replaces the older `Media` concept. `Layers` joins the same panel
routing model instead of remaining a separate `Properties | Layers` mode.

## Background

The current editor already has the start of a right-panel taxonomy in
`RightPanelTab`, with values such as `position`, `text`, `effects`, `media`,
`slide`, `notes`, and `source`. The floating toolbar `...` menu can also open
some of those routes.

However, the inspector still behaves mostly as a single properties surface:
multiple sections such as typography, object-specific controls, position, and
effects can appear together in one scroll area, while layers are reached through
a separate mode switch. In practice, opening a route means "scroll to this
section" more than "show this task panel."

This design makes the panel router the source of truth:

- one explicit active panel;
- one dynamic availability list;
- no generic fallback panel;
- no duplicated property ownership across panels.

## Goals

- Make each right-side panel contain one major property category.
- Make toolbar `...` entries mirror the right-side panel categories.
- Remove the separate `Properties | Layers` mode and treat `Layers` as a normal
  panel.
- Rename `Media` to `Appearance`, because shape, connector, image, and visual
  styling are all presentation/appearance concerns, not all media concerns.
- Keep unavailable panel choices out of menus rather than showing disabled
  entries.
- Close the right panel when the current active panel no longer applies to the
  selection.
- Avoid fallback routing that guesses a replacement panel for the user.

## Non-Goals

- No deck schema change.
- No runtime compatibility layer for the old `media` panel id.
- No right-side rich text content editor.
- No mixed-type multi-select batch editing for text, appearance, or source.
- No split of slide-level layout and background into separate top-level panels.
- No redesign of the canvas editing model, inline text editing, autosave, or
  export pipeline.

## Terminology

| Term             | Meaning                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Panel            | A top-level right-side task surface, for example `Text` or `Arrange`. Only one panel is rendered at a time.                          |
| Section          | A lightweight grouping inside a panel, for example `Layout` and `Background` inside `Slide`. Sections do not participate in routing. |
| Available panels | The dynamic set of panels valid for the current object or selection.                                                                 |
| Active panel     | The currently rendered right-side panel. It must be one of the available panels.                                                     |
| Invalid panel    | An active panel that no longer applies after the selection changes. The panel closes instead of falling back.                        |

## Panel Taxonomy

| Panel        | Owns                                                                                                                    | Available when                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `Slide`      | Slide layout, per-slide background, accent, gradient, and background image.                                             | No element selection; current object is the slide.      |
| `Arrange`    | Position, size, rotation, align, distribute, match size, group/ungroup, and z-order.                                    | Single element or multi-selection.                      |
| `Text`       | Text style only: role, font, color, size, line height, paragraph spacing, list style, text fit, and vertical alignment. | Text elements and non-line shapes with labels.          |
| `Appearance` | Shape, image, visual, connector, and line presentation controls.                                                        | Shapes, line shapes, images, visuals, and connectors.   |
| `Effects`    | Visual effects only: opacity and shadow.                                                                                | Single element or multi-selection.                      |
| `Source`     | Existing document source-link status and actions.                                                                       | Single element with an existing `source`.               |
| `Notes`      | Speaker notes.                                                                                                          | No element selection; current object is the slide.      |
| `Layers`     | Layer list, selection, visibility, lock, rename, reordering, and z-order management.                                    | Any slide context where layer management is meaningful. |

## Detailed Panel Ownership

### Slide

The `Slide` panel is the slide-level design surface. It remains one top-level
panel for now, with internal sections for `Layout` and `Background`.

It owns:

- slide template selection;
- apply/reset layout actions;
- per-slide background color;
- per-slide accent color;
- optional gradient background;
- optional background image upload or URL;
- any validation errors specific to background image input.

Layout and background are not split into separate panels yet. Their combined
control count is still small enough for one slide-level task surface.

### Arrange

The `Arrange` panel owns geometry and object arrangement. For a single element,
it owns:

- X/Y position;
- width/height where applicable;
- rotation;
- center horizontally/vertically;
- z-order controls such as bring forward/send backward if exposed in the panel.

For multi-selection, it owns:

- selection union position and size;
- align;
- distribute;
- match size;
- group/ungroup;
- selection z-order operations.

`Arrange` is also the natural home for editing-state controls that affect object
manipulation rather than visual style. Lock may be surfaced here if a compact
selection-level lock control is needed, but the primary lock management remains
in `Layers`.

### Text

The `Text` panel is style-only. It must not contain a `RichTextBox` or any other
right-side content editor. Text content is edited directly on the canvas.

It owns:

- semantic text role;
- inherited vs local text color;
- inherited vs local font;
- font size;
- line height;
- paragraph spacing;
- text fit mode;
- vertical alignment;
- list indentation and list type where list paragraphs exist;
- bullet gap where relevant.

For labeled shapes, text styling also belongs here. `Appearance` does not own
shape-label typography.

### Appearance

`Appearance` replaces the old `Media` panel id and label. The name must reflect
that this panel covers shape, line, connector, image, and visual presentation,
not only media assets.

For images, it owns:

- upload/replace image;
- image URL/data URL;
- alt text;
- fit mode;
- mask;
- crop;
- corner radius.

For shapes, it owns:

- shape kind;
- fill color;
- border/stroke color;
- border/stroke width;
- line thickness for line shapes;
- corner radius where applicable.

For visuals, it owns:

- visual preview/details that are currently editable;
- visual restyling/theme controls;
- visual-specific alt or descriptive fields if present.

For connectors, it owns:

- routing/dash style;
- stroke color and width;
- arrowhead style;
- endpoint detach controls.

It does not own text typography for text elements or labeled shapes.

### Effects

`Effects` owns visual effects only. The accepted initial scope is:

- opacity;
- shadow.

Lock is removed from `Effects` because lock is not a visual effect. Future
visual effects such as blur, glow, filters, or blend-like presentation controls
would belong here.

For multi-selection, `Effects` may support batch shadow and opacity when the
implementation can expose a clear mixed-state UI. It must still exclude lock.

### Source

`Source` appears only for a single element that already has a `source`.

It owns:

- linked/unlinked/stale/source-missing/up-to-date status;
- source block kind;
- source block id;
- linked timestamp;
- update from source;
- unlink;
- relink.

The panel should not appear for standalone elements. The standalone explanation
can remain as defensive component behavior, but menus should not route users to
`Source` unless there is an existing source link to manage. Creating source
links remains a `From document` insertion workflow, not a right-panel workflow.

### Notes

`Notes` owns speaker notes for the current slide. It is slide-level content but
stays separate from `Slide` because it is a different authoring task than slide
layout/background design.

### Layers

`Layers` becomes a normal panel in the same router as all other panels. The
separate `Properties | Layers` mode switch should be removed from the product
model.

It owns:

- layer list;
- element selection from the list;
- visibility toggles;
- lock toggles;
- layer rename;
- layer reorder;
- z-order management.

Element `name` remains meaningful as layer-management metadata, but it should
not be exposed as a permanent property in the general right-panel header.

## Object Identity Header

The right panel may keep a compact header that identifies the current object,
for example:

- `Slide`;
- `Image`;
- `Shape - rect`;
- `Connector`;
- `3 selected`;
- `Group`.

The header should not include a persistent `Name` input. Element naming is an
internal editor/layer-management concern and belongs in `Layers`, where the
field has clear purpose. The header can still include panel close controls and
slide-level duplicate/delete actions where appropriate.

## Dynamic Panel Availability

The toolbar `...` menu and the right-panel switcher must be generated from the
same available-panel calculation.

### Empty Selection

When no element is selected, the current object is the slide. The available
panels are:

```text
Slide / Notes / Layers
```

Do not show element-level panels:

```text
Arrange / Text / Appearance / Effects / Source
```

### Single Text Element

Available panels:

```text
Text / Arrange / Effects / Layers
```

`Appearance` is not shown for text elements unless a future text-box fill/border
feature creates true text appearance properties. The right-side `Text` panel
does not include content editing.

### Single Non-Line Shape With Label Support

Available panels:

```text
Text / Appearance / Arrange / Effects / Layers
```

`Text` controls the label typography. `Appearance` controls the shape body.

### Single Line Shape

Available panels:

```text
Appearance / Arrange / Effects / Layers
```

Line shapes do not expose `Text`.

### Single Image

Available panels:

```text
Appearance / Arrange / Effects / Layers
```

If the image has a `source`, add `Source`.

### Single Visual

Available panels:

```text
Appearance / Arrange / Effects / Layers
```

If the visual has a `source`, add `Source`.

### Single Connector

Available panels:

```text
Appearance / Arrange / Effects / Layers
```

If the connector has a `source`, add `Source`.

### Multi-Selection

Available panels:

```text
Arrange / Effects / Layers
```

Do not show `Text`, `Appearance`, or `Source` for multi-selection. Mixed
selection editing is easy to make ambiguous, so the initial design stays
conservative. Same-kind multi-select editing can be added later if there is a
clear mixed-state UI.

## Toolbar `...` Menu

The floating toolbar `...` menu should list only panels available for the
current context. It should not display disabled unavailable entries.

The generic `Open properties panel` entry should be removed. Users open a
specific task panel directly, for example:

```text
Text settings
Appearance settings
Arrange settings
Effects settings
Source settings
Slide settings
Notes
Layers
```

If the current context has no available panel choices, the `...` button should
not render. In normal editor contexts, most selections will have at least one
panel, but the rule remains important: no available action means no overflow
button.

## Right-Panel Switcher

When the right panel is open, it may include a compact switcher near the active
panel title so users can move between available task panels without returning to
the canvas toolbar.

The switcher follows the same rules as the toolbar menu:

- it lists only available panels;
- it does not show disabled unavailable entries;
- it does not render when there is zero or one available panel;
- it uses the same panel labels and ordering as the toolbar menu.

A compact menu button such as `Arrange` with a disclosure indicator is preferred
over a wide tab strip, because eight possible panel categories can overflow a
small right-side surface.

## Routing Rules

There is no fallback panel.

Opening the right panel is always explicit: the user chooses a concrete panel
from the toolbar `...` menu or from the in-panel switcher. The system should not
guess a different panel when the requested panel is unavailable.

When the selection changes while the right panel is open:

1. Recompute the available panels for the new context.
2. If the current active panel is still available, keep it open.
3. If the current active panel is no longer available, close the right panel.

Do not automatically switch to the first available panel. That would recreate a
fallback behavior under a different name.

## Panel Ids And Naming

The target `RightPanelTab` set is:

```ts
type RightPanelTab =
  | "slide"
  | "arrange"
  | "text"
  | "appearance"
  | "effects"
  | "source"
  | "notes"
  | "layers";
```

The old `position` id should become `arrange`. The old `media` id should become
`appearance`. The old separate `InspectorMode` product concept should be
removed once `layers` is part of the normal panel route.

No runtime compatibility layer is required for the old ids. These are internal
UI routes, not external payload contracts, and the project avoids carrying
superseded payload or state shapes forward.

## Implementation Notes

The implementation should prefer a pure availability helper that can be unit
tested independently of React rendering. The same helper should power:

- toolbar `...` menu entries;
- right-panel switcher entries;
- current-panel invalidation on selection changes;
- tests for element kind, source-link, empty selection, and multi-selection
  cases.

Suggested helper responsibilities:

- map a selected element kind and shape subtype to available panels;
- include `Source` only when a single selected element has `source`;
- include `Layers` according to the current slide context;
- exclude `Text`, `Appearance`, and `Source` for multi-selection;
- provide stable display labels and icons for menu rendering;
- expose an `isPanelAvailable(panel, context)` predicate for invalidation.

The first implementation should avoid large behavior changes outside the right
panel and toolbar menu. Canvas editing, direct manipulation, inline text editing,
source-link mutation, and autosave should continue to use the existing command
paths.

## Open Follow-Ups

- Whether multi-selection `Effects` should ship with opacity mixed-state UI in
  the first implementation or start with shadow only.
- Whether `Arrange` should expose lock as a secondary object manipulation
  control, or leave lock exclusively in `Layers`.
- Whether future text-box fill/border properties should make `Appearance`
  available for text elements.
- Whether same-kind multi-select editing should later enable `Text` or
  `Appearance` for homogeneous selections.

## Decision Log

1. Use property-domain panels rather than one scrollable all-properties panel.
2. Render one active right-side panel at a time.
3. Treat `Layers` as a normal panel, not a separate mode.
4. Move lock out of `Effects`; primary lock management belongs in `Layers`.
5. Do not put a `RichTextBox` or content editor in the right-side `Text` panel.
6. Keep `Text` style-only.
7. Do not put shape-label typography in `Appearance`; it belongs in `Text`.
8. Multi-selection exposes only `Arrange`, `Effects`, and `Layers`.
9. Empty selection exposes only `Slide`, `Notes`, and `Layers`.
10. Keep a compact in-panel switcher for moving between available panels.
11. Do not expose element `Name` in the permanent header; manage names in
    `Layers`.
12. Keep slide layout and background in one `Slide` panel for now.
13. Show `Source` only for elements with an existing `source`.
14. Menus should dynamically show available panels, not disabled unavailable
    panels.
15. Rename `media` to `appearance` directly, with no compatibility route.
16. Do not use fallback panel routing; close the right panel when its active
    panel becomes invalid.
17. Hide the in-panel switcher when it would contain zero or one choice.
18. Proceed to implementation from this accepted design when scheduled.
