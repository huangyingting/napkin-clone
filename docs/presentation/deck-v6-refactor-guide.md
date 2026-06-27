# Presentation Deck v6 Refactor Guide

**Status:** Accepted Refactor Plan  
**Last updated:** 2026-06-27

This guide describes how to implement the v6 presentation deck architecture
defined in [deck-v6-design.md](deck-v6-design.md). It is intentionally more
operational than the design document: it names the implementation slices,
expected file ownership, UI changes, tests, and validation gates.

The refactor is a hard schema cut. Do not add compatibility readers, aliases, or
fallbacks for superseded deck payloads. If a current payload shape is replaced,
update source, tests, fixtures, seeds, docs, and generated examples to the v6
shape in the same implementation stream.

## Refactor Principles

1. **New vocabulary everywhere.** Use `PresentationTheme`,
   `PresentationDesign`, `SlideMaster`, `SlideTemplate`, `TemplateElement`,
   `SlideElement`, `MasterElement`, `PresentationRole`, `designOverrides`, and
   `ResolvedSlideRenderModel`. Do not continue old names such as
   `DeckThemeTokenSet`, `customTokenSet`, `textRole`, `layout placeholder`, or
   `presentation theme` in new v6 code.
2. **One content source.** `Slide.elements[]` is authoritative. Slide-level
   fields such as `bullets`, `bulletRuns`, `visualIds`, `layout`, and
   `elementsDerived` are removed from the persisted schema.
3. **Templates are blueprints.** Applying a template materializes elements into
   a slide. Templates do not participate in normal render/export and do not
   update existing slides automatically.
4. **Masters are live chrome.** Masters are deck-owned persisted data and affect
   every slide using them. They are limited to shared chrome: backgrounds,
   watermarks, brand marks, logos, footers, and page numbers.
5. **Resolve before rendering.** Editor, present mode, public render,
   thumbnails, and export should consume the same resolved slide render model.
6. **UI edits the model directly.** Editor controls should expose theme,
   master, slide, element, role, content, and design override concepts instead
   of leaking old schema fields.

## Target Module Map

The final module names can vary, but the ownership boundaries should be clear.

| Concern                                | Suggested module                                          |
| -------------------------------------- | --------------------------------------------------------- |
| Deck facade and stable exports         | `src/lib/presentation/deck.ts`                            |
| Core deck, slide, canvas types         | `src/lib/presentation/deck-core.ts`                       |
| Element content and overrides          | `src/lib/presentation/slide-elements.ts`                  |
| Presentation roles and design refs     | `src/lib/presentation/presentation-design.ts`             |
| Built-in themes and theme resolver     | `src/lib/presentation/presentation-themes.ts`             |
| Masters and master helpers             | `src/lib/presentation/slide-masters.ts`                   |
| Built-in templates and materialization | `src/lib/presentation/slide-templates.ts`                 |
| Pure render model resolver             | `src/lib/presentation/slide-render-model.ts`              |
| Design origin inspection               | `src/lib/presentation/slide-design-origins.ts`            |
| Schema validation                      | `src/lib/presentation/deck-validation/`                   |
| Commands and mutations                 | `src/lib/presentation/slide-commands*`, `deck-mutations*` |

Avoid long-term facade files that merely preserve old names. Temporary shims are
acceptable only inside a single mechanical edit sequence and must be deleted
before the implementation is considered complete.

## Phase 1: Types And Schema Gate

Goal: make v6 the only valid persisted deck shape.

1. Raise `CURRENT_DECK_SCHEMA_VERSION` to `6`.
2. Replace top-level deck fields with:

   ```ts
   type Deck = {
     schemaVersion: 6;
     canvas: { format: SlideFormat };
     design: PresentationDesign;
     masters: SlideMaster[];
     defaultMasterId: string;
     customTemplates?: SlideTemplate[];
     slides: Slide[];
     deckContentHash?: string;
   };
   ```

3. Replace slide content metadata with:

   ```ts
   type Slide = {
     id: string;
     index: number;
     title: string;
     notes?: string;
     masterId?: string;
     templateId?: string;
     designOverrides?: SlideDesignOverrides;
     elements: SlideElement[];
     source?: SlideSourceMetadata;
   };
   ```

4. Move kind-specific element payload into `content` and require
   `content.kind === element.kind`.
5. Replace slide-level derived provenance with element-level `source`.
6. Update validation tests so old fields are rejected, including top-level
   `themeId`, `customTokenSet`, `slideFormat`, `layouts`, and slide-level
   `bullets`, `bulletRuns`, `visualIds`, `layout`, `elementsDerived`.

Expected tests:

- `deck-schema.test.ts` rejects v5 shapes and accepts one minimal v6 deck.
- Element validation rejects mismatched `kind` / `content.kind`.
- Master validation requires `layer` and `locked: true` for `MasterElement`.
- `defaultMasterId` must point at an existing master.

## Phase 2: Theme And Design Vocabulary

Goal: replace deck theme tokens with presentation-native design primitives.

1. Replace `DeckThemeTokenSet` with `PresentationTheme`.
2. Replace `DECK_TEXT_ROLES` with `PresentationRole`.
3. Use role names such as `title`, `subtitle`, `sectionTitle`, `body`,
   `bullet`, `quote`, `caption`, `footer`, `label`, `media`, `visual`, `image`,
   `logo`, `pageNumber`, and `background`.
4. Move built-in typography scale into one shared constant, for example
   `PRESENTATION_TYPE_SCALE`, and have built-in themes reference it unless a
   theme deliberately differs.
5. Replace `customTokenSet` editing with `design.themeOverrides` editing.
6. Support `ColorRef` style token references in master/template/slide/element
   overrides and concrete values in resolved output.

Expected tests:

- All built-in themes expose complete role design for every `PresentationRole`
  that has typography behavior.
- Token references such as `{ token: "accent" }` resolve against the selected
  theme and theme overrides.
- Concrete override values win over token references at lower layers.

## Phase 3: Masters

Goal: introduce live shared chrome without turning masters into content layout.

1. Add at least one deck-owned default master for every new deck.
2. Render master background treatment before slide elements.
3. Render `MasterElement.layer === "background"` before slide elements and
   `"foreground"` after slide elements.
4. Keep master and slide z-index ordering separate.
5. Limit master authoring to shared chrome: logo, footer, page number,
   watermark, brand marks, and background furniture.

Expected commands:

- `CREATE_MASTER`
- `UPDATE_MASTER`
- `DELETE_MASTER`
- `SET_DEFAULT_MASTER`
- `SET_SLIDE_MASTER`
- `UPDATE_MASTER_ELEMENT`

Expected tests:

- Slides without `masterId` use `defaultMasterId`.
- Master background overrides theme background.
- Slide background overrides master background.
- Master foreground elements render above slide elements.
- Locked master elements are not selectable in normal slide editing mode.

## Phase 4: Templates As Blueprints

Goal: make templates explicit creation data, not live inheritance.

1. Replace reusable layout placeholders with `SlideTemplate.elements`.
2. Use `TemplateElement.contentDefaults` for placeholder/default content.
3. Materialize templates into real slide elements when creating a slide or
   explicitly reapplying a template.
4. Set `Slide.templateId` as provenance only.
5. Apply `template.defaultMasterId` by setting the slide's `masterId` during
   materialization.
6. Store only deck-local custom templates in `Deck.customTemplates`; built-in
   templates live in code.

Expected commands:

- `ADD_SLIDE_FROM_TEMPLATE`
- `APPLY_SLIDE_TEMPLATE`
- `CREATE_CUSTOM_TEMPLATE`
- `UPDATE_CUSTOM_TEMPLATE`
- `DELETE_CUSTOM_TEMPLATE`

Expected tests:

- Applying a template creates real `SlideElement` records with `content`.
- Updating a built-in template does not affect an already materialized slide.
- Reapplying a template is explicit and can preserve or replace existing content
  according to the command option.
- A template can be applied under any presentation theme because it stores roles
  and token refs rather than hard-coded theme colors by default.

## Phase 5: Derivation And Source Links

Goal: document-derived decks emit v6 slides directly.

1. Document heading/list/visual derivation should create slide elements with
   presentation roles, boxes, content, and element-level `source`.
2. Document heading levels map only at derivation time:
   - document H1 -> `title` or `sectionTitle`;
   - document H2/H3 -> `title` or `body` depending on generated slide type;
   - list items -> `bullet`;
   - captions/quotes -> `caption` or `quote`.
3. Remove `elementsDerived`; sync decisions use element `source` plus user
   override state.
4. Replace helpers that read `slide.visualIds` or `slide.bullets` with derived
   helpers over `slide.elements`.

Expected helpers:

- `getSlideVisualIds(slide)`
- `getSlideTitleFromElements(slide)`
- `summarizeSlideContent(slide)`
- `findSourceLinkedElements(slide)`

Expected tests:

- Derived slides pass v6 schema validation.
- Source-linked text and visual elements can be found without slide-level
  `visualIds` or `elementsDerived`.
- Editing one sourced element does not mark unrelated elements or the whole
  slide as derived/hand-authored.

## Phase 6: Resolved Render Model

Goal: centralize render/export resolution.

Build a pure resolver with a flat output for render/export:

```ts
resolveSlideRenderModel(deck, slide): ResolvedSlideRenderModel;
```

The model should include:

- canvas format and slide dimensions;
- resolved background;
- resolved master background elements;
- resolved slide elements;
- resolved master foreground elements;
- concrete text, image, shape, connector, and visual design;
- metadata needed by export, thumbnails, and present mode.

Keep origin tracking separate:

```ts
inspectSlideDesignOrigins(deck, slide): SlideDesignOriginReport;
```

UI inspectors can use origin reports for labels such as "Inherited from theme",
"Inherited from master", or "Element override". Renderers should consume the
flat resolved model only.

Expected tests:

- Theme -> theme override -> master -> slide -> element precedence is stable.
- Master layers are included in the correct order.
- Token refs resolve to concrete values before reaching render/export.
- Public render, present mode, thumbnail, and export specs use the same resolver
  inputs.

## Phase 7: Command And Patch Rewrite

Goal: align mutation APIs with v6 concepts.

Rename command families around the model users actually edit:

| Old concept                     | New command direction             |
| ------------------------------- | --------------------------------- |
| `SET_DECK_THEME`                | `SET_PRESENTATION_THEME`          |
| `UPDATE_DECK_TEMPLATE`          | `UPDATE_THEME_OVERRIDES`          |
| `SET_DECK_FORMAT`               | `SET_CANVAS_FORMAT`               |
| slide layout apply              | `APPLY_SLIDE_TEMPLATE`            |
| element style patch             | `UPDATE_ELEMENT_DESIGN_OVERRIDES` |
| element text/image/visual patch | `UPDATE_ELEMENT_CONTENT`          |
| source ref patch                | `UPDATE_ELEMENT_SOURCE`           |

Patch metadata should use v6 field names. Do not write patch paths that mention
removed fields such as `themeId`, `customTokenSet`, `slideFormat`, `layout`,
`visualIds`, or `elementsDerived`.

Expected tests:

- Every command output deck passes `safeParseDeck`.
- Patch replay produces the same deck as whole-deck command execution.
- Old command names are removed rather than mapped silently.

## UI Refactor Overview

The UI must move from editing old deck fields to editing v6 objects. The surface
ownership remains the same, but the nouns change.

```text
Top toolbar    -> deck canvas, presentation theme, masters, templates
Slide rail     -> slide metadata, master/template provenance
Stage          -> resolved slide render model + selectable slide elements
Canvas popover -> frequent slide/element verbs
Inspector      -> precise properties for deck, master, slide, or element
Layers panel   -> slide elements plus optional read-only master chrome view
```

### Top Toolbar

Top toolbar controls should be deck-scoped only:

- `canvas.format`: slide size/aspect ratio.
- `design.themeId`: presentation theme selector.
- `design.themeOverrides`: brand/theme customization entry point.
- master selector or "Edit masters" entry point.
- template picker for adding slides.
- present/export/share/save/undo/redo.

Remove or rename any top toolbar entry that implies templates are live style
inheritance. Template controls create slides or explicitly reapply templates;
theme controls change global visual language.

### Slide Rail

The rail should read `Slide.title` metadata, not render-source title fields.
When a title element changes, mutation helpers update `Slide.title` so rail,
search, and export labels stay fast and predictable.

Useful rail badges after v6:

- current master name, if useful at low density;
- template provenance label such as "Title" or "Content";
- source-stale count derived from element-level sources.

### Stage And Selection

The stage should render `ResolvedSlideRenderModel`, not raw `slide.elements`
with ad hoc cascade calls. Selection remains limited to slide elements in normal
editing mode.

Master foreground/background elements render as locked chrome. They should not
appear as selectable objects unless the user enters a dedicated master editing
mode.

The stage must route updates by target type:

- slide element geometry -> `element.box`;
- slide element content -> `element.content`;
- slide element appearance -> `element.designOverrides`;
- slide background -> `slide.designOverrides.background`;
- master chrome -> master editing mode only.

### Inspector

The inspector should expose v6 concepts directly.

Deck-level sections:

- Theme: `design.themeId`, theme preview, theme override reset.
- Canvas: `canvas.format`.
- Masters: default master, master list, edit/create/delete.
- Templates: add slide from template, custom template management.

Slide-level sections:

- Background: `slide.designOverrides.background`.
- Master: `slide.masterId` with default fallback visibility.
- Template: `slide.templateId` provenance plus explicit reapply action.
- Notes and metadata: `notes`, `title` metadata.

Element-level sections:

- Content: text paragraphs, image source/crop, visual id, shape text, connector
  endpoints.
- Role: `role` selector using presentation-native names.
- Design: `designOverrides` only; provide reset controls that delete override
  keys rather than writing theme values into the element.
- Source: element-level `source`, stale state, relink/unlink actions.
- Arrange: `box`, `zIndex`, lock/hidden.

Origin labels should come from `inspectSlideDesignOrigins`, not from duplicated
component logic.

### Theme UI

Theme UI edits global visual language. It should not touch slide element content
or template definitions.

Required controls:

- theme selection;
- theme override reset;
- global role typography preview using `PresentationRole` labels;
- color token preview: slide background, surface, accent, on-background,
  on-surface, muted;
- element default preview for text, image, shape, connector, visual.

When the user changes the theme, existing slides keep their elements and local
`designOverrides`; only inherited resolved values change.

### Master UI

Master editing is a separate mode or panel, not normal slide selection.

Required controls:

- master list and default master selector;
- master background treatment;
- background and foreground chrome elements;
- logo/footer/page number helpers;
- apply master to selected slides;
- reset slide master to deck default.

Master elements should visually indicate they are shared chrome. In normal slide
editing, they can be visible but locked and non-selectable.

### Template UI

Template UI should communicate blueprint semantics.

Required controls:

- add slide from template;
- reapply template explicitly;
- create custom template from current slide;
- manage custom templates;
- template preview rendered under the current theme for visual fidelity.

Do not label templates as live style inheritance. Reapplying a template should
show whether content will be preserved, mapped, or replaced.

### Element UI

Element controls should separate content from design:

- Text: paragraph/list content lives in `content.paragraphs`; typography changes
  live in `designOverrides`.
- Image: `content.src` / `assetId` / `alt` / `crop`; fit, mask, radius, and
  shadow live in `designOverrides`.
- Visual: `content.visualId`; restyle defaults live in theme/design overrides,
  and element-specific restyle choices live in `designOverrides`.
- Shape: shape kind and optional label content in `content`; fill, stroke,
  radius, and label design in `designOverrides`.
- Connector: endpoints/routing in `content`; stroke, dash, width, and arrows in
  `designOverrides`.

Every reset-to-theme or reset-to-master action should delete the local override
key. It should not copy inherited values into the element.

### Layers Panel

Layers should show slide elements as editable rows. Master elements can appear
in a separate read-only group such as "Master chrome" with an "Edit master"
entry point.

Layer row labels should derive from `role`, `kind`, and `content`, for example
"Title", "Caption", "Logo", "Image", or "Connector". Avoid old labels such as
"H1" or "shapeLabel".

### Empty States

Templates materialize real elements. Empty title, image, or visual placeholders
are normal elements with empty content and suitable roles, not a separate
placeholder element kind.

The editor can display ghost prompts based on `kind`, `role`, and empty
`content`, but those prompts are UI state. They do not require a persisted
placeholder element.

## UI Migration Checklist

- Replace every UI label that says presentation theme when it means theme override.
- Replace `H1/H2/H3` labels with `Title`, `Subtitle`, `Section title`, `Body`,
  `Bullet`, `Quote`, `Caption`, `Footer`, `Label`.
- Move slide size controls to `canvas.format`.
- Move theme selection to `design.themeId`.
- Move custom brand/theme edits to `design.themeOverrides`.
- Move slide background edits to `slide.designOverrides.background`.
- Move element formatting edits to `element.designOverrides`.
- Move text/image/visual payload edits to `element.content`.
- Show source-link state from `element.source`.
- Hide master elements from normal selection; expose them only through master
  editing UI.
- Treat `templateId` as provenance and explicit reapply input only.

## Verification Plan

Use the narrowest reliable checks after each slice.

| Slice              | Minimum validation                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Types/schema       | `node --test` for deck validation tests and `npm run typecheck` if shared types changed.                             |
| Themes/design refs | role resolver tests, token-ref resolution tests, preflight font tests.                                               |
| Masters            | render model tests for background/foreground ordering and default master fallback.                                   |
| Templates          | materialization tests, add-slide command tests, template preview tests.                                              |
| Derivation/source  | document-to-deck tests, source staleness tests, visual dependency tests.                                             |
| Commands/patches   | command executor tests, patch replay tests, autosave conflict tests.                                                 |
| UI                 | focused component/unit tests where available, then existing slide editor smoke/e2e only after core model stabilizes. |
| Export/public      | deck export tests, public presentation model tests, screenshot smoke only when render model is wired.                |

Before handoff, update [../data-model/deck.md](../data-model/deck.md),
[rendering-and-export.md](rendering-and-export.md), and
[slide-editor.md](slide-editor.md) to describe implemented behavior rather than
the old schema.

## Completion Criteria

The v6 refactor is complete when:

1. `safeParseDeck` rejects all superseded deck shapes and accepts only v6.
2. New deck creation, derivation, templates, editor commands, public render, and
   export all produce/consume v6 decks.
3. No runtime code imports old deck theme token/template naming.
4. Normal render/export goes through the shared resolved render model.
5. UI controls edit `canvas`, `design`, `masters`, `slides`, `elements`,
   `content`, `source`, and `designOverrides` directly.
6. Master chrome is live and locked in normal slide editing.
7. Templates are blueprint-only and never silently change existing slides.
8. Current docs and tests describe v6 as the only supported shape.
