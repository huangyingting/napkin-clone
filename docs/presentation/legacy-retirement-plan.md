---
type: "plan"
status: "active — deletion blocked by product decision"
last_updated: "2026-07-02"
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
nearby product paths previously imported useful helpers from it. Several helpers
have now moved to shared modules and are no longer legacy debt. The remaining
load-bearing imports are legacy contracts, fallback export/document paths, and
entrypoint glue that should either become owned non-legacy APIs or be deleted
with the v6 surface after product closes the fallback decision.

## Import inventory model

Use this model as the retirement checklist. Re-run an import search before each
deletion phase because the exact list will drift.

| Bucket                           | What belongs here                                                                                                                                                                                                                    | Retirement direction                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migrated shared helpers          | Imports from `src/lib/presentation-shared/**`, `src/components/presentation-shared/**`, and `src/lib/a11y/use-focus-trap.ts`. These are canonical shared modules, not legacy imports.                                                | Keep as the shared kernel. They may be used by vNext and the legacy surface while deletion is blocked.                                                                |
| Canonical legacy imports         | Imports from `@/lib/presentation/**` or `@/components/presentation/**` inside the legacy tree itself, plus the external residuals inventoried below while they still represent v6 deck, patch, theme, export, or fallback contracts. | Do not treat as migrated shared helpers. Move only pure, data-agnostic contracts to owned non-legacy modules; otherwise delete with the legacy surface.               |
| Product-gated legacy surface     | `src/components/presentation/**` and v6-specific `src/lib/presentation/**` modules that are only needed if a user-facing v6 fallback remains supported.                                                                              | Delete after external imports are gone and product confirms no implicit fallback route remains; if fallback stays, name it as a supported product mode with an owner. |
| vNext production import boundary | `src/components/presentation-vnext/**` and `src/lib/presentation-vnext/**`.                                                                                                                                                          | Keep at zero production imports from legacy presentation paths; only boundary tests may reference legacy constants while rejection coverage exists.                   |

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

## Import inventory update — 2026-07-02

### Migrated shared helpers

These are complete migrations and should remain the canonical shared imports:

| Helper                                                                                             | Current consumers                                                                             | Status                                                                 |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/lib/presentation-shared/slide-format.ts`                                                      | Legacy render/export modules, present/public viewers, vNext-compatible helpers                | Shared slide geometry/format kernel; not a residual legacy dependency. |
| `src/lib/presentation-shared/slide-reorder.ts`                                                     | vNext filmstrip drag/reorder and legacy slide rail                                            | Shared reorder math.                                                   |
| `src/lib/a11y/use-focus-trap.ts`                                                                   | vNext editor, editor entrypoints, and legacy shell                                            | Shared accessibility helper.                                           |
| `src/lib/presentation-shared/save-status.ts`                                                       | vNext editor types, editor entrypoints, and legacy autosave UI                                | Shared save-state language.                                            |
| `src/lib/presentation-shared/slide-autosave-scheduler.ts`                                          | vNext slides route and editor open controls                                                   | Shared autosave debounce scheduler.                                    |
| `src/lib/presentation-shared/canvas-keyboard-rotate.ts`                                            | vNext canvas keyboard handling and legacy keyboard controller                                 | Shared keyboard-rotate mapping.                                        |
| `src/lib/presentation-shared/use-slide-presence.ts`                                                | vNext editor and editor open controls                                                         | Shared presence awareness hook.                                        |
| `src/components/presentation-shared/keyboard-shortcut-help-dialog.tsx`                             | vNext and legacy shortcut help surfaces                                                       | Shared UI component.                                                   |
| `src/lib/presentation-shared/document-block-hash.ts` and `src/lib/presentation-shared/fnv-hash.ts` | vNext document source planning, editor source links, and legacy derivation/source-link checks | Shared source/provenance hashing.                                      |

### Current residual legacy import inventory

Current production vNext source has **zero** imports from
`@/lib/presentation/**` or `@/components/presentation/**`. Boundary tests still
reference `@/lib/presentation/deck` to assert superseded payload rejection.

External non-test app/library source still has **42** legacy path references.
`src/test` helpers add **3** test-support files. Legacy-internal imports
within `src/components/presentation/**` and `src/lib/presentation/**` are
canonical to the blocked v6 surface and are not counted below.

| Residual area               | Count | Importing files                                                                                                                                                                                                                                                                      | Legacy modules                                                                                   | Recommended next decision                                                                                                                                         |
| --------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI/deck generation          | 8     | `src/app/api/generate-deck/parser.ts`, `src/app/api/generate-deck/route-logic.ts`, `src/lib/ai/deck-generation-request.ts`, `src/lib/ai/deck-metrics.ts`, `src/lib/ai/deck-source.ts`, `src/lib/ai/use-deck-generation.ts`                                                           | `theme-packages`, `deck`, `deck-schema`, `deck-diff`                                             | Move theme IDs/defaults and metrics/source utilities to document or vNext contracts, or mark them legacy-only until fallback deletion.                            |
| Editor/document entrypoints | 7     | `src/app/app/documents/[id]/deck-actions.ts`, `src/app/app/documents/[id]/slides/slide-editor-route-client.tsx`, `src/components/editor/document-export-button.tsx`, `src/components/editor/slide-editor-open-dialog.tsx`, `src/components/editor/use-slide-editor-open.ts`          | `slide-commands`, `theme-packages`, `slide-font-loading`, `export/deck-export`                   | Product must decide whether these routes keep a named legacy mode. If not, route to vNext-only APIs and delete v6 export/theme entrypoints.                       |
| Command/action contracts    | 6     | `src/lib/action-ports.ts`, `src/lib/commands/command-envelope-validation.ts`, `src/lib/commands/command-result-helpers.ts`, `src/lib/commands/visual-command-contracts.ts`, `src/lib/commands/visual-commands.ts`                                                                    | `deck`, `slide-commands`, `slide-command-contracts`, `slide-command-metadata`                    | Decide whether `DeckPatch`/command metadata becomes an owned command contract or remains legacy-only until deletion; do not create a v6-to-v7 compatibility path. |
| Comments anchors            | 3     | `src/lib/comments/anchors.ts`, `src/lib/comments/lifecycle.ts`, `src/lib/comments/service.ts`                                                                                                                                                                                        | `slide-comment-anchors`                                                                          | If comments must support DeckV7, move anchor contracts into comments/document ownership; otherwise delete with legacy comments integration.                       |
| Document persistence/model  | 10    | `src/lib/content/document-blocks.ts`, `src/lib/document/deck-cas-writer.ts`, `src/lib/document/duplicate.ts`, `src/lib/document/persistence/deck.ts`, `src/lib/document/persistence/versioning.ts`, `src/lib/document/persistence/visual.ts`, `src/lib/document/source-ref-model.ts` | `deck-elements`, `deck-revision-token`, `deck-schema`, `deck`, `slide-commands`, `strip-orphans` | Split persisted legacy validation/archive support from current DeckV7 persistence; keep only explicit archive/fallback code after the product decision.           |
| Visual/export fallback      | 8     | `src/lib/visual/deck-export-context.ts`, `src/lib/visual/deck-fallback-ops.ts`, `src/lib/visual/export-preflight.ts`, `src/lib/visual/presentation-visual-theme-bridge.ts`                                                                                                           | `deck`, `fresh-deck`, `image-element`, `presentation-theme`, `slide-fonts`                       | Complete DeckV7 export ownership or name the v6 export fallback as supported. Do not retain implicit fallback helpers after the deletion gate closes.             |
| Test helpers                | 3     | `src/test/builders/comments.ts`, `src/test/builders/deck.ts`, `src/test/deck-export-helpers.ts`                                                                                                                                                                                      | `slide-comment-anchors`, `deck`, `export/deck-export-pptx`                                       | Migrate or delete with the production area they support; they are not product blockers by themselves.                                                             |

### Recommended next decisions

1. Record the product fallback answer. The recommended decision remains
   retirement: no implicit v6 editor, presenter, public viewer, export, or deck
   fallback route.
2. Preserve the vNext import boundary as a hard gate. Production
   `presentation-vnext` code is already clean; new imports from legacy
   presentation modules should fail review.
3. Assign an owner to each residual area above. If an import represents current
   behavior, move it to a document, command, visual, comment, or vNext-owned API.
   If it only supports fallback behavior, keep it canonical legacy until the
   product gate closes and delete it with the v6 surface.
4. Do not create v6-to-v7 compatibility layers while resolving residuals. The
   allowed outcomes are shared data-agnostic helpers, current DeckV7 APIs, a
   named supported legacy mode, or deletion.

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

These gates are not all unchecked engineering work. Legacy surface deletion is
blocked until product confirms the fallback policy, and the remaining deletion
checks are deferred until that decision and import cleanup are complete.

| Gate                                                                                                           | Status                              | Notes                                                                               |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------- |
| Product confirms no implicit v6 fallback route is supported.                                                   | Blocked — product decision required | Do not delete the legacy surface until the fallback policy is recorded.             |
| Import search finds no production imports from legacy modules outside an explicitly retained shared kernel.    | Deferred                            | 42 external non-test app/library legacy path references still remain outside vNext. |
| vNext opens, edits, presents, publicly renders, and exports DeckV7 without v6 deck or element types.           | Deferred                            | Production vNext imports are clean; export, entrypoint, and fallback paths remain.  |
| Persisted deck open/validation rejects superseded payloads at the boundary instead of adding conversion paths. | Done                                | `open-deck.ts` rejects non-v7 payloads through the DeckV7 validation boundary.      |
| Presentation docs and README entries no longer refer to the deleted surface as current behavior.               | Deferred                            | Update with the actual deletion PR so docs match the removed files.                 |
| Focused presentation, public-render, visual/export, and document-generation tests pass for migrated slices.    | Deferred                            | Run when the deletion slice is executable; not a current blocker for planning docs. |

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
