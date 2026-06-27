# Presentation Deck v6 Design

**Status:** Accepted Design  
**Last updated:** 2026-06-27

This document defines the target v6 architecture for presentation decks. It is
an accepted design proposal for the in-development slide system. When the code
implementation lands, fold the implemented runtime contract back into
[../data-model/deck.md](../data-model/deck.md) and keep this document as design
background or remove it.

The v6 design intentionally replaces the current deck theme/template vocabulary.
It does not add runtime compatibility for superseded deck payload shapes.

## Goals

- Make the persisted deck model easy to reason about: canvas, design, masters,
  templates, slides, and elements each have one job.
- Keep presentation themes reusable across many slide templates.
- Keep slide templates as creation blueprints, not live inheritance layers.
- Keep masters as live shared chrome for backgrounds, logos, footers, and page
  numbers.
- Store authored slide content in elements only; do not duplicate derived content
  fields on the slide.
- Resolve rendering through one pure model shared by editor, present mode,
  public render, thumbnails, and export.

## Vocabulary

| Term                 | Meaning                                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `PresentationTheme`  | Global visual language: color tokens, typography, spacing, element defaults, and default background.                   |
| `PresentationDesign` | The deck's selected theme plus optional theme-level overrides.                                                         |
| `SlideMaster`        | Deck-owned live shared chrome: background treatment, background elements, foreground logo/footer/page number elements. |
| `SlideTemplate`      | Blueprint used when creating or explicitly reapplying a slide. It is not a live render dependency.                     |
| `TemplateElement`    | Blueprint element inside a template. It materializes into a `SlideElement` when applied.                               |
| `Slide`              | Authored page instance with metadata, selected master, optional template provenance, and authoritative elements.       |
| `SlideElement`       | Authored content element. Its geometry, content, role, and local design overrides are persisted.                       |
| `MasterElement`      | Shared chrome element rendered from a master in a background or foreground layer.                                      |
| `designOverrides`    | Persisted partial design override at theme, master, slide, template element, or element level.                         |
| `Resolved*Design`    | Runtime-only concrete design values after resolving theme, master, slide, and element inputs.                          |

Do not use the old `DeckThemeTokenSet`, `customTokenSet`, `textRole`,
`layout placeholder`, or `deck template` naming for new v6 code. The user-facing
and code-facing model should use presentation-native names.

## Deck Shape

```ts
type Deck = {
  schemaVersion: 6;
  canvas: DeckCanvas;
  design: PresentationDesign;
  masters: SlideMaster[];
  defaultMasterId: string;
  customTemplates?: SlideTemplate[];
  slides: Slide[];
  deckContentHash?: string;
};

type DeckCanvas = {
  format: SlideFormat;
};

type PresentationDesign = {
  themeId: PresentationThemeId;
  themeOverrides?: PresentationThemeOverrides;
};
```

Top-level `themeId`, `customTokenSet`, `slideFormat`, and `layouts` are removed.
`canvas` describes page geometry. `design` describes the global visual system.
`masters` are deck-owned live render data. `customTemplates` stores only
deck-local templates; built-in templates live in code.

The validator must reject older deck shapes. There is no runtime v5-to-v6
migration shim.

## Theme Model

`PresentationTheme` owns global design defaults. Built-in themes should share a
single presentation type scale unless a theme deliberately defines a distinct
scale.

```ts
type PresentationTheme = {
  id: PresentationThemeId;
  name: string;
  colors: ThemeColors;
  typography: ThemeTypography;
  spacing: ThemeSpacing;
  elements: ElementDesignDefaults;
  background: BackgroundDesign;
};
```

Theme groups stay domain-specific. Do not collapse text, image, connector,
visual, and shape properties into one generic style object.

`themeOverrides` may override theme-level design only. It must not contain slide
template geometry, slide content, master chrome, or layout data.

## Roles

v6 uses presentation-native roles instead of HTML-like heading names.

```ts
type PresentationRole =
  | "title"
  | "subtitle"
  | "sectionTitle"
  | "body"
  | "bullet"
  | "quote"
  | "caption"
  | "footer"
  | "label"
  | "media"
  | "visual"
  | "image"
  | "logo"
  | "pageNumber"
  | "background";
```

The role vocabulary is shared by text, media, and chrome elements. `role` is
optional on freeform elements; absent roles inherit kind-level defaults from the
theme. Document headings map into presentation roles only at derivation time;
`h1`, `h2`, and `h3` do not enter the deck schema.

## Design References

Color-like design values support both semantic token references and concrete
values.

```ts
type ColorRef =
  | { token: "slideBg" | "surface" | "accent" | "onBg" | "onSurface" | "muted" }
  | { value: string };
```

Themes define concrete token values. Masters and templates should prefer token
references so they apply cleanly to different themes. User-selected element
overrides usually store concrete values, unless the UI explicitly offers a
semantic token choice such as "Use accent".

Resolvers output concrete CSS colors, point sizes, percentages, and element
defaults. Renderers and exporters should not receive unresolved token refs.

## Master Model

Masters are deck-owned persisted data and participate in live rendering.

```ts
type SlideMaster = {
  id: string;
  name: string;
  background?: BackgroundDesign;
  designOverrides?: MasterDesignOverrides;
  elements: MasterElement[];
};

type MasterElement = BaseElement & {
  layer: "background" | "foreground";
  content: MasterElementContent;
  locked: true;
};
```

Masters are for shared chrome only: default background, brand marks, watermarks,
logos, footers, page numbers, and similar repeated presentation furniture. They
must not define content layout for slide titles, body copy, visuals, or charts.

Render order is:

```text
theme.background
  -> master.background
  -> slide.designOverrides.background
  -> master background elements
  -> slide elements
  -> master foreground elements
```

Master and slide z-index spaces are separate. Sort by `zIndex` inside each
master layer and inside slide elements, not across all elements together.

## Template Model

Templates are blueprints. They create or explicitly reapply slide content, but
they are not live render dependencies.

```ts
type SlideTemplate = {
  id: string;
  name: string;
  category: "title" | "section" | "content" | "media" | "comparison" | "blank";
  defaultMasterId?: string;
  slideDesignDefaults?: SlideDesignOverrides;
  elements: TemplateElement[];
};

type TemplateElement = BaseElement & {
  contentDefaults?: ElementContentDefaults;
};
```

Applying a template materializes `TemplateElement` records into real
`SlideElement` records. The materialized slide owns its element boxes, content,
roles, and design overrides after that point. Later edits to the built-in
template registry do not automatically alter existing slides.

`Slide.templateId` is provenance only. It can power "Created from" labels,
analytics, and explicit "Reapply template" commands, but renderers must not
look up `templateId` during normal render/export.

Built-in templates are provided by code. Only deck-local user or brand templates
are persisted in `Deck.customTemplates`.

## Slide Model

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

`Slide.elements[]` is the authoritative content model. The slide no longer
persists `bullets`, `bulletRuns`, `visualIds`, `layout`, `elementsDerived`, or
`sourceSectionId` as render or sync fields.

`Slide.title` is metadata/cache for rails, search, document summaries, and
export section labels. It is not a render source. When a title element changes,
mutation helpers should synchronize the metadata title.

## Element Model

```ts
type BaseElement = {
  id: string;
  kind: "text" | "image" | "visual" | "shape" | "connector";
  role?: PresentationRole;
  box: ElementBox;
  zIndex: number;
  designOverrides?: ElementDesignOverrides;
  hidden?: boolean;
  locked?: boolean;
};

type SlideElement = BaseElement & {
  content: ElementContent;
  source?: ElementSource;
};
```

Kind-specific payload belongs under `content`, not as scattered top-level
fields.

```ts
type ElementContent =
  | { kind: "text"; paragraphs: Paragraph[] }
  | {
      kind: "image";
      src?: string;
      assetId?: string;
      alt?: string;
      crop?: ImageCrop;
    }
  | { kind: "visual"; visualId: string }
  | { kind: "shape"; shape: ShapeKind; text?: Paragraph[] }
  | {
      kind: "connector";
      routing: ConnectorRouting;
      start: ConnectorEndpoint;
      end: ConnectorEndpoint;
    };
```

`content.kind` must match `BaseElement.kind`. The duplicate discriminant keeps
content unions easy to validate and pattern-match when passed independently.

Element-level `source` replaces slide-level `elementsDerived` and legacy
slide-wide provenance.

```ts
type ElementSource =
  | {
      kind: "document";
      documentId?: string;
      blockId: string;
      contentHash: string;
    }
  | { kind: "asset"; assetId: string }
  | { kind: "generated"; promptId?: string };
```

Sync from document operates on source-linked elements. Freeform or hand-authored
elements simply have no source.

## Rendering And Resolution

Rendering should flow through one pure resolved model:

```ts
resolveSlideRenderModel(deck, slide): ResolvedSlideRenderModel
```

The resolved model flattens concrete values for render/export:

- background fill;
- master background elements;
- slide elements with resolved boxes and design;
- master foreground elements;
- image, visual, shape, connector, and text defaults;
- slide metadata needed by export.

Editor, present mode, public render, thumbnails, and export must consume this
same resolved model or helper family instead of each recomputing theme/master
logic.

Origin tracking is useful for inspector UI, but it should be separate from the
flat render model:

```ts
inspectSlideDesignOrigins(deck, slide): SlideDesignOriginReport
```

Render/export paths use flat concrete values. Inspector/debug paths can ask for
field origins such as `theme`, `themeOverride`, `master`, `slide`, or `element`.

## Compatibility Policy

v6 is a hard schema cut:

- `schemaVersion` must be `6`.
- Runtime validators reject superseded top-level fields such as `themeId`,
  `customTokenSet`, `slideFormat`, and `layouts`.
- Runtime validators reject superseded slide fields such as `bullets`,
  `bulletRuns`, `visualIds`, `layout`, and `elementsDerived`.
- There is no runtime compatibility layer or silent migration.
- Fixtures, tests, generated decks, seeds, and docs must be updated with the
  schema change.

## Implementation Slices

1. Add v6 types and validators with the new names.
2. Replace built-in theme data with `PresentationTheme` and the presentation role
   vocabulary.
3. Add deck-owned masters and built-in template registry materialization.
4. Update document derivation to emit v6 slides and element-level source.
5. Add the pure resolved render model and route editor/present/public/export
   through it.
6. Update commands/mutations to write `canvas`, `design`, `masters`,
   `designOverrides`, and `content` fields.
7. Update fixtures, tests, and current contract docs once implementation lands.

## Invariants

1. Theme controls global visual language; it never stores slide content or
   template geometry.
2. Master controls live shared chrome; it never controls slide content layout.
3. Template is a blueprint; it is never a normal render dependency.
4. Slide elements are the only authoritative slide content.
5. Kind-specific content lives under `content`.
6. Local design customization is always named `designOverrides`.
7. Derived fields are computed by helpers, not persisted as duplicate content.
8. All render/export surfaces share the same resolved render model.
