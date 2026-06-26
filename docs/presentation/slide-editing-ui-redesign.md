# Slide Editing UI Redesign

**Status:** Design Proposal (accepted, not yet implemented)
**Last updated:** 2026-06-26

This document records the accepted design for reworking the slide editing UI.
It defines the addressable object model, the division of labor between the
editing surfaces (top toolbar, popover toolbar, right panel, bottom dock), and
the data-model simplifications that fall out of that model. When implemented,
fold the resulting runtime contracts back into
[slide-editor.md](slide-editor.md), [slide-stage-interactions.md](slide-stage-interactions.md),
and [../data-model/deck.md](../data-model/deck.md), and retire this proposal.

---

## 1. Goals

- Give every editing surface a single, predictable responsibility.
- Eliminate control duplication between the floating toolbar and the right
  panel.
- Treat the slide itself as a first-class editable object, not a special case.
- Collapse redundant element kinds and data-model concepts that exist only for
  historical reasons.

Non-goals: changing the persisted theme/token cascade, the export pipeline, or
the present/public viewers beyond what the element-kind changes require.

---

## 2. Addressable object model

There is always exactly one **current object**. The model is a strict three-level
hierarchy:

| Level       | What it is                          | Where it is edited                         |
| ----------- | ----------------------------------- | ------------------------------------------ |
| **Deck**    | The whole presentation              | Top toolbar only (never part of selection) |
| **Slide**   | A single slide                      | Current object when the selection is empty |
| **Element** | One element, a group, or a multiset | Current object when something is selected  |

Resolution rule:

```
current object = selected element(s) ?? current slide
```

Consequences:

- The popover toolbar and the right panel **always** have a target. When nothing
  is selected they serve the Slide (background, layout, notes); they never show
  an empty state.
- The Deck is permanently anchored in the top toolbar and does not participate
  in selection.

---

## 3. Surface map

| Surface             | Owns                                   | Notes                                                  |
| ------------------- | -------------------------------------- | ------------------------------------------------------ |
| **Top toolbar**     | Deck-level + app-level controls        | Repurposed from today's mixed toolbar                  |
| **Canvas + popover**| The current object's frequent actions  | Popover floats near the current object                 |
| **Right panel**     | The current object's precise properties| Floating overlay; user-toggled                         |
| **Bottom dock**     | Status (zoom, notes, save)             | Unchanged                                              |
| **Slide rail**      | Slide navigation/reorder               | Unchanged; remains a horizontal strip near the bottom  |

### 3.1 Division of labor: popover vs panel

Controls are split by **frequency × precision**, not by feature category:

| | **Popover toolbar** | **Right panel** |
| --- | --- | --- |
| Role | High-frequency, click-to-apply, visual "verbs" | Complete, precise, lower-frequency "property table" |
| Input | Toggle, color swatch, `+`/`−` stepper | Numeric field, slider, dropdown, text area |
| Appears | Anchored to the current object | Manually toggled; remembers last state |

The same **property** may appear in both surfaces at different precision (e.g.
font-size `+`/`−` in the popover, an exact numeric field in the panel). The same
**control** never appears in both places.

---

## 4. Top toolbar (Deck)

Keep only genuinely deck-scoped or app-scoped controls:

- Deck-scoped: overall theme/color scheme, default fonts, slide size/aspect
  ratio, present, export, share.
- App-scoped: undo/redo, save-status indicator, deck title + slide count.

Migrated **off** the top toolbar:

- **Background and layout** move to the Slide object (popover quick actions +
  panel `Background` / `Layout` sections).
- **Insert / add element** becomes a Slide verb (see §5.2).

### 4.1 Theme vs background

"Deck theme" (global colors/fonts, affects all slides) and "per-slide
background" (overrides one slide) are distinct concepts:

- Deck theme stays in the top toolbar.
- Per-slide background lives on the Slide object.

---

## 5. Popover toolbar

### 5.1 Skeleton

A fixed three-segment layout plus a bridge to the panel:

```
[ contextual verbs ] | [ arrange cluster ] | [ object actions ] · [⤢ Panel]
```

1. **Contextual verbs** (vary by element kind).
2. **Arrange cluster** (universal): bring-to-front / send-to-back, align +
   distribute when multi-selected, group / ungroup, lock.
3. **Object actions** (universal): duplicate, delete, overflow `⋯`
   (copy / cut / paste, rename, hide).
4. **`⤢ Panel` bridge**: opens the right panel and scrolls/expands to the
   section most relevant to the current object (e.g. selecting an image opens
   the `Image` section). This is the frequency-layer → precision-layer link.

### 5.2 Anchoring

```
popover anchor = union bbox of selected elements ?? slide top edge
```

- For elements, the popover floats above the selection bounding box; when there
  is not enough room above (near the top edge, or for the slide popover), it
  flips below.
- For the **Slide** (empty selection) the popover anchors to the **top edge of
  the canvas** (overlapping the canvas, not in the outer margin). It carries the
  Slide's high-frequency verbs: change layout, quick background swap, add element
  (Text / Image / Shape / Visual), duplicate slide, delete slide.
- **Add element** has two entry points: the Slide popover (primary) and a small
  persistent `+` on the canvas (so elements can be added without first
  deselecting).

### 5.3 Contextual verbs per kind

| Kind          | Verbs                                                          |
| ------------- | ------------------------------------------------------------- |
| **Text**      | Bold, italic, underline, align, color, font-size `+`/`−`; list toggle (bullet/number), indent/outdent for list paragraphs |
| **Shape**     | Fill color, (stroke color)                                    |
| **Connector** | Straight/elbow routing, dashed/solid, arrowheads              |
| **Image**     | Replace image, crop (opens the panel crop section)            |
| **Visual**    | Replace/restyle (opens the panel visual section)              |

### 5.4 Text: selected vs editing states

Text has two states that share one popover but differ in scope:

| | **Selected (not editing)** | **Editing (caret active)** |
| --- | --- | --- |
| Format verb scope | Whole element (all paragraphs/runs) | Current character range |
| Object actions (delete / z-order / group) | Shown | **Hidden** (avoid deleting the whole element mid-edit) |
| List controls | — | Indent/outdent, bullet/number toggle, level |
| Anchor | Above bbox | Still anchored to bbox (does not chase the caret) |

Entering edit: double-click or Enter. Exiting: Esc. The `⤢ Panel` bridge is
present in both states.

### 5.5 Multi-select and groups

- **Multi-select (heterogeneous):** identity header reads "n selected". The
  popover shows only the **intersection** of applicable contextual verbs (format
  verbs only when all are text); the arrange cluster becomes primary
  (align/distribute/match-size); object actions include group, duplicate,
  delete. The panel shows position/size of the union bbox plus any shared
  sections.
- **Group:** a group is a single addressable object keyed by `groupId`. Single
  click selects the whole group; the popover offers object actions, the arrange
  cluster, and ungroup. The panel shows the group's position/size and effects.

### 5.6 Selection grammar (uniform)

```
single click  = select the outermost object (group or top-level element)
double click  = drill down one level (enter group → child; enter text → edit)
Esc           = ascend one level
```

This single rule covers both groups and text editing.

---

## 6. Right panel

### 6.1 Presentation and visibility

- **Floating overlay** (unchanged): the panel does not resize the stage, so the
  canvas never reflows when it opens. It may cover a thin strip of the canvas;
  this is accepted.
- **Does not auto-open** on selection. Selecting an element only updates the
  panel's *content*, never its *visibility*.
- **Open/close is user-controlled** via (a) the popover `⤢ Panel` button and
  (b) a persistent toggle. Open/closed state and the active mode are remembered
  across slides and sessions.
- **Responsive:** open by default on wide screens; on narrow screens it opens as
  a bottom sheet.

### 6.2 Two modes

The panel header has a minimal `Properties | Layers` switch (mutually exclusive,
sharing the same space — no new screen region):

- **Properties** (default): the contextual property table for the current
  object.
- **Layers:** the layer list for the current slide (select / reorder / lock /
  show-hide / rename / search).

Memory model: remember **open/closed** and **Properties/Layers** as two
independent states, persisted across slides and sessions.

### 6.3 Properties information architecture

No fixed tabs. The Properties mode is a single contextual scroll composed of
collapsible **sections** whose set is derived from the current object's type.
Density is controlled by default collapsed/expanded state (single level — no
explicit "Advanced" tier).

- Header: an **object identity row** (icon + editable name, e.g. "Text · Title").
- Sections by object:

| Object        | Sections                                                                  |
| ------------- | ------------------------------------------------------------------------- |
| **Text**      | Typography (font / size / line height / paragraph spacing / align / vertical align / fit) · Fill & color · Position & size · Effects |
| **Image**     | Image (crop / fit / mask / corner radius) · Position & size · Effects      |
| **Shape**     | Shape (fill / stroke / corner radius) · Text label · Position & size · Effects |
| **Visual**    | Visual (restyle / alt) · Position & size · Effects                         |
| **Connector** | Line (routing / dash / arrows / stroke) · Endpoints                        |
| **Slide**     | Background · Layout · Accent · Transition · Size · Notes                    |

- **Source link** is a low-frequency, element-scoped, **collapsed-by-default**
  section that appears only when the element has a `sourceRef`. It is not a
  separate surface.

---

## 7. Element model

After consolidation there are **five** element kinds:

```
Text · Image · Visual · Shape · Connector
```

### 7.1 Removed: Placeholder

`PlaceholderElement` is removed. Its only load-bearing jobs were a crisp
"unfilled & layout-owned" flag, deferred type choice, and a meaningful empty
state. Because template slots have **fixed types**, none of these require a
distinct kind:

- Templates instantiate **real elements in an empty state** (empty text with
  ghost prompt; image/visual with an "add" affordance).
- Selecting an empty slot shows the minimal popover (fill verbs + position);
  filling it makes it a normal element of that kind.

### 7.2 Removed: layoutSlot and the slot re-flow engine

`BaseElement.layoutSlot` (`LayoutSlotBinding`) and the stored slot-based
re-flow in `layout-apply.ts` are removed. **Layout becomes a creation preset**:
a template is just a set of typed, positioned elements, instantiated at slide
creation. There is no stored binding and no content-preserving "switch layout"
on a filled slide.

If content-preserving re-flow is wanted later, it is a **pure function** driven
by `textRole` (see §7.4): group elements by role, order within a role by reading
order (top→bottom, left→right) to recover ordering implicitly, and map to the
target layout's regions of the same role. Role-less elements are never moved.

### 7.3 Removed: legacy semantic `role`

The legacy `TextElement.role: "title" | "body"` is removed. Semantic identity is
unified onto `textRole`.

### 7.4 Canonical classification: `textRole`

The existing `DECK_TEXT_ROLES`
(`h1 · h2 · h3 · subtitle · body · bullet · caption · footer · shapeLabel`,
see [deck-theme-token-primitives.ts](../../src/lib/presentation/deck-theme-token-primitives.ts))
is the single classification and does triple duty:

1. **Typography** (already implemented): selects the theme role token.
2. **Title derivation:** the slide title is the first `h1` in reading order
   (fallback to the highest heading level present, h2 then h3). Replaces the old
   `role === "title"` check in `slide-title.ts`.
3. **Algorithmic re-flow matching** (§7.2): replaces `layoutSlot.kind`.

Decisions:

- **Semantic = typographic coupling is accepted.** "`h1` is the title." The rare
  case of an h1-sized non-title decorative text is not worth a separate field.
- **`textRole` stays optional with a default.** Absent resolves to `body`
  (bullets to `bullet`). Import/generation should set explicit headings but are
  not required to.

### 7.5 Merged: Bullets into Text (paragraph model)

`BulletsElement` is removed; its structure becomes the canonical text model.
`BulletItem` (`text` + `runs?` + `indent?` + `listType?`) is already a superset
of the old single-paragraph `TextElement` (`text` + flat `runs?`), so Text is
the degenerate single-paragraph case of Bullets — not the other way around.

- The unified element keeps **`kind: "text"`** but stores
  `paragraphs: Paragraph[]` (today's `items[]`), each paragraph carrying
  `runs + indent? + listType?`.
- **Plain text** = paragraphs without `listType`; **bullet/number list** =
  paragraphs with `listType`. Converting between them is a per-paragraph
  formatting toggle in the popover, not an element-type swap.
- Per [AGENTS.md](../../AGENTS.md), the compat mirrors `bullets[]` /
  `bulletRuns[]` are **dropped**, not retained.
- Result: one inline editor, one renderer path, one fit implementation.

### 7.6 Kept separate: Image vs Visual

Unlike Text/Bullets (a subset relationship), `Image` (static raster: src/asset,
crop, mask, fit) and `Visual` (live reference: `visualId`, restyle, alt,
regenerable) have fundamentally different lifecycles and disjoint property sets.
Merging them would force two mutually exclusive property sets into one element.
They remain distinct kinds with distinct panel sections.

---

## 8. Migration impact

Schema and library (`src/lib/presentation/`):

- `deck-elements.ts`: drop `PlaceholderElement`, `BulletsElement`,
  `BaseElement.layoutSlot`, and `TextElement.role`; redefine `TextElement`
  around `paragraphs: Paragraph[]`; keep five kinds in the `SlideElement` union.
- `layout-apply.ts`: stop producing placeholders/slot bindings; templates
  instantiate typed positioned elements. Re-flow, if added, is a pure function
  keyed on `textRole`.
- `slide-title.ts`: derive the title from the first `h1` (fallback h2/h3)
  instead of `role === "title"` / title placeholder.
- `slide-slots.ts`: removed or reduced to the `textRole` re-flow helper.
- `deck-diff.ts`, `element-accessible-name.ts`, `stage-resize.ts`: remove the
  `placeholder` branches; bullets folds into text.

UI (`src/components/presentation/`):

- Top toolbar: keep deck/app controls only; move background, layout, and insert
  off it.
- Popover: implement the three-segment skeleton + `⤢ Panel` bridge + slide
  popover + text two-state behavior.
- Inspector: replace the seven fixed tabs with the `Properties | Layers` mode
  switch and dynamic collapsible sections; keep the floating, non-auto-opening
  overlay.
- Merge the `bullets` inline editor / renderer into the text path.

Tests, fixtures, builders (`src/test/builders/deck.ts`), and seeds update to the
new shapes per [AGENTS.md](../../AGENTS.md) (no compatibility layers for
superseded shapes).

---

## 9. Related contracts

- [slide-editor.md](slide-editor.md) — current editor runtime (fold updates here
  on implementation).
- [slide-stage-interactions.md](slide-stage-interactions.md) — selection / edit
  state machine that the selection grammar (§5.6) and text states (§5.4) extend.
- [../data-model/deck.md](../data-model/deck.md) — persisted deck shape to update
  for the element-model changes.
- [../editor/theme-layout.md](../editor/theme-layout.md) — `textRole` token
  resolution that §7.4 builds on.
- [new-element-kind-checklist.md](new-element-kind-checklist.md) — revisit after
  the kind count drops to five.
