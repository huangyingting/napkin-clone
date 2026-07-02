---
type: "plan"
status: "active — gaps tracked"
last_updated: "2026-07-02"
description: "P1 plan to reshape vNext presentation tests around refactor-safe behavior coverage instead of oversized suites and React-internals mocking."
---

# vNext Test Strategy Plan

## Priority and goal

**Priority:** P1.

Make presentation tests support refactors instead of padding coverage. The test
suite should protect public contracts, controller behavior, and user-visible
editor workflows without depending on React internals or fake DOM assumptions.

## Current behavior

The presentation test map is broad, and many core contracts are well covered.
The weak point is not a lack of tests; it is where some tests couple coverage to
oversized files and implementation details.

## Test map

| Area                 | Current strength | Representative sources                                                                                     | Follow-up                                                                           |
| -------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Schema/validation    | Strong           | `src/lib/presentation-vnext/schema.ts`, `src/lib/presentation-vnext/validation.test.ts`                    | Keep as contract tests; broaden only for schema changes.                            |
| Rendering/trees      | Strong           | `src/lib/presentation-vnext/render-tree.ts`, `src/lib/presentation-vnext/render-resolver.test.ts`          | Add pass-level tests if resolver phases are split.                                  |
| Inspector            | Strong but split | `src/lib/presentation-vnext/inspector-panel-ui.test.ts`, `src/components/presentation-vnext/inspector`     | Add command-bijection and continuity tests.                                         |
| Filmstrip            | Strong           | `src/components/presentation-vnext/filmstrip/filmstrip.test.ts`                                            | Keep focused component tests around reorder/drop behavior.                          |
| Export               | Strong           | `src/lib/presentation-vnext/export-spec.test.ts`, `src/lib/presentation-vnext/pptx-export-adapter.test.ts` | Add present-to-export parity/E2E coverage where output behavior crosses layers.     |
| Source links         | Strong           | `src/lib/presentation-vnext/source-links.ts`, source review tests                                          | Share source/diagnostic action-model tests as boundaries are split.                 |
| Commands/editing     | Split/focused    | `src/lib/presentation-vnext/editor-commands*.test.ts`                                                      | Keep command-family assertions on pure command results.                             |
| Full editor failures | Split/focused    | `src/components/presentation-vnext/slide-editor-vnext-*.failures.test.ts`                                  | Keep retiring quarantined React-internals usage as controller/component tests land. |
| Stage gestures       | Covered          | `src/components/presentation-vnext/stage-pointer-interactions.ts`, `stage-connector-interactions.ts`       | Keep choreography coverage focused on controller and region failure tests.          |
| Diagnostics repair   | Covered          | `src/lib/presentation-vnext/diagnostic-repairs.ts`, `deck-diagnostics-review.tsx`                          | Keep safety matrix coverage with review action descriptors.                         |
| Inline text/IME      | Covered          | `src/components/presentation-vnext/inline-text-editor*`                                                    | Keep IME/CJK coverage around the adapter.                                           |

## Oversized split plan

### `editor-commands.test.ts`

`src/lib/presentation-vnext/editor-commands.test.ts` was split into
command-family files so a refactor can validate only the affected family:

- [x] `editor-commands.layout.test.ts` for frame, position, rotation, sizing,
      align/distribute, and percent geometry.
- [x] `editor-commands.node-tree.test.ts` for insert, delete, duplicate,
      reorder, grouping, ungrouping, parent lookup, and z-order.
- [x] `editor-commands.text.test.ts` for text content, rich text, style, and
      inline edit handoff.
- [x] `editor-commands.table.test.ts` is the family home for table command
      coverage; no table-specific commands existed in the original suite.
- [x] `editor-commands.media-shape-connector.test.ts` for image/media, shape,
      connector, endpoints, and visual-block commands.
- [x] `editor-commands.slide-deck.test.ts` for slide add/delete/reorder,
      background, theme, and deck chrome commands.
- [x] `editor-commands.source-diagnostics.test.ts` for source metadata;
      diagnostic-specific command coverage remains with diagnostic repair tests.

Each file should use shared builders and assert on returned `DeckV7` values, not
on editor component internals.

### Slide editor failure region tests

The former monolithic failure suite was split by editor region while preserving
the migrated coverage:

- [x] `slide-editor-vnext-shell.failures.test.ts` for export, save, present, and
      share shell failures.
- [x] `slide-editor-vnext-stage-selection.failures.test.ts` for marquee,
      keyboard selection, context menu selection, connector detach, and
      select-under parity.
- [x] `slide-editor-vnext-stage-gestures.failures.test.ts` for drag, duplicate,
      resize, and live gesture badges.
- [x] `slide-editor-vnext-inspector-continuity.failures.test.ts` for image
      replacement validation, retry, and selected-inspector continuity.
- [x] `slide-editor-vnext-toolbar-command-surface.failures.test.ts` for connector
      keyboard commands and rotation command announcements.
- [x] `slide-editor-vnext-inline-text-editor.failures.test.ts` for double-click,
      selected-text click, and edit-mode exit behavior.
- [x] `slide-editor-vnext-source-diagnostics-review.failures.test.ts` for source
      review, diagnostic review, repair eligibility, and safe repair actions.

## React internals and fake DOM retirement

- Prefer pure command/controller tests for logic that does not require React.
- Prefer component tests around public UI behavior for toolbar, inspector,
  filmstrip, and shell wiring.
- Use browser/E2E coverage for interactions whose correctness depends on real
  DOM selection, pointer movement, composition events, focus, or fullscreen.
- Do not mock React internals to reach private state. Extract a controller or
  action descriptor instead.
- Do not treat DOM overlays as the source of truth for stage geometry; test
  geometry helpers and registry outputs directly.

Implementation update — 2026-07-02: oversized command tests and slide-editor
failure tests are split by command family and editor region. Remaining React
internals usage is quarantined in `src/test/react-internals.ts` and the shared
failure harness while future slices replace it with controller/component tests.

## Gap coverage

| Gap                    | Status    | Coverage                                                                                                                                           |
| ---------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stage choreography     | Covered   | Region failure tests and the stage controller test cover drag, resize, selection, connector detach, rotation, and cancel/escape paths.             |
| Inspector-command map  | Covered   | Current-object descriptor bijection tests and inspector continuity tests map command families to toolbar, popover, inspector, keyboard, and stage. |
| Present-to-export flow | Follow-up | Add a focused E2E or integration path proving authoring output, present mode, public render, and export resolve the same DeckV7/render contract.   |
| Diagnostics safety     | Covered   | Source/diagnostic review failure coverage and descriptor tests cover repair eligibility, safe repairs, destructive actions, and handoff.           |
| Inline editor IME      | Covered   | Inline text adapter tests cover composition, CJK preservation, blur commit deferral, enter/escape, and style handoff.                              |

## Validation commands

Focused validation:

```bash
npm run test:unit -- <focused presentation test files>
npm run test:presentation
```

Broader validation when touched behavior crosses boundaries:

```bash
npx prettier --write <touched files>
npx eslint <touched lintable files>
npm run typecheck
npm run test:public-render
npm run test:visual
```

Use `npm run test:presentation` as the default subsystem guard. Use
`npm run test:unit -- <files>` for split command/controller files when the
runner can target the slice directly.

## Acceptance template for refactor PRs

Each presentation refactor PR should answer:

- [ ] Which current behavior is intentionally preserved?
- [ ] Which controller, descriptor, or boundary now owns the behavior?
- [ ] Which oversized or internals-coupled test was split, deleted, or replaced?
- [ ] Which focused test file proves the behavior?
- [ ] Did any source/schema/export/public-render contract change?
- [ ] Were `npx prettier --write`, lint for touched lintable files, focused
      tests, and necessary typecheck/subsystem checks run?

## Definition of done

- Tests read like product/controller behavior, not coverage padding.
- New controller boundaries can be tested without mounting the full editor.
- React internals mocking is removed or quarantined behind an explicit migration
  issue.
- Stage, inspector, diagnostics, present/export, and IME gaps have focused
  coverage owners.
