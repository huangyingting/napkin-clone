# V7 Slide Editor Legacy Replacement GitHub Issues

**Status:** Planning backlog  
**Last updated:** 2026-06-30  
**Source:** [v7-slide-editor-implementation-plan.md](v7-slide-editor-implementation-plan.md)

This document translates the v7 slide editor legacy replacement plan into an
ordered GitHub issue backlog. The issue set assumes v7.0 is a full replacement
release for the legacy slide editor, not a short MVP.

Use this file as a staging area before creating GitHub issues. Create the epic
issues first, then create child issues in the order listed. Replace the local
ids such as `V7-E01` and `V7-013` with GitHub issue numbers after creation.

## Planning Rules

- Keep feature gaps separate from verification gaps.
- Do not reduce scope by re-enabling the old editor route.
- Do not add runtime compatibility layers for superseded v6 payload shapes.
- Preserve legacy user value through v7-native schema, commands, renderers, and
  host ports.
- Treat every release blocker as end-to-end: editor UI, host data, persistence,
  diagnostics, present/public render, export, and tests where applicable.

## Suggested Labels

Use existing repository labels where available. If labels need to be created,
use this set as the starting point:

| Label                        | Use                                                                |
| ---------------------------- | ------------------------------------------------------------------ |
| `area:presentation`          | All slide editor and render issues.                                |
| `area:presentation-vnext`    | V7/vNext-specific editor, schema, and render tree issues.          |
| `type:epic`                  | Parent tracking issues.                                            |
| `type:feature`               | User-visible feature implementation.                               |
| `type:verification`          | Tests, screenshots, export parity checks, release evidence.        |
| `type:docs`                  | Docs-only follow-up.                                               |
| `priority:release-blocker`   | Must be done before v7 replaces the legacy editor.                 |
| `priority:parity-polish`     | Existing path needs legacy-quality polish.                         |
| `priority:verification-gate` | Runtime may exist, but release evidence is missing.                |
| `track:boundary`             | Open, migration, persistence, runtime ownership.                   |
| `track:diagnostics`          | Diagnostics model, repair actions, review surfaces.                |
| `track:source-link`          | Source metadata, freshness, stale/orphan review, refresh/relink.   |
| `track:deck-chrome`          | Logo, footer, page numbers, watermark, frame, decorations.         |
| `track:assets`               | Image upload, visual picker, protected assets, orphan cleanup.     |
| `track:stage`                | Direct manipulation, grouping, connectors, tables, crop, rotation. |
| `track:theme-template`       | Semantic templates, theme packages, overrides, reapply.            |
| `track:render-export`        | Present, public, embed, prototype, PPTX export parity.             |
| `track:collaboration`        | Presence, anchors, conflicts, undo/redo reliability.               |

## Execution Order

The sequence below is dependency-first. Some implementation can happen in
parallel after the named foundation issues land, but the GitHub issues should be
triaged in this order so dependencies stay explicit.

| Order | Epic     | Title                                                  | Depends on         | Why it comes here                                                                  |
| ----- | -------- | ------------------------------------------------------ | ------------------ | ---------------------------------------------------------------------------------- |
| 0     | `V7-E00` | Replacement release governance and issue board         | None               | Creates labels, milestone, dependency graph, and final cutover rules.              |
| 1     | `V7-E01` | Runtime boundary, migration, persistence, and recovery | `V7-E00`           | Prevents data loss and establishes v7 as the only active runtime.                  |
| 2     | `V7-E02` | Diagnostics and repair action framework                | `V7-E01`           | Source, assets, theme fallback, migration, and export all need shared diagnostics. |
| 3     | `V7-E03` | Source-link replacement and deck-level Source Review   | `V7-E02`           | Highest host/data risk and required for document-derived slide trust.              |
| 4     | `V7-E04` | V7-native deck chrome replacement                      | `V7-E02`           | Requires schema/render decisions before theme/export polish.                       |
| 5     | `V7-E05` | Durable image and visual asset workflow                | `V7-E02`           | Required before public/export parity can be trustworthy.                           |
| 6     | `V7-E06` | Professional stage direct-manipulation parity          | `V7-E01`           | Restores legacy editing power on v7 nodes.                                         |
| 7     | `V7-E07` | Template and theme authoring parity                    | `V7-E04`           | Builds on theme/deck chrome decisions and local override semantics.                |
| 8     | `V7-E08` | Present, public, prototype, and PPTX export parity     | `V7-E03`-`V7-E07`  | Proves authored decks survive every consumption surface.                           |
| 9     | `V7-E09` | Collaboration, anchors, presence, and command history  | `V7-E01`, `V7-E06` | Aligns v7 ids with collaboration and recovery behavior.                            |
| 10    | `V7-E10` | Release verification, visual regression, and rollout   | All epics          | Converts implemented behavior into release evidence.                               |

## Epic Issues

### `V7-E00` Epic: Replacement Release Governance And Issue Board

**Labels:** `type:epic`, `area:presentation-vnext`, `priority:release-blocker`

#### GitHub Issue Body

The v7 slide editor release is now defined as a legacy replacement release. We
need the GitHub planning structure to reflect that decision before implementing
the remaining work.

#### Scope

- Create the v7 replacement milestone.
- Create or normalize labels for release blockers, parity polish, verification
  gates, and work tracks.
- Create all epic issues from this document.
- Create child issues in execution order.
- Replace local placeholder ids in issue bodies with GitHub issue references.
- Track which blocker matrix rows are implemented, partially implemented, or
  missing.

#### Acceptance Criteria

- [ ] GitHub milestone exists for the v7 legacy replacement release.
- [ ] Epic issues exist for `V7-E01` through `V7-E10`.
- [ ] Child issues include dependencies and verification requirements.
- [ ] Release blockers, parity polish, and verification gates are distinct in
      GitHub labels or project fields.
- [ ] The default-editor cutover criteria are captured in the milestone or
      release tracking issue.

#### Child Issues

- `V7-001`: Create v7 replacement milestone, labels, and project fields.
- `V7-002`: Create the epic issue set and dependency graph.
- `V7-003`: Audit current vNext runtime against the blocker matrix.

### `V7-E01` Epic: Runtime Boundary, Migration, Persistence, And Recovery

**Labels:** `type:epic`, `area:presentation-vnext`, `priority:release-blocker`, `track:boundary`

#### GitHub Issue Body

Make v7 the only active editor runtime and guarantee that existing deck data is
either opened safely, migrated once, or shown in a recovery state. This epic is
foundational for every other v7 replacement issue.

#### Scope

- Use `openDeckFromJson` as the single open boundary for editor, present,
  public, embed, and export contexts.
- Preserve deck, slide, node, source, asset, and theme identifiers during v7
  pass-through and v6 migration.
- Reject silent blank-deck replacement for non-empty invalid input.
- Validate all outgoing `DeckV7` payloads before persistence.
- Preserve autosave/manual save/CAS conflict recovery semantics for v7 decks.
- Ensure undo/redo tracks committed v7 deck changes, not only transient UI
  state.

#### Primary Files

- `src/lib/presentation-vnext/open-deck.ts`
- `src/lib/presentation-vnext/migration-v6.ts`
- `src/lib/presentation-vnext/validation.ts`
- `src/components/editor/use-slide-editor-open.ts`
- `src/components/presentation-vnext/conflict-recovery-dialog-v7.tsx`
- `src/lib/document/persistence/deck.ts`

#### Acceptance Criteria

- [ ] Valid v7 deck JSON opens unchanged in every product presentation surface.
- [ ] Migratable v6 decks open as valid `DeckV7` and save back only as v7.
- [ ] Invalid non-empty deck JSON shows recovery diagnostics instead of a blank
      deck.
- [ ] Manual save flushes autosave work and validates before persistence.
- [ ] CAS conflicts show a v7 conflict recovery dialog with keep-mine and
      use-theirs paths.
- [ ] Undo/redo updates v7 deck state and preserves sensible focus/selection.

#### Child Issues

- `V7-004`: Make `openDeckFromJson` the only deck open boundary across editor,
  present, public, embed, and export.
- `V7-005`: Preserve v7 identity and v6 migration mappings for slides, nodes,
  sources, assets, and themes.
- `V7-006`: Add invalid non-empty deck recovery state and diagnostics.
- `V7-007`: Validate every outgoing `DeckV7` before save/autosave persistence.
- `V7-008`: Port manual save flush and CAS conflict recovery fully to v7.
- `V7-009`: Harden v7 undo/redo history and focus restoration.

### `V7-E02` Epic: Diagnostics And Repair Action Framework

**Labels:** `type:epic`, `area:presentation-vnext`, `priority:release-blocker`, `track:diagnostics`

#### GitHub Issue Body

Create a shared diagnostics and repair framework for v7 so source links, deck
chrome, assets, theme packages, migration, render, and export all report issues
consistently.

#### Scope

- Define diagnostic severity, scope, target identity, and repair action shape.
- Route object-level diagnostics to the inspector.
- Route deck-level diagnostics to review surfaces.
- Apply repair actions through v7 editor commands and revalidate the deck.
- Prevent present/public/export flows from silently swallowing fallbacks the user
  needs to understand.

#### Primary Files

- `src/lib/presentation-vnext/diagnostics.ts`
- `src/components/presentation-vnext/inspector/diagnostics-panel.tsx`
- `src/lib/presentation-vnext/render-resolver.ts`
- `src/lib/presentation-vnext/export-spec.ts`
- `src/lib/presentation-vnext/open-deck.ts`

#### Acceptance Criteria

- [ ] Diagnostics distinguish migration, source, asset, theme, render, export,
      and validation problems.
- [ ] Diagnostics can target deck, slide, node, asset, style ref, source block,
      or export feature.
- [ ] Repair actions are typed and run through v7 command/update paths.
- [ ] Applying a repair revalidates the deck and refreshes diagnostics.
- [ ] The diagnostics UI supports object navigation and deck-level review.

#### Child Issues

- `V7-010`: Define shared v7 diagnostic target, severity, action, and grouping
  model.
- `V7-011`: Add deck-level diagnostics routing and review surface entry points.
- `V7-012`: Make diagnostic repair actions command-backed and revalidation-safe.
- `V7-013`: Integrate migration, source, asset, theme, render, and export
  diagnostics into the shared framework.

### `V7-E03` Epic: Source-Link Replacement And Deck-Level Source Review

**Labels:** `type:epic`, `area:presentation-vnext`, `priority:release-blocker`, `track:source-link`

#### GitHub Issue Body

Replace the legacy source-link workflow with a v7-native source metadata,
freshness, refresh, relink, and deck-level review system.

#### Scope

- Store enough source metadata on v7 nodes to identify source document context,
  block id, block kind, hash/revision, and last refresh state.
- Provide a host block index for the current document and explicit fetch path for
  remote/cross-document sources.
- Classify source-linked nodes as fresh, stale, orphaned, unlinked, or unknown.
- Let users refresh, unlink, and relink selected nodes.
- Add deck-level Source Review for all stale/orphaned nodes.
- Preserve source identity through v6-to-v7 migration.

#### Primary Files

- `src/components/presentation-vnext/inspector/node-source-panel.tsx`
- `src/components/presentation-vnext/inspector/diagnostics-panel.tsx`
- `src/components/presentation-vnext/slide-editor-vnext.tsx`
- `src/components/editor/slide-editor-button.tsx`
- `src/lib/presentation/document-block-hash.ts`
- `src/lib/presentation/source-link-staleness.ts`
- `src/lib/presentation-vnext/editor-commands.ts`

#### Acceptance Criteria

- [ ] Source panel shows fresh/stale/orphan/unlinked state for selected nodes.
- [ ] Refresh updates v7 node content from the correct source block.
- [ ] Relink review makes block identity and risk visible before applying.
- [ ] Deck-level Source Review lists all stale and orphaned nodes by slide.
- [ ] Refresh all only applies safe matches and reports skipped/risky nodes.
- [ ] V6 migration preserves enough source identity for v7 review.

#### Child Issues

- `V7-014`: Define v7 source metadata and migration mapping contract.
- `V7-015`: Add host block index and source hash plumbing for the document
  editor.
- `V7-016`: Implement fresh/stale/orphan source classification for v7 nodes.
- `V7-017`: Implement selected-node refresh, unlink, and relink commands.
- `V7-018`: Build deck-level Source Review UI and diagnostics grouping.
- `V7-019`: Implement refresh all, resolve one by one, and safe skip behavior.
- `V7-020`: Add source-link migration and review tests.

### `V7-E04` Epic: V7-Native Deck Chrome Replacement

**Labels:** `type:epic`, `area:presentation-vnext`, `priority:release-blocker`, `track:deck-chrome`

#### GitHub Issue Body

Replace legacy master chrome user value with v7-native deck chrome, theme
decoration, and slide override behavior. Do not reintroduce v6 `masters[]` or
`defaultMasterId`.

#### Scope

- Model deck-level logo, footer, page number, watermark, border, and safe-area
  chrome in v7 terms.
- Render deck chrome consistently in editor, thumbnails, present, public,
  prototype, and PPTX export.
- Let slides override, disable, detach, or customize chrome where supported.
- Keep theme decorations and deck chrome unambiguous in z-order and layers.
- Preserve relevant v6 master chrome intent during migration.

#### Primary Files

- `src/lib/presentation-vnext/schema.ts`
- `src/lib/presentation-vnext/theme-package-schema.ts`
- `src/lib/presentation-vnext/render-resolver.ts`
- `src/components/presentation-vnext/inspector/slide-settings-panel.tsx`
- `src/components/presentation-vnext/inspector/layers-panel.tsx`
- `src/lib/presentation-vnext/pptx-export-adapter.ts`

#### Acceptance Criteria

- [ ] Users can configure global logo, footer, page number, watermark, border,
      and frame/safe-area chrome.
- [ ] Slide-level disable/override/detach behavior is explicit and reversible.
- [ ] Layers mode distinguishes user nodes, theme decorations, and deck chrome.
- [ ] Deck chrome renders consistently across editor, present, public, and PPTX.
- [ ] V6 migration preserves supported chrome intent without active v6 masters.

#### Child Issues

- `V7-021`: Define v7 deck chrome schema and theme override contract.
- `V7-022`: Render deck chrome and theme decorations through the v7 render tree.
- `V7-023`: Add deck chrome editor controls and slide override controls.
- `V7-024`: Expose deck chrome and decorations correctly in layers mode.
- `V7-025`: Add deck chrome PPTX/public/present parity.
- `V7-026`: Migrate supported v6 master chrome intent into v7-native chrome.

### `V7-E05` Epic: Durable Image And Visual Asset Workflow

**Labels:** `type:epic`, `area:presentation-vnext`, `priority:release-blocker`, `track:assets`

#### GitHub Issue Body

Make image and visual workflows durable and consistent across editor, present,
public, and export. Data URLs may remain a fallback only for host surfaces that
intentionally omit durable upload support.

#### Scope

- Wire image insert/replace to protected slide asset upload in product document
  surfaces.
- Store uploaded asset metadata in `DeckV7.assets.images`.
- Resolve assets consistently in editor, thumbnails, present, public, and PPTX.
- Provide visual picker and replacement flows.
- Interpret supported visual channel colors in render/export paths.
- Detect and clean up orphaned slide assets safely.

#### Primary Files

- `src/components/presentation-vnext/slide-editor-vnext.tsx`
- `src/components/presentation-vnext/inspector/node-content-panel.tsx`
- `src/lib/slides/asset-upload.ts`
- `src/lib/slides/asset-storage.ts`
- `src/lib/slides/asset-resolver.ts`
- `src/lib/slides/asset-orphan.ts`
- `src/lib/presentation-vnext/render-resolver.ts`
- `src/lib/presentation-vnext/pptx-export-adapter.ts`

#### Acceptance Criteria

- [ ] Product image insert/replace stores durable asset references, not data URL
      primary payloads.
- [ ] Image fit, crop, alt text, dimensions, MIME type, and content hash are
      preserved where available.
- [ ] Public and export paths resolve the same image/visual assets as editor.
- [ ] Visual replacement preserves layout, source metadata, and intentional
      local style overrides.
- [ ] Supported visual channel colors render and export; unsupported channels
      produce diagnostics.
- [ ] Orphan detection avoids deleting assets still referenced anywhere in the
      deck or public render surface.

#### Child Issues

- `V7-027`: Wire v7 image insert/replace to durable slide asset upload.
- `V7-028`: Normalize `DeckV7.assets.images` metadata and resolver behavior.
- `V7-029`: Complete image replace, fit, crop, alt, diagnostics, and export
  parity.
- `V7-030`: Implement host-backed visual picker and visual replacement flow.
- `V7-031`: Render/export supported visual channel colors and diagnose gaps.
- `V7-032`: Implement slide asset orphan detection and cleanup strategy.
- `V7-033`: Add protected public asset resolution coverage for v7 decks.

### `V7-E06` Epic: Professional Stage Direct-Manipulation Parity

**Labels:** `type:epic`, `area:presentation-vnext`, `priority:release-blocker`, `track:stage`

#### GitHub Issue Body

Bring the v7 stage to legacy replacement quality for direct manipulation. Users
should not lose professional editing flows when switching from the old editor.

#### Scope

- Preserve selection, hover, marquee, drag, resize, nudge, snap, z-order,
  clipboard, duplicate, delete, lock/hide, group, and ungroup behavior on v7
  nodes.
- Add group member direct editing and visible group entry/exit state.
- Add stage rotation handle for rotatable nodes.
- Add connector endpoint drag/snap and endpoint binding lifecycle.
- Add table cell-level editing and table ergonomics.
- Harden image crop drag/reset behavior.
- Preserve keyboard accessibility and focus restoration.

#### Primary Files

- `src/components/presentation-vnext/slide-editor-vnext.tsx`
- `src/components/presentation-vnext/slide-canvas.tsx`
- `src/components/presentation-vnext/slide-node-renderer.tsx`
- `src/components/presentation-vnext/selection-model.ts`
- `src/components/presentation-vnext/toolbar/context-toolbar.tsx`
- `src/components/presentation-vnext/inspector/node-geometry-panel.tsx`
- `src/lib/presentation-vnext/editor-commands.ts`
- `src/lib/presentation-vnext/selection-geometry.ts`
- `src/lib/presentation-vnext/stage-guides.ts`

#### Acceptance Criteria

- [ ] Group members can be selected and edited without ungrouping.
- [ ] Rotation handle updates v7 layout rotation and supports expected snapping
      or precision behavior.
- [ ] Connector endpoints drag, snap, bind to node anchors, and survive node
      move/resize/delete where possible.
- [ ] Table cells can be edited directly and preserve valid v7 table content.
- [ ] Crop handles support drag and reset behavior.
- [ ] Keyboard move/resize/delete/duplicate/group flows restore focus and
      announce changes.

#### Child Issues

- `V7-034`: Implement group member direct editing and group entry/exit state.
- `V7-035`: Add stage rotation handle and rotation command plumbing.
- `V7-036`: Implement connector endpoint drag/snap and binding lifecycle.
- `V7-037`: Add direct table cell editing and table focus model.
- `V7-038`: Harden image crop drag/reset and crop diagnostics.
- `V7-039`: Complete stage keyboard/focus restoration/a11y parity.
- `V7-040`: Polish context toolbar grouping for stage editing commands.

### `V7-E07` Epic: Template And Theme Authoring Parity

**Labels:** `type:epic`, `area:presentation-vnext`, `priority:release-blocker`, `track:theme-template`

#### GitHub Issue Body

Expose v7 semantic templates, theme packages, layout variants, style bindings,
and local overrides through mature authoring workflows.

#### Scope

- Add slide through semantic template/layout choices.
- Reapply templates while preserving compatible slots and source metadata.
- Switch themes without rewriting the semantic slide tree.
- Make slide/node local overrides visible and resettable.
- Diagnose unknown style refs, missing package styles, missing decorations,
  template overflow, and theme fallback.
- Keep theme decorations and deck chrome consistent with layers, detach, disable,
  render, public, and export behavior.

#### Primary Files

- `src/lib/presentation-vnext/template-registry.ts`
- `src/lib/presentation-vnext/template-compiler.ts`
- `src/lib/presentation-vnext/theme-packages.ts`
- `src/lib/presentation-vnext/theme-package-registry.ts`
- `src/components/presentation-vnext/inspector/slide-controls-panel.tsx`
- `src/components/presentation-vnext/inspector/style-binding-panel.tsx`
- `src/components/presentation-vnext/inspector/local-style-panel.tsx`
- `src/lib/presentation-vnext/diagnostics.ts`

#### Acceptance Criteria

- [ ] Add slide opens semantic template/layout choices instead of only blank
      slide creation.
- [ ] Template reapply preserves compatible slot content and source metadata.
- [ ] Theme switching updates visual language without changing semantic slide
      structure.
- [ ] Local overrides are visible, explainable, and resettable.
- [ ] Theme fallback and unknown refs are user-visible diagnostics with repairs.

#### Child Issues

- `V7-041`: Build semantic template/layout picker for Add slide.
- `V7-042`: Implement template reapply with slot/source preservation.
- `V7-043`: Harden theme switching to preserve semantic structure and local
  overrides.
- `V7-044`: Add slide/node local override visibility and reset UX.
- `V7-045`: Add style ref, missing package style, decoration, and template
  overflow repair diagnostics.
- `V7-046`: Align theme decorations with deck chrome layers, detach, and export.

### `V7-E08` Epic: Present, Public, Prototype, And PPTX Export Parity

**Labels:** `type:epic`, `area:presentation-vnext`, `priority:release-blocker`, `track:render-export`

#### GitHub Issue Body

Ensure a v7-authored deck renders consistently in the editor, present mode,
public share, public embed, HTML prototypes, and PPTX export.

#### Scope

- Use `resolveDeckRenderTree` or documented equivalent adapters across all
  presentation surfaces.
- Define support matrix for text, rich text, images, visuals, shapes,
  connectors, tables, backgrounds, decorations, deck chrome, local styles,
  source-derived content, and effects.
- Add preflight diagnostics for unsupported export features.
- Ensure public routes open v7 data through the v7 boundary and resolve theme
  packages/assets.
- Keep prototype renderer behavior aligned with product rendering.

#### Primary Files

- `src/lib/presentation-vnext/render-resolver.ts`
- `src/components/presentation-vnext/slide-canvas.tsx`
- `src/components/presentation-vnext/present-mode-vnext.tsx`
- `src/components/presentation-vnext/public-present-viewer-vnext.tsx`
- `src/lib/public-render/presentation.ts`
- `src/lib/presentation-vnext/export-spec.ts`
- `src/lib/presentation-vnext/pptx-export-adapter.ts`
- `src/lib/presentation-vnext/pptx-vnext-apply.ts`
- `prototypes/slide-themes/render-html.ts`

#### Acceptance Criteria

- [ ] Representative decks match across editor, present, public, embed,
      prototype, and PPTX export within documented limits.
- [ ] Public share/embed routes use v7 open boundary, theme resolution, and
      protected asset resolution.
- [ ] PPTX export has diagnostics for every unsupported effect or fallback.
- [ ] Deck chrome, decorations, assets, tables, connectors, and visuals have
      explicit render/export behavior.
- [ ] Theme package fallback is visible where user action is possible.

#### Child Issues

- `V7-047`: Create v7 render/export parity support matrix and fixture decks.
- `V7-048`: Align present/public/embed routes with v7 boundary, themes, and
  assets.
- `V7-049`: Complete PPTX adapter coverage for v7 core node types.
- `V7-050`: Add export diagnostics for unsupported effects and fallbacks.
- `V7-051`: Align prototype HTML renderer with product v7 render tree.
- `V7-052`: Add representative parity checks for editor/present/public/PPTX.

### `V7-E09` Epic: Collaboration, Anchors, Presence, And Command History

**Labels:** `type:epic`, `area:presentation-vnext`, `priority:release-blocker`, `track:collaboration`

#### GitHub Issue Body

Preserve collaboration expectations when the editor switches from legacy deck
elements to v7 slide/node ids.

#### Scope

- Preserve or map comment anchors and source anchors through v6-to-v7 migration.
- Ensure slide-level presence works on v7 slides.
- Ensure node-level presence, where enabled, uses v7 node ids and avoids stale
  nodes.
- Keep command history, focus restoration, save state, and collaboration updates
  consistent.
- Prevent collaboration code from writing v6 element fields through v7 commands.

#### Primary Files

- `src/components/editor/use-slide-editor-open.ts`
- `src/lib/presentation/use-slide-presence.ts`
- `src/lib/presentation/slide-comment-anchors.ts`
- `src/lib/presentation-vnext/migration-v6.ts`
- `src/lib/presentation-vnext/editor-commands.ts`
- `src/lib/document/persistence/deck.ts`

#### Acceptance Criteria

- [ ] Legacy slide/comment/source anchors survive migration or receive explicit
      mapping diagnostics.
- [ ] Slide-level presence renders on v7 slides.
- [ ] Node-level presence uses v7 node ids and handles hidden/deleted/detached
      nodes safely.
- [ ] Command history and collaboration state never write v6 element fields.
- [ ] Conflict recovery, undo/redo, and focus restoration remain consistent
      during collaborative editing.

#### Child Issues

- `V7-053`: Preserve or map legacy comment/source anchors during v7 migration.
- `V7-054`: Port slide-level and node-level presence to v7 ids.
- `V7-055`: Harden command history with collaboration/save/focus state.
- `V7-056`: Add collaboration safety tests that prevent v6 element writes.

### `V7-E10` Epic: Release Verification, Visual Regression, And Rollout

**Labels:** `type:epic`, `area:presentation-vnext`, `priority:verification-gate`, `type:verification`

#### GitHub Issue Body

Convert implemented v7 replacement behavior into release evidence. This epic is
not a dumping ground for missing features; it proves runtime behavior already
claimed by the release blocker matrix.

#### Scope

- Add focused unit tests for schema, commands, migration, source, assets,
  diagnostics, render, and export logic.
- Add component/integration coverage for editor UI flows.
- Extend E2E smoke coverage for full authoring and consumption flows.
- Add visual regression coverage for editor layout and critical stage chrome.
- Add export parity checks for representative decks.
- Create final default-editor rollout checklist.

#### Acceptance Criteria

- [ ] Every release blocker has either feature implementation issues still open
      or verification evidence linked.
- [ ] E2E covers open, edit, save, present, public, and export for v7 decks.
- [ ] Visual regression covers desktop, mobile, inspector, filmstrip, dense deck,
      and overlapped node states.
- [ ] Export parity covers assets, tables, connectors, decorations, deck chrome,
      and unsupported-effect diagnostics.
- [ ] Release checklist blocks default-editor cutover until all blocker epics are
      closed.

#### Child Issues

- `V7-057`: Add open/migration/save/conflict validation tests.
- `V7-058`: Add source-link and Source Review tests.
- `V7-059`: Add deck chrome, assets, and diagnostics tests.
- `V7-060`: Add stage interaction, keyboard, and accessibility tests.
- `V7-061`: Add template/theme authoring tests.
- `V7-062`: Add present/public/export parity tests and fixtures.
- `V7-063`: Add visual regression coverage for editor layout and stage chrome.
- `V7-064`: Create final v7 default-editor rollout checklist.

## Child Issue Details

The sections below are ready-to-copy child issue bodies. When creating the
issues in GitHub, replace local dependency ids with actual issue references.

### `V7-001` Create v7 replacement milestone, labels, and project fields

**Labels:** `area:presentation-vnext`, `type:feature`, `priority:release-blocker`

#### Context

The v7 release is now a legacy replacement release. GitHub planning needs to
separate release blockers, parity polish, verification gates, and non-goals so
the team does not treat untested runtime behavior as missing feature work.

#### Scope

- Create the release milestone.
- Add labels listed in this document or map them to existing labels.
- Add project fields for scope class, track, dependency, and release status.
- Create a saved view ordered by execution sequence.

#### Acceptance Criteria

- [ ] Milestone exists and links to the implementation plan.
- [ ] Labels or equivalent project fields exist for all scope classes and work
      tracks.
- [ ] Project view can filter release blockers separately from verification
      gates.
- [ ] Project view can show dependency order from `V7-E00` to `V7-E10`.

#### Verification

- [ ] Manually inspect the GitHub project/milestone setup.

### `V7-002` Create the epic issue set and dependency graph

**Labels:** `area:presentation-vnext`, `type:feature`, `priority:release-blocker`

#### Context

The epics are the long-lived coordination issues for the replacement release.

#### Scope

- Create epic issues `V7-E01` through `V7-E10`.
- Link each epic to this planning doc and the implementation plan.
- Add dependency links between epics.
- Add child issue placeholders or task lists.

#### Acceptance Criteria

- [ ] All epic issues exist in GitHub.
- [ ] Epic issue bodies include scope, primary files, acceptance criteria, and
      child issues.
- [ ] Dependencies are visible in issue bodies or GitHub project fields.

#### Verification

- [ ] Manually inspect epic issue links and dependency order.

### `V7-003` Audit current vNext runtime against the blocker matrix

**Labels:** `area:presentation-vnext`, `type:feature`, `priority:release-blocker`

#### Context

Some v7 runtime behavior already exists. Before opening implementation work,
mark each blocker matrix row as implemented, partial, missing, or verification
only.

#### Scope

- Audit current code against the blocker matrix.
- Mark runtime features separately from tests/coverage.
- Attach code references for each partial or missing feature.
- Convert audit findings into child issue edits.

#### Acceptance Criteria

- [ ] Each blocker matrix row has status: implemented, partial, missing, or
      verification gate.
- [ ] Existing implementation is not duplicated by new issues.
- [ ] Missing feature issues include precise local anchors.

#### Verification

- [ ] Review audit with the implementation plan open.

### `V7-004` Make `openDeckFromJson` the only deck open boundary

**Labels:** `area:presentation-vnext`, `track:boundary`, `type:feature`, `priority:release-blocker`

**Depends on:** `V7-E01`

#### Context

The v7 editor, present mode, public render, embed, and export paths must share a
single deck open boundary so v7 validation and v6 migration behavior cannot
drift.

#### Scope

- Find all deck JSON entry points in editor, present, public, embed, and export.
- Route each through `openDeckFromJson` or a documented wrapper around it.
- Preserve valid v7 decks unchanged.
- Return structured diagnostics for migration or invalid input.

#### Acceptance Criteria

- [ ] Editor open path uses the v7 open boundary.
- [ ] Present mode uses the v7 open boundary for saved/fetched deck JSON.
- [ ] Public share and embed paths use the v7 open boundary.
- [ ] Export path uses the v7 open boundary before producing export specs.
- [ ] Unknown or invalid non-empty deck data does not silently become blank.

#### Verification

- [ ] Focused open-boundary unit tests.
- [ ] Narrow integration test for editor/present/public/export open behavior.

### `V7-005` Preserve identity and migration mappings for v7 and migrated v6 decks

**Labels:** `area:presentation-vnext`, `track:boundary`, `type:feature`, `priority:release-blocker`

**Depends on:** `V7-004`

#### Context

Collaboration, anchors, source links, comments, and asset references depend on
stable identity across open and migration.

#### Scope

- Preserve valid v7 deck, slide, node, asset, source, and theme ids.
- During v6 migration, preserve ids where compatible.
- Generate explicit mapping metadata where ids must change.
- Expose mapping to comment/source anchor migration code.

#### Acceptance Criteria

- [ ] Valid v7 pass-through does not rewrite ids.
- [ ] V6 migration preserves compatible slide and element ids as v7 slide/node
      ids.
- [ ] Required id rewrites produce a mapping consumable by anchor migration.
- [ ] Migration diagnostics identify dropped or unmappable identities.

#### Verification

- [ ] Migration tests with comments/source/assets fixtures.
- [ ] Snapshot tests for id preservation and mapping output.

### `V7-006` Add invalid non-empty deck recovery state and diagnostics

**Labels:** `area:presentation-vnext`, `track:boundary`, `track:diagnostics`, `type:feature`, `priority:release-blocker`

**Depends on:** `V7-004`, `V7-010`

#### Context

The replacement release must not hide bad data by creating a blank deck. Invalid
non-empty decks need a visible recovery state.

#### Scope

- Add recovery state for invalid or unsupported non-empty deck JSON.
- Surface validation/migration diagnostics.
- Provide user actions for retry, start blank explicitly, or return to document.
- Ensure the blank path is explicit and does not overwrite existing deck data
  without confirmation.

#### Acceptance Criteria

- [ ] Invalid non-empty input renders recovery UI, not editor with blank deck.
- [ ] Recovery UI shows actionable diagnostics.
- [ ] Starting blank is explicit and guarded.
- [ ] No save occurs from recovery state unless the user chooses a safe path.

#### Verification

- [ ] Unit tests for invalid open results.
- [ ] Component/integration test for recovery UI.

### `V7-007` Validate every outgoing `DeckV7` before save/autosave persistence

**Labels:** `area:presentation-vnext`, `track:boundary`, `type:feature`, `priority:release-blocker`

**Depends on:** `V7-004`

#### Context

Invalid v7 payloads must fail before persistence and surface diagnostics.

#### Scope

- Validate manual save payloads.
- Validate autosave payloads.
- Convert validation failures to save errors and diagnostics.
- Avoid writing partial or invalid decks after command failures.

#### Acceptance Criteria

- [ ] Manual save rejects invalid `DeckV7` before persistence.
- [ ] Autosave rejects invalid `DeckV7` before persistence.
- [ ] Save status reflects validation errors.
- [ ] Diagnostics include enough path information to fix the deck.

#### Verification

- [ ] Focused save-boundary tests.
- [ ] Regression test for invalid deck not being persisted.

### `V7-008` Port manual save flush and CAS conflict recovery fully to v7

**Labels:** `area:presentation-vnext`, `track:boundary`, `track:collaboration`, `type:feature`, `priority:release-blocker`

**Depends on:** `V7-007`

#### Context

Manual save and conflict recovery are core reliability promises from the legacy
editor.

#### Scope

- Ensure manual save flushes queued autosave work.
- Preserve revision-token/CAS behavior for v7 deck snapshots.
- Show v7 conflict recovery dialog on conflict.
- Implement keep-mine and use-theirs behavior for v7 payloads.

#### Acceptance Criteria

- [ ] Manual save does not report success before queued work is persisted.
- [ ] Conflict dialog receives v7 deck snapshots.
- [ ] Keep-mine validates and persists the local v7 deck.
- [ ] Use-theirs replaces local state with server v7 deck safely.

#### Verification

- [ ] Existing deck CAS writer tests extended for v7 payloads.
- [ ] Component test for conflict recovery dialog behavior.

### `V7-009` Harden v7 undo/redo history and focus restoration

**Labels:** `area:presentation-vnext`, `track:boundary`, `track:stage`, `type:feature`, `priority:release-blocker`

**Depends on:** `V7-007`

#### Context

Undo/redo must cover v7 command changes and leave selection/focus in a sensible
state.

#### Scope

- Ensure v7 deck command results enter undo/redo history.
- Keep selection/focus restoration after undo/redo of insert, delete, group,
  ungroup, move, and style changes.
- Avoid undoing host-only state such as transient popovers unless intended.

#### Acceptance Criteria

- [ ] Undo/redo works for slide, node, content, style, geometry, and source
      changes.
- [ ] Focus restores to changed nodes or stable fallback after undo/redo.
- [ ] Save dirty state reflects undo/redo correctly.

#### Verification

- [ ] Unit tests for history behavior where possible.
- [ ] Component/integration tests for representative editor flows.

### `V7-010` Define shared v7 diagnostic target, severity, action, and grouping model

**Labels:** `area:presentation-vnext`, `track:diagnostics`, `type:feature`, `priority:release-blocker`

**Depends on:** `V7-E02`

#### Context

Every blocker track needs diagnostics. The schema needs to support object
targets and repair actions without becoming track-specific.

#### Scope

- Define diagnostic target types.
- Define severity and category vocabulary.
- Define repair action shape.
- Define grouping by deck, slide, node, asset, source, style, or export feature.

#### Acceptance Criteria

- [ ] Diagnostics can target deck, slide, node, asset, source block, style ref,
      theme package, and export feature.
- [ ] Severity and category values are stable and documented in code.
- [ ] Repair action payloads are typed.
- [ ] Existing diagnostics migrate to the shared model.

#### Verification

- [ ] Unit tests for diagnostic grouping and action typing.

### `V7-011` Add deck-level diagnostics routing and review surface entry points

**Labels:** `area:presentation-vnext`, `track:diagnostics`, `type:feature`, `priority:release-blocker`

**Depends on:** `V7-010`

#### Context

Some diagnostics are not tied to the selected object. Users need a deck-level
entry point for source review, export preflight, assets, and theme fallback.

#### Scope

- Add deck-level diagnostics count/status affordance.
- Route deck-level diagnostics to a review surface.
- Preserve selection when opening and closing review surfaces.
- Support navigation from a diagnostic to the affected slide/node.

#### Acceptance Criteria

- [ ] Deck-level diagnostics are discoverable without selecting the affected
      object.
- [ ] Diagnostics can navigate to affected slide/node where applicable.
- [ ] Review surface can host source, asset, theme, migration, and export groups.

#### Verification

- [ ] Component tests for routing and navigation.

### `V7-012` Make diagnostic repair actions command-backed and revalidation-safe

**Labels:** `area:presentation-vnext`, `track:diagnostics`, `type:feature`, `priority:release-blocker`

**Depends on:** `V7-010`, `V7-007`

#### Context

Repair actions must mutate the deck through normal v7 commands and revalidate
the result.

#### Scope

- Implement repair action dispatcher.
- Route actions through editor commands or host ports.
- Revalidate and refresh diagnostics after repair.
- Preserve focus/selection after repair.

#### Acceptance Criteria

- [ ] Repair actions never write deck JSON directly from UI components.
- [ ] Failed repair actions leave the prior deck state intact.
- [ ] Successful repairs clear or update diagnostics.
- [ ] Focus/selection remains predictable after repair.

#### Verification

- [ ] Unit tests for repair dispatcher.
- [ ] Component tests for representative repair actions.

### `V7-013` Integrate migration, source, asset, theme, render, and export diagnostics

**Labels:** `area:presentation-vnext`, `track:diagnostics`, `type:feature`, `priority:release-blocker`

**Depends on:** `V7-010`, `V7-011`, `V7-012`

#### Context

Diagnostics should feel like one product system even when generated by different
subsystems.

#### Scope

- Convert migration diagnostics to shared model.
- Convert source freshness diagnostics to shared model.
- Convert missing asset diagnostics to shared model.
- Convert theme/style fallback diagnostics to shared model.
- Convert render/export unsupported-feature diagnostics to shared model.

#### Acceptance Criteria

- [ ] All v7 diagnostics render in the same panel/review surface.
- [ ] Categories and severities are consistent across subsystems.
- [ ] User-visible fallbacks are not logged-only.

#### Verification

- [ ] Unit tests for each diagnostic producer.
- [ ] Integration test showing mixed diagnostics in one deck.

### `V7-014` Define v7 source metadata and migration mapping contract

**Labels:** `area:presentation-vnext`, `track:source-link`, `type:feature`, `priority:release-blocker`

**Depends on:** `V7-005`, `V7-010`

#### Context

Source freshness and review need stable source identity on v7 nodes.

#### Scope

- Define required source metadata fields.
- Include source document context, block id, kind, hash/revision, and refresh
  metadata.
- Define migration behavior from legacy source refs.
- Define diagnostics for unmappable source refs.

#### Acceptance Criteria

- [ ] v7 source metadata supports fresh/stale/orphan classification.
- [ ] Legacy source refs migrate where possible.
- [ ] Unmappable source refs produce diagnostics.
- [ ] Source metadata does not depend on v6 element shape.

#### Verification

- [ ] Schema/validation tests.
- [ ] Migration fixture tests.

### `V7-015` Add host block index and source hash plumbing for the document editor

**Labels:** `area:presentation-vnext`, `track:source-link`, `type:feature`, `priority:release-blocker`

**Depends on:** `V7-014`

#### Context

The editor cannot compute freshness honestly unless the host passes current
document block data.

#### Scope

- Build or reuse normalized block hash helpers.
- Provide current document block index to `SlideEditorVNext` host port.
- Include text, visual, and table payloads needed for refresh.
- Define explicit fetch path for cross-document or remote sources.

#### Acceptance Criteria

- [ ] Editor host provides a current block index, not only initial page-load
      blocks.
- [ ] Block index includes id, kind, hash, display label, and refresh payload.
- [ ] Cross-document sources are not silently matched to local blocks.

#### Verification

- [ ] Unit tests for block hashing.
- [ ] Host integration tests for block index updates.

### `V7-016` Implement fresh/stale/orphan source classification for v7 nodes

**Labels:** `area:presentation-vnext`, `track:source-link`, `type:feature`, `priority:release-blocker`

**Depends on:** `V7-014`, `V7-015`

#### Context

Source Review depends on deterministic classification.

#### Scope

- Classify source-linked nodes against the host block index.
- Emit diagnostics for stale and orphaned nodes.
- Handle unknown source contexts separately from orphaned local blocks.
- Keep classification pure/testable where possible.

#### Acceptance Criteria

- [ ] Fresh nodes do not emit stale/orphan diagnostics.
- [ ] Stale nodes identify the changed source block.
- [ ] Orphaned nodes identify missing block ids.
- [ ] Unknown remote contexts are not mislabeled as local orphans.

#### Verification

- [ ] Unit tests for classification matrix.

### `V7-017` Implement selected-node refresh, unlink, and relink commands

**Labels:** `area:presentation-vnext`, `track:source-link`, `type:feature`, `priority:release-blocker`

**Depends on:** `V7-016`, `V7-012`

#### Context

Selected source-linked nodes need explicit repair actions.

#### Scope

- Add refresh command for selected node.
- Add unlink command that marks source intent clearly.
- Add relink command that requires explicit user choice.
- Preserve local overrides unless refresh explicitly replaces them.

#### Acceptance Criteria

- [ ] Refresh updates content from the correct block.
- [ ] Unlink removes active source dependency without deleting content.
- [ ] Relink shows block identity before applying.
- [ ] Commands preserve valid `DeckV7` and update diagnostics.

#### Verification

- [ ] Command tests.
- [ ] Source panel component tests.

### `V7-018` Build deck-level Source Review UI and diagnostics grouping

**Labels:** `area:presentation-vnext`, `track:source-link`, `track:diagnostics`, `type:feature`, `priority:release-blocker`

**Depends on:** `V7-016`, `V7-011`

#### Context

Users need to review all stale/orphaned slide content before trusting a deck.

#### Scope

- Add Source Review deck-level surface.
- Group issues by slide and source state.
- Allow navigation to affected slide/node.
- Show safe vs risky actions clearly.

#### Acceptance Criteria

- [ ] Source Review lists stale and orphaned nodes across the deck.
- [ ] Each row shows slide, node, source block identity, and state.
- [ ] Users can navigate from a row to the affected node.
- [ ] Review surface can coexist with inspector diagnostics.

#### Verification

- [ ] Component tests for grouped review UI.

### `V7-019` Implement refresh all, resolve one by one, and safe skip behavior

**Labels:** `area:presentation-vnext`, `track:source-link`, `type:feature`, `priority:release-blocker`

**Depends on:** `V7-017`, `V7-018`

#### Context

Deck-level review needs bulk operations, but only safe matches should refresh in
bulk.

#### Scope

- Implement refresh all safe stale matches.
- Skip orphaned, unknown, and ambiguous relink cases.
- Provide resolve-one-by-one flow for skipped cases.
- Report results after bulk actions.

#### Acceptance Criteria

- [ ] Refresh all updates only safe matches.
- [ ] Skipped items remain visible with reasons.
- [ ] Resolve-one-by-one can refresh, relink, unlink, or dismiss each item.
- [ ] Bulk action results are announced and diagnosable.

#### Verification

- [ ] Unit tests for safe bulk selection.
- [ ] Component/integration tests for Source Review actions.

### `V7-020` Add source-link migration and review tests

**Labels:** `area:presentation-vnext`, `track:source-link`, `type:verification`, `priority:verification-gate`

**Depends on:** `V7-014`-`V7-019`

#### Context

Source-link replacement is a release blocker and needs explicit evidence.

#### Scope

- Add migration fixture tests.
- Add classification unit tests.
- Add source panel component tests.
- Add Source Review integration tests.

#### Acceptance Criteria

- [ ] Tests cover fresh, stale, orphaned, unlinked, and unknown source states.
- [ ] Tests cover selected-node refresh/unlink/relink.
- [ ] Tests cover deck-level Source Review and refresh all.

#### Verification

- [ ] Run focused source-link test commands.

## Remaining Child Issues Summary

The remaining issues should be created with the same body structure: context,
scope, acceptance criteria, and verification. They are listed below in execution
order to keep the backlog complete without duplicating repeated template text.

### Deck Chrome Issues

#### `V7-021` Define v7 deck chrome schema and theme override contract

- **Labels:** `track:deck-chrome`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-010`
- **Scope:** Model logo, footer, page number, watermark, border, safe area, and
  frame chrome using v7-native deck/theme structures.
- **Acceptance:** Schema validates; overrides are explicit; no active v6
  `masters[]` or `defaultMasterId`; migration path is documented.
- **Verification:** Schema validation tests and render resolver fixture.

#### `V7-022` Render deck chrome and theme decorations through the v7 render tree

- **Labels:** `track:deck-chrome`, `track:render-export`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-021`
- **Scope:** Resolve deck chrome and theme decorations into render tree layers
  with deterministic z-order and hit-test behavior.
- **Acceptance:** Editor canvas, thumbnails, present, and public render the same
  chrome intent.
- **Verification:** Render resolver tests and screenshot fixtures.

#### `V7-023` Add deck chrome editor controls and slide override controls

- **Labels:** `track:deck-chrome`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-021`, `V7-022`
- **Scope:** Add UI to configure global chrome and per-slide override/disable
  behavior.
- **Acceptance:** Users can edit every supported chrome kind and reset slide
  overrides.
- **Verification:** Component tests for chrome controls.

#### `V7-024` Expose deck chrome and decorations correctly in layers mode

- **Labels:** `track:deck-chrome`, `track:stage`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-022`
- **Scope:** Distinguish user nodes, groups, deck chrome, theme decorations,
  locked nodes, hidden nodes, and detached decorations.
- **Acceptance:** Layers rows use clear identity, support allowed selection, and
  prevent invalid edits.
- **Verification:** Layers component tests.

#### `V7-025` Add deck chrome PPTX/public/present parity

- **Labels:** `track:deck-chrome`, `track:render-export`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-022`
- **Scope:** Export and render logo/footer/page number/watermark/border/frame
  chrome consistently.
- **Acceptance:** Representative decks match across present, public, and PPTX
  within documented limits.
- **Verification:** Export parity tests and screenshots.

#### `V7-026` Migrate supported v6 master chrome intent into v7-native chrome

- **Labels:** `track:deck-chrome`, `track:boundary`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-021`, `V7-005`
- **Scope:** Convert supported legacy master chrome into v7 chrome/decorations;
  diagnose unsupported cases.
- **Acceptance:** Supported logo/footer/page-number/watermark intent survives
  migration without v6 master runtime.
- **Verification:** Migration fixture tests.

### Durable Asset Issues

#### `V7-027` Wire v7 image insert/replace to durable slide asset upload

- **Labels:** `track:assets`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-007`
- **Scope:** Connect `onUploadImage` to protected upload in product document
  host; keep data URL fallback only for non-product hosts.
- **Acceptance:** Product image insert/replace stores durable asset references.
- **Verification:** Upload action and editor host tests.

#### `V7-028` Normalize `DeckV7.assets.images` metadata and resolver behavior

- **Labels:** `track:assets`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-027`
- **Scope:** Store durable src, asset id, dimensions, MIME type, hash, and alt
  where available; resolve consistently.
- **Acceptance:** Editor/present/public/export resolve the same asset ids.
- **Verification:** Asset resolver tests.

#### `V7-029` Complete image replace, fit, crop, alt, diagnostics, and export parity

- **Labels:** `track:assets`, `track:stage`, `track:render-export`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-028`, `V7-038`
- **Scope:** Finish image editing and parity across renderer/exporter.
- **Acceptance:** Replace/crop/fit/alt edits persist and export; missing assets
  diagnose.
- **Verification:** Component tests and export fixture.

#### `V7-030` Implement host-backed visual picker and visual replacement flow

- **Labels:** `track:assets`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-028`
- **Scope:** Pick visuals from current document or host registry; replace visual
  without losing layout/source/local overrides.
- **Acceptance:** Visual insert/replace works in product editor and diagnostics
  cover missing visual assets.
- **Verification:** Host/component tests.

#### `V7-031` Render/export supported visual channel colors and diagnose gaps

- **Labels:** `track:assets`, `track:render-export`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-030`, `V7-013`
- **Scope:** Interpret `VisualStyle.channelColors` for known visual renderers and
  PPTX export adapters.
- **Acceptance:** Supported channels render/export; unsupported channels produce
  diagnostics.
- **Verification:** Visual renderer/export tests.

#### `V7-032` Implement slide asset orphan detection and cleanup strategy

- **Labels:** `track:assets`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-028`, `V7-030`
- **Scope:** Detect unreferenced assets after delete/replace and define cleanup
  path.
- **Acceptance:** Cleanup never deletes referenced assets and reports remaining
  orphans.
- **Verification:** Orphan cleanup tests.

#### `V7-033` Add protected public asset resolution coverage for v7 decks

- **Labels:** `track:assets`, `track:render-export`, `type:verification`, `priority:verification-gate`
- **Depends on:** `V7-028`, `V7-030`
- **Scope:** Cover public share/embed and export asset resolution rules.
- **Acceptance:** Public routes render authorized assets and diagnose missing or
  denied assets.
- **Verification:** Public render tests and E2E where available.

### Professional Stage Issues

#### `V7-034` Implement group member direct editing and group entry/exit state

- **Labels:** `track:stage`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-009`
- **Scope:** Select/edit group children without ungrouping; show active group
  context; prevent accidental outside edits.
- **Acceptance:** Users can enter, edit, and exit groups; commands target the
  correct node scope.
- **Verification:** Selection model and component tests.

#### `V7-035` Add stage rotation handle and rotation command plumbing

- **Labels:** `track:stage`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-009`
- **Scope:** Add pointer rotation handle for rotatable nodes and command-backed
  layout updates.
- **Acceptance:** Rotation can be changed on stage and through inspector without
  drift.
- **Verification:** Geometry command tests and component tests.

#### `V7-036` Implement connector endpoint drag/snap and binding lifecycle

- **Labels:** `track:stage`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-009`
- **Scope:** Drag connector endpoints, snap to valid anchors, preserve bindings
  through node changes where possible.
- **Acceptance:** Endpoint drag feels direct; invalid/deleted anchors diagnose or
  repair safely.
- **Verification:** Connector lifecycle tests and component tests.

#### `V7-037` Add direct table cell editing and table focus model

- **Labels:** `track:stage`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-009`
- **Scope:** Edit table cell text directly; support keyboard traversal and
  row/column actions.
- **Acceptance:** Users do not need raw row/column form fields for normal table
  content editing.
- **Verification:** Component tests and keyboard tests.

#### `V7-038` Harden image crop drag/reset and crop diagnostics

- **Labels:** `track:stage`, `track:assets`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-009`
- **Scope:** Finish crop handle behavior, reset action, bounds, and diagnostics.
- **Acceptance:** Crop is direct, reversible, persisted, rendered, and exported.
- **Verification:** Component tests and export fixture.

#### `V7-039` Complete stage keyboard/focus restoration/a11y parity

- **Labels:** `track:stage`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-009`, `V7-034`-`V7-038`
- **Scope:** Roving tabindex, move/resize shortcuts, delete focus restoration,
  live announcements, toolbar escape/focus behavior.
- **Acceptance:** Keyboard users can perform core editing without focus traps or
  misleading announcements.
- **Verification:** Unit/component accessibility tests.

#### `V7-040` Polish context toolbar grouping for stage editing commands

- **Labels:** `track:stage`, `priority:parity-polish`, `type:feature`
- **Depends on:** `V7-034`-`V7-039`
- **Scope:** Group text, shape, image, visual, connector, table, multi-select,
  and slide actions with shared primitives.
- **Acceptance:** Toolbar reads as product UI, not local debug controls.
- **Verification:** Component snapshots and keyboard tests.

### Template, Theme, Render, Collaboration, And Verification Issues

#### `V7-041` Build semantic template/layout picker for Add slide

- **Labels:** `track:theme-template`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-043`
- **Scope:** Replace blank-only add-slide path with semantic template/layout
  choice.
- **Acceptance:** New slides can be created from registered semantic templates.
- **Verification:** Component and command tests.

#### `V7-042` Implement template reapply with slot/source preservation

- **Labels:** `track:theme-template`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-041`, `V7-014`
- **Scope:** Reapply compatible templates while preserving slot content and
  source metadata where possible.
- **Acceptance:** Reapply changes structure only by explicit user action.
- **Verification:** Compiler/command tests.

#### `V7-043` Harden theme switching to preserve semantic structure and local overrides

- **Labels:** `track:theme-template`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-021`
- **Scope:** Switch theme packages without rewriting slide semantic tree or
  intentional local overrides.
- **Acceptance:** Theme changes visual language; user content/geometry/source
  remains intact.
- **Verification:** Render resolver and editor command tests.

#### `V7-044` Add slide/node local override visibility and reset UX

- **Labels:** `track:theme-template`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-043`
- **Scope:** Show override badges/diffs and reset-to-theme actions.
- **Acceptance:** Users can understand and clear local overrides at slide/node
  level.
- **Verification:** Component tests.

#### `V7-045` Add style ref, package style, decoration, and template overflow repair diagnostics

- **Labels:** `track:theme-template`, `track:diagnostics`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-013`, `V7-043`
- **Scope:** Diagnose and repair unknown style refs, missing styles, missing
  decorations, and template overflow.
- **Acceptance:** Repairs are action-backed and revalidate the deck.
- **Verification:** Diagnostic and command tests.

#### `V7-046` Align theme decorations with deck chrome layers, detach, and export

- **Labels:** `track:theme-template`, `track:deck-chrome`, `track:render-export`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-024`, `V7-045`
- **Scope:** Ensure decorations and chrome interact correctly in layers, render,
  public, and export paths.
- **Acceptance:** Detach/disable/export behavior is consistent and diagnosable.
- **Verification:** Render/export tests.

#### `V7-047` Create v7 render/export parity support matrix and fixture decks

- **Labels:** `track:render-export`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-021`, `V7-028`, `V7-034`, `V7-043`
- **Scope:** Define support for every v7 node/style/deck chrome/effect category
  and create representative fixtures.
- **Acceptance:** Matrix distinguishes supported, fallback, unsupported, and
  diagnostic-required behavior.
- **Verification:** Docs plus fixture validation.

#### `V7-048` Align present/public/embed routes with v7 boundary, themes, and assets

- **Labels:** `track:render-export`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-004`, `V7-028`, `V7-043`
- **Scope:** Ensure all consumption routes open v7 decks, resolve themes, and
  resolve protected assets.
- **Acceptance:** Public surfaces do not depend on v6 fallback and do not silently
  neutralize themes/assets.
- **Verification:** Public render tests and E2E.

#### `V7-049` Complete PPTX adapter coverage for v7 core node types

- **Labels:** `track:render-export`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-047`
- **Scope:** Export text, images, visuals, shapes, connectors, tables,
  backgrounds, decorations, deck chrome, and local styles.
- **Acceptance:** Supported features export; unsupported features diagnose.
- **Verification:** PPTX adapter tests.

#### `V7-050` Add export diagnostics for unsupported effects and fallbacks

- **Labels:** `track:render-export`, `track:diagnostics`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-013`, `V7-049`
- **Scope:** Diagnose blur, glass, conic gradients, patterns, unsupported visual
  channels, and other lossy export behavior.
- **Acceptance:** Export never silently drops user-visible styling.
- **Verification:** Export preflight tests.

#### `V7-051` Align prototype HTML renderer with product v7 render tree

- **Labels:** `track:render-export`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-047`
- **Scope:** Keep prototype renderer behavior aligned with product render tree or
  document intentional fallbacks.
- **Acceptance:** Prototype previews are not a separate product rendering model.
- **Verification:** Prototype render fixtures.

#### `V7-052` Add representative parity checks for editor/present/public/PPTX

- **Labels:** `track:render-export`, `type:verification`, `priority:verification-gate`
- **Depends on:** `V7-048`-`V7-051`
- **Scope:** Compare representative decks across consumption surfaces.
- **Acceptance:** Parity failures either block release or become documented
  diagnostics.
- **Verification:** Screenshot/pixel/PPTX checks as appropriate.

#### `V7-053` Preserve or map legacy comment/source anchors during v7 migration

- **Labels:** `track:collaboration`, `track:boundary`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-005`, `V7-014`
- **Scope:** Preserve anchors or generate mapping diagnostics for unmappable
  anchors.
- **Acceptance:** Comments/source anchors do not silently disappear during
  migration.
- **Verification:** Migration anchor tests.

#### `V7-054` Port slide-level and node-level presence to v7 ids

- **Labels:** `track:collaboration`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-005`, `V7-034`
- **Scope:** Use v7 slide/node ids for presence; handle hidden/deleted/detached
  nodes safely.
- **Acceptance:** Presence is accurate and never points to stale v6 ids.
- **Verification:** Presence tests.

#### `V7-055` Harden command history with collaboration/save/focus state

- **Labels:** `track:collaboration`, `track:boundary`, `type:feature`, `priority:release-blocker`
- **Depends on:** `V7-008`, `V7-009`, `V7-054`
- **Scope:** Keep undo/redo, save dirty state, collaboration updates, and focus
  restoration consistent.
- **Acceptance:** Collaborative edits do not corrupt history or save state.
- **Verification:** Integration tests.

#### `V7-056` Add collaboration safety tests that prevent v6 element writes

- **Labels:** `track:collaboration`, `type:verification`, `priority:verification-gate`
- **Depends on:** `V7-053`-`V7-055`
- **Scope:** Assert collaboration and command paths never write v6
  `Slide.elements[]`.
- **Acceptance:** Tests fail if v7 editor code reintroduces v6 element writes.
- **Verification:** Focused safety tests.

#### `V7-057` Add open/migration/save/conflict validation tests

- **Labels:** `track:boundary`, `type:verification`, `priority:verification-gate`
- **Depends on:** `V7-004`-`V7-009`
- **Scope:** Test v7 pass-through, v6 migration, invalid recovery, save
  validation, autosave, manual flush, and conflict recovery.
- **Acceptance:** Boundary and reliability blocker rows have executable evidence.
- **Verification:** Focused test command in final issue comment.

#### `V7-058` Add source-link and Source Review tests

- **Labels:** `track:source-link`, `type:verification`, `priority:verification-gate`
- **Depends on:** `V7-014`-`V7-020`
- **Scope:** Cover source classification, node actions, deck review, refresh all,
  relink, and migration.
- **Acceptance:** Source replacement blocker rows have executable evidence.
- **Verification:** Focused test command in final issue comment.

#### `V7-059` Add deck chrome, assets, and diagnostics tests

- **Labels:** `track:deck-chrome`, `track:assets`, `track:diagnostics`, `type:verification`, `priority:verification-gate`
- **Depends on:** `V7-021`-`V7-033`
- **Scope:** Cover chrome schema/render/export, durable assets, visual picker,
  orphan cleanup, and diagnostics.
- **Acceptance:** Chrome/assets/diagnostics blocker rows have executable
  evidence.
- **Verification:** Focused test command in final issue comment.

#### `V7-060` Add stage interaction, keyboard, and accessibility tests

- **Labels:** `track:stage`, `type:verification`, `priority:verification-gate`
- **Depends on:** `V7-034`-`V7-040`
- **Scope:** Cover group editing, rotation, connectors, tables, crop, keyboard,
  focus restoration, and announcements.
- **Acceptance:** Stage blocker rows have executable evidence.
- **Verification:** Focused test command in final issue comment.

#### `V7-061` Add template/theme authoring tests

- **Labels:** `track:theme-template`, `type:verification`, `priority:verification-gate`
- **Depends on:** `V7-041`-`V7-046`
- **Scope:** Cover add-slide templates, reapply, theme switch, overrides, and
  repair diagnostics.
- **Acceptance:** Template/theme blocker rows have executable evidence.
- **Verification:** Focused test command in final issue comment.

#### `V7-062` Add present/public/export parity tests and fixtures

- **Labels:** `track:render-export`, `type:verification`, `priority:verification-gate`
- **Depends on:** `V7-047`-`V7-052`
- **Scope:** Cover editor, present, public, embed, prototype, and PPTX export
  parity with representative decks.
- **Acceptance:** Render/export blocker rows have executable evidence.
- **Verification:** Focused test command in final issue comment.

#### `V7-063` Add visual regression coverage for editor layout and stage chrome

- **Labels:** `area:presentation-vnext`, `type:verification`, `priority:verification-gate`
- **Depends on:** `V7-034`-`V7-040`, `V7-052`
- **Scope:** Screenshot desktop 1280/1440/1920, mobile inspector sheet,
  filmstrip, dense decks, overlapped nodes, inline edit, crop, rotation, and
  connector states.
- **Acceptance:** Visual regressions are tracked before default-editor cutover.
- **Verification:** Screenshot regression command in final issue comment.

#### `V7-064` Create final v7 default-editor rollout checklist

- **Labels:** `area:presentation-vnext`, `type:verification`, `priority:release-blocker`
- **Depends on:** `V7-E01`-`V7-E10`
- **Scope:** Build the final go/no-go checklist for defaulting to v7 editor and
  disabling legacy editor fallback.
- **Acceptance:** Checklist references every release blocker, parity polish
  exception, verification gate, and explicit non-goal.
- **Verification:** Release owner review and final docs update.
