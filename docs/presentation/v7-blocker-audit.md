# V7 vNext Runtime Blocker Audit (V7-003)

**Status:** Audit complete  
**Last updated:** 2026-06-30  
**Tracking issue:** [#1224](https://github.com/) (V7-003) — parent epic #1211 (V7-E00)  
**Source matrix:** [v7-slide-editor-implementation-plan.md](v7-slide-editor-implementation-plan.md) — section "V7.0 Legacy Replacement Release Scope" → "Release Blocker Matrix"  
**Issue backlog:** [v7-slide-editor-github-issues.md](v7-slide-editor-github-issues.md)

This document audits the current `presentation-vnext` (v7) runtime against every
required-behavior row of the Release Blocker Matrix and maps each matrix area to
its GitHub child issues (V7-004..V7-064 = #1225..#1285). It is the execution
guide for the rest of the v7.0 legacy-replacement release.

## Status Vocabulary

| Status                | Meaning                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| **implemented**       | Runtime behavior present and complete. Cited with `file:line` anchors.                           |
| **partial**           | Exists but has a concrete, cited gap.                                                            |
| **missing**           | No runtime implementation. Cited with the expected primary surface (where the work should land). |
| **verification-gate** | Runtime present but tests / evidence missing. Counted as a release risk, not a feature gap.      |

Per-issue dispositions use: `implemented → verify` (needs verification only),
`partial → gap: <what>`, or `missing → build: <what>`.

## Method And Grounding

Every status below was determined by reading the real runtime, not the docs. The
audit opened the boundary, validation, migration, diagnostics, source-link,
chrome/theme, asset, stage, render, and export surfaces under
`src/lib/presentation-vnext/`, `src/components/presentation-vnext/`,
`src/components/editor/`, `src/lib/slides/`, `src/lib/presentation/`,
`src/lib/document/`, `src/lib/public-render/`, and `prototypes/slide-themes/`.

Key structural facts confirmed directly:

- The v7 editor is already the **only** editor; there is no feature flag selecting
  v6 vs v7. `src/components/editor/use-slide-editor-open.ts:7` ("Development builds
  support only DeckV7 at runtime") and `src/components/editor/slide-editor-button.tsx`
  unconditionally render `SlideEditorVNext` once a `DeckV7` is open.
- The diagnostic model (`src/lib/presentation-vnext/diagnostics.ts:10-54`) has 22
  codes, 4 severities, 7 actions, and per-diagnostic `nodeId`/`slideId`/`path`, but
  **no scope/grouping field** and **no `stale-source`/`orphaned-source` codes**.
- `DeckV7` (`src/lib/presentation-vnext/schema.ts:504-514`) has **no deck-level
  chrome** (logo/footer/page-number/watermark/border); the only chrome field is the
  slide-level enum `SlideProps.chrome?: "default" | "minimal" | "none"` (`schema.ts:488`).
- `NodeSourcePanel` (`src/components/presentation-vnext/inspector/node-source-panel.tsx:31-37`)
  **displays stored source metadata only**; it never computes freshness against a
  live host block index.

## Executive Summary

| Epic | Area                                      | Issues      | Overall              |
| ---- | ----------------------------------------- | ----------- | -------------------- |
| E01  | Open / Migration / Persistence / Recovery | #1225–#1230 | mostly implemented   |
| E02  | Diagnostics & Repair UX                   | #1231–#1234 | partial              |
| E03  | Source-Link Replacement                   | #1235–#1241 | mostly missing       |
| E04  | Deck Chrome Replacement                   | #1242–#1247 | mostly missing       |
| E05  | Durable Image / Visual Asset Workflow     | #1248–#1254 | mostly implemented   |
| E06  | Professional Stage Interaction Parity     | #1255–#1261 | partial (large gaps) |
| E07  | Template & Theme Authoring                | #1262–#1267 | partial              |
| E08  | Render / Present / Public / Export        | #1268–#1273 | mostly implemented   |
| E09  | Reliability / Collab / Presence / Anchors | #1274–#1277 | partial              |
| E10  | Verification Gates                        | #1278–#1285 | verification-gate    |

The two structurally absent areas are **Source-Link (E03)** and **Deck Chrome
(E04)** — both need foundation schema/runtime before their child issues can close.
The boundary (E01), assets (E05), and render/export (E08) areas are largely
present and primarily need verification plus targeted gap-fills. Stage interaction
(E06) has strong selection/drag/resize/snap but is missing three legacy direct-
manipulation affordances (group entry/exit, rotation handle, connector endpoint
drag).

---

## E01 — Open, Migration, Persistence, And Recovery (#1225–#1230)

### Required-behavior status

| #   | Required behavior                                                                 | Status          | Anchors / gap                                                                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Valid `DeckV7` opens unchanged, preserving deck/slide/node/asset/source/theme ids | **implemented** | `open-deck.ts:65-68` routes `schemaVersion===7` straight to `safeParseDeckV7`; duplicate-id checks in `validation.ts`; no field mutation                                                                                                                                         |
| 2   | Migratable v6 JSON opens via one-time migration, saved only as valid v7           | **partial**     | `open-deck.ts:78-93` + `migration-v6.ts:585-673` migrate once and re-validate via `safeParseDeckV7` (`migration-v6.ts:645`). Gap: `cleanId` (`migration-v6.ts:108-125`) may rename an illegal/colliding v6 id with **no exported old→new id map**, so anchors cannot be remapped |
| 3   | Non-empty invalid JSON opens a visible recovery state; never a silent blank deck  | **implemented** | `use-slide-editor-open.ts:186-203` sets `deckOpenErrorV7` without `deckV7`; `slide-editor-button.tsx:425-434` renders `SlideEditorOpenRecovery` (error + diagnostics + collapsible validation errors)                                                                            |
| 4   | All save paths validate with `safeParseDeckV7` before persistence                 | **implemented** | `deck-cas-writer.ts:36-44` calls `safeParseDeckV7` and returns `ok:false` with zero DB calls on failure; `deck.ts:41` delegates to it                                                                                                                                            |
| 5   | Manual save flushes pending autosave before reporting success                     | **implemented** | `use-slide-editor-open.ts:291-304` clears the autosave timer then awaits `saveDeckJson` before reporting                                                                                                                                                                         |
| 6   | CAS conflicts surface v7 recovery with keep-mine / use-theirs / dismiss           | **implemented** | `use-slide-editor-open.ts:321-333,446-504` + `conflict-recovery-dialog-v7.tsx:35-143`                                                                                                                                                                                            |
| 7   | Undo/redo applies to committed v7 command state, not just selection               | **partial**     | `use-slide-editor-open.ts:360-398` keeps 50-item deck snapshots + autosave, but `onUndo`/`onRedo` are `() => void` (`slide-editor-vnext.tsx:253-254`) with **no slide/node focus restoration**                                                                                   |

### Child-issue dispositions

| Issue                                              | Disposition                                                  | Note (anchors)                                                                                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1225 V7-004 — `openDeckFromJson` as only boundary | **partial → gap:** AI-apply path bypasses boundary           | `openWithAiDeckV7` calls `finishOpenV7(aiDeck)` directly with no `safeParseDeckV7` (`use-slide-editor-open.ts:205-215`); all other paths use `openDeckFromJson` |
| #1226 V7-005 — identity & migration mappings       | **partial → gap:** no v6→v7 id-map artifact                  | v7 ids pass through; `cleanId` can rename without recording (`migration-v6.ts:108-125,585-673`) — needed by anchors #1274                                       |
| #1227 V7-006 — invalid non-empty recovery          | **implemented → verify**                                     | `SlideEditorOpenRecovery` (`slide-editor-button.tsx:425-434`)                                                                                                   |
| #1228 V7-007 — validate before save/autosave       | **implemented → verify**                                     | `deck-cas-writer.ts:36-44`; autosave/manual/conflict re-save all route through it                                                                               |
| #1229 V7-008 — manual save flush + CAS recovery    | **implemented → verify**                                     | `use-slide-editor-open.ts:291-504`, `conflict-recovery-dialog-v7.tsx`                                                                                           |
| #1230 V7-009 — undo/redo + focus restoration       | **partial → gap:** focus/selection not restored on undo/redo | `use-slide-editor-open.ts:374-398`, `slide-editor-vnext.tsx:253-254`                                                                                            |

**Overlap with existing code:** #1227/#1228/#1229 are essentially complete runtime;
new issues should be scoped to tests/hardening, not re-implementation.

---

## E02 — Diagnostics And Repair UX (#1231–#1234)

### Required-behavior status

| #   | Required behavior                                                                                                                                   | Status          | Anchors / gap                                                                                                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Grouped by slide/node/deck scope; distinguish error/warning/unsupported-export/missing-asset/stale-source/unknown-style-ref/missing-theme/migration | **partial**     | Model has `nodeId`/`slideId`/`path` + 22 codes (`diagnostics.ts:10-54`) but **no scope enum or grouping fn**; panel sorts by severity only (`diagnostics-panel.tsx:94-99`); **no `stale-source`/`orphaned-source`/migration-repair codes** |
| 2   | Each diagnostic provides a repair action, points to the object, or is informational                                                                 | **partial**     | `action` + buttons exist (`diagnostics-panel.tsx:138-145`); `repair-ai-plan` (`diagnostics.ts:41`) is rendered but **falls through unhandled** in `handleDiagnosticAction` (`slide-editor-vnext.tsx:2247`)                                 |
| 3   | Reachable from inspector AND a deck-level review surface                                                                                            | **partial**     | Inspector tab present (`inspector-shell.tsx:1202-1210`, count badge); **no deck-level review surface exists**                                                                                                                              |
| 4   | Applying an action mutates via v7 commands and revalidates                                                                                          | **implemented** | `slide-editor-vnext.tsx:2249-2308` maps 6/7 actions to v7 commands; re-resolve via `useDeckV7RenderTree` (`:1553`) — revalidation is implicit (no explicit `revalidate()`)                                                                 |
| 5   | Diagnostics not swallowed by present/public/export                                                                                                  | **implemented** | `export-spec.ts:117-122,314-316`; `open-deck.ts:19-33` always returns diagnostics; `dedupeDiagnostics` aggregates boundary+render+export (`slide-editor-vnext.tsx:1556-1567`)                                                              |

### Child-issue dispositions

| Issue                                                                           | Disposition                                                                  | Note (anchors)                                                                                                                            |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| #1231 V7-010 — shared target/severity/action/grouping model                     | **partial → gap:** add scope/grouping + missing codes                        | `diagnostics.ts:10-79` lacks `DiagnosticTargetScope` and grouping fn                                                                      |
| #1232 V7-011 — deck-level diagnostics routing + review entry points             | **missing → build:** deck-level review surface                               | only the inspector tab exists; expected new surface e.g. `src/components/presentation-vnext/deck-diagnostics-review.tsx`                  |
| #1233 V7-012 — repair actions command-backed + revalidation-safe                | **partial → gap:** `repair-ai-plan` handler missing; add explicit revalidate | `slide-editor-vnext.tsx:2247-2308`                                                                                                        |
| #1234 V7-013 — integrate migration/source/asset/theme/render/export diagnostics | **partial → gap:** source-link diagnostics absent                            | migration/asset/render/export wired; **no source codes emitted** (`diagnostics.ts:10-32`, `render-resolver.ts` never reads `node.source`) |

---

## E03 — Source-Link Replacement (#1235–#1241)

This is the **least-implemented blocker area in v7**. A v1 (legacy) staleness
engine exists (`src/lib/presentation/source-link-staleness.ts`,
`document-block-hash.ts`) but targets the old `Deck` type. The v7 editor stores
source metadata and lets the user hand-edit it, but does **not** compute
freshness, has **no host block index**, and has **no deck-level review**.

### Required-behavior status

| #   | Required behavior                                                                   | Status      | Anchors / gap                                                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Node stores source metadata (block id, doc context, kind, last hash, refresh state) | **partial** | `NodeSourceMetadata` (`schema.ts:147-155`) on `BaseNode` (`schema.ts:371`) has `documentId`/`blockId`/`blockKind`/`contentHash`/`linkedAt`/`unlinked`; **no `lastRefreshState`/`revision`/display identity** |
| 2   | Host provides a current block index (id, normalized content, kind, hash, payloads)  | **missing** | No `DocumentBlockIndex` type; no `blockIndex` prop on `SlideEditorVNextProps`; nothing wired in `slide-editor-button.tsx`. Expected: `src/lib/presentation-vnext/block-index.ts`                             |
| 3   | Node is **fresh** when stored hash matches host hash and block exists               | **missing** | No v7 classifier; `node-source-panel.tsx:31-37` derives status only from `documentId`/`unlinked`                                                                                                             |
| 4   | Node is **stale** when block exists but hash changed                                | **missing** | v1-only (`source-link-staleness.ts:62-64`); no v7 equivalent; no `stale-source` code                                                                                                                         |
| 5   | Node is **orphaned** when block id cannot be resolved                               | **missing** | v1-only (`source-link-staleness.ts:63-64`); no `orphaned-source` code                                                                                                                                        |
| 6   | Cross-document refresh uses explicit host fetch; no silent relink                   | **partial** | `handleRefreshSelectedSource` calls `onRefreshSource` (`slide-editor-vnext.tsx:2024-2053`); **no `sourceDocumentId` mismatch guard**                                                                         |
| 7   | Source inspector shows fresh/stale/orphan/unlinked for selected node                | **partial** | **Display-only**: shows Standalone/Unlinked/Linked/Draft-link from stored fields; never compares hashes (`node-source-panel.tsx:31-37,56-67`)                                                                |
| 8   | Selected node can refresh / unlink / relink via explicit actions                    | **partial** | Buttons exist but go through generic `updateNodeSourceMetadata` (`editor-commands.ts:519`); relink just flips `unlinked:false` (`node-source-panel.tsx:121-162`)                                             |
| 9   | Relink review shows enough block identity to avoid wrong content                    | **missing** | Relink is a single flag flip with no block title/snippet/candidate list (`node-source-panel.tsx:151-162`)                                                                                                    |
| 10  | Deck-level Source Review lists all stale/orphaned nodes by slide/state              | **missing** | No component; expected `src/components/presentation-vnext/deck-source-review.tsx`                                                                                                                            |
| 11  | Deck actions: refresh-all-safe, resolve one-by-one, mark unlinked, dismiss          | **missing** | No bulk source logic in `editor-commands.ts`                                                                                                                                                                 |
| 12  | Source diagnostics feed the shared diagnostics surface                              | **missing** | No source codes; `render-resolver.ts` never reads `node.source`                                                                                                                                              |

### Child-issue dispositions

| Issue                                                       | Disposition                                                           | Note (anchors)                                                                                                         |
| ----------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| #1235 V7-014 — source metadata + migration mapping contract | **partial → gap:** add `lastRefreshState`/revision; migrate v6 source | `schema.ts:147-155`; `migration-v6.ts` does not transfer a `source` field                                              |
| #1236 V7-015 — host block index + hash plumbing             | **missing → build:** `DocumentBlockIndex` type + editor prop          | expected `src/lib/presentation-vnext/block-index.ts`; wire in `slide-editor-button.tsx`                                |
| #1237 V7-016 — fresh/stale/orphan classification for v7     | **missing → build:** v7 staleness module                              | expected `src/lib/presentation-vnext/source-staleness.ts` (port from `source-link-staleness.ts`, retarget to `DeckV7`) |
| #1238 V7-017 — refresh/unlink/relink commands               | **partial → gap:** dedicated v7 commands + block-pick relink          | `editor-commands.ts:519`, `node-source-panel.tsx`                                                                      |
| #1239 V7-018 — deck-level Source Review UI                  | **missing → build:** `deck-source-review.tsx`                         | absent                                                                                                                 |
| #1240 V7-019 — refresh-all / resolve / safe-skip            | **missing → build:** bulk resolution behavior                         | absent in `editor-commands.ts`                                                                                         |
| #1241 V7-020 — source-link migration + review tests         | **missing → build:** v7 source tests                                  | only v1 `source-link-staleness.test.ts` exists                                                                         |

**Overlap with existing code:** the v1 `source-link-staleness.ts` /
`document-block-hash.ts` engine and its 716-line test are a **port target**, not a
reuse — #1237 should adapt that logic to `DeckV7`, not start from scratch.

---

## E04 — Deck Chrome Replacement (#1242–#1247)

Deck-level chrome (logo / footer / page number / watermark / border / safe-area)
**does not exist in the v7 schema**. The nearest mechanisms are theme-package
**decorations** (which do flow through the render tree) and the slide-level
`SlideProps.chrome` visibility enum. The whole area needs schema foundation first.

### Required-behavior status

| #   | Required behavior                                                                         | Status          | Anchors / gap                                                                                                                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Configure deck-level logo/footer/page-number/watermark/border/safe-area                   | **missing**     | `DeckV7` (`schema.ts:504-514`) has no chrome fields; only `SlideProps.chrome` enum (`schema.ts:488`)                                                                                                                                                                                                                                   |
| 2   | Deck chrome applies to all slides unless overridden/disabled/detached                     | **missing**     | Only theme-decoration propagation exists (`render-resolver.ts:279-358`), not deck chrome                                                                                                                                                                                                                                               |
| 3   | Slide overrides don't rewrite the deck theme or semantic tree                             | **implemented** | `updateSlideControls`/`updateSlideLocalStyle` per-slide; `setThemePackage` touches only `deck.theme` (`editor-commands.ts:303-388`)                                                                                                                                                                                                    |
| 4   | Theme decorations and deck chrome coexist without z-order/hit-test/layer/export ambiguity | **partial**     | Decorations land in a dedicated `decorations` array with `source:"themeDecoration"` (`render-resolver.ts:354,391-397`); deck-chrome coexistence is moot until chrome exists                                                                                                                                                            |
| 5   | Layers mode exposes decorations/chrome and allows detach/disable                          | **partial**     | `detachDecoration` (`editor-commands.ts:734-758`) **bug:** appends a node but never adds the id to `theme.overrides.disabledDecorations`, so the recipe still renders (double-render); `LayersPanel` only lists `SlideChildNode[]` (`layers-panel.tsx:9`), so live decorations are invisible until detached; no disable-without-detach |
| 6   | Editor/thumbnails/present/public/HTML/PPTX render the same chrome intent                  | **partial**     | All surfaces consume one render tree for decorations (`render-resolver.ts:448-470`); deck-chrome parity unverifiable until chrome exists                                                                                                                                                                                               |

### Child-issue dispositions

| Issue                                                       | Disposition                                                                                 | Note (anchors)                                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| #1242 V7-021 — deck chrome schema + theme override contract | **missing → build:** add `DeckV7` chrome schema                                             | `schema.ts:504-514`; `DeckThemeBinding.overrides.disabledDecorations` (`schema.ts:103`) covers decoration ids only |
| #1243 V7-022 — render chrome + decorations via render tree  | **partial → gap:** decorations render; deck-chrome render nodes absent                      | `render-resolver.ts:271-358`                                                                                       |
| #1244 V7-023 — deck chrome editor + slide override controls | **partial → gap:** slide chrome/decoration selects exist; no deck-level chrome controls     | `slide-controls-panel.tsx:189-202`, `slide-settings-panel.tsx:102-252`                                             |
| #1245 V7-024 — chrome/decorations in layers mode            | **partial → gap:** fix `detachDecoration` disabledDecorations bug; surface live decorations | `editor-commands.ts:752-758`, `layers-panel.tsx:9`                                                                 |
| #1246 V7-025 — chrome PPTX/public/present parity            | **partial → gap:** decoration parity ok; no deck-chrome to verify                           | `pptx-export-adapter.ts`, single render tree                                                                       |
| #1247 V7-026 — migrate v6 master chrome intent              | **missing → build:** read v6 master chrome in migration                                     | `themeFromLegacy` reads only `design.themeId` (`migration-v6.ts:566-572`); masters dropped                         |

---

## E05 — Durable Image And Visual Asset Workflow (#1248–#1254)

The **image** path is essentially complete (protected upload, normalized asset
registry, replace/fit/crop/alt, on-stage crop handles, missing-asset diagnostics,
orphan lifecycle). The **visual** path is the gap: host-picker-only, and
`channelColors` is authored but never consumed by any renderer or export adapter.

### Required-behavior status

| #   | Required behavior                                                   | Status          | Anchors / gap                                                                                                                                                                          |
| --- | ------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Image insert/replace use a protected upload action                  | **implemented** | `onUploadImage` prop + hidden file input (`slide-editor-vnext.tsx:255,1177,2416`); server action gated by `requireDocumentActionContext(..,"edit")`                                    |
| 2   | Uploaded assets normalized into `DeckV7.assets.images`              | **implemented** | `ImageAsset` `id/src/alt/widthPx/heightPx/mimeType/contentHash/origin` (`schema.ts:50-59`); written at `slide-editor-vnext.tsx:1199-1214`                                              |
| 3   | Replace / fit / crop / alt + on-stage crop handles                  | **implemented** | `node-content-panel.tsx:249-320`; crop drag `slide-editor-vnext.tsx:1488-1541`; handles `slide-canvas.tsx:436-468`                                                                     |
| 4   | Same asset id resolves across editor/thumbnails/present/public/PPTX | **partial**     | `resolveDeckAsset` reads `images`+`files` but **not `visuals`** (`slide-editor-vnext.tsx:1603-1607`)                                                                                   |
| 5   | Missing/unauthorized assets produce diagnostics + repair            | **implemented** | `render-resolver.ts:80-97` emits `missing-asset` with `open-asset-panel`; handled `slide-editor-vnext.tsx:2270-2284`                                                                   |
| 6   | Choose visuals from a document registry or host picker              | **partial**     | `onPickVisual` host callback only (`slide-editor-vnext.tsx:256,1246`); no built-in registry browser                                                                                    |
| 7   | Replace a visual without losing layout/source/local style           | **partial**     | Patch limited to `{visualId,assetId,alt}`, rest preserved (`slide-editor-vnext.tsx:1254-1262`); requires host picker                                                                   |
| 8   | `VisualStyle.channelColors` interpreted by renderers/export         | **partial**     | Schema + inspector exist (`style-schema.ts:175-179`, `local-style-panel.tsx:389-422`) but `VisualNodeContent` never receives them (`slide-node-renderer.tsx:904-911`); PPTX omits them |
| 9   | Unsupported channel overrides produce diagnostics                   | **missing**     | No diagnostic anywhere; silently ignored. Expected: `render-resolver.ts`                                                                                                               |
| 10  | Visual assets resolve in public/export under image rules            | **partial**     | Access policy uniform (`asset-access.ts:91-128`); `resolveDeckAsset` doesn't resolve `visuals`                                                                                         |
| 11  | Deleting/replacing leaves orphan refs detectable                    | **implemented** | `collectDeckAssetRefs` walks bg + elements (`asset-orphan.ts:58-85`); gap: doesn't walk `assets.visuals`                                                                               |
| 12  | Immediate or documented background cleanup path                     | **implemented** | `ASSET_RETENTION_MS=7d`, `markOrphanedAssets`, `purgeExpiredAssets` (`asset-orphan.ts:43,146,206`)                                                                                     |
| 13  | Cleanup must not delete still-referenced assets                     | **implemented** | Scans `Document` + all `DocumentVersion` deckJson (`asset-orphan.ts:154-175`); gap: visuals not scanned                                                                                |

### Child-issue dispositions

| Issue                                                         | Disposition                                                                    | Note (anchors)                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| #1248 V7-027 — durable image upload wiring                    | **implemented → verify**                                                       | `slide-editor-vnext.tsx:1177-1235`, slide-asset server action   |
| #1249 V7-028 — normalize `assets.images` + resolver           | **implemented → verify**                                                       | `schema.ts:50-59`, `asset-resolver.ts:79-171`                   |
| #1250 V7-029 — replace/fit/crop/alt/diag/export               | **partial → gap:** add crop-reset; verify export parity                        | `node-content-panel.tsx:258-320`, `slide-editor-vnext.tsx:1488` |
| #1251 V7-030 — host visual picker + replacement               | **partial → gap:** built-in document visual registry picker                    | `slide-editor-vnext.tsx:256,1246`                               |
| #1252 V7-031 — visual channel colors render/export + diagnose | **missing → build:** consume `channelColors` in renderer+PPTX; emit diagnostic | `slide-node-renderer.tsx:904`, `pptx-export-adapter.ts:460-485` |
| #1253 V7-032 — orphan detection + cleanup                     | **implemented → verify**                                                       | `asset-orphan.ts:146,206`; gap: scan `assets.visuals`           |
| #1254 V7-033 — protected public asset resolution              | **implemented → verify**                                                       | `asset-access.ts:91-128`; route test exists                     |

---

## E06 — Professional Stage Interaction Parity (#1255–#1261)

Core direct manipulation (selection, hover preselect, marquee, multi-select
bounds, resize, drag, snap, nudge, z-order, duplicate, delete, copy/paste,
group/ungroup) is **implemented**. Three legacy affordances are **missing on the
stage**: group entry/exit, rotation handle, and connector endpoint drag. Table and
crop are partial.

### Required-behavior status

| #   | Required behavior                                                                                 | Status          | Anchors / gap                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Select/hover/marquee/multi-bounds/resize/drag/nudge/snap/z-order/dup/del/copy/paste/group/ungroup | **implemented** | `selection-model.ts:92-138`; marquee `slide-editor-vnext.tsx:1438-1486`; resize `:1676-1728`; snap `:1645-1657` + `stage-guides.ts`; nudge `:1821-1866`; z-order/dup/del/copy/paste/group `:1799-1900`      |
| 2   | Group member direct editing + visible entry/exit                                                  | **missing**     | No `activeGroupId`; `handleNodeDoubleClick` only enters text/shape edit (`slide-editor-vnext.tsx:1374-1383`). Expected: group state in `slide-editor-vnext.tsx` + boundary chrome in `slide-canvas.tsx`     |
| 3   | Stage rotation handle for rotatable nodes                                                         | **missing**     | No rotation handle in `slide-canvas.tsx` (confirmed: zero `rotat*` matches); only inspector field (`node-geometry-panel.tsx:117-123`); `LayoutBox.rotation` exists (`schema.ts:128`)                        |
| 4   | Connector endpoint drag/snap + binding lifecycle                                                  | **missing**     | No endpoint drag in `slide-canvas.tsx`; only form fields (`node-content-panel.tsx:646-762`); endpoints stored as node refs (`schema.ts:297-300`) but no live re-bind                                        |
| 5   | Connector routing/arrowheads/dash/color/width editable                                            | **implemented** | `context-toolbar.tsx:839-908`, `local-style-panel.tsx:244-354`, routing `node-content-panel.tsx:630-643`; render `slide-node-renderer.tsx:592-683` (gap: no drag-to-reroute)                                |
| 6   | Table cell-level editing directly on stage / equally immediate                                    | **partial**     | Inspector cell inputs (`node-content-panel.tsx:396-422`); `handleNodeDoubleClick` skips `table`; no on-stage editor                                                                                         |
| 7   | Row/col insert-delete, header, caption, alt-rows, per-cell                                        | **partial**     | All present except **alternating rows** (no field in `TableContent`, `schema.ts:310-331`)                                                                                                                   |
| 8   | Image crop handles drag + reset                                                                   | **partial**     | Drag implemented (`slide-editor-vnext.tsx:1488-1541`); **no crop reset** (confirmed) and no crop diagnostics                                                                                                |
| 9   | Locked/hidden consistent across pointer/keyboard/inspector/toolbar/layers                         | **implemented** | Locked skipped in drag/resize/crop/move (`editor-commands.ts:549`, `slide-editor-vnext.tsx:1495,1625,1683`); hidden excluded from render (`render-resolver.ts:68`); gap: context toolbar has no lock/unlock |

### Child-issue dispositions

| Issue                                                  | Disposition                                                             | Note (anchors)                                                      |
| ------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------- |
| #1255 V7-034 — group member direct edit + entry/exit   | **missing → build:** group entry/exit state + boundary chrome           | `slide-editor-vnext.tsx:1374-1383`, `slide-canvas.tsx`              |
| #1256 V7-035 — rotation handle + command plumbing      | **missing → build:** stage rotation handle                              | `slide-canvas.tsx`, `slide-editor-vnext.tsx`; `schema.ts:128` ready |
| #1257 V7-036 — connector endpoint drag/snap/binding    | **missing → build:** on-stage endpoint drag + anchor snap               | `slide-canvas.tsx`, `slide-editor-vnext.tsx`                        |
| #1258 V7-037 — direct table cell editing + focus model | **partial → gap:** on-stage cell editor                                 | `node-content-panel.tsx:396-422`                                    |
| #1259 V7-038 — crop drag/reset + diagnostics           | **partial → gap:** add crop reset + degenerate-crop diagnostic          | `slide-editor-vnext.tsx:1488`                                       |
| #1260 V7-039 — keyboard/focus restoration/a11y parity  | **partial → gap:** focus restoration after delete/group; a11y tests     | `slide-editor-vnext.tsx:1736-1901`                                  |
| #1261 V7-040 — context toolbar grouping polish         | **partial → gap:** add rotation/crop-reset/lock toggle/table-edit entry | `context-toolbar.tsx`                                               |

---

## E07 — Template And Theme Authoring (#1262–#1267)

Theme switching, local-override visibility/reset, and theme-fallback diagnostics
are **implemented**. The two gaps are the **Add-slide template picker** (insert is
blank-only) and **template reapply** (preserves only id + localStyle, not slot
content/source).

### Required-behavior status

| #   | Required behavior                                                                   | Status          | Anchors / gap                                                                                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Add slide opens a semantic template/layout choice                                   | **missing**     | `handleInsertSlide` → `insertBlankSlide` hardcodes `kind:"content"`, empty children (`slide-editor-vnext.tsx:1133-1140`, `editor-commands.ts:193-210`); filmstrip button blank-inserts (`filmstrip.tsx:227-234`)                                                               |
| 2   | Template choices in product language map to `SemanticTemplateV1`                    | **implemented** | `template-registry.ts:123-235` (`kind`/`label`/`group`/`layouts`, `selectLayout`)                                                                                                                                                                                              |
| 3   | Reapply preserves compatible slot content + source                                  | **partial**     | `applyTemplate` preserves only `id`+`localStyle` (`editor-commands.ts:276-297`); drops children/source/controls/notes                                                                                                                                                          |
| 4   | Theme switching changes treatment without rewriting semantic tree                   | **implemented** | `setThemePackage` updates only `deck.theme` (`editor-commands.ts:374-388`)                                                                                                                                                                                                     |
| 5   | Local styles/geometry/content/source survive theme changes                          | **implemented** | `editor-commands.ts:379-387` (spread-preserve)                                                                                                                                                                                                                                 |
| 6   | Local overrides visible at slide+node level, resettable                             | **implemented** | `local-override-badge.tsx:47-68`, `local-style-panel.tsx`, `resetLocalStyleOverride`/`resetSlideLocalStyle` (`editor-commands.ts:698,343`)                                                                                                                                     |
| 7   | Unknown style refs / missing styles / decorations / overflow → diagnostics + repair | **partial**     | `slot-over-capacity`/`missing-required-slot`/`unknown-template-kind`/`missing-style-default` implemented+tested; `theme-decoration-export-fallback` (`diagnostics.ts:30`) declared but **never emitted**; `unknown-style-ref` emission unconfirmed; no missing-decoration code |
| 8   | Theme package fallback visible as diagnostic, not silent                            | **implemented** | `resolveThemePackageForDeck` returns `fallback:true` + `unknown-theme-package` warning (`theme-package-registry.ts:78-105`)                                                                                                                                                    |

### Child-issue dispositions

| Issue                                                               | Disposition                                                                                 | Note (anchors)                                                                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| #1262 V7-041 — Add-slide template/layout picker                     | **missing → build:** semantic template picker UI                                            | `slide-editor-vnext.tsx:1133`, `editor-commands.ts:202`; `TEMPLATE_OPTIONS` (`:183`) exists but unused for insert |
| #1263 V7-042 — reapply with slot/source preservation                | **partial → gap:** preserve slot content + source on reapply                                | `editor-commands.ts:276-297`                                                                                      |
| #1264 V7-043 — theme switch preserves structure/overrides           | **implemented → verify**                                                                    | `editor-commands.ts:374-388`                                                                                      |
| #1265 V7-044 — local override visibility + reset                    | **implemented → verify**                                                                    | `local-override-badge.tsx`, `editor-commands.ts:698,343`                                                          |
| #1266 V7-045 — style/package/decoration/overflow repair diagnostics | **partial → gap:** emit decoration-fallback + missing-decoration; confirm unknown-style-ref | `diagnostics.ts:17,30`                                                                                            |
| #1267 V7-046 — align decorations with chrome layers/detach/export   | **partial → gap:** fix `detachDecoration` bug; depends on E04 chrome                        | `editor-commands.ts:752-758`                                                                                      |

---

## E08 — Render, Present, Public, Prototype, And Export Parity (#1268–#1273)

Single-render-tree consumption is **implemented across all surfaces** (editor,
present, public, embed, prototype HTML, PPTX). PPTX visual ops now export
rendered assets or a labeled placeholder fallback, connectors preserve endpoint,
dash, arrow, and straight/elbow routing, and the written support matrix plus
cross-surface parity fixture are in place.

### Required-behavior status

| #   | Required behavior                                                                                    | Status          | Anchors / gap                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | All surfaces consume `resolveDeckRenderTree` or documented adapter                                   | **implemented** | present `present-mode-vnext.tsx:80`; public `public-present-viewer-vnext.tsx:69`; PPTX `pptx-vnext-apply.ts:566`; prototype `render-html.ts:251` |
| 2   | Every content type has explicit render/export behavior                                               | **implemented** | `render-resolver.ts:153-197`, `export-spec.ts:170-266`, `pptx-export-adapter.ts`, and `pptx-vnext-apply.ts` cover all current content types.     |
| 3   | PPTX support matrix for fills/typography/images/visuals/connectors/tables/effects/decorations/chrome | **implemented** | Fills/typography/images/visuals/connectors/tables/effects have support/fallback diagnostics plus `render-export-support-matrix.md`.              |
| 4   | Unsupported effects produce diagnostics before export                                                | **implemented** | `export-spec.ts:153-161`; `pptx-export-adapter.ts:265-390` (fills/effects/visual channels)                                                       |
| 5   | Public/embed open v7 via boundary + resolve theme                                                    | **implemented** | `public-render/presentation.ts:41-56` (`openDeckFromJson` + `resolveThemePackageForDeck`)                                                        |
| 6   | Public routes use protected asset resolution                                                         | **implemented** | `api/slide-assets/[documentId]/[...path]/route.ts`; viewer resolves inline protected `src`                                                       |
| 7   | Theme fallback diagnostics travel to user surfaces                                                   | **implemented** | Public model carries open/theme diagnostics (`presentation.ts:50-54`); editor surfaces boundary diagnostics (`slide-editor-button.tsx:241-244`). |

### Child-issue dispositions

| Issue                                                     | Disposition     | Note (anchors)                                                                                               |
| --------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------ |
| #1268 V7-047 — parity support matrix + fixtures           | **implemented** | `docs/presentation/render-export-support-matrix.md`; `render-export-parity.test.ts`; prototype deck fixtures |
| #1269 V7-048 — align present/public/embed routes          | **implemented** | `public-render/presentation.ts:38-57`; focused public render boundary tests                                  |
| #1270 V7-049 — PPTX adapter coverage for core node types  | **implemented** | visual apply/fallback and connector endpoint/dash/arrow coverage in PPTX tests                               |
| #1271 V7-050 — export diagnostics for unsupported effects | **implemented** | effect, fill, visual-channel, placeholder, and curved-routing diagnostics                                    |
| #1272 V7-051 — prototype HTML uses product render tree    | **implemented** | `render-html.ts` exports a product-render-tree HTML path verified by parity tests                            |
| #1273 V7-052 — representative parity checks               | **implemented** | representative editor/present/public/prototype/PPTX parity test fixture                                      |

---

## E09 — Reliability, Collaboration, Presence, And Anchors (#1274–#1277)

Autosave/manual-save/conflict-recovery are **implemented** (shared with E01).
Collaboration items are **partial-to-missing**: presence is not wired into the v7
editor, comment anchors are still typed against the v6 `Deck`, and there are no
collaboration-safety tests.

### Required-behavior status

| #   | Required behavior                                        | Status          | Anchors / gap                                                                                                                             |
| --- | -------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Autosave debounces and reports saving/saved/error        | **implemented** | `use-slide-editor-open.ts:341-357,506-510`                                                                                                |
| 2   | Manual save flushes before success                       | **implemented** | `use-slide-editor-open.ts:293-319`                                                                                                        |
| 3   | Conflicts compare v7 snapshots + recovery path           | **implemented** | `deck-cas-writer.ts:36,66-77`; gap: token/CAS-based, no content diff                                                                      |
| 4   | Undo/redo integrates deck/focus/save state               | **partial**     | Deck snapshots + save integrated; no focus restoration; no conflict guard (`use-slide-editor-open.ts:374-398`)                            |
| 5   | Comment/source anchors preserve ids or get v6→v7 mapping | **partial**     | `slide-comment-anchors.ts:21,100` imports `Deck` (v6) and reads `slide.elements`; no id map from migration                                |
| 6   | Slide-level presence works on v7 slides                  | **partial**     | `useSlidePresence` is v7-agnostic (`use-slide-presence.ts:201-277`) but **not imported by any `presentation-vnext/` component**           |
| 7   | Node-level presence uses v7 ids; no stale presence       | **partial**     | `extractSlidePresencePeers` filters by `documentId` only (`use-slide-presence.ts:57-60,120-139`); no node-id validation against live deck |
| 8   | Collaboration never writes v6 element fields             | **partial**     | `safeParseDeckV7` rejects v6 fields at write (`validation.ts:732-744`, `deck-cas-writer.ts:36-44`); **no collaboration-safety tests**     |

### Child-issue dispositions

| Issue                                                     | Disposition                                                          | Note (anchors)                                               |
| --------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------ |
| #1274 V7-053 — preserve/map comment/source anchors        | **missing → build:** v6→v7 anchor id map + DeckV7-typed resolution   | `slide-comment-anchors.ts:21,100`, `migration-v6.ts:108-125` |
| #1275 V7-054 — port slide/node presence to v7 ids         | **partial → gap:** wire hook into v7 editor; node-id staleness guard | `use-slide-presence.ts:201-277` (zero v7 imports)            |
| #1276 V7-055 — harden command history (collab/save/focus) | **partial → gap:** focus restoration + conflict guard                | `use-slide-editor-open.ts:374-398`                           |
| #1277 V7-056 — collaboration safety tests                 | **missing → build:** tests proving commands can't write v6 fields    | guard exists (`deck-cas-writer.ts:36-44`); no test           |

---

## E10 — Verification Gates (#1278–#1285)

These are **evidence** issues. The runtime under test is summarized above; here we
inventory existing coverage vs. what is missing. Test runner: `npm run test:unit`
(`node --import tsx --test "src/**/*.test.ts"`), subsystem runs via
`npm run test:subsystem -- <subsystem>` (e.g. `presentation`, `public-render`),
typecheck `npm run typecheck`, E2E `npm run test:e2e` (Playwright).

| Issue                                                        | Disposition                           | Existing coverage → missing                                                                                                                                                                                                                     |
| ------------------------------------------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1278 V7-057 — open/migration/save/conflict tests            | **partial → gap**                     | Have `open-deck.test.ts`, `validation.test.ts`, `deck-cas-writer.test.ts`; missing v7 conflict-state-machine + migration-id-preservation assertions                                                                                             |
| #1279 V7-058 — source-link + Source Review tests             | **missing → build**                   | Only v1 `source-link-staleness.test.ts`; v7 metadata covered by 2 generic command tests; no staleness/refresh/review tests                                                                                                                      |
| #1280 V7-059 — deck chrome / assets / diagnostics tests      | **partial → gap**                     | Assets thorough (`asset-*.test.ts` ×5 + route test); missing deck-chrome behavior tests + diagnostic-action handler tests                                                                                                                       |
| #1281 V7-060 — stage interaction / keyboard / a11y tests     | **partial → gap**                     | `selection-model.test.ts`, `selection-geometry.test.ts`, `stage-guides.test.ts`, `slide-canvas-render.test.ts`; missing rotation/connector/group/table-cell/crop-reset/keyboard/a11y (legacy variants live only in `legacy-reference/*.legacy`) |
| #1282 V7-061 — template/theme authoring tests                | **implemented → verify**              | `template-compiler.test.ts`, `template-coverage.test.ts`, `theme-package-registry.test.ts`, `style-resolver.test.ts`; add an authoring roundtrip                                                                                                |
| #1283 V7-062 — present/public/export parity tests + fixtures | **partial → gap**                     | `pptx-export-adapter.test.ts`, `export-spec.test.ts`, `pptx-vnext-apply.test.ts`, `public-render/presentation.test.ts`, `e2e/present-export.spec.ts`; missing cross-surface output-equivalence parity                                           |
| #1284 V7-063 — visual regression coverage                    | **verification-gate (exists, gated)** | Opt-in Playwright `e2e/screenshot-regression.spec.ts` + `e2e/slides-layout-screenshots.spec.ts` (env-var gated; baselines not committed; not in default CI gate)                                                                                |
| #1285 V7-064 — final default-editor rollout checklist        | **missing → build**                   | No checklist doc; expected `docs/presentation/v7-default-editor-rollout-checklist.md`. Note: v7 is **already the unconditional default** (no flag), so the checklist gates evidence, not a cutover switch                                       |

---

## Master Per-Issue Disposition Table

`verify` = implemented, needs verification only. `gap` = partial, gap-fill.
`build` = missing, implement.

| Issue | Local id | Epic | Disposition          | Note                                           |
| ----- | -------- | ---- | -------------------- | ---------------------------------------------- |
| #1225 | V7-004   | E01  | partial → gap        | AI-apply bypasses open boundary                |
| #1226 | V7-005   | E01  | partial → gap        | no v6→v7 id-map export                         |
| #1227 | V7-006   | E01  | implemented → verify | invalid-deck recovery UI present               |
| #1228 | V7-007   | E01  | implemented → verify | save validates via safeParseDeckV7             |
| #1229 | V7-008   | E01  | implemented → verify | manual flush + CAS recovery present            |
| #1230 | V7-009   | E01  | partial → gap        | undo/redo lacks focus restoration              |
| #1231 | V7-010   | E02  | partial → gap        | no scope/grouping + missing codes              |
| #1232 | V7-011   | E02  | missing → build      | deck-level diagnostics review surface          |
| #1233 | V7-012   | E02  | partial → gap        | repair-ai-plan unhandled; add revalidate       |
| #1234 | V7-013   | E02  | partial → gap        | source-link diagnostics absent                 |
| #1235 | V7-014   | E03  | partial → gap        | add refresh-state/revision; migrate source     |
| #1236 | V7-015   | E03  | missing → build      | host block index + hash plumbing               |
| #1237 | V7-016   | E03  | missing → build      | v7 fresh/stale/orphan classifier               |
| #1238 | V7-017   | E03  | partial → gap        | dedicated refresh/unlink/relink commands       |
| #1239 | V7-018   | E03  | missing → build      | deck-level Source Review UI                    |
| #1240 | V7-019   | E03  | missing → build      | refresh-all / resolve / safe-skip              |
| #1241 | V7-020   | E03  | missing → build      | v7 source-link tests                           |
| #1242 | V7-021   | E04  | missing → build      | DeckV7 chrome schema + override contract       |
| #1243 | V7-022   | E04  | partial → gap        | render deck-chrome nodes (decorations ok)      |
| #1244 | V7-023   | E04  | partial → gap        | deck-level chrome editor controls              |
| #1245 | V7-024   | E04  | partial → gap        | fix detachDecoration; surface live decorations |
| #1246 | V7-025   | E04  | partial → gap        | deck-chrome PPTX/public/present parity         |
| #1247 | V7-026   | E04  | missing → build      | migrate v6 master chrome intent                |
| #1248 | V7-027   | E05  | implemented → verify | durable image upload wired                     |
| #1249 | V7-028   | E05  | implemented → verify | assets.images normalized + resolver            |
| #1250 | V7-029   | E05  | partial → gap        | add crop reset; verify export parity           |
| #1251 | V7-030   | E05  | partial → gap        | built-in visual registry picker                |
| #1252 | V7-031   | E05  | missing → build      | consume channelColors render+export; diagnose  |
| #1253 | V7-032   | E05  | implemented → verify | orphan lifecycle (add visuals scan)            |
| #1254 | V7-033   | E05  | implemented → verify | protected public asset resolution              |
| #1255 | V7-034   | E06  | missing → build      | group member edit + entry/exit state           |
| #1256 | V7-035   | E06  | missing → build      | stage rotation handle                          |
| #1257 | V7-036   | E06  | missing → build      | connector endpoint drag/snap                   |
| #1258 | V7-037   | E06  | partial → gap        | on-stage table cell editing                    |
| #1259 | V7-038   | E06  | partial → gap        | crop reset + crop diagnostics                  |
| #1260 | V7-039   | E06  | partial → gap        | focus restoration + a11y parity                |
| #1261 | V7-040   | E06  | partial → gap        | toolbar: rotation/crop/lock/table entry        |
| #1262 | V7-041   | E07  | missing → build      | Add-slide semantic template picker             |
| #1263 | V7-042   | E07  | partial → gap        | reapply slot/source preservation               |
| #1264 | V7-043   | E07  | implemented → verify | theme switch preserves structure               |
| #1265 | V7-044   | E07  | implemented → verify | local override visibility + reset              |
| #1266 | V7-045   | E07  | partial → gap        | emit decoration/style-ref/overflow diagnostics |
| #1267 | V7-046   | E07  | partial → gap        | align decorations w/ chrome; fix detach        |
| #1268 | V7-047   | E08  | implemented          | render/export support-matrix doc + fixtures    |
| #1269 | V7-048   | E08  | implemented          | present/public/embed on v7 boundary            |
| #1270 | V7-049   | E08  | implemented          | PPTX visual apply; connector fidelity          |
| #1271 | V7-050   | E08  | implemented          | unsupported-effect export diagnostics          |
| #1272 | V7-051   | E08  | implemented          | prototype HTML uses product render tree        |
| #1273 | V7-052   | E08  | implemented          | cross-surface parity equivalence test          |
| #1274 | V7-053   | E09  | missing → build      | v6→v7 anchor id map + DeckV7 typing            |
| #1275 | V7-054   | E09  | partial → gap        | wire presence into v7; node-id guard           |
| #1276 | V7-055   | E09  | partial → gap        | command history focus + conflict guard         |
| #1277 | V7-056   | E09  | missing → build      | collaboration-safety tests                     |
| #1278 | V7-057   | E10  | partial → gap        | conflict-state + migration-id tests            |
| #1279 | V7-058   | E10  | missing → build      | v7 source-link + Source Review tests           |
| #1280 | V7-059   | E10  | partial → gap        | deck-chrome + diagnostics-action tests         |
| #1281 | V7-060   | E10  | partial → gap        | stage interaction/keyboard/a11y tests          |
| #1282 | V7-061   | E10  | implemented → verify | template/theme authoring tests present         |
| #1283 | V7-062   | E10  | partial → gap        | cross-surface parity tests + fixtures          |
| #1284 | V7-063   | E10  | verification-gate    | gated visual-regression harness exists         |
| #1285 | V7-064   | E10  | missing → build      | default-editor rollout checklist doc           |

### Disposition tally

- **implemented → verify:** 12 (#1227, #1228, #1229, #1248, #1249, #1253, #1254, #1264, #1265, #1269, #1271, #1272)
- **partial → gap-fill:** 26
- **missing → build:** 22
- **verification-gate:** 1 (#1284)

---

## Where New Issues Overlap Existing Code (Do Not Re-Implement)

- **E01 #1227/#1228/#1229** — recovery, save validation, manual flush, and CAS
  conflict recovery are complete runtime (`use-slide-editor-open.ts`,
  `deck-cas-writer.ts`, `conflict-recovery-dialog-v7.tsx`). Scope to tests.
- **E03 #1237** — do not write a new staleness engine from scratch; port the v1
  logic in `source-link-staleness.ts` / `document-block-hash.ts` to `DeckV7`.
- **E05 #1248/#1249/#1253/#1254** — image upload, asset registry, orphan
  lifecycle, and protected access are complete; only add `assets.visuals` to the
  ref/scan walks and verify.
- **E07 #1264/#1265** — theme switching and local-override reset are complete;
  scope to verification.
- **E08 #1269/#1271/#1272** — present/public/embed boundary, export diagnostics,
  and prototype render-tree reuse are complete; scope to verification.
- **E09 #1275** — `useSlidePresence` already exists and is v7-agnostic; the work
  is wiring it into `presentation-vnext`, not rebuilding presence.

---

## Top 5 Highest-Risk Gaps

1. **Source-Link is largely absent in v7 (E03, #1235–#1241).** The inspector only
   displays stored metadata; there is no host block index, no fresh/stale/orphan
   classification, no deck-level Source Review, and no source diagnostics. This is
   the single largest feature-gap cluster and a documented release blocker. Primary
   build surfaces: `src/lib/presentation-vnext/block-index.ts` (new),
   `src/lib/presentation-vnext/source-staleness.ts` (new),
   `src/components/presentation-vnext/deck-source-review.tsx` (new).

2. **Deck Chrome has no schema (E04, #1242–#1247).** `DeckV7` cannot express
   logo/footer/page-number/watermark/border, so every downstream chrome behavior
   (editor controls, layers, export, public parity) is blocked. Build foundation in
   `src/lib/presentation-vnext/schema.ts` + `theme-package-schema.ts`, then render
   in `render-resolver.ts`.

3. **`detachDecoration` double-renders (E04 #1245 / E07 #1267).** `editor-commands.ts:752-758`
   appends a detached node but never adds the decoration id to
   `theme.overrides.disabledDecorations`, so the theme recipe keeps rendering
   underneath. This is a concrete data-correctness bug shipping today.

4. **Three legacy stage affordances missing (E06 #1255/#1256/#1257).** Group
   entry/exit editing, rotation handle, and connector endpoint drag are all absent
   on the v7 stage (confirmed: no rotation/endpoint handlers in `slide-canvas.tsx`).
   These are core direct-manipulation behaviors the legacy editor provided; their
   absence is the most user-visible parity regression.

5. **Collaboration anchors/presence not v7-safe (E09 #1274/#1275/#1277).**
   `slide-comment-anchors.ts` is still typed against the v6 `Deck` and reads
   `slide.elements`; `useSlidePresence` is not wired into the v7 editor; migration
   exports no id map; and there are no collaboration-safety tests. Risk: comment
   anchors and presence silently break on migrated decks. (Adjacent verification
   risk: the v7 editor is **already the default** with no fallback flag, so these
   gaps are live in production paths.)

---

## Related Documents

- [v7-slide-editor-implementation-plan.md](v7-slide-editor-implementation-plan.md) — the blocker matrix this audit grades against.
- [v7-slide-editor-github-issues.md](v7-slide-editor-github-issues.md) — the epic/issue backlog (V7-E00..E10).
- [rendering-and-export.md](rendering-and-export.md), [assets.md](assets.md), [theme-packages.md](theme-packages.md), [semantic-slide-design-system.md](semantic-slide-design-system.md) — subsystem references.
