---
type: "plan"
status: "final"
last_updated: "2026-07-01"
description: "P0 plan to shrink SlideEditorVNext into a thin shell with explicit controllers while preserving vNext editor behavior, output parity, and export/present compatibility."
---

# vNext Editor Decomposition Plan

## Priority and goal

**Priority:** P0.

Shrink `SlideEditorVNext` from a god component into a thin editor shell that
wires explicit controllers, render surfaces, overlays, and command descriptors.
Behavior must remain unchanged unless a phase explicitly calls out a product
decision.

## Current behavior

`src/components/presentation-vnext/slide-editor-vnext.tsx` is the production
editor shell and currently owns too many reasons to change:

- deck open/save state, conflict handling, diagnostics, source review, and
  export affordances;
- slide selection, stage pointer state, drag/resize/rotate, table edit, inline
  text edit, and connector gestures;
- toolbar, context toolbar, inspector panel coordination, filmstrip state, and
  deck chrome affordances;
- focus restoration, live messages, keyboard shortcuts, presence, and dialog
  plumbing.

The vNext contracts around schema, commands, rendering, export, and diagnostics
are comparatively clean, but the shell does not yet respect that boundary.

## Evidence

| Evidence                  | Source                                                                                          | What it shows                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Oversized editor shell    | `src/components/presentation-vnext/slide-editor-vnext.tsx`                                      | 5,804 lines; component shape contradicts the thin-shell invariant.          |
| Stage helpers already     | `src/components/presentation-vnext/stage-pointer-interactions.ts`                               | Pointer and gesture logic is already separable from the React shell.        |
| Targeting helpers already | `src/components/presentation-vnext/stage-targeting.ts`                                          | Hit/target behavior can be tested outside the full editor.                  |
| Drag lifecycle helpers    | `src/components/presentation-vnext/pointer-drag-lifecycle.ts`                                   | Drag state can move behind an interaction controller.                       |
| Inspector shell exists    | `src/components/presentation-vnext/inspector/inspector-shell.tsx`                               | Inspector rendering already has a shell boundary that can consume actions.  |
| Inspector UI helpers      | `src/lib/presentation-vnext/inspector-panel-ui.ts`                                              | Panel decisions can be described without mounting the full editor.          |
| Oversized failure tests   | `src/components/presentation-vnext/slide-editor-vnext.failures.test.ts`                         | 89 KB failure suite couples behavior coverage to editor internals.          |
| Command contract          | `src/lib/presentation-vnext/editor-commands.ts`                                                 | Mutations are already mostly pure and should remain the command boundary.   |
| Render/export contracts   | `src/lib/presentation-vnext/render-tree.ts`, `src/lib/presentation-vnext/export-spec.ts`        | Output code can stay read-only while editor controllers dispatch mutations. |
| Diagnostics/recovery      | `src/lib/presentation-vnext/diagnostics.ts`, `src/lib/presentation-vnext/diagnostic-repairs.ts` | Review/repair actions should not be embedded in the editor component.       |

## Target boundaries

| Boundary                   | Target owner                                                | Notes                                                                                       |
| -------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Editor session shell       | `SlideEditorVNext` plus a small session controller          | Opens deck state, wires save status, routes callbacks, and renders layout regions only.     |
| Stage interaction state    | `useStageInteractionController`                             | Explicit state machine for idle, preselect, drag, resize, rotate, text edit, and connector. |
| Stage render surface       | `SlideCanvasVNext` render-only surface                      | Renders slide nodes and percent geometry without owning selection chrome or edit adapters.  |
| Stage overlays             | overlay components/controllers                              | Selection chrome, handles, guides, marquee, comments, and gesture feedback.                 |
| Inline text editing        | tested inline text adapter                                  | Keeps double-click text behavior and IME-safe commit/cancel behavior outside the shell.     |
| Focus and geometry         | focus/geometry registry                                     | Replaces brittle `querySelector`/`setTimeout` ownership with registered elements.           |
| Toolbar/current object     | action descriptor model                                     | Toolbar, popovers, and inspector consume the same current-object command descriptors.       |
| Inspector                  | inspector shell + shared field primitives                   | Inspector stays panel-oriented and maps descriptors to fields/actions.                      |
| Deck chrome                | deck-chrome controller                                      | Separates deck-level chrome defaults from slide-level overrides.                            |
| Diagnostics/source review  | action model shared by source review and diagnostics review | Keeps source/repair decisions out of the main editor component.                             |
| Export/present entrypoints | existing export/present modules                             | Editor invokes them; it does not own their internal behavior.                               |

## Phases

| Phase | Slice                                  | Actions                                                                                                                                    | Exit criteria                                                                                          |
| ----- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 0     | Behavior map and safety harness        | Inventory editor-owned behaviors, current-object actions, focus paths, and tests before moving code.                                       | No behavior change; each behavior has a current test owner or planned acceptance check.                |
| 1     | Extract session and action selectors   | Move current slide/current node/current object/action derivation into pure selectors or hooks consumed by shell, toolbar, and inspector.   | Toolbar and inspector render from shared descriptors; no duplicated current-object logic.              |
| 2     | Introduce stage interaction controller | Move pointer/keyboard/connector state into `useStageInteractionController`; reuse existing stage helper modules.                           | Stage gestures still dispatch `editor-commands.ts`; full editor no longer owns gesture state directly. |
| 3     | Split canvas render surface/overlays   | Keep `SlideCanvasVNext` focused on rendering and move selection chrome, handles, table edit, guides, and comments into overlay components. | Canvas can render read-only output without editor-only overlays.                                       |
| 4     | Replace focus/geometry ad hoc paths    | Add a registry for stage nodes, toolbar actions, inline editors, and inspector controls.                                                   | Focus restoration and live messages do not rely on DOM queries or delayed timers as truth.             |
| 5     | Extract inline text adapter            | Wrap existing double-click, commit, cancel, style handoff, and IME paths behind a small adapter with focused tests.                        | Text editing behavior survives extraction and has IME/CJK coverage.                                    |
| 6     | Move diagnostics/source review actions | Represent source review and diagnostic repair affordances with the same action descriptor shape used by toolbar/inspector actions.         | Review panels can be tested without mounting the god shell.                                            |
| 7     | Collapse the shell                     | Delete dead local state and inline handlers from `SlideEditorVNext` after every region has an owner.                                       | Shell is primarily composition and callback wiring.                                                    |

## Action items

- [ ] Define the editor behavior inventory for selection, drag, resize, rotate,
      text edit, connector, table edit, diagnostics, source review, filmstrip,
      deck chrome, export, focus, and keyboard shortcuts.
- [ ] Introduce current-object action descriptors before moving toolbar or
      inspector UI.
- [ ] Extract `useStageInteractionController` without changing command payloads.
- [ ] Split canvas rendering from overlays/table edit.
- [ ] Add a focus/geometry registry and migrate one focus path at a time.
- [ ] Wrap inline text edit behavior in an adapter and add IME acceptance tests.
- [ ] Move diagnostics/source-review repair actions behind descriptors.
- [ ] Delete obsolete editor-local state only after equivalent controller tests
      pass.

## Out of scope

- No DeckV7 schema changes.
- No legacy v6 bridge, conversion layer, or flat `groupId` element model.
- No visual redesign of the editor chrome.
- No wholesale port of the legacy stage editor.
- No required single-gesture connector draw; that remains an optional UX
  improvement after the state machine exists.
- No change to AI generation defaults; faithful document-derived generation
  remains the recommended default unless product decides otherwise.

## Acceptance checks

- `SlideEditorVNext` becomes a composition shell: it renders regions and passes
  controllers/actions, but no longer owns pointer state, focus querying, or
  inspector command derivation.
- Stage interaction behavior remains compatible with current selection,
  deterministic select-under/layer fallback, double-click text edit, and
  connector behavior.
- Inspector preserves compatible panels when the selected node changes; it does
  not close panels merely because selection changed.
- Toolbar, popover, and inspector actions are derived from one current-object
  command surface.
- Present/export output remains read-only and does not depend on editor-only
  overlay state.
- Tests move from React-internals mocking toward controller, component, and
  behavior acceptance coverage.

## Verification

Run the smallest checks for touched files in each implementation slice:

```bash
npx prettier --write <touched files>
npx eslint <touched lintable files>
npm run test:unit -- <focused presentation test files>
npm run test:presentation
npm run typecheck
```

Use `npm run typecheck` when controller extraction touches shared props, command
contracts, or generated Next types. Broaden beyond `npm run test:presentation`
only when a slice changes shared document, visual, export, or public-render
contracts.
