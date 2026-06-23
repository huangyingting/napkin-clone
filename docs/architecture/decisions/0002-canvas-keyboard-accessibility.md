# 2. Canvas keyboard accessibility for the slide editor

- **Status:** Accepted — R1–R3 implemented (canvas keyboard accessibility wave,
  issues #530–#535); A1 partially implemented; A2 deferred
- **Date:** 2026-06-23
- **Epic:** #517 — Release Gate Automation and Critical Flow E2E Coverage
- **Issue:** #522
- **Supersedes:** —
- **Superseded by:** —

## Context

The slide editor canvas (`SlideStageEditor`,
`src/components/presentation/slide-stage-editor.tsx`; editor shell
`src/components/presentation/slide-editor.tsx`) is the primary authoring surface
for decks. It is pointer-first: elements are moved and resized by dragging, and
connectors are drawn by dragging endpoints onto element anchors. The release
gate has long tracked a deferred-risk item for this surface —
`docs/operations/release-gate.md` row **AC-5 "Canvas drag/resize keyboard
parity" (Owner: D / deferred)** — without a written decision recording exactly
which keyboard interactions are required for the next accessibility bar and
which limitations are accepted, with rationale and ownership.

This ADR records that decision so the gate references a concrete, time-bounded
plan rather than an open-ended "deferred" marker.

### Current keyboard support (verified in code)

The canvas already supports a non-trivial keyboard model:

- **Focus.** Every element renders as `role="button"`, `tabIndex={0}`,
  `aria-pressed={selected}` with an accessible name derived from content
  (`elementAccessibleName`). Native **Tab** moves focus across elements.
  - `slide-stage-editor.tsx:1965-1970`
- **Select.** **Space** selects the focused element; **Shift+Space** toggles it
  into the multi-selection; **Enter** activates it (enters a group, else inline
  edit).
  - `slide-stage-editor.tsx:2017-2036`
- **Move.** With an element selected, **Arrow** keys nudge it by `1%`;
  **Shift+Arrow** nudges by `5%`.
  - `slide-editor.tsx:1287-1332`
- **Delete.** **Delete** / **Backspace** removes the selected element(s).
  - `slide-editor.tsx:1304-1313`
- **Slide navigation.** **Arrow Left/Right** pages between slides when no
  selected element consumes the arrow.
  - `slide-editor.tsx:1335-1343`
- **Editor shortcuts.** Escape, undo/redo, duplicate, new slide, select-all,
  copy/cut/paste, group/ungroup are all keyboard-driven.
  - `slide-editor.tsx:1034-1285`
- **Bullets.** **Tab** / **Shift+Tab** changes bullet indent while editing text.
  - `slide-stage-editor.tsx:2936-2945`

### Current keyboard gaps (verified in code)

- **No keyboard resize.** Resizing is pointer-only via eight drag handles; there
  is no keyboard equivalent (e.g. a modifier+Arrow to change the element box).
  - `slide-stage-editor.tsx:9-10` (doc comment), pointer resize at
    `slide-stage-editor.tsx:1467-1496`
- **No keyboard connector authoring.** Connectors are created and reattached by
  dragging endpoints onto anchors; there is no keyboard path to draw a connector
  or rebind an endpoint to an anchor.
  - `slide-stage-editor.tsx:730-736`, `1471-1497`
- **Traversal is raw Tab order, with no focus restoration contract.** Selection
  traversal relies on DOM/z-index Tab order rather than a spatial or
  "next/previous element" model, and focus is not guaranteed to be restored to a
  sensible element after a mutation (move/delete/duplicate/group). There is no
  `aria-live` announcement of selection or move/resize results.
- **No keyboard rotation.** Rotation is pointer-only (decorative).

## Decision

For the **next accessibility bar** we split the gaps into **required** work
(blocks the next a11y sign-off) and **accepted** limitations (documented,
deferred with rationale and a revisit point). The release gate's AC-5 item is
re-pointed at this ADR.

### Required before the next accessibility bar

- **R1 — Keyboard resize parity.** ✅ **Implemented** (#530). A keyboard user can
  resize a selected element with **Alt+Arrow** (`1%`) / **Alt+Shift+Arrow**
  (`5%`), mirroring the nudge step model; Right/Down grow the right/bottom edge,
  Left/Up shrink them. Clamping (min size + canvas bounds) lives in the pure
  `resizeBoxByStep` helper (`src/lib/presentation/canvas-a11y.ts`) and applies
  via `SET_ELEMENT_BOXES`. Without this, keyboard-only users could not perform a
  core authoring action (WCAG 2.1.1 Keyboard).
- **R2 — Deterministic selection traversal + focus restoration.** ✅
  **Implemented** (#531, #532). **Tab / Shift+Tab** select the next / previous
  element in a deterministic reading order (`orderedElementIds` +
  `nextElementId`) while a canvas element has focus, backed by a roving
  tabindex; **Escape** releases canvas focus so users are never trapped. Focus
  is restored to a sensible element after move / resize (the same element),
  delete (`focusTargetAfterDelete` → next/previous survivor, or the canvas
  container), duplicate (the new copy) and group (the group primary).
- **R3 — Selection/operation announcements.** ✅ **Implemented** (#533). A
  visually-hidden `aria-live="polite"` region in the stage announces selection,
  move, resize and delete results (pure `announce*` builders), and focused
  elements show a distinct `focus-visible` outline ring separate from the
  selection style.

A discoverable in-product **keyboard shortcut help dialog** (#535, opened with
`?` or the toolbar keyboard button) documents the full model; its content is the
pure `canvasShortcutHelp` helper.

**User impact now:** keyboard-only and screen-reader users can focus, select,
move, **resize**, delete, duplicate and group elements, traverse deterministically,
and keep their place after every edit.

### Accepted limitations (deferred with rationale)

- **A1 — Keyboard connector drawing/reattachment.** 🟡 **Partially implemented**
  (#534). The accessible interim path now ships: with exactly two connectable
  elements selected, **C** inserts a connector with default endpoints bound to
  both (facing anchors via `buildConnectorBetween`); with a connector selected,
  **C** / **Shift+C** cycle its end / start endpoint among the candidate anchors
  (`cycleEndpointAnchor`). **Still deferred:** free-draw connector authoring
  with arbitrary routing remains pointer-only. **User impact:** keyboard users
  can connect and rebind elements but cannot free-draw an arbitrary path;
  mitigated by default-endpoint insertion + anchor cycling + nudging.
- **A2 — Keyboard rotation.** Deferred. Rotation is decorative and rarely needed
  for comprehension; pointer-only is acceptable short term. **User impact:**
  minimal; rotation is not required to author readable slides.

These limitations remain recorded as release-gate **AC-5** warnings (Part 3 of
`docs/operations/release-gate.md`) until closed.

### Ownership and timing

- **Owner:** Accessibility / QA (Ghost) with the Presentation surface owner.
- **Time-box:** R1–R3 shipped in the canvas keyboard accessibility wave
  (issues #530–#535), together with the A1 interim subset (connector
  create/reattach). A2 (rotation) and free-draw connector authoring are
  revisited in a later wave; AC-5 stays an explicit, signed-off release warning
  for those remaining gaps.

## Consequences

- The release gate's AC-5 item now points at this ADR; R1–R3 ship and AC-5 is a
  narrowed warning covering only the accepted A1 (free-draw) / A2 (rotation)
  limitations.
- R1–R3 are additive to the existing keyboard model and the pure helpers that
  back it (`elementAccessibleName`, the nudge/step logic, and the new
  `canvas-a11y.ts` module), implemented and unit-tested
  (`src/lib/presentation/canvas-a11y.test.ts`) without changing the persisted
  deck schema.
- Automated a11y assertions continue to cover the helper-level guarantees
  (`src/lib/a11y/a11y-helpers.test.ts`, `element-accessible-name.test.ts`); the
  resize/traversal/announcement logic is now covered by `canvas-a11y.test.ts`.

## Implementation issues (delivered)

The wave delivered these (status in parentheses):

1. **Keyboard resize for slide elements** — Alt+Arrow / Alt+Shift+Arrow resize
   the selected element box using the nudge step model (#530 R1 — ✅ shipped).
2. **Deterministic canvas selection traversal (roving tabindex + next/previous)**
   — Tab / Shift+Tab select next/previous without relying on raw DOM order
   (#531 R2 — ✅ shipped).
3. **Focus restoration after canvas mutations** — keep a sensible element focused
   after move/resize/delete/duplicate/group (#532 R2 — ✅ shipped).
4. **Selection and move/resize screen-reader announcements** — visible focus +
   `aria-live` updates for selection and operation results (#533 R3 — ✅ shipped).
5. **Keyboard connector create/reattach** — connect two selected elements and
   rebind endpoints to anchors via keyboard (#534 A1 — 🟡 interim subset shipped;
   free-draw still deferred).
6. **In-product canvas keyboard shortcut help** — surface the keyboard model in
   the slide editor help overlay (#535 — ✅ shipped).

## Rollback

This ADR is documentation. If the required scope proves infeasible in the
targeted wave, the rollback is to keep AC-5 as an explicit, signed-off release
warning (Part 3 of the release gate) and re-time R1–R3 — no code change is
required to revert.
