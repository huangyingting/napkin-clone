# Adding a New Slide Element Kind

**Status:** Current  
**Last updated:** 2026-06-26

This checklist ensures every layer of the stack stays consistent when a new
`SlideElement` kind is added to the discriminated union in
`src/lib/presentation/deck-elements.ts`.

## 1 — Schema

- [ ] Add the new element interface (e.g. `FooElement`) to `deck-elements.ts`
      and extend the `SlideElement` union.
- [ ] Add the new kind to `deck-validation/elements.ts` (`validateSlideElement`
      switch) so the runtime validator accepts and parses it.
- [ ] If the kind carries a `text`-like field, decide whether it needs
      `TextElementStyle` and wire up `validateTextStyle`.

## 2 — Rendering

- [ ] Add a React component in
      `src/components/presentation/slide-canvas/<kind>-elements.tsx`.
- [ ] Export it and add a `case "<kind>"` to the `SlideElementView` switch in
      `slide-canvas/elements-slide-layout.tsx`.

## 3 — Exhaustiveness guards (compile-time)

The following switches use `assertNever` in their `default` branch. TypeScript
will report a compile error at each one until you add a matching `case`:

| File                                                                 | Function/component                  |
| -------------------------------------------------------------------- | ----------------------------------- |
| `src/components/presentation/slide-inspector.tsx`                    | `elementLabel`                      |
| `src/components/presentation/layer-list.tsx`                         | `KindIcon`                          |
| `src/components/presentation/slide-canvas/elements-slide-layout.tsx` | `SlideElementView`                  |
| `src/components/presentation/slide-editor.tsx`                       | `slideElementTypeLabel`             |
| `src/components/presentation/slide-inspector/controls.tsx`           | `ElementControls`                   |
| `src/lib/presentation/stage-resize.ts`                               | `fitElementBoxToContent`            |
| `src/lib/presentation/element-accessible-name.ts`                    | `elementAccessibleName`             |
| `src/lib/visual/deck-export.ts`                                      | `buildDeckSlideSpec` (element loop) |

Run `npm run typecheck` after adding the interface — every unguarded switch will
fail to compile until it has a case for the new kind.

## 4 — Editor interactions

- [ ] `src/lib/presentation/stage-hit-test.ts` — add a case (or verify the
      `default` fallback is sufficient) so the new element responds to pointer
      events correctly.
- [ ] `src/lib/presentation/stage-resize.ts` — already guarded; add a case for
      the element's resize behaviour.
- [ ] `src/components/presentation/slide-stage-editor.tsx` — check inline-edit
      entry points; add a branch if the kind supports direct editing.
- [ ] `src/components/presentation/slide-inspector/controls.tsx` — already
      guarded; add inspector controls for the new kind.
- [ ] `src/lib/presentation/element-accessible-name.ts` — already guarded; add
      a meaningful accessible name for the new kind.
- [ ] `src/lib/presentation/element-accessible-name.ts` (`connectorTargetLabel`)
      — intentionally partial; add a case if connectors should bind to the new kind.

## 5 — Export

- [ ] `src/lib/visual/deck-export.ts` — already guarded; add a `case` in the
      element loop and implement `buildDeck<Kind>Op`.
- [ ] `src/lib/presentation/render-export-style-adapter.ts` — add style
      resolution if the kind uses a `TextElementStyle`.

## 6 — Mutation and commands

- [ ] `src/lib/presentation/deck-mutation-elements.ts` — check `addElement`,
      `updateElement`, and element-patch helpers.
- [ ] `src/lib/presentation/slide-command-element-executor.ts` — add handling if
      the new kind interacts with document-linked commands.

## 7 — Tests and fixtures

- [ ] Add a builder in `src/test/builders/deck.ts`.
- [ ] Add at least one round-trip test in `deck-schema.test.ts` (validates
      serialise → parse).
- [ ] Update snapshot/golden fixtures if any exist.

## 8 — Docs

- [ ] Update this checklist if new integration points appear.
- [ ] If the kind has non-trivial rendering or export logic, add a note to
      `docs/presentation/rendering-and-export.md`.
