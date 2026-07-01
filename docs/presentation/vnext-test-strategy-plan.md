---
type: "plan"
status: "final"
last_updated: "2026-07-01"
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
| Commands/editing     | Oversized        | `src/lib/presentation-vnext/editor-commands.test.ts`                                                       | Split by command family and keep assertions on pure command results.                |
| Full editor failures | Oversized        | `src/components/presentation-vnext/slide-editor-vnext.failures.test.ts`                                    | Split by editor region and retire React-internals mocking.                          |
| Stage gestures       | Gaps             | `src/components/presentation-vnext/stage-pointer-interactions.ts`, `stage-connector-interactions.ts`       | Add choreography tests for pointer lifecycle, selection, resize, rotate, connector. |
| Diagnostics repair   | Gaps             | `src/lib/presentation-vnext/diagnostic-repairs.ts`, `deck-diagnostics-review.tsx`                          | Add safety matrix for auto-repair eligibility and non-destructive repair behavior.  |
| Inline text/IME      | Gaps             | `src/components/presentation-vnext/inline-text-editor*`                                                    | Add IME/CJK commit/cancel/composition tests around the adapter.                     |

## Oversized split plan

### `editor-commands.test.ts`

`src/lib/presentation-vnext/editor-commands.test.ts` is about 61 KB. Split it
into command-family files so a refactor can validate only the affected family:

- [ ] `editor-commands.layout.test.ts` for frame, position, rotation, sizing,
      align/distribute, and percent geometry.
- [ ] `editor-commands.node-tree.test.ts` for insert, delete, duplicate,
      reorder, grouping, ungrouping, parent lookup, and z-order.
- [ ] `editor-commands.text.test.ts` for text content, rich text, style, and
      inline edit handoff.
- [ ] `editor-commands.table.test.ts` for table structure, cell edit, and table
      style commands.
- [ ] `editor-commands.media-shape-connector.test.ts` for image/media, shape,
      connector, endpoints, and visual-block commands.
- [ ] `editor-commands.slide-deck.test.ts` for slide add/delete/reorder,
      background, theme, and deck chrome commands.
- [ ] `editor-commands.source-diagnostics.test.ts` for source metadata,
      diagnostic repair, and provenance-safe updates.

Each file should use shared builders and assert on returned `DeckV7` values, not
on editor component internals.

### `slide-editor-vnext.failures.test.ts`

`src/components/presentation-vnext/slide-editor-vnext.failures.test.ts` is about
89 KB. Split it by editor region:

- [ ] `slide-editor-shell.failures.test.ts` for open/save/conflict/reload and
      shell-level error boundaries.
- [ ] `stage-interactions.failures.test.ts` for selection, drag, resize, rotate,
      marquee, connector, select-under, and focus restoration.
- [ ] `inspector-continuity.failures.test.ts` for panel preservation, disabled
      states, validation, and command descriptor mapping.
- [ ] `toolbar-command-surface.failures.test.ts` for toolbar/popover/current
      object command placement.
- [ ] `inline-text-editor.failures.test.ts` for double-click, commit/cancel,
      composition, and IME/CJK behavior.
- [ ] `source-diagnostics-review.failures.test.ts` for source review,
      diagnostic review, repair eligibility, and safe repair actions.

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

## Gap coverage

| Gap                    | Required coverage                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stage choreography     | Pointer down/move/up lifecycle, drag threshold, marquee selection, resize handles, rotation, connector edit/create, select-under, escape/cancel.   |
| Inspector-command map  | Every visible command descriptor has one command family; every supported command family has an intentional toolbar/popover/inspector owner.        |
| Present-to-export flow | A focused E2E or integration path verifies that authoring output, present mode, public render, and export resolve the same DeckV7/render contract. |
| Diagnostics safety     | Matrix for diagnostic severity, repair availability, no-op safety, destructive repair blocking, and source review handoff.                         |
| Inline editor IME      | Composition start/update/end, CJK input, enter/escape behavior, blur commit/cancel, and style handoff.                                             |

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
