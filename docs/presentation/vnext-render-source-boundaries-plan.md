---
type: "plan"
status: "implemented — P2 provenance follow-up pending"
last_updated: "2026-07-02"
description: "P1/P2 plan to split vNext render, export, source, diagnostic, and document-plan boundaries without changing runtime behavior."
---

# vNext Render and Source Boundaries Plan

## Priority and goal

**Priority:** P1 for boundary splits that unblock editor decomposition; P2 for
provenance typing and doc hygiene follow-ups.

Split render, export, source, diagnostic, and document-plan modules along stable
contracts without changing runtime behavior. This is a refactor plan, not a
runtime redesign.

## Current behavior

vNext has clean persisted and runtime contracts, and the first boundary-splitting
slices are now implemented. The remaining work is a P2 provenance-typing and
documentation cleanup follow-up rather than a blocker for editor decomposition.

| Boundary             | Current sources                                                                                                                                                                                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema/types         | `src/lib/presentation-vnext/types.ts`, `src/lib/presentation-vnext/schema.ts`                                                                                                                                                                                                                      |
| Open/validation      | `src/lib/presentation-vnext/open-deck.ts`, `src/lib/presentation-vnext/validation.ts`                                                                                                                                                                                                              |
| Render tree/resolver | `src/lib/presentation-vnext/render-tree.ts`, `src/lib/presentation-vnext/render-resolver.ts`, `src/lib/presentation-vnext/render-resolver/*-pass.ts`                                                                                                                                               |
| Commands/tree ops    | `src/lib/presentation-vnext/editor-commands.ts`, `src/lib/presentation-vnext/node-tree-ops.ts`                                                                                                                                                                                                     |
| Stage interactions   | `src/components/presentation-vnext/stage-hit-test.ts`, `stage-guides.ts`, `selection-geometry.ts`, `stage-pointer-interactions.ts`, `stage-targeting.ts`, `pointer-drag-lifecycle.ts`                                                                                                              |
| Inspector/filmstrip  | `src/lib/presentation-vnext/inspector-panel-ui.ts`, `src/components/presentation-vnext/inspector/inspector-shell.tsx`, `src/components/presentation-vnext/filmstrip/filmstrip.tsx`                                                                                                                 |
| Export/present       | `src/lib/presentation-vnext/export-spec.ts`, `src/lib/presentation-vnext/export-lowerers/*`, `pptx-export-adapter.ts`, `pptx-lowerers/*`, `pptx-vnext-apply.ts`, `pptx-appliers/*`, `present-shell.ts`, `present-shell-vnext.tsx`, `present-mode-vnext.tsx`, `public-present-viewer-vnext.tsx`     |
| Diagnostics/recovery | `src/lib/presentation-vnext/diagnostics.ts`, `src/lib/presentation-vnext/diagnostic-repairs.ts`, `review-action-descriptors.ts`, `use-export-diagnostics.ts`, `deck-diagnostics-review.tsx`, `conflict-recovery-reload-v7.ts`                                                                      |
| Source/derivation    | `src/lib/presentation-vnext/source-links.ts`, `source-link-orchestration.ts`, `document-source-commands.ts`, `document-source-plan.ts`, `document-slide-planner.ts`, `document-slide-plan-compiler.ts`, `document-slide-plan-repair.ts`, `document-slide-plan-provenance.ts`, `deck-derivation.ts` |
| Themes/styles        | `src/lib/presentation-vnext/theme-package-registry.ts`, `theme-package-schema.ts`, `style-resolver.ts`, `style-schema.ts`, `theme-packages.ts`                                                                                                                                                     |

## Target behavior

- Runtime output stays byte-for-byte or visually equivalent unless a downstream
  product change explicitly opts in.
- Boundary modules expose pure functions or small adapters with focused tests.
- Editor controllers consume render/source/diagnostic/export descriptors rather
  than owning these decisions.
- Present mode, public viewer, and export continue to share the same read-only
  DeckV7/render contract.

## Boundary slices

### 1. Shared `node-tree-ops.ts`

Create one source of truth for tree operations that are currently repeated near
commands, render resolution, targeting, and selection.

Include:

- flattening nodes for hit testing/render traversal;
- parent lookup and ancestor checks;
- z-order/layer traversal;
- insert/delete/reorder helpers;
- group/ungroup helpers for true DeckV7 tree nesting.

Do not reintroduce v6 flat arrays or `groupId`.

### 2. Render resolver passes

Split `render-resolver.ts` into named passes that can be tested independently:

- theme/template resolution;
- style token resolution;
- layout/frame normalization;
- role/slot/default content resolution;
- render tree emission;
- diagnostics or warnings emitted by render resolution.

The public output shape should remain the same. Existing render/export parity
tests must pass unchanged after each pass split.

### 3. Source and diagnostic action model

Unify source review and diagnostics review around an action descriptor model:

- label, severity, disabled reason, repair eligibility, and command payload;
- safe/no-op/destructive action classification;
- source provenance references;
- UI placement for review panels and inspector advanced sections.

This lets `source-link-orchestration.ts`, `diagnostic-repairs.ts`, and review UI
share behavior without embedding decisions inside `SlideEditorVNext`.

### 4. Present/public shared shell

Share data-agnostic shell pieces between:

- `src/components/presentation-vnext/present-mode-vnext.tsx`;
- `src/components/presentation-vnext/public-present-viewer-vnext.tsx`;
- `src/components/presentation-vnext/present-mode/presenter-tools-vnext.tsx`.

Candidate shared behavior:

- navigation state;
- aspect-ratio fit;
- keyboard shortcuts;
- presenter timer/fullscreen/laser pointer when not tied to private editor
  state;
- public hash restoration where route-safe.

Keep route-specific access control, asset resolution, and public/private chrome
separate.

### 5. Modular export lowerers

Keep `export-spec.ts` as the pure DeckV7 export contract, then split lowerers by
node family:

- text/rich text;
- shapes/connectors;
- images/media;
- tables;
- visual blocks;
- theme/background/chrome.

`pptx-export-adapter.ts` and `pptx-vnext-apply.ts` should orchestrate lowerers
instead of accumulating node-family decisions in one place.

### 6. Document plan module split

Align document-derived slide generation with the existing derivation plan:

- source collection and source plan;
- document slide plan;
- semantic deck plan;
- compile/repair;
- provenance stamping;
- preview/diff/apply/save.

Recommended product answer: faithful source compression remains the default for
AI generation unless product explicitly chooses a presentation-rewrite mode.

### 7. Provenance typing follow-up

P2 follow-up: replace loose provenance payloads in deck/node `extra` metadata
with typed helpers or branded payloads where possible.

Do not block P1 boundary splits on schema changes. If typing requires a schema
change, update schema, fixtures, tests, docs, and generated artifacts together.

## Phases

| Phase | Priority | Slice                                  | Status    | Exit criteria                                                                                  |
| ----- | -------- | -------------------------------------- | --------- | ---------------------------------------------------------------------------------------------- |
| 1     | P1       | Add `node-tree-ops.ts`                 | Done      | Commands/render/targeting share tree traversal helpers without behavior changes.               |
| 2     | P1       | Split render resolver passes           | Done      | Render resolver pass modules preserve existing render/export behavior.                         |
| 3     | P1       | Add source/diagnostic action model     | Done      | Review panels consume descriptors; repairs still enforce safety rules.                         |
| 4     | P1       | Share present/public shell             | Done      | Present mode and public viewer share runtime helpers while preserving route-specific behavior. |
| 5     | P1       | Modularize export lowerers             | Done      | Export specs, PPTX lowerers, and PPTX appliers are split by node family.                       |
| 6     | P1/P2    | Split document plan modules            | Done      | Document-derived deck pipeline keeps faithful default and existing preview/apply behavior.     |
| 7     | P2       | Type provenance and clean docs/indexes | Follow-up | Provenance typing beyond current helpers remains a P2 cleanup.                                 |

## Out of scope

- No runtime behavior change.
- No DeckV7 schema change in P1 slices.
- No v6 bridge, alias, or conversion path.
- No wholesale legacy stage or export port.
- No product change from faithful AI generation to presentation rewrite.

## Acceptance checks

- Source, render, diagnostics, export, and present/public modules can be tested
  independently.
- `SlideEditorVNext` consumes descriptors/controllers from these modules instead
  of owning their decisions.
- Render/export parity remains stable after resolver and lowerer splits.
- Public viewer and present mode still differ only where route, access, or chrome
  requirements require it.
- Provenance typing follow-up is tracked but does not block behavior-preserving
  refactors.

## Verification

```bash
npx prettier --write <touched files>
npx eslint <touched lintable files>
npm run test:unit -- <focused presentation-vnext test files>
npm run test:presentation
npm run test:public-render
npm run test:visual
npm run typecheck
```

Use the focused test files for the touched boundary first. Run
`npm run typecheck` whenever exported types, schema-adjacent helpers, or shared
runtime modules move.
