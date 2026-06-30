# Semantic Slide Design System

**Status:** Implemented (vNext semantic schema; v6 migration utility in development)
**Last updated:** 2026-06-29

This document describes the implemented semantic slide design system that replaces
the v6 presentation model. The vNext semantic slide schema is now the runtime
boundary, implemented across the core model layer, React components, API
generation, public render, and editor v7 path. The system features first-class
style packages, semantic templates, AI slot generation, direct rendering, and
direct export from the new tree.

The current v6 model is being migrated through a one-time v6-to-v7 migration
utility. After cutover, the runtime accepts the new schema only. Existing v6
documents should be migrated through this path rather than supported by long-lived
runtime compatibility layers.

## Target Outcome

The presentation system should become:

```text
AI semantic deck plan
  -> semantic template compiler
  -> vNext slide node tree
  -> theme style resolver
  -> resolved render tree
  -> editor canvas / present mode / export
```

Slides are no longer stored as v6 `Slide.elements[]` with theme behavior baked
into copied element overrides. Each slide is a root component with child
component nodes. Layout, content, style binding, local overrides, and generated
theme decorations are separate concepts.

## Hard Decisions

- Use a new persisted deck schema, referred to here as `schemaVersion: 7`.
- Do not materialize semantic slides back into v6 as the normal render/export
  path.
- Do not add a long-lived v6 compatibility reader to the new runtime.
- Use one-time migration or seed regeneration for existing v6 data.
- Keep AI away from coordinates, raw style refs, and low-level component trees
  by default.
- Keep template layout package-independent.
- Keep theme packages focused on tokens, styles, variants, and decorations.
- Preserve user local overrides above theme styles.
- Allow theme switching to change visual treatment, not existing layout.

## Goals

- Make AI generation reliable by giving it semantic templates, typed slots, and
  capacity limits.
- Make theme switching predictable by resolving named style bindings against a
  replaceable theme package.
- Make the slide itself a styleable root component.
- Make each node independently styleable without global cascade or selector
  specificity.
- Make theme decorations expressive without mixing them into normal user
  content.
- Make renderer, present mode, public render, screenshot, and PPTX export share
  one resolved render tree.
- Make the new schema easier to validate than the current mixed materialized
  model.

## Non-Goals

- No full CSS runtime.
- No arbitrary selectors, descendant selectors, or specificity.
- No runtime cascade from root slide into child nodes.
- No ordinary theme-switch reflow of existing slides.
- No AI-generated free-form coordinates in the default generation path.
- No persisted v6-shaped slide elements after cutover.
- No long-term support for superseded payload shapes.

## Proposed Source Layout

Create a new vNext presentation model beside the current implementation, then
switch runtime entry points over when complete.

```text
src/lib/presentation-vnext/
  schema.ts
  types.ts
  ids.ts
  validation.ts
  diagnostics.ts
  style-registry.ts
  style-schema.ts
  style-resolver.ts
  theme-package-schema.ts
  theme-packages.ts
  template-schema.ts
  template-registry.ts
  template-compiler.ts
  ai-plan-schema.ts
  ai-plan-repair.ts
  render-tree.ts
  render-resolver.ts
  export-spec.ts

src/components/presentation-vnext/
  slide-canvas.tsx
  slide-node-renderer.tsx
  selection-model.ts
  inspector/
  stage/
```

The exact folder names can change, but the boundaries should not: schema,
style, theme package, template, AI plan, render tree, editor, and export should
stay separable.

## Normative Data Contract

This section is the v7 implementation target. The TypeScript shapes below are
the persisted and registry contracts that validation should enforce; renderer
and export adapters should consume only resolved runtime shapes derived from
these contracts.

### Contract Boundaries

| Boundary               | Persisted or registry input                  | Owner                | Validation result                                |
| ---------------------- | -------------------------------------------- | -------------------- | ------------------------------------------------ |
| Deck parse             | `DeckV7` from `Document.deckJson`            | document persistence | accept only current v7 shape or return errors    |
| Theme package load     | `ThemePackageV1` bundled or uploaded package | package registry     | accept, warn, or reject package before use       |
| Semantic template load | `SemanticTemplateV1` registry entries        | template registry    | accept only complete slot/layout contracts       |
| AI plan repair         | `AiDeckPlanV1` from generation               | AI repair/compiler   | return repaired plan plus diagnostics            |
| Template compile       | `AiSlideSpec` + `SemanticTemplateV1`         | template compiler    | emit valid `SlideNode` trees or blocking errors  |
| Render resolve         | `DeckV7` + theme package + template registry | render resolver      | emit resolved render tree plus fidelity warnings |
| Export build           | `ResolvedDeckRenderTree`                     | export spec builder  | emit DOM-free export operations plus diagnostics |

Persisted JSON is strict: unknown keys are rejected except inside explicitly
named `metadata.extra`, `source.extra`, and `debug` fields. Validation must not
repair persisted `DeckV7`; repair is allowed only at import, migration, paste,
and AI-plan boundaries before the value is saved.

### Primitive Types

```ts
type DeckId = string;
type SlideId = string;
type NodeId = string;
type AssetId = string;
type ThemePackageId = string;
type ThemeVersion = string;
type TemplateVersion = string;
type StyleVariantId = string;
type TokenPath = string;
type IsoDateTime = string;

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
```

Identity rules:

- ids are non-empty ASCII strings matching `^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,127}$`;
- `NodeId` values are unique within one deck, including slide root nodes and all
  descendants;
- asset ids are unique within their asset family and stable across metadata
  edits;
- template layout ids and style variant ids are unique only inside their owning
  template or style ref;
- version fields use semver-compatible strings when authored by code, but the
  parser only requires a non-empty string so prerelease tags remain possible.

String rules:

- user-visible strings are UTF-8 and may be empty only when the field explicitly
  allows empty text;
- ids, style refs, token paths, template kinds, and enum values are ASCII;
- persisted strings are stored without leading/trailing control characters;
- URLs are stored only in asset registries or source metadata, not repeated in
  slide nodes.

Number rules:

- every persisted number must be finite;
- percentages use the inclusive range documented on the field;
- opacities are `0` to `1`;
- rotations are degrees, clockwise, normalized to `[-360, 360]` on edit;
- style lengths use explicit `Pt`, `Pct`, or `Px` suffixes in field names.

### Units And Coordinate Space

```ts
type CanvasSpec = {
  format: "16:9" | "4:3" | "square" | "custom";
  width: number;
  height: number;
  unit: "percent";
  safeArea?: InsetsPct;
};

type InsetsPct = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type FramePct = {
  x: number;
  y: number;
  w: number;
  h: number;
};
```

Canvas rules:

- persisted geometry is always canvas-relative percent space;
- default `16:9` uses `width: 100`, `height: 56.25`, and `unit: "percent"`;
- `4:3` uses `width: 100`, `height: 75`;
- `square` uses `width: 100`, `height: 100`;
- `custom` must still use a positive `width`, positive `height`, and
  `unit: "percent"`;
- `safeArea` values are percentages of the matching canvas axis and default to
  `{ top: 0, right: 0, bottom: 0, left: 0 }`;
- renderers convert percent frames to pixels, points, inches, or PPTX EMUs only
  at the adapter boundary.

Layout rules:

- every non-slide node requires `layout` after template compilation;
- every persisted child frame is in slide canvas coordinates, even when nested
  under a group;
- `w` and `h` must be greater than `0`;
- user nodes must intersect the canvas unless the node is hidden;
- theme decoration frames may bleed outside the canvas by at most `50%` of the
  relevant axis;
- theme switching must never rewrite existing `layout.frame` values.

## Persisted Deck Schema

The deck is a semantic component document, not a list of v6 element records.

```ts
type DeckV7 = {
  schemaVersion: 7;
  id?: DeckId;
  title?: string;
  canvas: CanvasSpec;
  theme: DeckThemeBinding;
  assets: DeckAssetRegistry;
  slides: SlideNode[];
  metadata?: DeckMetadata;
};

type DeckMetadata = {
  createdAt?: IsoDateTime;
  updatedAt?: IsoDateTime;
  sourceDocumentId?: string;
  contentHash?: string;
  locale?: string;
  extra?: Record<string, JsonValue>;
};
```

Deck validation:

- `schemaVersion` is required and must be exactly `7`;
- `canvas`, `theme`, `assets`, and `slides` are required;
- `slides` must contain at least one `SlideNode`;
- slide order is the array order; no separate persisted slide index exists;
- no v6 fields such as `elements`, `masters`, `customTemplates`,
  `design.themeId`, or `defaultMasterId` are valid in a v7 deck;
- parsed decks are immutable inputs for render/export; editor commands return a
  new tree or a structural patch.

### Deck Theme Binding

```ts
type DeckThemeBinding = {
  packageId: ThemePackageId;
  packageVersion?: ThemeVersion;
  brandKitId?: string;
  overrides?: ThemeOverridePatch;
};

type ThemeOverridePatch = {
  tokens?: DeepPartial<ThemeTokens>;
  styles?: Partial<Record<StyleRef, Record<StyleVariantId, StylePatch>>>;
  disabledDecorations?: string[];
};
```

Theme binding rules:

- `packageId` must resolve to a loaded package before render/export;
- `packageVersion` is an informational lock used for diagnostics, not a reason
  to reject when a compatible package id is available;
- `brandKitId` references product-level brand data outside the deck and must not
  be required for public render;
- overrides are explicit user edits above the package, not copied resolved
  styles;
- disabled decoration ids suppress generated decorations without deleting the
  package recipe.

### Asset Registry

```ts
type DeckAssetRegistry = {
  images: Record<AssetId, ImageAsset>;
  fonts?: Record<AssetId, FontAsset>;
  visuals?: Record<AssetId, VisualAssetRef>;
  files?: Record<AssetId, FileAsset>;
};

type ImageAsset = {
  id: AssetId;
  src: string;
  alt?: string;
  widthPx?: number;
  heightPx?: number;
  mimeType?:
    | "image/png"
    | "image/jpeg"
    | "image/gif"
    | "image/webp"
    | "image/svg+xml";
  contentHash?: string;
  origin?: AssetOrigin;
};

type FontAsset = {
  id: AssetId;
  family: string;
  src: string;
  weight?: number | number[];
  style?: "normal" | "italic";
  contentHash?: string;
};

type VisualAssetRef = {
  id: AssetId;
  visualId: string;
  documentId?: string;
  title?: string;
  alt?: string;
  contentHash?: string;
};

type FileAsset = {
  id: AssetId;
  src: string;
  filename?: string;
  mimeType?: string;
  contentHash?: string;
};

type AssetOrigin = {
  kind: "upload" | "document" | "ai" | "theme" | "remote";
  sourceId?: string;
  importedAt?: IsoDateTime;
};
```

Asset rules:

- slide nodes reference assets by `assetId`; they do not duplicate `src`, size,
  hash, or origin metadata;
- image dimensions are pixels and must be positive when present;
- `alt` on a node overrides asset-level `alt` for that placement only;
- theme package assets are resolved through the package manifest unless detached
  into deck assets;
- deleting an asset requires first removing or repairing every node reference.

## Node Model

Every slide is a root node. Every visible or editable object on the slide is a
child node in the same semantic tree.

```ts
type BaseNode = {
  id: NodeId;
  name?: string;
  role?: SemanticRole;
  slot?: SlotKey;
  layout?: LayoutBox;
  style?: StyleBinding;
  localStyle?: StylePatch;
  locked?: boolean;
  hidden?: boolean;
  accessibility?: AccessibilityMetadata;
  source?: NodeSourceMetadata;
};

type SlideNode = BaseNode & {
  type: "slide";
  template: SlideTemplateBinding;
  controls?: SlideControls;
  props?: SlideProps;
  children: SlideChildNode[];
  notes?: string;
};

type SlideChildNode =
  | TextNode
  | ImageNode
  | ShapeNode
  | ConnectorNode
  | TableNode
  | VisualNode
  | GroupNode;
```

Base node rules:

- `type` is the discriminant and determines the exact `content` shape;
- `id` is stable across edits, drag/resize, style changes, and content edits;
- `name` is for layer UI only and does not affect accessibility unless no
  better accessible name exists;
- `role` describes semantic purpose, not visual appearance;
- `slot` records the template slot that produced the node and remains useful for
  reapply/repair, but renderers must not depend on it;
- `layout` is absent only on slide roots and pre-compile template blueprints;
- `style` binds to a theme style; `localStyle` stores explicit user overrides;
- `locked` blocks normal editor mutations but does not hide or skip export;
- `hidden` removes the node from editor render, present mode, public render, and
  export while keeping it in the document;
- `source` is provenance metadata and never a render dependency.

### Slide Root

```ts
type SlideTemplateBinding = {
  kind: SemanticTemplateKind;
  templateVersion?: TemplateVersion;
  layoutId?: string;
};

type SlideControls = {
  tone?: SlideTone;
  density?: SlideDensity;
  emphasis?: SlideEmphasis;
};

type SlideProps = {
  decoration?: "none" | "subtle" | "default" | "expressive";
  chrome?: "default" | "minimal" | "none";
};
```

Slide root rules:

- `type` is always `"slide"`;
- slide root `style` controls slide surface, chrome, and generated theme layer;
- slide root style must not cascade into child node geometry or rewrite child
  `style` bindings;
- `template.kind` is the semantic template that created or last structurally
  reapplied the slide;
- `template.layoutId` records the concrete layout variant used;
- `controls` are optional because older v7 drafts and migrated explicit slides
  may not have every control;
- unsupported controls are repaired during template compile and reported as
  diagnostics;
- `notes` stores speaker notes and overflow text from AI repair.

### Semantic Roles

```ts
type SemanticRole =
  | "slide"
  | "title"
  | "subtitle"
  | "kicker"
  | "body"
  | "bullet"
  | "caption"
  | "quote"
  | "attribution"
  | "metric"
  | "label"
  | "table"
  | "visual"
  | "image"
  | "card"
  | "callout"
  | "connector"
  | "background"
  | "themeDecoration";
```

Role rules:

- roles are stable semantic labels used by templates, accessibility, and style
  defaults;
- roles are not CSS selectors and have no cascade behavior;
- a node may have a role even when it uses a different style ref;
- `themeDecoration` is reserved for generated render-layer nodes and detached
  decoration nodes.

### Layout Box

```ts
type LayoutBox = {
  frame: FramePct;
  rotation?: number;
  zIndex: number;
  anchor?: "topLeft" | "center";
  constraints?: LayoutConstraints;
};

type LayoutConstraints = {
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  preserveAspectRatio?: boolean;
};
```

Layout validation:

- `zIndex` is an integer; higher values render above lower values inside the
  user-node layer;
- siblings may share `zIndex`; stable tie-break is tree order;
- `anchor` defaults to `"topLeft"`; rotation always happens around the visual
  center after frame resolution;
- constraints are editor hints and must not change render output by themselves;
- constraints use the same percent units as `frame`;
- `minW <= maxW` and `minH <= maxH` when both are present.

### Accessibility And Source Metadata

```ts
type AccessibilityMetadata = {
  label?: string;
  alt?: string;
  decorative?: boolean;
  readingOrder?: number;
};

type NodeSourceMetadata = {
  documentId?: string;
  blockId?: string;
  blockKind?: "text" | "visual" | "table" | "image";
  contentHash?: string;
  linkedAt?: IsoDateTime;
  unlinked?: boolean;
  extra?: Record<string, JsonValue>;
};
```

Accessibility rules:

- `decorative: true` excludes a node from accessible reading output unless the
  user selects it in the editor;
- `alt` belongs on image/visual placements; `label` belongs on grouped or
  non-text interactive nodes;
- `readingOrder` is optional; when absent, reading order follows tree order then
  top-to-bottom/left-to-right layout order;
- generated theme decorations default to decorative.

## Content Models

### Text Node

```ts
type TextNode = BaseNode & {
  type: "text";
  content: TextContent;
};

type TextContent = {
  paragraphs: Paragraph[];
  fit?: TextFitMode;
  language?: string;
};

type Paragraph = {
  id: string;
  text: string;
  runs?: TextRun[];
  list?: ListMarker;
};

type TextRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  code?: boolean;
  link?: string;
  localStyle?: Pick<TextStyle, "color" | "fontSizePt" | "fontFamily">;
};

type ListMarker = {
  kind: "bullet" | "number";
  indent?: number;
  numberStyle?: "decimal" | "lower-alpha" | "upper-alpha" | "lower-roman";
};

type TextFitMode = "auto-height" | "fixed-box" | "shrink-to-fit";
```

Text rules:

- `paragraphs` is the canonical persisted text payload;
- plain text is derived by joining paragraph `text` values with `\n` and is not
  separately persisted;
- every paragraph id is stable within its text node;
- if `runs` is present, concatenating `runs[].text` must equal `paragraph.text`;
- `indent` defaults to `0` and is clamped to `0` through `5` before save;
- `fit` defaults to `"auto-height"` in the editor and `"fixed-box"` for export
  when a renderer cannot mutate layout;
- hyperlinks are allowed only on text runs and must use supported URL schemes.

### Image Node

```ts
type ImageNode = BaseNode & {
  type: "image";
  content: ImageContent;
};

type ImageContent = {
  assetId: AssetId;
  crop?: ImageCrop;
  fit?: ImageFitMode;
  focalPoint?: PointPct;
  alt?: string;
};

type ImageCrop = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type PointPct = {
  x: number;
  y: number;
};

type ImageFitMode = "contain" | "cover" | "fill" | "none";
```

Image rules:

- `assetId` must reference `assets.images`;
- crop values are fractions from `0` to `1` and opposite sides must sum to less
  than `1`;
- `fit` defaults to the resolved image style, then `"cover"`;
- `focalPoint` uses `0` to `100` percentages inside the uncropped image;
- node `content.alt` overrides the asset alt for this placement;
- if both node alt and asset alt are absent, validation emits an accessibility
  warning unless the node is decorative.

### Shape Node

```ts
type ShapeNode = BaseNode & {
  type: "shape";
  content: ShapeContent;
};

type ShapeContent = {
  shape: ShapeKind;
  text?: TextContent;
  path?: SvgPathData;
};

type ShapeKind =
  | "rect"
  | "ellipse"
  | "line"
  | "triangle"
  | "diamond"
  | "circle"
  | "square"
  | "path";

type SvgPathData = string;
```

Shape rules:

- `path` is required only when `shape` is `"path"`;
- path data must be normalized SVG path data using absolute commands accepted
  by the renderer/exporter;
- line shapes use `stroke` and ignore `fill` unless explicitly converted to a
  path;
- shape text uses the same `TextContent` rules and resolves through the shape's
  text style;
- circles and squares are semantic shortcuts; the renderer derives the actual
  fitted geometry from the node frame.

### Connector Node

```ts
type ConnectorNode = BaseNode & {
  type: "connector";
  content: ConnectorContent;
};

type ConnectorContent = {
  from: ConnectorEndpoint;
  to: ConnectorEndpoint;
  routing?: "straight" | "elbow";
};

type ConnectorEndpoint =
  | { kind: "point"; point: PointPct }
  | { kind: "node"; nodeId: NodeId; anchor: ConnectorAnchor };

type ConnectorAnchor = "center" | "top" | "right" | "bottom" | "left";
```

Connector rules:

- `from` and `to` are required;
- node endpoints must reference non-slide nodes in the same slide tree;
- connectors may reference hidden nodes only when the connector itself is also
  hidden;
- endpoint `point` values use slide percent coordinates;
- connector `layout.frame` is the editor hit area and bounding box; endpoint
  geometry is authoritative for the line path;
- `routing` defaults to the resolved connector style, then `"straight"`.

### Table Node

```ts
type TableNode = BaseNode & {
  type: "table";
  content: TableContent;
};

type TableContent = {
  columns: TableColumn[];
  rows: TableRow[];
  header?: boolean;
  caption?: string;
};

type TableColumn = {
  id: string;
  label: string;
  width?: number;
};

type TableRow = {
  id: string;
  cells: TableCell[];
};

type TableCell = {
  text: string;
  runs?: TextRun[];
};
```

Table rules:

- persisted tables accept `1` to `8` columns and `1` to `20` rows;
- AI-facing template slots should usually use stricter slide-friendly limits;
- column and row ids are stable and unique within the table;
- editing a label or cell text must not regenerate ids;
- every row must carry exactly one cell per column;
- `width` is a relative positive weight, not a percentage; absent widths divide
  remaining space evenly;
- if a cell has `runs`, concatenating run text must equal `cell.text`;
- `header` defaults to `false`;
- captions render inside the table node unless the template also creates a
  separate caption text node.

### Visual Node

```ts
type VisualNode = BaseNode & {
  type: "visual";
  content: VisualContent;
};

type VisualContent = {
  assetId?: AssetId;
  visualId?: string;
  transparentBackground?: boolean;
  alt?: string;
};
```

Visual rules:

- a visual node must provide either `assetId` referencing `assets.visuals` or a
  direct `visualId` resolvable from the current document context;
- public render/export should prefer `assetId` so detached or shared decks can
  resolve visuals without the source editor state;
- `transparentBackground` defaults to the resolved visual style;
- node alt overrides visual asset alt;
- unresolved visuals are export-blocking errors unless a deterministic fallback
  image asset exists.

### Group Node

```ts
type GroupNode = BaseNode & {
  type: "group";
  component: GroupComponentKind;
  children: SlideChildNode[];
};

type GroupComponentKind =
  | "metricCard"
  | "quoteBlock"
  | "timeline"
  | "comparisonGrid"
  | "cardGrid"
  | "custom";
```

Group rules:

- groups are authoring/editing containers, not coordinate-system containers;
- child frames remain slide-relative percent frames;
- group layout is used for hit testing, drag handles, bounds display, and
  optional clipping when style says to clip;
- a group must contain at least one child;
- nested groups are allowed up to depth `4`;
- moving or resizing a group mutates child frames through an editor command.

## Semantic Template Registry

Templates are global. Theme packages do not define different AI-facing template
contracts; they only style the same contracts.

```ts
type SemanticTemplateV1 = {
  schemaVersion: 1;
  kind: SemanticTemplateKind;
  label: string;
  version: TemplateVersion;
  group: TemplateGroup;
  intent: string;
  slots: Record<SlotKey, SlotContract>;
  supports: TemplateControlSupport;
  layouts: TemplateLayoutVariant[];
  selection: TemplateSelectionMetadata;
};
```

Initial template kinds should match the current package taxonomy unless the
registry intentionally migrates every package, test fixture, and AI prompt in
the same change:

```ts
type SemanticTemplateKind =
  | "cover"
  | "agenda"
  | "section"
  | "executive-summary"
  | "content"
  | "detail"
  | "quote"
  | "big-stat"
  | "metric-row"
  | "insight"
  | "evidence"
  | "table"
  | "comparison"
  | "matrix"
  | "framework"
  | "process"
  | "timeline"
  | "roadmap"
  | "architecture"
  | "case-study"
  | "risks"
  | "recommendation"
  | "pricing"
  | "team"
  | "visual-focus"
  | "closing"
  | "appendix";

type TemplateGroup =
  | "orient"
  | "explain"
  | "compare"
  | "prove"
  | "sequence"
  | "decision"
  | "commercial"
  | "closing";
```

### Slot Contracts

```ts
type SlotKey =
  | "kicker"
  | "title"
  | "subtitle"
  | "body"
  | "bullets"
  | "leftTitle"
  | "leftBody"
  | "leftBullets"
  | "rightTitle"
  | "rightBody"
  | "rightBullets"
  | "cards"
  | "steps"
  | "quote"
  | "attribution"
  | "stat"
  | "statLabel"
  | "metrics"
  | "table"
  | "visualId"
  | "imagePrompt"
  | "caption";

type SlotContract = {
  type: SlotValueType;
  required: boolean;
  maxChars?: number;
  maxItems?: number;
  minItems?: number;
  minRows?: number;
  maxRows?: number;
  minColumns?: number;
  maxColumns?: number;
  maxCellChars?: number;
  overflow: OverflowPolicy;
};

type SlotValueType =
  | "shortText"
  | "paragraph"
  | "bullets"
  | "metric"
  | "metrics"
  | "cards"
  | "steps"
  | "image"
  | "table"
  | "timeline"
  | "visual";

type OverflowPolicy =
  | "reject"
  | "repair"
  | "chooseDenserLayout"
  | "splitSlide"
  | "truncateWithNote";
```

Slot rules:

- every AI-facing slot requires at least one capacity field relevant to its
  `type`;
- `required: true` means compile fails when the repaired slot value is absent;
- `required: false` means compile may omit or hide the target node;
- text capacities count Unicode code points after trimming repeated whitespace;
- table capacities apply before compile and before any style/layout decisions;
- `overflow` is mandatory so repair is deterministic.

### Template Controls And Layouts

```ts
type TemplateControlSupport = {
  tone: SlideTone[];
  density: SlideDensity[];
  emphasis: SlideEmphasis[];
};

type SlideTone =
  | "neutral"
  | "confident"
  | "warm"
  | "urgent"
  | "premium"
  | "technical";

type SlideDensity = "airy" | "normal" | "dense";

type SlideEmphasis =
  | "balanced"
  | "title"
  | "data"
  | "visual"
  | "quote"
  | "action";

type TemplateLayoutVariant = {
  id: string;
  density: SlideDensity[];
  emphasis: SlideEmphasis[];
  root: TemplateNodeBlueprint;
};

type TemplateNodeBlueprint = {
  type: SlideChildNode["type"] | "slide";
  component?: GroupComponentKind;
  role?: SemanticRole;
  slot?: SlotKey;
  layout?: LayoutBox;
  style: StyleBinding;
  content?: TemplateStaticContent;
  props?: Record<string, JsonValue>;
  children?: TemplateNodeBlueprint[];
};

type TemplateSelectionMetadata = {
  priority: number;
  bestFor: string;
  avoidFor?: string;
  signals: string[];
};
```

Template rules:

- every template must have at least one layout variant;
- each layout variant root must be a `slide` blueprint;
- every non-slide blueprint requires `layout` and `style`;
- blueprints with `slot` must reference a declared slot;
- static content is allowed for decorative labels, separators, and icons, but
  should not contain user document content;
- layout selection is deterministic: exact density/emphasis match first, then
  density match, then emphasis match, then template default;
- template compile emits normal `SlideNode` trees and never writes theme package
  implementation details into slots.

## AI Generation Contract

AI output is a deck plan, not a rendered deck.

```ts
type AiDeckPlanV1 = {
  planVersion: 1;
  title?: string;
  locale?: string;
  slides: AiSlideSpec[];
};

type AiSlideSpec = {
  kind: SemanticTemplateKind;
  tone?: SlideTone;
  density?: SlideDensity;
  emphasis?: SlideEmphasis;
  slots: Partial<Record<SlotKey, SlotValue>>;
  speakerNotes?: string;
};
```

```ts
type SlotValue =
  | { type: "shortText"; text: string }
  | { type: "paragraph"; paragraphs: string[] }
  | { type: "bullets"; items: BulletSlotItem[] }
  | { type: "metric"; value: string; label: string; detail?: string }
  | { type: "metrics"; items: MetricSlotItem[] }
  | { type: "cards"; items: CardSlotItem[] }
  | { type: "steps"; items: StepSlotItem[] }
  | { type: "image"; assetId?: AssetId; prompt?: string; alt?: string }
  | { type: "table"; columns: string[]; rows: string[][]; caption?: string }
  | { type: "timeline"; items: TimelineSlotItem[] }
  | { type: "visual"; visualId: string; caption?: string };

type BulletSlotItem = { text: string; children?: BulletSlotItem[] };
type MetricSlotItem = { value: string; label: string; detail?: string };
type CardSlotItem = { title: string; body?: string; metric?: string };
type StepSlotItem = { title: string; body?: string; date?: string };
type TimelineSlotItem = { label: string; title: string; body?: string };
```

AI rules:

- prompts include template kinds, slot contracts, capacities, control
  vocabulary, source outline, candidate content, and visual asset inventory;
- prompts exclude style object details, theme internals, coordinates, renderer
  internals, and export operations;
- repair may trim, split, choose a denser layout, move overflow to notes, or
  reject according to the slot's `overflow` policy;
- repair must preserve source meaning and produce diagnostics for every
  material change;
- AI plan fields are never copied wholesale into persisted decks; the compiler
  emits valid nodes with generated ids and stable slot metadata.

## Style System

Styles are named semantic bindings resolved against the active theme package.
They are not arbitrary class names.

```ts
type StyleBinding = {
  ref: StyleRef;
  variant?: StyleVariantId;
};

type StyleRef =
  | "slide.cover"
  | "slide.content"
  | "slide.section"
  | "text.title"
  | "text.subtitle"
  | "text.body"
  | "text.kicker"
  | "text.caption"
  | "text.quote"
  | "text.metric"
  | "surface.card"
  | "surface.callout"
  | "surface.table"
  | "media.hero"
  | "media.inline"
  | "chart.primary"
  | "connector.primary"
  | "decoration.background";
```

Style binding rules:

- `ref` must exist in the global style registry;
- every public style ref requires a `default` variant in every theme package;
- missing requested variants fall back to `default` and produce warnings;
- theme switching changes resolved styles but keeps node `layout` and
  `localStyle` unchanged;
- there is no general cascade, selector specificity, descendant selector, or
  inherited root-to-child style behavior.

### Style Object Schema

The style schema contains only properties that editor canvas, present mode,
public render, and PPTX/image export can all interpret or deterministically
fallback from.

```ts
type StyleObject = {
  text?: TextStyle;
  fill?: FillStyle;
  stroke?: StrokeStyle;
  radius?: RadiusStyle;
  opacity?: number;
  shadow?: ShadowStyle;
  effect?: EffectStyle;
  image?: ImageStyle;
  connector?: ConnectorStyle;
  table?: TableStyle;
  slide?: SlideSurfaceStyle;
  visual?: VisualStyle;
  clip?: ClipStyle;
};

type StylePatch = DeepPartial<StyleObject>;
```

```ts
type TextStyle = {
  fontFamily?: string | TokenRef;
  fontSizePt?: number;
  weight?: number;
  italic?: boolean;
  underline?: boolean;
  color?: ColorValue;
  lineHeight?: number;
  paragraphSpacingPt?: number;
  align?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  letterSpacingEm?: number;
  textTransform?: "none" | "uppercase";
};

type ColorValue = string | TokenRef;
type TokenRef = { token: TokenPath };

type FillStyle =
  | { type: "solid"; color: ColorValue }
  | {
      type: "linearGradient";
      from: ColorValue;
      to: ColorValue;
      angle?: number;
      stops?: GradientStop[];
    }
  | {
      type: "radialGradient";
      inner: ColorValue;
      outer: ColorValue;
      cx?: number;
      cy?: number;
      r?: number;
      rx?: number;
      ry?: number;
      stops?: GradientStop[];
    }
  | { type: "image"; assetId: AssetId; opacity?: number };

type GradientStop = { color: ColorValue; offsetPct: number };

type StrokeStyle = {
  color: ColorValue;
  widthPt: number;
  dash?: "solid" | "dashed" | "dotted";
};

type RadiusStyle =
  | { allPt: number }
  | {
      topLeftPt: number;
      topRightPt: number;
      bottomRightPt: number;
      bottomLeftPt: number;
    };

type ShadowStyle = {
  xPt: number;
  yPt: number;
  blurPt: number;
  color: ColorValue;
  opacity?: number;
};

type EffectStyle =
  | { kind: "none" }
  | { kind: "glass"; intensity: "light" | "medium" | "strong" }
  | { kind: "blur"; radiusPt: number }
  | { kind: "glow"; color: ColorValue; blurPt: number; opacity?: number };

type ImageStyle = {
  fit?: ImageFitMode;
  maskShape?:
    | "none"
    | "rect"
    | "circle"
    | "ellipse"
    | "rounded"
    | "diamond"
    | "triangle";
  radiusPct?: number;
  shadow?: boolean;
};

type ConnectorStyle = {
  stroke?: StrokeStyle;
  startArrow?: "none" | "arrow" | "filled";
  endArrow?: "none" | "arrow" | "filled";
  routing?: "straight" | "elbow";
};

type TableStyle = {
  headerFill?: FillStyle;
  rowFill?: FillStyle;
  alternateRowFill?: FillStyle;
  border?: StrokeStyle;
  cellPaddingPt?: InsetsPt;
  text?: TextStyle;
  headerText?: TextStyle;
};

type SlideSurfaceStyle = {
  background?: FillStyle;
  paddingPct?: InsetsPct;
  chrome?: "default" | "minimal" | "none";
  decoration?: "none" | "subtle" | "default" | "expressive";
};

type VisualStyle = {
  styleThemeId?: string;
  transparentBackground?: boolean;
};

type ClipStyle = {
  enabled: boolean;
};

type InsetsPt = { top: number; right: number; bottom: number; left: number };
type DeepPartial<T> = { [K in keyof T]?: DeepPartial<T[K]> };
```

Style rules:

- layout placement fields never appear in `StyleObject`;
- token refs are structured as `{ token }`, not CSS strings, in persisted JSON;
- color strings must be CSS hex colors or exporter-supported color literals;
- gradient stops are ordered by `offsetPct` from `0` to `100`;
- unresolved token refs are package validation errors;
- unsupported effects use deterministic export fallbacks and diagnostics;
- `localStyle` merges over the resolved theme style at the node only.

Resolution order:

```text
resolvedStyle = package.styles[ref][variant/default]
  + deck.theme.overrides.styles[ref][variant/default]
  + node.localStyle
```

Local overrides must survive theme switching. The inspector should show an
override badge and provide `Reset to theme style`, which removes the relevant
keys from `node.localStyle` instead of writing package defaults into the node.

## Theme Package Schema

Theme packages implement visual language for the global template/style
contracts.

```ts
type ThemePackageV1 = {
  schemaVersion: 1;
  id: ThemePackageId;
  version: ThemeVersion;
  name: string;
  tagline?: string;
  tokens: ThemeTokens;
  styles: Record<StyleRef, Record<StyleVariantId, StyleObject>>;
  decorations?: Record<string, ThemeDecorationRecipe>;
  assets?: ThemeAssetManifest;
};
```

```ts
type ThemeTokens = {
  colors: {
    canvas: { fill: string; text: string; mutedText: string };
    surface: { fill: string; text: string; mutedText: string; border?: string };
    accent: { fill: string; text: string };
    status?: {
      danger?: { fill: string; text: string };
      warning?: { fill: string; text: string };
      success?: { fill: string; text: string };
    };
  };
  fonts: {
    heading: string;
    body: string;
    mono?: string;
  };
  spacing?: Record<string, number>;
  radii?: Record<string, number>;
  shadows?: Record<string, ShadowStyle>;
};

type ThemeAssetManifest = {
  images?: Record<AssetId, Omit<ImageAsset, "origin">>;
  fonts?: Record<AssetId, FontAsset>;
};
```

Package rules:

- every package style ref used by public templates must define `default`;
- package validation fails if a referenced token, image asset, or font asset is
  missing;
- package assets are immutable package resources until detached into deck assets;
- package tokens are reusable values, not a cascade layer;
- color tokens are grouped by surface so `canvas.text`, `surface.text`, and
  `accent.text` are the foreground colors for the corresponding fills;
- package ids are stable and must not change when visible theme names change.

### Slide Root Style And Decorations

Theme decorations are generated render-layer nodes, not normal slide children.

```ts
type ThemeDecorationRecipe = {
  id: string;
  component: "shape" | "image" | "text";
  role: "themeDecoration";
  layout: LayoutBox;
  style: StyleObject;
  content?: TemplateStaticContent;
  visibility?: "subtle" | "default" | "expressive";
  chrome?: "default" | "minimal";
};
```

Decoration rules:

- generated decorations are inserted into `ResolvedSlideRenderTree.decorations`,
  not `SlideNode.children`;
- generated decorations are not selectable in normal editing mode;
- `SlideProps.decoration` filters recipes by visibility;
- `SlideProps.chrome` filters chrome recipes;
- detaching a decoration converts it to a normal locked or unlocked node with a
  deck-local id and `role: "themeDecoration"`;
- detached decorations stop following the theme package.

### CSS-Like Authoring DSL

The runtime source of truth is structured JSON. A CSS-like DSL may exist only as
a package-authoring input that compiles to `ThemePackageV1.styles`.

Allowed shape:

```css
style text.title/default {
  font-family: token(fonts.heading);
  font-size-pt: 44;
  font-weight: 720;
  line-height: 1.05;
  color: token(colors.canvas.text);
}

style surface.card/elevated {
  fill: token(colors.surface.fill);
  radius-pt: 14;
  shadow: 0 14 36 token(colors.surface.border) 0.28;
}
```

Forbidden in the DSL:

- arbitrary selectors;
- descendant or sibling selectors;
- cascade;
- specificity;
- media queries;
- layout placement properties;
- browser-only CSS properties that cannot export.

The DSL compiler should produce structured JSON plus diagnostics. Runtime code
must never parse the DSL while rendering a deck.

## Render Tree

Renderer and export share one resolved render tree.

```ts
type ResolvedDeckRenderTree = {
  canvas: CanvasSpec;
  theme: ResolvedTheme;
  slides: ResolvedSlideRenderTree[];
  diagnostics: PresentationDiagnostic[];
};

type ResolvedSlideRenderTree = {
  id: NodeId;
  background: ResolvedSlideBackground;
  decorations: ResolvedRenderNode[];
  nodes: ResolvedRenderNode[];
  notes?: string;
};

type ResolvedRenderNode = {
  id: NodeId;
  type: SlideChildNode["type"] | "group";
  role?: SemanticRole;
  layout: ResolvedLayoutBox;
  style: ResolvedStyleObject;
  content: ResolvedNodeContent;
  children?: ResolvedRenderNode[];
  source: "user" | "themeDecoration";
};

type ResolvedLayoutBox = LayoutBox & {
  framePx?: { x: number; y: number; w: number; h: number };
};
```

Render rules:

- the resolver removes hidden nodes from normal `nodes` output unless a debug
  mode explicitly requests them;
- decorations render behind user nodes unless their recipe explicitly marks
  chrome foreground;
- user nodes render by ascending `zIndex` with stable tree-order ties;
- groups preserve tree structure but do not create a new coordinate system;
- all token refs are resolved before reaching React or export builders;
- unresolved assets, style refs, or templates produce diagnostics before any UI
  tries to render them.

Canvas, present mode, public rendering, image export, and PPTX export should all
consume this tree. This avoids separate style/layout interpretations in each
surface.

## Editor Command Model

The editor mutates the v7 node tree directly through serializable commands.

Core commands:

- insert slide from semantic template;
- apply semantic template to slide;
- update slide controls;
- set theme package;
- update node content;
- update node layout;
- update node style binding;
- update local style override;
- reset local style override;
- detach theme decoration;
- group and ungroup nodes;
- reorder z-index;
- update asset metadata;
- delete unused assets.

Command rules:

- commands reference slides and nodes by stable ids;
- commands validate against the same schema helpers used by persisted parse;
- command handlers never write resolved styles into node `style` or `localStyle`;
- theme-generated decoration nodes appear only in a debug/layers mode unless
  detached;
- undo/redo records command-level patches, not rendered output.

## Export Model

Export does not rebuild v6. It converts the resolved render tree into a pure
operation list.

```ts
type ExportDeckSpec = {
  canvas: CanvasSpec;
  slides: ExportSlideSpec[];
  diagnostics: PresentationDiagnostic[];
};

type ExportSlideSpec = {
  id: NodeId;
  background: ExportBackgroundOperation;
  operations: ExportOperation[];
  notes?: string;
};

type ExportOperation =
  | ExportTextOperation
  | ExportShapeOperation
  | ExportImageOperation
  | ExportConnectorOperation
  | ExportVisualOperation;
```

Export rules:

- export operation builders are pure and DOM-free;
- browser/PPTX adapters only apply operations and perform file-generation side
  effects;
- table export compiles into deterministic shape and text operations unless a
  later native table adapter can prove equivalent fidelity;
- unsupported effects use deterministic fallbacks and emit diagnostics;
- operation order matches resolved render order exactly;
- adapters convert percent frames and point styles to their target units at the
  final boundary.

## Validation And Diagnostics

Validation runs at the boundaries listed above and returns structured,
testable diagnostics.

```ts
type PresentationDiagnostic = {
  code: PresentationDiagnosticCode;
  severity: "info" | "warning" | "error" | "fatal";
  path?: string;
  message: string;
  nodeId?: NodeId;
  slideId?: SlideId;
  action?: DiagnosticAction;
  details?: Record<string, JsonValue>;
};

type DiagnosticAction =
  | "reset-to-theme"
  | "choose-denser-layout"
  | "split-slide"
  | "open-asset-panel"
  | "repair-ai-plan"
  | "remove-override"
  | "replace-style-ref";
```

Minimum diagnostics:

| Code                               | Severity | Meaning                                                 |
| ---------------------------------- | -------- | ------------------------------------------------------- |
| `invalid-schema-version`           | fatal    | Persisted deck is not v7.                               |
| `unknown-field`                    | error    | Strict JSON contains an unsupported key.                |
| `duplicate-id`                     | error    | Node, asset, row, column, or layout id is duplicated.   |
| `unknown-template-kind`            | error    | A slide or AI plan references an unknown template kind. |
| `unknown-template-layout`          | error    | A slide references a layout id missing from template.   |
| `unknown-style-ref`                | error    | A binding references a style outside the registry.      |
| `missing-style-default`            | error    | Theme style ref has no `default` variant.               |
| `missing-style-variant`            | warning  | Requested variant is absent; `default` was used.        |
| `missing-token`                    | error    | Style object references an unknown token path.          |
| `invalid-node-layout`              | error    | Node layout frame is invalid for the canvas.            |
| `missing-node-layout`              | error    | A compiled child node has no layout.                    |
| `missing-asset`                    | error    | Node references an asset not in the deck registry.      |
| `invalid-asset-reference`          | error    | Asset id points to the wrong asset family.              |
| `invalid-text-runs`                | error    | Text runs do not concatenate to their owning text.      |
| `invalid-table-shape`              | error    | Table rows, columns, ids, or cell counts are invalid.   |
| `slot-over-capacity`               | warning  | Slot content exceeds template capacity.                 |
| `missing-required-slot`            | error    | Required slot has no repaired value.                    |
| `unsupported-template-control`     | warning  | Tone/density/emphasis was repaired.                     |
| `theme-decoration-export-fallback` | warning  | Decoration effect needed export fallback.               |
| `unsupported-export-feature`       | warning  | Export used a deterministic fallback.                   |
| `local-style-overrides`            | info     | Node has user overrides above theme style.              |

Diagnostics should remain stable enough for tests and UI grouping. User-facing
UI can map them to actions such as `Use denser layout`, `Split slide`,
`Open asset panel`, or `Reset to theme`.

## Cutover And Migration

Because the new schema does not preserve v6 shape, cutover should be explicit.

Recommended approach:

1. Build vNext schema, validation, renderer, and export behind a feature flag.
2. Generate new decks as `schemaVersion: 7` only.
3. Add a one-time v6-to-v7 migration utility for development data and any
   existing seeded/e2e fixtures that must survive.
4. After vNext editor/render/export pass acceptance, switch write paths to v7.
5. Remove v6 runtime readers from the active presentation path.
6. Keep any v6 migration utility out of normal runtime parsing.

Migration can be best-effort. If a v6 deck cannot be confidently mapped to
semantic templates, migrate it as explicit v7 nodes with concrete style bindings
and local styles. It does not need to become perfectly semantic.

## Implementation Phases

### Phase 1: Schema And Validation

- Add `presentation-vnext/types.ts` and `schema.ts`.
- Define `DeckV7`, node unions, layout model, assets, and diagnostics.
- Add parser tests for valid and invalid decks.
- Add fixture decks for cover, content, table, comparison, and visual slides.

Acceptance:

- `safeParseDeckV7` accepts only v7 shape.
- Invalid node ids, missing assets, bad frames, and unknown node types fail.
- No v6-shaped slide is accepted as a valid v7 deck.

### Phase 2: Style Registry And Theme Packages

- Add global `StyleRef` registry.
- Add structured style schema.
- Add theme package schema with required `default` variants.
- Add resolver for tokens, variants, and local overrides.
- Port one existing package into the new theme package shape.

Acceptance:

- Missing style defaults fail package validation.
- Missing variants warn and fall back to `default`.
- Local overrides resolve above theme styles.

### Phase 3: Render Tree And Canvas

- Add `resolveDeckRenderTree`.
- Build vNext `SlideCanvas` from resolved render nodes.
- Render slide root background, user nodes, groups, and decorations.
- Add visual regression fixtures for the first package.

Acceptance:

- Canvas renders v7 fixtures without v6 materialization.
- Theme decorations render outside normal selection.
- Theme switch updates styles without changing node layout frames.

### Phase 4: Semantic Templates And Compiler

- Add global semantic template registry.
- Add slot capacity validation.
- Compile `AiSlideSpec` and template layouts into `SlideNode` trees.
- Support the first template set: `cover`, `content`, `section`, `quote`,
  `metric-row`, `comparison`, `table`, and `recommendation`.

Acceptance:

- AI plans compile into valid `DeckV7` slides.
- Slot overflow repairs or reports deterministic diagnostics.
- AI never needs style refs or coordinates for normal generation.

### Phase 5: Editor Commands And Inspector

- Add vNext command handlers.
- Add selection, drag, resize, z-order, and content editing for vNext nodes.
- Add inspector panels for style binding, local overrides, and reset.
- Add root slide controls for tone, density, emphasis, chrome, and decoration.

Acceptance:

- User edits mutate v7 nodes directly.
- Local style overrides survive theme switching.
- Detached decorations become normal nodes.

### Phase 6: Export

- Build export operations from resolved render tree.
- Implement PPTX adapter for vNext operations.
- Reuse the same resolved styles as canvas.
- Add export preflight diagnostics for unsupported effects.

Acceptance:

- Export does not call v6 materialization.
- PPTX output matches canvas fixtures within accepted limits.
- Unsupported theme effects produce deterministic fallbacks.

### Phase 7: AI Generation Cutover

- Update deck generation prompts to emit `AiDeckPlan` only.
- Send template slot contracts and capacity to AI.
- Repair AI output before compilation.
- Generate `DeckV7` directly.

Acceptance:

- Generated decks use v7 schema.
- AI does not output raw element trees.
- Repair handles over-capacity slots.

### Phase 8: Runtime Cutover

- Switch presentation editor open path to v7 decks.
- Migrate fixtures and seed data.
- Remove v6 presentation runtime from active code paths.
- Keep any v6 migration utility out of normal runtime parsing.

Acceptance:

- New deck create, edit, present, public render, and export all use v7.
- Tests no longer require v6 deck shape for active presentation flows.
- Docs and schema references point to v7 as current behavior.

## Test Plan

Add focused tests for:

- v7 schema parsing and rejection of v6-shaped payloads;
- theme package validation;
- style resolver fallback and local override precedence;
- semantic template slot capacity;
- AI plan repair;
- template compiler output;
- render tree ordering and decoration layering;
- editor command mutations;
- export operation generation;
- migration utility, if historical data must be migrated.

Run broad presentation checks only after the focused vNext tests are passing.

## Final Architecture Rule

The refactor should keep this boundary intact:

```text
AI fills semantic slots.
Templates own layout and structure.
Themes own visual style.
Users own local overrides.
Renderer/export consume the resolved vNext tree.
```

Do not let these layers leak into each other. That boundary is what keeps the
model simple enough to implement and flexible enough to theme well.
