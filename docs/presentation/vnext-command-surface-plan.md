---
type: "plan"
status: "implemented"
last_updated: "2026-07-02"
description: "P1 plan for vNext current-object command placement, inspector continuity, deck chrome ownership, connector draw scope, design-system primitives, and accessibility."
---

# vNext Command Surface Plan

## Priority and goal

**Priority:** P1.

Define where current-object commands belong across toolbar, popovers, inspector,
keyboard, and stage gestures. The goal is a single command surface that improves
UI ownership without changing DeckV7 semantics.

## Current behavior

The vNext editor exposes toolbar, context toolbar, inspector, keyboard, and
stage gestures. The shared command descriptor catalog now gives those surfaces a
common vocabulary, while some editor-local wiring remains until future UI slices
move every affordance to descriptors.

Historical coupling that drove this plan:

- `src/components/presentation-vnext/slide-editor-vnext.tsx` derives and wires
  many current-object actions directly.
- `src/components/presentation-vnext/toolbar/context-toolbar.tsx` owns visual
  affordances that should be backed by shared action descriptors.
- `src/components/presentation-vnext/inspector/inspector-shell.tsx` and
  `src/lib/presentation-vnext/inspector-panel-ui.ts` already provide useful
  panel boundaries; continuity is now resolved through shared panel logic.
- Stage command sources include `src/components/presentation-vnext/stage-pointer-interactions.ts`,
  `src/components/presentation-vnext/stage-connector-interactions.ts`, and
  `src/lib/presentation-vnext/editor-commands.ts`.

## Target behavior

- A current-object descriptor describes available commands, disabled reasons,
  shortcut labels, inspector panel mapping, and accessibility labels.
- Toolbar, popover, inspector, keyboard, and stage gestures dispatch the same
  `editor-commands.ts` command families instead of duplicating decisions.
- Inspector panel continuity preserves compatible panels when selection changes.
- Deck-level chrome has one owner; slide-level overrides remain visible on the
  selected slide or layout context.
- Design-system primitives keep field behavior consistent across inspector and
  popovers.

## Command placement matrix

| Current object/state   | Primary toolbar                                       | Popover/context toolbar                               | Inspector panel                                                                 | Keyboard/stage gesture                                  | Notes                                                                           |
| ---------------------- | ----------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| No selection           | Add slide, add content, theme, present/export, source | None or deck-level quick actions                      | Deck summary, theme package, source/diagnostics                                 | Global shortcuts, slide navigation                      | Deck-level commands only; do not show object fields.                            |
| Slide selected         | Add node, layout/theme shortcuts                      | Slide layout/background quick actions                 | Slide properties, background, speaker/presenter metadata, slide chrome override | Arrow navigation, duplicate/delete slide if focused     | Deck chrome defaults should not be hidden inside slide override UI.             |
| Text node              | Text family, style presets, alignment                 | Common text formatting and arrange actions            | Text content/style, source link, accessibility label                            | Double-click edit, text shortcuts during edit           | Preserve shared text style controls; inline editor owns IME-safe commit/cancel. |
| Shape node             | Fill/stroke/style preset, arrange                     | Common shape actions, duplicate/delete, layer actions | Geometry, fill/stroke, source link, accessibility label                         | Drag/resize/rotate/select-under                         | Keep deterministic layer fallback/select-under.                                 |
| Image/media node       | Replace/crop/fit/arrange                              | Replace, crop/fit, duplicate/delete                   | Asset metadata, alt text, geometry, source link                                 | Drag/resize/rotate/select-under                         | Asset decisions should remain compatible with export/public render.             |
| Table node/cell        | Table style, row/column actions                       | Cell/table quick actions                              | Table structure, cell style, geometry, source link                              | Cell edit, table navigation, drag/resize table          | Split table overlay editing from read-only canvas rendering.                    |
| Connector              | Connector style and endpoints                         | Endpoint/style quick actions                          | Connector geometry, endpoint binding, stroke/arrow settings                     | Connector creation/edit gestures                        | Single-gesture draw is optional UX, not required for this command surface.      |
| Group/multi-selection  | Arrange, align, distribute, group/ungroup             | Duplicate/delete, align, distribute                   | Multi-select summary and common fields only                                     | Marquee, shift-select, group move/resize when supported | Do not reintroduce v6 flat group mental model.                                  |
| Visual block           | Visual style/export capability                        | Visual quick actions                                  | Visual props, data/source link, export capability warnings                      | Drag/resize/rotate/select-under                         | Keep generated visual blocks editable, not static images.                       |
| Source/diagnostic item | Review/repair entrypoint                              | Contextual repair where safe                          | Source review and diagnostic review actions                                     | None unless focused panel owns shortcuts                | Use shared action descriptors for source review and diagnostic repair.          |
| Deck chrome            | Deck settings/menu                                    | None or current slide override shortcut               | Deck chrome defaults in deck-level panel; slide overrides in slide-level panel  | Global shortcuts only                                   | Separate deck defaults from slide override controls.                            |

## Inspector panel continuity

Recommended answer: **preserve compatible panels rather than always closing the
inspector when selection changes.**

Rules:

- Keep the active panel open when the new selection supports the same semantic
  panel, such as text-to-text, shape-to-shape, or image-to-image.
- Fall back to a common panel for multi-selection when the previous panel is not
  valid for the new selection.
- Close or replace a panel only when its target object no longer exists or the
  panel is incompatible with the new current object.
- Preserve focus when the same field remains valid; otherwise move focus to the
  panel heading and announce the panel change.

## Deck chrome ownership

Target ownership:

- Deck-level chrome defaults live in a deck settings/chrome panel reachable from
  the primary toolbar.
- Slide-level chrome overrides live in the slide inspector and are visually
  labeled as overrides.
- Toolbar commands may expose a shortcut to the relevant owner, but they should
  not duplicate field state.
- Export, present, and public render must resolve deck defaults plus slide
  overrides through the same read-only runtime path.

## Design-system primitives

Create shared primitives before broad panel rewrites:

- `EditorField` for label, description, validation state, help text, and focus
  wiring.
- `EditorNumberField` for percent geometry, dimensions, rotation, opacity, and
  keyboard step behavior.
- `EditorActionButton` for command descriptors, disabled reasons, shortcuts, and
  live-message announcements.
- `EditorActionMenu` for grouped command descriptors in toolbar/popovers.
- Shared color, icon, and alignment controls that can render in inspector or
  popover contexts without duplicating command decisions.

## Connector draw decision

Recommended answer: **single-gesture connector draw is optional.** Scope it as a
UX improvement after the stage interaction controller exists. The P1 command
surface only needs connector commands to be discoverable, keyboard-accessible,
and backed by the same command descriptors as other node actions.

## Accessibility requirements

- Every command descriptor includes a label, disabled reason, optional shortcut,
  and live-message text.
- Toolbar and popover labels/tooltips must be clearer than icon-only controls.
- Focus restoration uses the planned focus/geometry registry rather than DOM
  queries as truth.
- Inspector continuity announces panel changes and preserves focus only when the
  target field remains valid.
- Keyboard paths exist for add, duplicate, delete, arrange, group/ungroup, text
  edit, table edit, present, export, and panel navigation.
- Progressive disclosure replaces hidden "simple mode" logic: advanced source
  ids, raw provenance, and deck chrome overrides should live in advanced
  sections with clear labels.

## Implementation update — 2026-07-02

The command descriptor catalog, disabled-reason vocabulary, inspector continuity
resolver, deck-chrome default/override split, editor field/action/menu
primitives, and descriptor bijection tests are implemented. Toolbar and
inspector arrange controls now consume the shared descriptor catalog; future UI
rewrites should continue moving local affordances onto that surface instead of
adding new command-specific wiring.

## Action items

- [x] Define the `CurrentObjectCommandDescriptor` shape and disabled-reason
      vocabulary.
- [x] Map toolbar, popover, inspector, keyboard, and stage commands to
      descriptor families.
- [x] Add inspector continuity rules to panel selection logic.
- [x] Split deck-level chrome defaults from slide-level override controls.
- [x] Build shared field/action/menu primitives before rewriting panels.
- [x] Add inspector-command bijection tests: every visible command maps to one
      command family, and every command family has an intentional UI owner.

## Verification

```bash
npx prettier --write <touched files>
npx eslint <touched lintable files>
npm run test:unit -- <focused toolbar/inspector tests>
npm run test:presentation
npm run typecheck
```

Run accessibility-focused component tests for toolbar/inspector slices whenever
labels, focus, disabled states, or live messages change.
