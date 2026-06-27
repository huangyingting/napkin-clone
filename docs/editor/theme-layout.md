# Theme, Master, and Template Architecture for Slides

**Status:** Current

**Last updated:** 2026-06-27

This document describes the current v6 styling cascade for presentation decks.
For the persisted JSON contract, see [../data-model/deck.md](../data-model/deck.md).

## Cascade

```text
PresentationTheme
  -> SlideMaster
  -> SlideTemplate materialization
  -> Slide.designOverrides
  -> SlideElement.designOverrides
  -> ResolvedSlideRenderModel
```

Each layer overrides only the fields it owns. Resetting to inherited behavior
means deleting the local override key rather than copying a resolved value into
the lower layer.

## Presentation Theme

`Deck.design.themeId` selects a built-in `PresentationTheme`. Optional global
customization lives under `Deck.design.themeOverrides`; brand/custom theme data
is stored there instead of in any top-level legacy field.

`PRESENTATION_ROLES` is the semantic role vocabulary used by templates,
elements, inspectors, and render/export resolution: `title`, `subtitle`,
`sectionTitle`, `body`, `bullet`, `quote`, `caption`, `footer`, `label`,
`media`, `visual`, `image`, `logo`, `pageNumber`, and `background`.

Typography resolves through `resolveRoleToken`. A theme may define partial role
tokens, and missing fields are derived from the built-in type scale and color
tokens so every role has complete typography at render/export time.

## Masters

`Deck.masters[]` stores deck-owned `SlideMaster` records. `Deck.defaultMasterId`
is required and must reference an existing master; `Slide.masterId` may override
the default for one slide.

Masters are live shared chrome. They may provide background treatment and locked
background/foreground `MasterElement` records such as logos, watermarks,
footers, brand marks, and page numbers. Master elements render around slide
elements but are not selectable in normal slide editing.

Render order is stable across editor, present mode, public viewers, thumbnails,
and export:

```text
theme/master/slide background
  -> master background elements
  -> slide elements
  -> master foreground elements
```

Master background, slide element, and master foreground z-indexes are each
sorted within their own band.

## Templates

Built-in templates live in code as `SlideTemplate` blueprints. Deck-local custom
templates live in `Deck.customTemplates`. Applying a template materializes real
`SlideElement` records with `content` and `designOverrides`; templates do not
participate in normal render/export and do not update existing slides unless the
user explicitly reapplies one.

Template reapply supports replacing elements or preserving matching element
content while refreshing the template structure.

## Slide And Element Overrides

Slide-level visual changes live under `Slide.designOverrides`, especially
`background` and `accent`.

Element content changes write `element.content`. Element visual formatting writes
`element.designOverrides`. Element source-link state writes `element.source`.

## Resolution

`resolveSlideRenderModel(deck, slide)` centralizes render/export resolution. It
returns canvas metadata, resolved background/accent, master background elements,
slide elements, master foreground elements, flat rendered element order, and
concrete per-element design metadata.

Token refs and partial override values are resolved at this boundary. React
renderers, present/public viewers, and export spec builders consume concrete
colors, font stacks, element defaults, and ordered element lists.

`inspectSlideDesignOrigins(deck, slide)` reports where slide-level design values
come from for inspector labels. Rendering consumes the resolved render model;
origin inspection is UI metadata only.

## Primary Tests

- [`src/lib/presentation/style-cascade.test.ts`](../../src/lib/presentation/style-cascade.test.ts)
- [`src/lib/presentation/slide-render-model.test.ts`](../../src/lib/presentation/slide-render-model.test.ts)
- [`src/lib/presentation/slide-templates.test.ts`](../../src/lib/presentation/slide-templates.test.ts)
- [`src/lib/presentation/slide-commands.deck.test.ts`](../../src/lib/presentation/slide-commands.deck.test.ts)
