# 2. Canvas keyboard accessibility for the slide editor

- **Status:** Accepted
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

- **R1 — Keyboard resize parity.** A keyboard user must be able to resize a
  selected element using the same step model as nudge (proposed: **Alt+Arrow**
  for `1%`, **Alt+Shift+Arrow** for `5%`). Without this, keyboard-only users
  cannot perform a core authoring action (WCAG 2.1.1 Keyboard).
- **R2 — Deterministic selection traversal + focus restoration.** Provide an
  explicit "select next / previous element" command and a roving-tabindex (or
  equivalent) so traversal does not depend on raw DOM order, and restore focus
  to a sensible element after move/delete/duplicate/group so keyboard users are
  never dropped to the top of the page.
- **R3 — Selection/operation announcements.** Surface a visible focus indicator
  and `aria-live` announcements for selection and the result of move/resize, so
  the canvas is operable and perceivable without sight of pointer affordances.

**User impact if not done:** keyboard-only and screen-reader users can focus,
select, move, and delete elements but **cannot resize** them and can lose their
place after edits — a blocking barrier for independent deck authoring.

### Accepted limitations (deferred with rationale)

- **A1 — Keyboard connector drawing/reattachment.** Deferred to a later epic.
  Connector authoring is an advanced, lower-frequency action with a complex
  anchor-snapping model; the accessible interim path is to insert a connector
  with default endpoints and nudge/select rather than free-draw. Revisit once
  R1–R3 ship. **User impact:** keyboard users cannot free-draw connectors;
  mitigated by default-endpoint insertion + nudging.
- **A2 — Keyboard rotation.** Deferred. Rotation is decorative and rarely needed
  for comprehension; pointer-only is acceptable short term. **User impact:**
  minimal; rotation is not required to author readable slides.

These limitations remain recorded as release-gate **AC-5** warnings (Part 3 of
`docs/operations/release-gate.md`) until closed.

### Ownership and timing

- **Owner:** Accessibility / QA (Ghost) with the Presentation surface owner.
- **Time-box:** R1–R3 are scoped for the **next accessibility hardening wave**
  (target: the accessibility epic following #517). A1–A2 are revisited in the
  wave after that. If R1–R3 slip, AC-5 stays an explicit, signed-off release
  warning rather than a silent gap.

## Consequences

- The release gate's AC-5 deferred item now points at this ADR and an explicit
  list of follow-up issues, so "deferred" is auditable and time-bounded.
- R1–R3 are additive to the existing keyboard model and the pure helpers that
  back it (`elementAccessibleName`, the nudge/step logic), so they can be
  implemented and unit-tested without changing the persisted deck schema.
- Until R1 ships, automated a11y assertions continue to cover the
  helper-level guarantees (`src/lib/a11y/a11y-helpers.test.ts`,
  `element-accessible-name.test.ts`); the resize/traversal parity gap is a
  documented manual-review item.

## Follow-up implementation issues to file

The coordinator should open these GitHub issues (title — one-line scope):

1. **Keyboard resize for slide elements** — Alt+Arrow / Alt+Shift+Arrow resize
   the selected element box using the nudge step model (#522 R1).
2. **Deterministic canvas selection traversal (roving tabindex + next/previous)**
   — keyboard "select next/previous element" that does not rely on raw DOM order
   (#522 R2).
3. **Focus restoration after canvas mutations** — keep a sensible element focused
   after move/delete/duplicate/group so keyboard users aren't dropped to page top
   (#522 R2).
4. **Selection and move/resize screen-reader announcements** — visible focus +
   `aria-live` updates for selection and operation results (#522 R3).
5. **Keyboard connector create/reattach** — keyboard path to draw a connector
   between two selected elements and rebind endpoints to anchors (#522 A1,
   accepted-limitation follow-up).
6. **In-product canvas keyboard shortcut help** — surface the keyboard model in
   the slide editor help/overlay (supports discoverability for R1–R3).

## Rollback

This ADR is documentation. If the required scope proves infeasible in the
targeted wave, the rollback is to keep AC-5 as an explicit, signed-off release
warning (Part 3 of the release gate) and re-time R1–R3 — no code change is
required to revert.
