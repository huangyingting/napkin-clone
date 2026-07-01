---
type: "plan"
status: "final"
last_updated: "2026-07-01"
description: "P0 plan to extract the reusable presentation kernel from the orphaned legacy v6 stack and retire the legacy presentation surface after product confirms no fallback route is required."
---

# Legacy Retirement Plan

## Priority and goal

**Priority:** P0.

Extract the data-agnostic presentation kernel currently living under the legacy
v6 stack, migrate vNext and product entrypoints to that kernel, and retire the
orphaned v6 presentation surface once product confirms there is no fallback
route to preserve.

## Recommended product decision

Legacy retirement should be an explicit product goal. If product confirms there
is no supported fallback editor/presenter route, remove the v6 surface after the
import gates below pass. If product still needs a fallback route, freeze it as a
named, supported product mode with an owner, tests, and public documentation
instead of letting it remain implicit dead code.

## Current behavior

The legacy stack is not the vNext production authoring target, but vNext and
nearby product paths still import useful helpers from it. The result is a
load-bearing legacy tree: most code is obsolete, while a smaller shared kernel is
still required for present mode, public viewing, export, document-derived
generation, and editor shell utilities.

## Import inventory categories

Use this inventory as the retirement checklist. Re-run an import search before
each deletion phase because the exact list will drift.

| Category                     | Representative sources                                                                                                                                                                                                                                 | Retirement direction                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| vNext present/public runtime | `src/components/presentation-vnext/present-mode-vnext.tsx`, `src/components/presentation-vnext/public-present-viewer-vnext.tsx`, `src/components/presentation-vnext/present-mode/presenter-tools-vnext.tsx`                                            | Move data-agnostic navigation, fullscreen, timer, laser pointer, fit, and hash helpers to shared runtime. |
| vNext editor helpers         | `src/components/presentation-vnext/slide-editor-vnext.tsx`, `src/components/presentation-vnext/filmstrip/use-filmstrip-drag.ts`                                                                                                                        | Move focus trap, save status, presence, keyboard rotate, and reorder helpers to shared/vNext modules.     |
| Document/AI generation       | `src/lib/ai/deck-generation-request.ts`, `src/lib/ai/deck-source.ts`, `src/lib/ai/deck-metrics.ts`, `src/lib/presentation-vnext/document-slide-plan.ts`, `src/lib/presentation-vnext/block-index.ts`                                                   | Move hash/source utilities into document or presentation-shared modules with no v6 deck dependency.       |
| Editor entrypoints           | `src/components/editor/slide-editor-button.tsx`, `src/components/editor/slide-editor-open-dialog.tsx`, `src/components/editor/use-slide-editor-open.ts`, `src/app/app/documents/[id]/deck-actions.ts`, `src/app/app/documents/[id]/lexical-editor.tsx` | Make entrypoints choose vNext directly or a confirmed fallback route explicitly.                          |
| Export/visual fallback       | `src/lib/visual/deck-export-context.ts`, `src/lib/visual/deck-fallback-ops.ts`, `src/lib/visual/export-preflight.ts`, `src/lib/visual/presentation-visual-theme-bridge.ts`, legacy `src/lib/presentation/export/*`                                     | Preserve pure export spec/applier ideas, but remove v6-specific fallback once vNext export is complete.   |
| Legacy-only surface          | `src/components/presentation/**`, `src/lib/presentation/**`                                                                                                                                                                                            | Delete after all external imports are gone and product fallback gate is closed.                           |

## Preserve

- Modular hooks that are data-agnostic and easy to test.
- Present navigation, fullscreen, laser pointer, and presenter timer behavior
  when decoupled from v6 deck shapes.
- Pure export spec/applier split; vNext should keep the read-only export spec
  builder separate from PPTX/browser appliers.
- Controlled stage geometry and percent-based layout calculations that work for
  authoring and output parity.
- Announcements, focus restoration, keyboard shortcuts, deterministic
  select-under/layer fallback, and double-click text affordances when rehosted
  on vNext boundaries.

## Do not port

- v6 flat `element[]` plus `groupId` as the runtime editing model.
- v6 masters/global-master path or global-master inspector concepts as vNext
  architecture.
- Wholesale legacy stage editor code.
- v6 `DeckPatch` autosave as a compatibility path for vNext.
- Generic v6 label mental model or DOM overlay targeting as the source of truth.
- Superseded payload bridges, aliases, or conversion paths unless product
  explicitly requests them.

## Target behavior

| Area            | Target                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| Shared runtime  | Data-agnostic helpers live outside legacy v6 modules and do not import v6 deck/element types.               |
| vNext imports   | `src/components/presentation-vnext/**` and `src/lib/presentation-vnext/**` do not import from legacy paths. |
| Product routing | Editor/presenter entrypoints route to vNext unless an explicit supported fallback product mode exists.      |
| Export          | vNext export owns DeckV7 output; any remaining v6 export helpers are either migrated or deleted.            |
| Legacy tree     | `src/components/presentation/**` and v6-specific `src/lib/presentation/**` are removable as a final slice.  |
| Documentation   | Docs describe current vNext behavior, not retired fallback behavior.                                        |

## Migration phases

| Phase | Slice                         | Actions                                                                                                                                      | Gate                                                            |
| ----- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 0     | Product fallback decision     | Confirm whether any user-facing v6 editor, presenter, public viewer, export, or deck fallback route remains supported.                       | Product answer recorded; recommended answer is retirement.      |
| 1     | Import inventory              | Re-run import search and categorize imports by shared runtime, vNext helper, document/AI, entrypoint, export/visual, or legacy-only surface. | Every non-legacy import has a migration owner.                  |
| 2     | Shared kernel extraction      | Move data-agnostic helpers out of legacy modules without changing behavior or adding v6/v7 adapters.                                         | Extracted modules have no v6 deck/element type dependency.      |
| 3     | Migrate vNext imports         | Update vNext present/public/editor/filmstrip code to consume the shared kernel or vNext-local helpers.                                       | No `presentation-vnext` file imports legacy presentation paths. |
| 4     | Migrate document/export paths | Move hash/source helpers and export fallback contracts into document, visual, or vNext modules.                                              | AI/document/export tests pass without legacy imports.           |
| 5     | Close entrypoints             | Route editor/open/presenter buttons to vNext or the explicitly named fallback mode.                                                          | No implicit legacy entrypoint remains.                          |
| 6     | Delete legacy surface         | Delete v6-only components/lib files in reviewable batches; update docs and inventories in the same PR.                                       | Deletion gates below pass.                                      |

## Deletion gates

- [ ] Product confirms no implicit v6 fallback route is supported.
- [ ] Import search finds no production imports from legacy modules outside an
      explicitly retained shared-kernel package.
- [ ] vNext opens, edits, presents, publicly renders, and exports DeckV7 without
      v6 deck or element types.
- [ ] Persisted deck open/validation still rejects superseded payloads at the
      boundary instead of adding runtime conversion paths.
- [ ] Presentation docs and README entries no longer refer to the deleted
      surface as current behavior.
- [ ] Focused presentation, public-render, visual/export, and document-generation
      tests pass for migrated slices.

## Verification

Suggested import search before each phase:

```bash
rg -n "from ['\"]@/(lib|components)/presentation(/|['\"])" src --glob "*.{ts,tsx}" --glob "!**/*.test.*"
```

Smallest practical checks by slice:

```bash
npx prettier --write <touched files>
npx eslint <touched lintable files>
npm run test:presentation
npm run test:public-render
npm run test:visual
npm run test:documents
npm run typecheck
```

Run only the subsystem checks relevant to the moved imports first. Use
`npm run typecheck` for shared-kernel moves because import boundaries and public
types are the main risk.
