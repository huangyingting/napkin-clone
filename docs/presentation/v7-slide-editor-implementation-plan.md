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

### Milestone 1: V7 Editor Shell Matches Legacy Structure

- Full editor surface.
- Stable stage sizing.
- Slide rail, toolbar, inspector, and save/close/export controls.
- Real theme package resolution.
- Open boundary returns v7 or visible diagnostics.

### Milestone 2: Basic Editing Parity

- Selection, drag, resize, nudge, duplicate, delete, and z-order.
- Basic text editing.
- Basic style binding and local override editing.
- Autosave and conflict recovery.

### Milestone 3: Inspector And Content Parity

- Type-specific inspectors.
- Image, visual, shape, connector, table, and group editing.
- Clipboard and keyboard shortcut parity.
- Source links and diagnostics.

### Milestone 4: VNext-Native Enhancements

- Template reapply and layout variant selection.
- Theme package switching with preserved user overrides.
- Decoration layer controls and detach workflow.
- Render/export parity checks.

## Immediate Implementation Slice

The next implementation slice should establish the v7 editor as the complete
replacement shell before deeper command migration:

1. Make `SlideEditorVNext` structurally match the old full editor UI: toolbar,
   rail, stage, inspector, and status areas.
2. Wire runtime `ThemePackageV1` resolution into editor, present, public render,
   and export paths.
3. Change the open boundary so legacy non-v7 data migrates or shows diagnostics;
   it must not silently open a blank deck.
4. Add tests for editor open behavior, theme package resolution, and stage shell
   sizing assumptions.

This slice should not re-enable the old editor route. It should make the new v7
editor the single active editing surface while preserving the old editor's user
experience as the migration target.
