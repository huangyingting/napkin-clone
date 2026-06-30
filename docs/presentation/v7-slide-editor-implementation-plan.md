# V7 Slide Editor Migration Plan

**Status:** Draft implementation plan  
**Last updated:** 2026-06-30

This document defines the work required to migrate the mature legacy slide
editing system to the vNext presentation runtime. The goal is not to keep two
editors alive. The goal is to rebuild the existing editing experience on top of
`DeckV7`, `SlideNode`, semantic templates, theme packages, and the shared v7
render tree.

The legacy editor is the behavioral and UI reference. The new editor should look
and feel familiar to users, while adding the controls that vNext needs for
semantic templates, style bindings, theme decorations, render diagnostics, and
v7-only persistence.

## Goal

Build a production-ready v7 slide editor that fully replaces the legacy slide
editing system.

The completed editor must:

- use `DeckV7` as the only active persisted slide editing model;
- mutate `SlideNode` and `SlideChildNode` data directly;
- preserve the legacy editor's core UI structure and editing workflows;
- add vNext-specific controls for semantic templates, style refs, local style
  patches, theme packages, decorations, and diagnostics;
- render editor, present mode, public view, prototypes, and export from the same
  v7 render tree;
- avoid providing runtime v6 editor support in the new editing system.

## Non-Goals

- Do not keep a long-lived dual editor where v6 decks open in the old editor and
  v7 decks open in the new editor.
- Do not add compatibility layers that let the v7 editor mutate v6
  `Slide.elements[]`.
- Do not preserve package-local v6 templates or v6 master behavior as active
  editor concepts.
- Do not make the prototype HTML renderer a separate product rendering model.
- Do not change the v7 data model merely to mirror old v6 field names.

## Source And Target

### Legacy Source System

The legacy editor lives under:

- `src/components/presentation/slide-editor.tsx`
- `src/components/presentation/slide-editor/*`
- `src/components/presentation/slide-stage-*`
- `src/components/presentation/slide-inspector/*`
- `src/lib/presentation/*`

It provides the reference behavior for:

- full editor shell and toolbar;
- slide rail and active slide navigation;
- stage sizing, zoom, selection, overlays, and element chrome;
- drag, resize, nudge, duplicate, delete, z-order, keyboard, clipboard;
- text, image, visual, shape, connector, table, and background editing;
- inspector panels;
- autosave, conflict recovery, source links, and export hooks.

### V7 Target System

The target editor lives under:

- `src/components/presentation-vnext/slide-editor-vnext.tsx`
- `src/components/presentation-vnext/slide-canvas.tsx`
- `src/components/presentation-vnext/slide-node-renderer.tsx`
- `src/components/presentation-vnext/inspector/*`
- `src/lib/presentation-vnext/*`

It must operate on:

- `DeckV7`
- `SlideNode`
- `SlideChildNode`
- `SemanticTemplateV1`
- `ThemePackageV1`
- `StyleBinding`
- `StylePatch`
- `ResolvedDeckRenderTree`

## Migration Principles

1. **Copy the product experience, not the old data shape.**
   The v7 editor should visually and behaviorally resemble the mature old slide
   editor, but all mutations must target v7 nodes and v7 style structures.

2. **No v6 support inside the v7 editor.**
   If existing data is v6, convert or repair it before it enters the editor.
   Once inside the editor, the deck is v7 only.

3. **Semantic structure stays separate from visual language.**
   Layout comes from semantic templates. Theme packages provide tokens, styles,
   assets, and decorations.

4. **One render tree feeds every surface.**
   Editor canvas, present mode, public render, prototype HTML, and export should
   all consume `resolveDeckRenderTree` output or deliberately documented export
   fallbacks.

5. **Local user edits outrank theme styling.**
   Theme packages can change the default look, but explicit user `localStyle`,
   content, geometry, and source metadata must be preserved unless the user asks
   to reset or reapply.

6. **Diagnostics are first-class UI.**
   Missing assets, unknown style refs, unsupported export features, and template
   overflow should be visible and actionable in the editor.

## UI Migration Target

The v7 editor should keep the old editor's overall structure:

- top toolbar for editor-wide commands;
- left slide rail with thumbnails and slide actions;
- central stage with a framed slide canvas;
- contextual stage overlays for selection, resize handles, guides, alignment,
  and drag feedback;
- right inspector with slide-level and node-level panels;
- save/conflict/export status surfaces;
- keyboard shortcut help and command affordances.

The v7 editor can add new UI where vNext needs it:

- semantic template kind and layout metadata;
- tone, density, emphasis, decoration, and chrome controls;
- style ref and style variant pickers;
- local style override badges and reset controls;
- theme package selector or theme package diagnostics;
- theme decoration layers mode and detach action;
- render/export diagnostic panel;
- template reapply/repair controls.

## Data Boundary

The editor open boundary must return one of these outcomes:

1. valid `DeckV7`, open editor;
2. v6/legacy deck successfully migrated to valid `DeckV7`, open editor;
3. invalid or unsupported data, show a recovery state with diagnostics.

It must not silently replace non-empty deck data with a blank deck.

The editor save boundary must persist only valid `DeckV7` payloads. Invalid
payloads should fail before persistence and surface diagnostics to the user or
caller.

## V7.0 Legacy Replacement Release Scope

V7.0 is a legacy replacement release, not a short MVP. The release is complete
only when users can stop using the legacy slide editor without losing authoring
power, document fidelity, collaboration context, or export/public rendering
behavior. The legacy editor remains the behavioral reference, but v7 remains the
only active data model inside the new editor.

Feature gaps and verification gaps are tracked separately:

- **Feature gaps** are missing or incomplete product capabilities that users can
  experience directly.
- **Verification gaps** are missing tests, screenshots, or release checks for
  capabilities that already have a runtime implementation.

Do not merge these categories in planning. A feature that works but lacks tests
is a release risk, not the same thing as a missing feature. A feature that has a
form field but no direct manipulation, host data, persistence, diagnostics, or
export behavior remains a feature gap.

### Scope Classes

| Class             | Meaning                                                                                                                 | Release effect                                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Release blocker   | User-visible legacy replacement behavior that must exist before v7 replaces the old editor.                             | V7.0 cannot ship as the default editor until the capability works end to end.                                       |
| Parity polish     | A capability has a working v7 path, but the interaction quality, grouping, feedback, menu structure, or repair UX lags. | Should be completed before broad rollout unless explicitly accepted as a short-lived paper cut.                     |
| Verification gate | Runtime behavior is present, but evidence is missing.                                                                   | Does not count as a feature gap, but release cannot pass without focused unit/component/E2E/visual/export coverage. |
| Explicit non-goal | Legacy implementation shape or compatibility behavior that must not be rebuilt.                                         | Do not spend migration time recreating it; preserve user value through v7-native contracts instead.                 |

### Release Blocker Matrix

#### Open, Migration, Persistence, And Recovery

The editor boundary must protect existing data and keep all active editing on
`DeckV7`.

Required behavior:

- Valid `DeckV7` opens unchanged and preserves deck, slide, node, asset, source,
  and theme identifiers.
- Migratable legacy v6 deck JSON opens through the one-time migration path and
  is saved back only as valid `DeckV7`.
- Non-empty invalid or unsupported deck JSON opens a visible recovery state with
  structured diagnostics; it must not silently become a blank deck.
- All save paths validate with `safeParseDeckV7` or the nearest authoritative v7
  validator before persistence.
- Manual save flushes pending autosave work before reporting success.
- CAS/revision-token conflicts surface the v7 conflict recovery flow with clear
  keep-mine, use-theirs, and dismiss behavior.
- Undo/redo applies to committed v7 editor command state, not only transient UI
  selection state.

Primary surfaces:

- `src/lib/presentation-vnext/open-deck.ts`
- `src/lib/presentation-vnext/migration-v6.ts`
- `src/lib/presentation-vnext/validation.ts`
- `src/components/editor/use-slide-editor-open.ts`
- `src/components/presentation-vnext/conflict-recovery-dialog-v7.tsx`
- `src/lib/document/persistence/deck.ts`

#### Source-Link Replacement

Source links are in scope for v7.0. The replacement is not only a node-level
metadata display; it must include freshness, orphan detection, node refresh, and
deck-level review.

Required data model and host behavior:

- Every source-linked v7 node stores enough `source` metadata to identify the
  source block, document context, block kind, last known hash or revision, and
  last refresh state.
- The document editor host provides a current block index for the open document,
  including block id, normalized content, block kind, hash, and any visual/table
  payloads needed to refresh slide content.
- A source-linked node is **fresh** when its stored hash matches the host block
  hash and its block still exists.
- A source-linked node is **stale** when the block exists but its hash/content
  changed.
- A source-linked node is **orphaned** when its block id cannot be resolved in
  the current source context.
- Cross-document or remote source refresh must use an explicit host fetch path;
  the editor must not guess or silently relink to unrelated local blocks.

Required UI behavior:

- The Source inspector panel shows fresh/stale/orphan/unlinked state for the
  selected node.
- The selected node can refresh from source, unlink, and relink through explicit
  actions.
- Relink review must show enough block identity for the user to avoid linking
  the wrong document content.
- A deck-level Source Review surface lists all stale and orphaned nodes, grouped
  by slide and source state.
- Deck-level actions include refresh all safe matches, resolve one by one, mark
  intentionally unlinked, and dismiss non-actionable diagnostics.
- Source diagnostics feed the same diagnostics surface as render/export
  diagnostics instead of becoming a separate hidden status system.

Primary surfaces:

- `src/components/presentation-vnext/inspector/node-source-panel.tsx`
- `src/components/presentation-vnext/inspector/diagnostics-panel.tsx`
- `src/components/presentation-vnext/slide-editor-vnext.tsx`
- `src/components/editor/slide-editor-button.tsx`
- `src/lib/presentation/document-block-hash.ts`
- `src/lib/presentation/source-link-staleness.ts`
- `src/lib/presentation-vnext/editor-commands.ts`

Non-acceptable shortcuts:

- Showing source metadata without freshness computation.
- Refreshing only from the initial page-load block snapshot when the live
  document state has changed.
- Treating missing source blocks as successful refreshes.
- Losing source identity during v6 to v7 migration.

#### Deck Chrome Replacement

Legacy deck/master chrome is in scope as user value, but not as v6 master data.
V7 must provide a native deck-level chrome model for recurring visual elements.

Required behavior:

- Users can configure deck-level logo, footer, page number, watermark, border,
  and safe-area/frame chrome.
- Deck-level chrome applies consistently to every slide unless the slide
  explicitly overrides, disables, or detaches the relevant chrome/decoration.
- Slide-level overrides do not rewrite the whole deck theme or semantic slide
  tree.
- Theme package decorations and deck-level chrome can coexist without z-order,
  hit-testing, layer-list, or export ambiguity.
- Layers mode exposes generated decorations/chrome clearly and allows supported
  detach or disable operations.
- Editor, thumbnails, present mode, public viewer, HTML prototypes, and PPTX
  export render the same chrome intent.

V7-native expression options:

- `DeckV7.theme.overrides` for package-level decoration toggles or chrome
  parameters.
- Deck-level style/theme binding for global frame, footer, watermark, and page
  number presentation.
- Theme decoration recipes for visual chrome supplied by a theme package.
- Slide-local overrides for one-off disable/detach/customization behavior.

Out of scope:

- Reintroducing `masters[]`, `defaultMasterId`, or v6 package-local master
  templates as active editing concepts.

Primary surfaces:

- `src/lib/presentation-vnext/schema.ts`
- `src/lib/presentation-vnext/theme-package-schema.ts`
- `src/lib/presentation-vnext/render-resolver.ts`
- `src/components/presentation-vnext/inspector/slide-settings-panel.tsx`
- `src/components/presentation-vnext/inspector/layers-panel.tsx`
- `src/lib/presentation-vnext/pptx-export-adapter.ts`

#### Durable Image And Visual Asset Workflow

The v7 editor must not depend on data URLs for the main product path. Data URLs
may remain a local fallback only when a host surface intentionally omits durable
upload support.

Required image behavior:

- Image insert and replace use a protected slide asset upload action in product
  document surfaces.
- Uploaded assets are written into `DeckV7.assets.images` with durable ids,
  source URLs, MIME type, dimensions when known, content hash when available,
  and accessible alt text.
- The editor can replace images, edit fit mode, edit crop, edit alt text, and
  render crop handles directly on the stage.
- Editor, thumbnails, present mode, public view, and PPTX export resolve the
  same asset id consistently.
- Missing or unauthorized assets produce diagnostics with user-actionable
  repair paths.

Required visual behavior:

- Users can choose visuals from the current document visual registry or another
  host-provided visual picker.
- Users can replace an existing visual without losing layout, source metadata,
  or intentional local style overrides.
- `VisualStyle.channelColors` is interpreted by known visual renderers and
  export adapters.
- Unsupported visual channel overrides produce diagnostics rather than silently
  doing nothing.
- Visual assets resolve in public and export contexts under the same access
  rules as image assets.

Required cleanup behavior:

- Deleting or replacing image/visual nodes must leave the deck in a state where
  orphaned asset references can be detected.
- The product needs either immediate orphan cleanup or a documented background
  cleanup path for unreferenced slide assets.
- Cleanup must not delete assets still referenced by another slide, node,
  visual, decoration, or public render surface.

Primary surfaces:

- `src/components/presentation-vnext/slide-editor-vnext.tsx`
- `src/components/presentation-vnext/inspector/node-content-panel.tsx`
- `src/lib/slides/asset-upload.ts`
- `src/lib/slides/asset-storage.ts`
- `src/lib/slides/asset-resolver.ts`
- `src/lib/slides/asset-orphan.ts`
- `src/lib/presentation-vnext/render-resolver.ts`
- `src/lib/presentation-vnext/pptx-export-adapter.ts`

#### Professional Stage Interaction Parity

The v7 stage must preserve the direct manipulation power of the legacy editor.
Inspector-only field editing is not enough for the replacement release when the
legacy editor provided a direct stage interaction.

Required behavior:

- Selection, hover preselection, marquee selection, multi-select bounds, resize,
  drag, nudge, snap guides, z-order, duplicate, delete, copy, paste, group, and
  ungroup work on v7 nodes.
- Group member direct editing is supported without requiring users to ungroup
  first. The editor must make group entry/exit state visible and prevent
  accidental edits outside the active group context.
- Stage rotation handle exists for rotatable nodes and updates the v7 layout
  rotation model with snap or precision behavior comparable to legacy.
- Connector endpoints can be dragged on stage, snap to valid node anchors, and
  preserve endpoint bindings through node move/resize/delete where possible.
- Connector routing, arrowheads, dash, stroke color, and stroke width are
  editable from direct controls and inspector controls.
- Table cell-level editing is available directly in the stage or an equally
  immediate editing surface. Users must not have to edit normal table content
  only through raw row/column form fields.
- Table row/column insert/delete, header toggle, caption, alternating rows, and
  per-cell text edits preserve valid v7 table content.
- Image crop handles support pointer drag and reset behavior.
- Locked and hidden nodes behave consistently across pointer, keyboard,
  inspector, context toolbar, and layers panel.

Primary surfaces:

- `src/components/presentation-vnext/slide-editor-vnext.tsx`
- `src/components/presentation-vnext/slide-canvas.tsx`
- `src/components/presentation-vnext/slide-node-renderer.tsx`
- `src/components/presentation-vnext/selection-model.ts`
- `src/components/presentation-vnext/toolbar/context-toolbar.tsx`
- `src/components/presentation-vnext/inspector/node-geometry-panel.tsx`
- `src/lib/presentation-vnext/editor-commands.ts`
- `src/lib/presentation-vnext/selection-geometry.ts`
- `src/lib/presentation-vnext/stage-guides.ts`

#### Template And Theme Authoring

V7 must keep the legacy authoring workflow while replacing old template/master
shape with semantic templates and theme packages.

Required behavior:

- Add slide opens a semantic template/layout choice, not only a blank-slide
  action.
- Template choices are presented in product language and map to
  `SemanticTemplateV1` kinds/layouts.
- Reapplying a template preserves compatible slot content and source metadata
  where possible, then updates structure only where the user requested it.
- Theme switching changes visual treatment and deck chrome/decorations without
  rewriting the slide semantic tree.
- User-authored local styles, geometry, content, and source metadata survive
  theme changes unless the user explicitly resets or reapplies.
- Local overrides are visible at slide and node level and can be reset to theme.
- Unknown style refs, missing package styles, missing decorations, and template
  overflow produce diagnostics with repair actions.
- Theme package fallback is visible as a diagnostic; neutral fallback must not
  be silent in product runtime.

Primary surfaces:

- `src/lib/presentation-vnext/template-registry.ts`
- `src/lib/presentation-vnext/template-compiler.ts`
- `src/lib/presentation-vnext/theme-packages.ts`
- `src/lib/presentation-vnext/theme-package-registry.ts`
- `src/components/presentation-vnext/inspector/slide-controls-panel.tsx`
- `src/components/presentation-vnext/inspector/style-binding-panel.tsx`
- `src/components/presentation-vnext/inspector/local-style-panel.tsx`
- `src/lib/presentation-vnext/diagnostics.ts`

#### Render, Present, Public, Prototype, And Export Parity

Authoring is not complete until the same deck can be presented, shared, embedded,
previewed, and exported without surprising loss.

Required behavior:

- Editor canvas, present mode, public viewer, embed viewer, HTML prototype
  previews, and PPTX export consume `resolveDeckRenderTree` or a documented
  equivalent adapter.
- Text, rich text runs, images, visuals, shapes, connectors, tables, slide
  backgrounds, theme decorations, deck chrome, local style overrides, and
  source-derived content have an explicit render/export behavior.
- The PPTX export path has a support matrix for fills, typography, images,
  visuals, connectors, tables, effects, decorations, and deck chrome.
- Unsupported effects such as blur, glass, conic gradients, or patterns produce
  diagnostics before export instead of silently disappearing.
- Public share and embed routes open v7 deck JSON through the v7 boundary and
  resolve the deck theme package.
- Public routes use protected asset resolution rules for image and visual assets.
- Theme package fallback diagnostics travel to user-visible surfaces where
  possible.

Primary surfaces:

- `src/lib/presentation-vnext/render-resolver.ts`
- `src/components/presentation-vnext/slide-canvas.tsx`
- `src/components/presentation-vnext/present-mode-vnext.tsx`
- `src/components/presentation-vnext/public-present-viewer-vnext.tsx`
- `src/lib/public-render/presentation.ts`
- `src/lib/presentation-vnext/export-spec.ts`
- `src/lib/presentation-vnext/pptx-export-adapter.ts`
- `src/lib/presentation-vnext/pptx-vnext-apply.ts`
- `prototypes/slide-themes/render-html.ts`

#### Reliability, Collaboration, Presence, And Anchors

The replacement release must preserve the old editor's reliability and
collaboration expectations.

Required behavior:

- Autosave debounces v7 deck updates and reports saving/saved/error state.
- Manual save flushes pending autosave edits and does not report success before
  persistence confirms.
- Save conflicts compare v7 snapshots and preserve a user recovery path.
- Undo/redo integrates with v7 deck changes, selection focus restoration, and
  save state.
- Comment anchors, source anchors, and any existing slide/node references from
  legacy decks either preserve stable ids through migration or receive an
  explicit v6-to-v7 mapping.
- Slide-level presence continues to work on v7 slides.
- Node-level presence, if enabled in a host surface, uses v7 node ids and does
  not show misleading presence on deleted, hidden, migrated, or detached nodes.
- Collaboration state must never cause a v7 editor command to write v6 element
  fields.

Primary surfaces:

- `src/components/editor/use-slide-editor-open.ts`
- `src/lib/presentation/use-slide-presence.ts`
- `src/lib/presentation/slide-comment-anchors.ts`
- `src/lib/presentation-vnext/migration-v6.ts`
- `src/lib/presentation-vnext/editor-commands.ts`
- `src/lib/document/persistence/deck.ts`

#### Diagnostics And Repair UX

Diagnostics are part of the product surface, not only developer logging.

Required behavior:

- Diagnostics are grouped by slide/node/deck scope and distinguish errors,
  warnings, unsupported export behavior, missing assets, stale sources, unknown
  style refs, missing theme packages, and migration repair issues.
- Each diagnostic either provides a direct repair action, points to the exact
  object to fix, or clearly marks why the issue is informational only.
- Diagnostics can be reached from the inspector and from deck-level review
  surfaces when the issue is not tied to the selected object.
- Applying a diagnostic action mutates the deck through v7 editor commands and
  revalidates the resulting deck.
- Diagnostics must not be swallowed by present/public/export flows when the user
  needs to understand a visible fallback.

Primary surfaces:

- `src/lib/presentation-vnext/diagnostics.ts`
- `src/components/presentation-vnext/inspector/diagnostics-panel.tsx`
- `src/lib/presentation-vnext/render-resolver.ts`
- `src/lib/presentation-vnext/export-spec.ts`
- `src/lib/presentation-vnext/open-deck.ts`

### Parity Polish Queue

These items are still part of the v7.0 replacement quality bar when they affect
the normal authoring flow. They are called out separately because a basic path
may already exist while the interaction remains below legacy quality.

- Top toolbar grouping should separate deck/session controls from insert and
  object-format controls.
- Context toolbar groups should use shared toolbar/menu primitives instead of
  accumulating local one-off wrappers.
- Connector routing, arrowhead, dash, and color controls should feel like direct
  tool controls, not debug form fields.
- Table editing should make row, column, header, caption, and cell focus states
  obvious.
- Visual channel color controls should communicate which channels are supported
  by the selected visual renderer/export adapter.
- Layers mode should clearly distinguish user nodes, groups, theme decorations,
  deck chrome, locked nodes, hidden nodes, and detached decorations.
- Source Review should make safe bulk refreshes and risky relinks visually
  distinct.
- Diagnostics repair actions should name the affected slide/node and preserve
  selection/focus after repair.
- Mobile inspector, filmstrip, and context toolbar should remain usable without
  covering the current edit target.

### Verification Gates

Verification gates are not counted as feature gaps, but v7.0 cannot ship without
evidence for the replacement behaviors above.

Required focused coverage:

- Open boundary: valid v7 pass-through, v6 migration, invalid non-empty recovery,
  and no silent blank-deck replacement.
- Save boundary: v7 validation before persistence, autosave debounce, manual
  save flush, CAS conflict recovery, and invalid-payload rejection.
- Source links: fresh/stale/orphan classification, selected-node refresh,
  unlink/relink, deck-level Source Review, refresh all, and migration of legacy
  source identity.
- Deck chrome: global logo/footer/page number/watermark/border behavior, slide
  override/disable behavior, layers visibility, and export/public parity.
- Assets: protected image upload, image replace/crop/alt/fit, visual replace,
  public asset resolution, export asset resolution, and orphan cleanup.
- Stage interactions: group member editing, rotation handle, connector endpoint
  drag/snap, table cell editing, crop drag/reset, locked/hidden behavior,
  keyboard nudge/resize, focus restoration, and live announcements.
- Template/theme: add-slide template picker, reapply with slot preservation,
  theme switch without semantic rewrite, local override badges/reset, and theme
  fallback diagnostics.
- Render/export: editor/present/public/embed/prototype/PPTX parity for text,
  image, visual, shape, connector, table, decoration, deck chrome, and effects.
- Collaboration: comment/source anchor migration, slide-level presence,
  node-level presence where supported, undo/redo with focus/save state, and
  conflict recovery.
- Accessibility: canvas roving tabindex, toolbar keyboard navigation, inspector
  tab semantics, filmstrip keyboard navigation, mobile sheet focus trap, and
  screen-reader announcements.

Required visual or browser coverage:

- Desktop editor at 1280, 1440, and 1920 px with toolbar, inspector, stage, and
  filmstrip visible.
- Inspector-open stage fit, 100% fit zoom, >100% scroll zoom, and dense decks.
- Mobile inspector sheet, safe-area controls, collapsed filmstrip, and toolbar
  overflow.
- Overlapped nodes where hover, selection, resize, crop, rotation, and inline
  text chrome must layer correctly.
- Present mode, public share, public embed, and exported PPTX visual parity for
  representative decks.

### Explicit Non-Goals For V7.0

These remain non-goals even though the replacement release is broad:

- Do not keep a long-lived dual editor where v6 decks continue to open in the
  old editor.
- Do not let v7 editor commands write v6 `Slide.elements[]`.
- Do not reintroduce v6 `masters[]`, `defaultMasterId`, package-local templates,
  or package-local master editing as active v7 concepts.
- Do not add runtime compatibility layers for superseded payload shapes.
- Do not silently neutralize unknown theme packages, missing assets, unsupported
  effects, or invalid deck data.
- Do not treat prototype HTML rendering as a separate product rendering model.

## Workstream 1: Editor Shell And Layout Parity

Goal: make the v7 editor shell feel like the old slide editor before advanced
node editing is ported.

Tasks:

- Move the v7 editor out of toolbar flow and into a full editor surface.
- Rebuild the old editor layout using v7 components: toolbar, slide rail, stage,
  inspector, status/save area.
- Make the stage sizing robust: centered 16:9 canvas, responsive bounds,
  predictable scroll behavior, and no collapse when rail/inspector are visible.
- Add toolbar slots for present/export/save/close and future editing commands.
- Add loading, empty, invalid deck, and render diagnostic states.
- Ensure the right-surface coordinator suppresses document popovers while the
  editor is open.

Primary files:

- `src/components/editor/slide-editor-button.tsx`
- `src/components/editor/use-slide-editor-open.ts`
- `src/components/presentation-vnext/slide-editor-vnext.tsx`
- `src/components/presentation-vnext/slide-canvas.tsx`
- `src/app/app/documents/[id]/right-surface-context.tsx`

Acceptance criteria:

- Opening Slides shows a full editor surface, not inline toolbar content.
- The active slide canvas is always visible and usable.
- Rail, stage, and inspector preserve their intended proportions.
- Closing the editor returns to the document without stale overlay state.

## Workstream 2: Theme Package Resolution In Product Runtime

Goal: product surfaces use real v7 theme packages, not only
`NEUTRAL_THEME_PACKAGE`.

Tasks:

- Create a runtime v7 theme package registry keyed by `ThemePackageV1.id`.
- Promote generated/prototype packages into a runtime-consumable module or an
  explicit build artifact.
- Resolve `DeckV7.theme.packageId` in editor, present mode, public render, and
  export.
- Preserve neutral fallback only as a diagnostic fallback for unknown packages.
- Ensure `ThemePackageV1` styles and decorations are validated before use.

Primary files:

- `src/lib/presentation-vnext/theme-package-schema.ts`
- `src/lib/presentation-vnext/neutral-theme-package.ts`
- new `src/lib/presentation-vnext/theme-package-registry.ts`
- `src/components/editor/slide-editor-button.tsx`
- `src/components/editor/present-button.tsx`
- `src/lib/public-render/presentation.ts`
- `src/lib/presentation-vnext/pptx-vnext-apply.ts`

Acceptance criteria:

- A deck with `theme.packageId: "ocean"` renders ocean styling in every product
  presentation surface.
- Unknown packages produce a diagnostic and render with neutral fallback.
- Theme package visual changes do not require v6 fields or package-local layout.

## Workstream 3: Open Boundary And Legacy Data Migration

Goal: eliminate active v6 editor support without losing existing deck data.

Tasks:

- Use `openDeckFromJson` as the only editor open boundary.
- Detect valid v7 decks and return them unchanged.
- Detect legacy v6 deck JSON and run the one-time migration path.
- Validate migrated decks with `safeParseDeckV7`.
- Return structured diagnostics when migration fails.
- Remove behavior that silently opens a blank deck for non-empty invalid data.
- Keep any v6 migration utility outside normal editor mutation code.

Primary files:

- `src/lib/presentation-vnext/open-deck.ts`
- `src/lib/presentation-vnext/migration-v6.ts`
- `src/components/editor/use-slide-editor-open.ts`
- `src/lib/document/persistence/deck.ts`

Acceptance criteria:

- Valid v7 data opens in the v7 editor.
- Migratable v6 data opens as v7 and saves back as v7.
- Unmigratable non-empty data produces a visible recovery state.
- No active editor command mutates v6 `Slide.elements[]`.

## Workstream 4: Stage Interaction Migration

Goal: port the old stage interaction model to v7 nodes.

Tasks:

- Port selection overlays: hit testing, preselection, single select, multi-select,
  clear selection, selection ring, and resize handles.
- Port drag and resize behavior to mutate `SlideChildNode.layout.frame`.
- Port keyboard nudging, delete, duplicate, z-order, escape, and shortcut help.
- Port alignment guides, page guides, snap behavior, and stage measurement.
- Support group children and nested node hit testing.
- Support theme decorations in layers mode, including detach-to-user-node.

Legacy reference files:

- `src/components/presentation/slide-editor.tsx`
- `src/components/presentation/slide-stage-editor.tsx`
- `src/components/presentation/slide-stage/*`
- `src/components/presentation/slide-editor/use-slide-selection.ts`
- `src/components/presentation/slide-editor/use-slide-keyboard-controller.ts`

V7 target files:

- `src/components/presentation-vnext/slide-editor-vnext.tsx`
- `src/components/presentation-vnext/slide-canvas.tsx`
- `src/components/presentation-vnext/slide-node-renderer.tsx`
- `src/components/presentation-vnext/selection-model.ts`
- `src/lib/presentation-vnext/editor-commands.ts`

Acceptance criteria:

- Users can select, drag, resize, nudge, duplicate, delete, and reorder v7 nodes.
- Stage interaction updates preserve valid `DeckV7`.
- Selection overlays match the old editor's usability and visual clarity.

## Workstream 5: Command And Mutation Migration

Goal: port old editor commands to v7-native command helpers.

Tasks:

- Implement v7 commands for node insert, duplicate, delete, reorder, group, and
  ungroup where supported.
- Implement v7 commands for geometry updates, z-index updates, lock/hide, and
  source metadata.
- Implement content commands for text, image, visual, table, shape, and
  connector nodes.
- Implement style commands for style binding, style variant, local style patch,
  and reset-to-theme.
- Ensure all commands are immutable, serializable where needed, and easy to
  validate with `safeParseDeckV7`.

Legacy reference files:

- `src/components/presentation/slide-editor/use-slide-element-commands.ts`
- `src/components/presentation/slide-editor/use-slide-background-commands.ts`
- `src/components/presentation/slide-editor/use-slide-insert-commands.ts`
- `src/components/presentation/slide-editor/use-slide-management-commands.ts`
- `src/components/presentation/slide-editor/use-slide-source-link-commands.ts`

V7 target files:

- `src/lib/presentation-vnext/editor-commands.ts`
- `src/lib/presentation-vnext/ids.ts`
- `src/lib/presentation-vnext/validation.ts`
- `src/lib/presentation-vnext/editor-commands.test.ts`

Acceptance criteria:

- Every common old editor mutation has a v7 equivalent or an explicit v7
  non-goal.
- Command tests validate both behavior and final `DeckV7` shape.
- No command writes v6 element fields.

## Workstream 6: Inspector Migration And VNext Additions

Goal: rebuild inspector parity while adding vNext-specific controls.

Tasks:

- Port slide-level panels for background, template, source, and view settings.
- Add vNext slide controls: tone, density, emphasis, decoration, and chrome.
- Port node-level panels for geometry, role, content, source link, lock/hidden,
  and layering.
- Add vNext style controls: style ref, variant, local style patch, reset to
  theme.
- Add type-specific panels for text, image, visual, shape, connector, table, and
  group.
- Add decoration inspector for generated theme decorations and detach action.
- Add render/export diagnostics with repair actions.

Legacy reference files:

- `src/components/presentation/slide-inspector/*`
- `src/components/presentation/slide-editor/panels/*`
- `src/components/presentation/slide-editor/source-panel.tsx`

V7 target files:

- `src/components/presentation-vnext/inspector/*`
- `src/lib/presentation-vnext/style-registry.ts`
- `src/lib/presentation-vnext/style-schema.ts`
- `src/lib/presentation-vnext/diagnostics.ts`

Acceptance criteria:

- Inspector panels are contextual and complete enough for real editing.
- Users can inspect and modify both semantic/template-level controls and visual
  style controls.
- Decorations and diagnostics have clear, actionable UI.

## Workstream 7: Template And Theme Editing Workflows

Goal: expose vNext concepts without breaking the old editor mental model.

Tasks:

- Show each slide's semantic template kind and layout id.
- Support template reapply using compatible slot preservation.
- Support selecting alternate layout variants when available.
- Support changing theme package without changing slide structure.
- Preserve user local overrides across theme changes.
- Add affordances for resetting local overrides back to theme defaults.

Primary files:

- `src/lib/presentation-vnext/template-registry.ts`
- `src/lib/presentation-vnext/template-compiler.ts`
- `src/lib/presentation-vnext/theme-packages.ts`
- `src/components/presentation-vnext/inspector/*`
- `src/lib/presentation-vnext/editor-commands.ts`

Acceptance criteria:

- Theme switching changes visual treatment only.
- Template reapply changes structure only where the user requested it.
- Local overrides are visible and reversible.

## Workstream 8: Autosave, Conflicts, And Persistence

Goal: preserve the old editor's persistence reliability in the v7 editor.

Tasks:

- Debounce v7 autosave with the same reliability expectations as the old editor.
- Validate every outgoing deck with `safeParseDeckV7`.
- Preserve revision-token CAS behavior.
- Port conflict recovery flows to `DeckV7` snapshots.
- Ensure manual Save flushes pending autosave work.
- Ensure invalid decks never reach persistence silently.

Primary files:

- `src/components/editor/use-slide-editor-open.ts`
- `src/components/presentation-vnext/conflict-recovery-dialog-v7.tsx`
- `src/lib/document/persistence/deck.ts`
- `src/lib/document/deck-cas-writer.test.ts`

Acceptance criteria:

- Edits autosave.
- Manual save works.
- Conflicts can be resolved with keep-mine or use-theirs behavior.
- Invalid v7 payloads are rejected with diagnostics.

## Workstream 9: Render, Present, Public, And Export Parity

Goal: all presentation surfaces share the v7 render model.

Tasks:

- Keep `resolveDeckRenderTree` as the single render source.
- Ensure editor, present mode, public viewer, HTML prototype previews, and export
  use equivalent fill/effect/table/decoration behavior.
- Add diagnostics and fallbacks for unsupported export features such as glass,
  blur, conic gradients, and patterns.
- Add focused screenshot or pixel checks once the v7 shell and stage are stable.

Primary files:

- `src/lib/presentation-vnext/render-resolver.ts`
- `src/components/presentation-vnext/slide-canvas.tsx`
- `src/components/presentation-vnext/slide-node-renderer.tsx`
- `src/components/presentation-vnext/present-mode-vnext.tsx`
- `src/components/presentation-vnext/public-present-viewer-vnext.tsx`
- `src/lib/presentation-vnext/pptx-export-adapter.ts`
- `prototypes/slide-themes/render-html.ts`

Acceptance criteria:

- The same `DeckV7` and `ThemePackageV1` render consistently across editor,
  present, public, prototype, and export surfaces.
- Unsupported export styling is visible as diagnostics, not silent loss.

## Migration Milestones

These milestones describe sequencing only. They are not separate release cuts,
and v7.0 should not ship as the default slide editor until the release blocker
matrix and verification gates above are satisfied.

### Milestone 1: Boundary, Shell, And Runtime Ownership

Goal: make v7 the only active editor runtime and prevent silent data loss.

Required outcomes:

- Full editor surface with stable toolbar, stage, inspector, filmstrip, status,
  save, close, present, and export entry points.
- Runtime `ThemePackageV1` resolution in editor, present, public render, and
  export paths.
- `openDeckFromJson` is the single open boundary for editor, present, public,
  and export contexts.
- V6 decks migrate once before entering the editor; invalid non-empty decks show
  recovery diagnostics.
- Save paths validate outgoing `DeckV7` and preserve CAS/revision-token conflict
  behavior.
- Right-surface coordination suppresses document popovers while the full editor
  is open.

### Milestone 2: Core Editing And Stage Parity

Goal: match the direct manipulation baseline of the legacy editor.

Required outcomes:

- Select, hover preselect, marquee, drag, resize, nudge, snap guides, duplicate,
  delete, clipboard, z-order, lock, hide, group, and ungroup work on v7 nodes.
- Group member direct editing, group entry/exit state, and layers interaction are
  implemented.
- Stage rotation handle and image crop handles work through pointer interaction.
- Connector endpoint drag/snap and endpoint binding lifecycle are implemented.
- Table cell-level editing and table row/column operations are usable without
  raw-data editing.
- Inline rich text editing supports commit/cancel, runs, lists, links,
  auto-height, Tab traversal, and toolbar commands.
- Canvas keyboard accessibility and focus restoration match the legacy contract.

### Milestone 3: Source, Assets, Deck Chrome, And Inspector Depth

Goal: close the old editor's content, source, asset, and chrome workflows.

Required outcomes:

- Source metadata, freshness hashes, stale/orphan detection, selected-node
  refresh, unlink/relink, and deck-level Source Review are implemented.
- Durable image upload, protected asset resolution, image replace/crop/alt/fit,
  visual picker/replace, visual channel colors, and orphan cleanup are wired.
- Deck-level logo, footer, page number, watermark, border, safe-area/frame
  chrome, slide overrides, and decoration disable/detach workflows are v7-native.
- Type-specific inspector panels cover text, shape, image, visual, connector,
  table, group, slide, arrange, effects, source, notes, layers, style binding,
  local overrides, and diagnostics.
- Diagnostics offer repair actions or clear object navigation for source,
  assets, styles, decorations, templates, migration, and export issues.

### Milestone 4: Template, Theme, And VNext Authoring

Goal: preserve mature authoring workflows while making v7 concepts explicit.

Required outcomes:

- Add slide presents semantic template/layout choices.
- Template reapply preserves compatible slots and source metadata.
- Theme switching changes visual language and chrome without changing the slide
  semantic tree.
- Local slide/node overrides are visible, explainable, and resettable.
- Theme package fallback, unknown style refs, missing package styles, missing
  decorations, and template overflow are diagnostic-driven.
- Theme decorations and deck chrome interact correctly with layers, detach,
  disable, render, present, public, and export surfaces.

### Milestone 5: Presentation, Export, Collaboration, And Release Evidence

Goal: prove that v7 can replace the legacy editor across the full product loop.

Required outcomes:

- Editor, present, public share, public embed, HTML prototype, and PPTX export
  render the same v7 deck intent or documented adapter fallback.
- PPTX support matrix and diagnostics cover text, images, visuals, shapes,
  connectors, tables, effects, decorations, deck chrome, and assets.
- Autosave, manual save flush, conflict recovery, undo/redo, presence, comment
  anchors, source anchors, and migration mappings work on v7 ids.
- Focused unit/component tests, E2E smoke flows, visual regression coverage, and
  export parity checks cover the release blocker matrix.
- Remaining parity polish is either completed or explicitly accepted as a
  short-lived rollout risk with owner and follow-up issue.

## Immediate Implementation Slice

The next implementation slice should choose the highest-risk unresolved blocker,
not the smallest remaining UI tweak. Based on the replacement scope above, good
candidate slices are:

1. **Source Review slice:** define the v7 source freshness contract, host block
   index, stale/orphan computation, selected-node refresh, and deck-level review
   actions.
2. **Deck chrome slice:** define the v7 deck chrome schema/overrides,
   decoration interaction, slide disable/detach behavior, and render/export
   parity path.
3. **Durable assets slice:** harden image upload, visual picker/replace, public
   asset resolution, export asset resolution, diagnostics, and orphan cleanup.
4. **Professional stage slice:** implement group member editing, stage rotation
   handle, connector endpoint drag/snap, and table cell editing.
5. **Release evidence slice:** add focused tests and screenshots for runtime
   behavior that already exists but lacks proof, especially inline rich text,
   filmstrip drag, stage keyboard, crop drag, and export parity.

Do not re-enable the old editor route as a way to reduce scope. The migration
target is a single active v7 editor that preserves the old editor's user value
through v7-native data and rendering contracts.
