# Package-Template Deck Generation Implementation Plan

**Status:** Planned  
**Last updated:** 2026-06-29

This plan describes the next-generation document-to-slides pipeline: generate
slide content from a document, choose the best semantic template inside the
active theme package, materialize that package template into real slide
elements, and preview the result before applying it.

The plan intentionally keeps the user's selected theme package stable. It does
not auto-pick a different package based on the document. The AI chooses
templates within the current package.

## Goals

- Turn document structure into a package-themed deck that looks authored, not
  free-form generated.
- Use the active theme package when one is installed; fall back to `clarity`
  when no package can be resolved.
- Let AI choose semantic template kinds and slot content, while deterministic
  code owns layout, theme tokens, table limits, visual id validation, and schema
  repair.
- Expand v6 with one new first-class element kind: `table`.
- Keep package template metadata in the theme package catalog, not in persisted
  `Document.deckJson` beyond existing `customTemplates` and slide fields.
- Ship this as a new pipeline with the current AI deck generation path retained
  as fallback during rollout.

## Non-Goals

- Do not auto-switch the user's theme package based on document mood or domain.
- Do not let AI output free-form element coordinates for package-template
  generation.
- Do not persist AI selection reasons or package metadata into deck JSON.
- Do not add first-class `chart`, `diagram`, `cardGrid`, or architecture element
  kinds in the first version.
- Do not build spreadsheet-style canvas cell editing for tables in the first
  version.

## Existing Anchors

- `src/lib/ai/generate-deck.ts` owns the current free-form AI deck pipeline.
- `src/lib/ai/deck-prompt.ts` asks the model to return schema-v6 deck JSON.
- `src/lib/ai/run-deck-generation.ts` is the pure route orchestration seam.
- `src/app/api/generate-deck/parser.ts` parses `contentJson`, extracts blocks,
  visuals, outline, and current preferred built-in theme.
- `src/components/editor/use-slide-editor-open.ts` owns the AI open, preview,
  apply, and deterministic fallback flow.
- `src/lib/presentation/theme-packages.ts` builds runtime packages from package
  decks and applies tokens, masters, and custom templates.
- `prototypes/slide-themes/build-themes.ts` and
  `prototypes/slide-themes/themes.ts` generate validated package deck JSON.
- `src/lib/presentation/deck-elements.ts` and `deck-validation/*` define the v6
  element contract.
- `src/components/presentation/slide-canvas/elements-slide-layout.tsx` renders
  slide elements on canvas.
- `src/lib/presentation/export/*` builds export specs and applies them to PPTX
  or slide images.

## Confirmed Decisions

- Use the active package: `resolveThemePackageId(deck.design.themeId) ??
DEFAULT_THEME_PACKAGE_ID`.
- Generate slot-based slide plans, not free-form positioned elements.
- AI returns a semantic `templateKind`; backend maps it to
  `theme:<package-id>:<semantic-kind>`.
- Runtime template ids use semantic kind even when multiple semantic kinds reuse
  the same render family.
- Semantic kind taxonomy is intentionally broad; render families may be reused.
- Template metadata is generated from the same package authoring source as the
  rendering templates.
- Template metadata serves both AI selection and editor UI grouping.
- Applying a generated template means materializing package template elements
  and filling slots, not merely setting `Slide.templateId`.
- `selectionReason` is allowed in the temporary AI plan for debugging and
  telemetry, but is not persisted in the deck.
- First version adds only one v6 element kind: `table`.
- AI may output table slots, but backend enforces 2-4 columns, 2-6 rows, cell
  length limits, and notes overflow.
- MVP acceptance uses fixture documents across technical/product, business, and
  legal/evidence style inputs, plus multiple package variations.

## Resolved Table MVP Decisions

- `table` is a first-class v6 slide element, not a package-template-only alias
  or a text/shape workaround.
- Persisted v6 table schema supports a wider editor/import range: 1-8 columns
  and 1-20 rows. Package-template AI generation applies stricter slide-friendly
  limits: 2-4 columns and 2-6 rows.
- Schema validation rejects mismatched row cell counts, duplicate column ids,
  and duplicate row ids. AI generation, import, and paste boundaries may repair
  by padding, truncating, or assigning stable ids before `safeParseDeck`.
- `TableColumn.id` and `TableRow.id` are stable identity fields generated at
  creation time and preserved across label or cell text edits.
- First-version canvas behavior is whole-table selection, drag, resize,
  visibility, and layering. Cell-level canvas selection and spreadsheet-style
  editing are out of scope.
- The inspector supports whole-table editing: columns, rows, cell text, header
  flag, caption, border, fills, and text styles. It may add or remove rows and
  columns within persisted schema limits.
- Table styling is table-level only through `TableElementStyle`: header fill,
  row fill, alternate row fill, border color/width, text style, and header text
  style. Individual cell-level styling is out of scope beyond preserving
  `TableCell.runs`.
- Table defaults come from theme tokens and `role: "table"` style resolution;
  element `designOverrides.tableStyle` applies local overrides.
- `kind: "table"` is the required discriminator. `role: "table"` is optional
  semantic metadata for styling and accessibility.
- `content.caption` is the default table caption location and renders inside the
  table element. Templates may also bind a separate caption text element when a
  layout needs an external caption.
- `TableCell.runs` preserves existing `TextRun` formatting. Canvas and export
  should reuse existing rich-text support where practical, with plain-text
  fallback allowed for unsupported run attributes.
- Generation overflow is appended to the current slide notes. The first version
  does not automatically create appendix slides for truncated table content.
- Export first compiles tables into deterministic text/shape operations for
  fidelity with canvas rendering. Native PPTX table output remains a later
  optimization.
- Layer-list and accessibility names prefer caption, then a short column-label
  summary, then `Table`.
- Deck content hash and diff include table column labels, header flag, caption,
  cell text, and cell runs. Table fills, borders, and other presentation styles
  stay in style/presentation comparisons.
- Source extraction preserves already-structured table-like document blocks as
  table slot candidates when available, without adding a broader import parser
  expansion to the first table slice.
- First-class document table authoring is tracked separately in
  [../documents/table-support-plan.md](../documents/table-support-plan.md).
  Document tables feed package-template generation as structured candidates,
  not automatic one-table-one-slide output.
- `evidence` and `table` semantic template kinds may share the table render
  family. `evidence` is for proof, source-to-claim, legal, audit, and factual
  support slides; `table` is for general structured data.

## Target Pipeline

```text
User chooses Create slides
  -> capture document contentJson
  -> prepare deterministic baseline deck
  -> resolve active package id from baseline deck, fallback clarity
  -> send outline, visual inventory, package id, and template catalog to AI
  -> AI returns slot-based slide plan
  -> repair and validate slide plan
  -> apply/ensure theme package tokens, masters, and semantic templates
  -> materialize each slide from theme:<package>:<semantic-kind>
  -> fill slots into template elements and table elements
  -> validate final v6 deck with safeParseDeck
  -> show existing preview/diff
  -> user applies or falls back to deterministic derived deck
```

## Data Contracts

### Semantic Template Kind

The AI-facing semantic kind list should be stable and package-independent.
First version:

```ts
export const THEME_PACKAGE_TEMPLATE_KINDS = [
  "cover",
  "agenda",
  "context",
  "section",
  "executive-summary",
  "definition",
  "principle",
  "content",
  "key-takeaways",
  "quote",
  "big-stat",
  "metric-row",
  "data-insight",
  "evidence",
  "table",
  "problem-solution",
  "before-after",
  "comparison",
  "pros-cons",
  "tradeoff",
  "matrix",
  "framework",
  "process",
  "workflow",
  "timeline",
  "roadmap",
  "architecture",
  "case-study",
  "customer-story",
  "market-landscape",
  "competitive-landscape",
  "experiment",
  "results",
  "risks",
  "decision",
  "recommendation",
  "next-steps",
  "business-model",
  "pricing",
  "team",
  "visual-focus",
  "closing",
  "appendix",
] as const;
```

`two-column` remains a legacy package template alias accepted by resolver code,
but the new AI catalog should prefer semantic kinds such as `comparison`,
`pros-cons`, `tradeoff`, `before-after`, and `problem-solution`.

### Render Family

Render families are the smaller set of physical layout builders. Several
semantic kinds may reuse the same family.

```ts
export const THEME_PACKAGE_RENDER_FAMILIES = [
  "cover",
  "section-divider",
  "agenda",
  "summary-list",
  "title-bullets",
  "title-body",
  "text-visual-split",
  "visual-focus",
  "quote-hero",
  "stat-hero",
  "metric-row",
  "data-insight",
  "table",
  "two-column",
  "before-after",
  "problem-solution",
  "pros-cons",
  "cards-3",
  "cards-4",
  "matrix-2x2",
  "process-steps",
  "timeline",
  "roadmap",
  "framework-diagram",
  "architecture-diagram",
  "case-study",
  "risk-register",
  "recommendation",
  "next-steps",
  "team-grid",
  "pricing-cards",
  "closing",
  "appendix-detail",
] as const;
```

Recommended semantic-to-render mapping:

| Semantic kind           | Render family          |
| ----------------------- | ---------------------- |
| `cover`                 | `cover`                |
| `agenda`                | `agenda`               |
| `context`               | `title-body`           |
| `section`               | `section-divider`      |
| `executive-summary`     | `summary-list`         |
| `definition`            | `title-body`           |
| `principle`             | `title-bullets`        |
| `content`               | `title-bullets`        |
| `key-takeaways`         | `summary-list`         |
| `quote`                 | `quote-hero`           |
| `big-stat`              | `stat-hero`            |
| `metric-row`            | `metric-row`           |
| `data-insight`          | `data-insight`         |
| `evidence`              | `table`                |
| `table`                 | `table`                |
| `problem-solution`      | `problem-solution`     |
| `before-after`          | `before-after`         |
| `comparison`            | `two-column`           |
| `pros-cons`             | `pros-cons`            |
| `tradeoff`              | `two-column`           |
| `matrix`                | `matrix-2x2`           |
| `framework`             | `framework-diagram`    |
| `process`               | `process-steps`        |
| `workflow`              | `process-steps`        |
| `timeline`              | `timeline`             |
| `roadmap`               | `roadmap`              |
| `architecture`          | `architecture-diagram` |
| `case-study`            | `case-study`           |
| `customer-story`        | `case-study`           |
| `market-landscape`      | `cards-4`              |
| `competitive-landscape` | `matrix-2x2`           |
| `experiment`            | `data-insight`         |
| `results`               | `data-insight`         |
| `risks`                 | `risk-register`        |
| `decision`              | `recommendation`       |
| `recommendation`        | `recommendation`       |
| `next-steps`            | `next-steps`           |
| `business-model`        | `cards-4`              |
| `pricing`               | `pricing-cards`        |
| `team`                  | `team-grid`            |
| `visual-focus`          | `visual-focus`         |
| `closing`               | `closing`              |
| `appendix`              | `appendix-detail`      |

### Template Metadata

Metadata is generated with the package templates and exposed through the runtime
package catalog. It is not persisted as deck metadata.

```ts
export interface ThemePackageTemplateMetadata {
  kind: ThemePackageTemplateKind;
  label: string;
  group:
    | "opening"
    | "core"
    | "compare"
    | "proof"
    | "flow"
    | "decision"
    | "business"
    | "closing";
  priority: number;
  renderFamily: ThemePackageRenderFamily;
  bestFor: string;
  avoidFor?: string;
  signals: string[];
  accepts: TemplateSlotKey[];
  required?: TemplateSlotKey[];
  capacity: TemplateCapacity;
  bindings: TemplateSlotBinding[];
}
```

`priority` drives picker ordering inside a group. `signals`, `bestFor`, and
`avoidFor` drive the AI catalog. `accepts`, `required`, `capacity`, and
`bindings` drive materialization and repair.

### Slot Keys

Use one shared slot vocabulary across packages.

```ts
export type TemplateSlotKey =
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
```

Generated slide slots:

```ts
export interface GeneratedSlideSlots {
  kicker?: string;
  title: string;
  subtitle?: string;
  body?: string;
  bullets?: string[];
  leftTitle?: string;
  leftBody?: string;
  leftBullets?: string[];
  rightTitle?: string;
  rightBody?: string;
  rightBullets?: string[];
  cards?: Array<{ title: string; body?: string; bullets?: string[] }>;
  steps?: Array<{ title: string; body?: string }>;
  quote?: string;
  attribution?: string;
  stat?: string;
  statLabel?: string;
  metrics?: Array<{ label: string; value: string; note?: string }>;
  table?: GeneratedTableSlot;
  visualId?: string;
  imagePrompt?: string;
  caption?: string;
}
```

### AI Slide Plan

```ts
export interface GeneratedPackageDeckPlan {
  schemaVersion: 1;
  language: string;
  slides: GeneratedPackageSlidePlan[];
}

export interface GeneratedPackageSlidePlan {
  title: string;
  templateKind: ThemePackageTemplateKind;
  selectionReason?: string;
  slots: GeneratedSlideSlots;
  notes?: string;
}
```

`selectionReason` may be logged in a content-safe way or shown in preview in a
future explain UI. It must not be written into the final deck.

### Table Slot

AI may generate table slots. The backend owns normalization.

```ts
export interface GeneratedTableSlot {
  columns: string[];
  rows: string[][];
  caption?: string;
  emphasisColumn?: number;
}
```

Repair rules:

- Require 2-4 columns. Fewer than 2 columns downgrades to bullets. More than 4
  columns are truncated and overflow goes to notes.
- Require 2-6 rows. More than 6 rows are truncated and overflow goes to notes
  or an appendix slide.
- Pad or truncate row cells to match column count.
- Clamp cell text by character budget. Preserve full overflow in notes when
  possible.
- Reject or downgrade empty tables.
- Validate all output through `safeParseDeck`.

### V6 Table Element

Add one first-class slide element kind.

```ts
export interface TableElement extends BaseElement {
  kind: "table";
  role?: "table";
  content: TableElementContent;
}

export interface TableElementContent {
  kind: "table";
  columns: TableColumn[];
  rows: TableRow[];
  header?: boolean;
  caption?: string;
}

export interface TableColumn {
  id: string;
  label: string;
  width?: number;
}

export interface TableRow {
  id: string;
  cells: TableCell[];
}

export interface TableCell {
  text: string;
  runs?: TextRun[];
}
```

Extend design overrides with a table-specific style block:

```ts
export interface TableElementStyle {
  headerFill?: { token: string } | { value: string };
  rowFill?: { token: string } | { value: string };
  alternateRowFill?: { token: string } | { value: string };
  borderColor?: string;
  borderWidth?: number;
  textStyle?: Partial<TextElementStyle>;
  headerTextStyle?: Partial<TextElementStyle>;
}
```

First-version editor behavior is whole-element selection, drag, resize, layer
list visibility, and inspector editing of table content/style. Cell-level canvas
selection and spreadsheet editing are out of scope.

## Implementation Phases

### Phase 1: V6 Table Element

Files and work items:

- `src/lib/presentation/deck-elements.ts`
  - Add `TableElement`, content types, cell types, and `TableElementStyle`.
  - Add `TableElement` to `SlideElement`.
  - Extend `ElementDesignOverrides` with `tableStyle`.
- `src/lib/presentation/deck-validation/*`
  - Validate `kind: "table"` elements.
  - Validate 1-8 columns and 1-20 rows at persisted schema level; generation
    repair applies stricter 2-4 by 2-6 slide-friendly limits.
  - Validate unique column ids and row ids inside each table.
  - Validate cell count matches columns or normalize at generation boundaries.
- `src/lib/presentation/slide-render-model.ts`
  - Resolve table style from theme tokens plus overrides.
  - Preserve existing read-only render model behavior.
- `src/components/presentation/slide-canvas/*`
  - Add `TableElementView` and branch in `ElementsSlideLayout`.
  - Use CSS grid/table layout inside the element box.
  - Support theme colors, alternating rows, header styling, overflow clipping,
    and optional caption.
- `src/components/presentation/layer-list.tsx`
  - Add table icon and accessible label.
- `src/components/presentation/slide-editor/slide-editor-view-model.ts`
  - Add display name derivation for table elements.
- `src/components/presentation/slide-inspector/*`
  - Add a minimal table inspector panel: columns, rows, cell text, header flag,
    caption, border, fills, and text style.
  - Keep whole-element editing only.
- `src/lib/presentation/export/*`
  - Add a table export spec path.
  - Prefer native PPTX table output if the applier supports it cleanly.
  - Otherwise compile the table element into deterministic text/shape ops for
    export fidelity while keeping v6 deck data first-class.
- `src/lib/presentation/deck-hash.ts`, `deck-diff.ts`, and helpers
  - Include table text in content hashes and deck edit distance where relevant.
- Tests
  - Add schema tests for valid/invalid table elements.
  - Add render-model tests for table style resolution.
  - Add export spec tests for table output.
  - Add editor view-model/layer tests for table labels.
- Docs
  - Update `docs/data-model/deck.md` with the table element contract.
  - Update `docs/presentation/rendering-and-export.md` with table rendering and
    export behavior.

Cheap validation after this phase:

```bash
npm run test:subsystem -- presentation
npm run typecheck
```

### Phase 2: Template Taxonomy and Metadata Contracts

Files and work items:

- Add `src/lib/presentation/theme-template-taxonomy.ts`.
  - Export semantic kinds, render families, groups, slot keys, metadata types,
    and semantic-to-render mapping.
  - Include a resolver for legacy aliases such as `two-column`.
- Update `src/lib/presentation/theme-packages.ts`.
  - Replace six-kind `THEME_PACKAGE_TEMPLATE_KINDS` with the canonical semantic
    kind list.
  - Add metadata to `PresentationThemePackage` as catalog-only data.
  - Add helpers:
    - `getThemePackageTemplateMetadata(packageId, kind)`
    - `themePackageTemplateCatalogForAi(packageId)`
    - `themePackageTemplateGroupsForUi(packageId)`
    - `resolveThemePackageTemplateId(packageId, kind)`
- Update `docs/presentation/theme-packages.md`.
  - Document semantic template ids, metadata, UI grouping, and legacy aliasing.

Tests:

- Every package exposes every semantic kind.
- Every semantic kind resolves to a known render family.
- Every metadata entry has label, group, priority, bestFor, accepts, capacity,
  and bindings.
- Legacy `theme:<package>:two-column` remains accepted where existing decks may
  reference it.

### Phase 3: Theme Package Generation Script

Files and work items:

- Update `prototypes/slide-themes/theme-kit.ts`.
  - Add source-level template specs that combine semantic kind, render family,
    metadata, and slide element builder.
  - Add slot binding helpers so content materialization does not rely only on
    fragile element order.
  - Add table element builder once Phase 1 lands.
- Update `prototypes/slide-themes/themes.ts`.
  - Generate one semantic template per kind for each package.
  - Reuse render family builders where appropriate.
  - Keep package-specific visual language in each render family implementation.
- Update `prototypes/slide-themes/build-themes.ts`.
  - Validate generated deck JSON.
  - Validate generated metadata coverage.
  - Emit package deck JSON and a manifest containing metadata summaries.
- Migrate `clarity` and `ocean` into the same source-generation path or add
  equivalent source specs so all packages share one taxonomy and metadata
  contract.
- Copy/regenerate package deck JSON under
  `src/lib/presentation/theme-package-decks/`.

Tests:

- Script output validates through `safeParseDeck`.
- Every generated package has the full semantic template set.
- Every generated semantic template id has the form
  `theme:<package-id>:<semantic-kind>`.
- Metadata and generated `customTemplates` stay in sync.

### Phase 4: Slot-Based AI Plan Pipeline

Files and work items:

- Add `src/lib/ai/package-template-deck-prompt.ts`.
  - Prompt the model to return `GeneratedPackageDeckPlan` JSON only.
  - Include compact AI catalog entries derived from package metadata.
  - Include visual inventory and hard visual id rules.
  - Instruct same-language output.
  - Instruct first slide should usually be `cover`, last should usually be
    `closing` or `next-steps`.
- Add `src/lib/ai/package-template-deck-plan.ts`.
  - Parse, repair, and validate model output.
  - Clamp slide count by existing generated deck limits.
  - Normalize template kinds and fallback invalid kinds to `content` or the
    nearest metadata-compatible kind.
  - Validate visual ids against inventory.
  - Normalize table slots with strict generation limits.
  - Move overflow content to notes.
- Add `src/lib/presentation/package-template-materializer.ts`.
  - Ensure package tokens, masters, and semantic templates are installed via
    `applyThemePackage`.
  - Materialize `theme:<package>:<semantic-kind>` into a slide.
  - Fill slots into elements using metadata bindings.
  - Build first-class table elements for table slots.
  - Remove or hide unfilled optional media placeholders.
  - Stamp slide `templateId` with the semantic package template id.
- Add `src/lib/ai/run-package-template-deck-generation.ts`.
  - Orchestrate source extraction, prompt call, plan repair, materialization,
    and final `safeParseDeck`.

Tests:

- Plan parser rejects non-object, missing slides, invalid kinds, invalid slots,
  and invented visual ids.
- Plan repair clamps table columns/rows and moves overflow into notes.
- Materializer creates schema-valid decks for representative slot plans.
- Materialized slides use package template ids and package master ids.
- Generated slides preserve package visual language across `clarity`, `noir`,
  and `terra`.

### Phase 5: Route, Client Flow, Flags, and Fallback

Files and work items:

- Add server config flag:

```text
AI_DECK_GEN_PACKAGE_TEMPLATES_ENABLED
```

- Extend the generate-deck request body:

```ts
{
  contentJson: unknown;
  options?: DeckGenerationOptions;
  themePackageId?: ThemePackageId;
  generationMode?: "legacy" | "package-template";
}
```

- Update `src/app/api/generate-deck/parser.ts`.
  - Validate `themePackageId` against `isThemePackageId`.
  - Default to `clarity` only for package-template mode when absent.
  - Keep legacy behavior unchanged.
- Update `src/app/api/generate-deck/route.ts`.
  - If package-template mode and flag are enabled, run the new pipeline.
  - On package-template failure, run legacy pipeline when fallback is enabled.
  - Log content-safe telemetry: package id, selected kind counts, fallback
    reason, table slide count, schema valid, and latency.
- Update `src/lib/ai/deck-generation-request.ts`.
  - Add optional package-template request fields and response metadata.
- Update `src/components/editor/use-slide-editor-open.ts` and the open dialog
  flow.
  - Resolve baseline deck before calling package-template generation so the
    client can send the active package id.
  - Keep current preview/diff apply path.
  - If generation returns fallback legacy deck, preview still works.

Important client sequencing change:

```text
Current flow:
  choose generate -> request AI -> prepare baseline -> preview

Package-template flow:
  choose generate -> prepare baseline -> resolve active package -> request AI
  -> preview
```

Tests:

- Request parser accepts valid package ids and rejects invalid ones.
- Route uses new pipeline only when the new flag is enabled.
- Route falls back to legacy generation on repair/materialization failure.
- Client sends the active package id derived from the baseline deck.

### Phase 6: Editor Template Picker Integration

Files and work items:

- Update Add slide/template picker surfaces to consume metadata groups.
- Do not flat-list all templates by default.
- Group templates by metadata group:
  - Opening
  - Core
  - Compare
  - Proof
  - Flow
  - Decision
  - Business
  - Closing
- Sort by `priority` within each group.
- Add search/filter if the picker becomes crowded.
- Preserve existing custom template group and legacy built-in fallback behavior.

Tests:

- Package templates are grouped by metadata.
- Custom templates remain separate.
- Legacy built-in templates remain available for decks without package
  templates.

### Phase 7: MVP Fixture Acceptance

Add deterministic tests with stubbed model output and a smaller number of
integration-style prompt fixtures.

Fixture classes:

1. Technical/product explanation
   - Expected kinds: `cover`, `context`, `architecture`, `workflow` or
     `process`, `comparison` or `tradeoff`, `next-steps`.
2. Business/strategy report
   - Expected kinds: `executive-summary`, `market-landscape`, `data-insight` or
     `table`, `risks`, `recommendation`, `roadmap`.
3. Legal/evidence/long-form analysis
   - Expected kinds: `context`, `timeline`, `evidence` or `table`, `risks`,
     `decision` or `recommendation`, `appendix`.

Assertions:

- Slide count stays within requested range.
- First slide is `cover`.
- Last slide is `closing` or `next-steps`.
- No invalid template kind survives repair.
- Every generated deck has active package tokens, masters, and templates.
- Every materialized slide uses `theme:<package>:<semantic-kind>`.
- Table slides obey generation limits.
- All visual ids come from inventory.
- `safeParseDeck` succeeds.
- Same fixture generated with `clarity`, `noir`, and `terra` preserves similar
  content structure while adopting each package's visual language.

## Rollout Plan

1. Land `table` element support behind normal schema tests. Existing decks stay
   valid.
2. Land taxonomy and metadata without changing AI generation behavior.
3. Regenerate packages with semantic template ids and grouped metadata.
4. Add materializer and deterministic unit tests.
5. Add package-template AI pipeline behind
   `AI_DECK_GEN_PACKAGE_TEMPLATES_ENABLED`.
6. Enable internally with automatic legacy fallback.
7. Compare telemetry and fixture outcomes against legacy generation.
8. Make package-template generation the default once preview quality and
   fallback rate meet acceptance thresholds.

## Risks and Mitigations

| Risk                                          | Mitigation                                                           |
| --------------------------------------------- | -------------------------------------------------------------------- |
| Scope creep from table schema expansion       | Add only `table`; defer chart/diagram/cardGrid.                      |
| AI chooses plausible but poor template kinds  | Keep metadata concise, repair invalid choices, add fixture coverage. |
| Too many templates crowd the editor UI        | Group by metadata and sort by priority.                              |
| Package templates become huge                 | Reuse render family builders; allow semantic ids to share layout.    |
| Export fidelity differs from canvas rendering | Add export spec tests and screenshot/PPTX checks for table slides.   |
| Current active package unavailable to route   | Resolve package on client after baseline preparation and send id.    |
| Legacy decks reference `two-column`           | Keep alias resolution and migration-free support.                    |
| Prompt output leaks full reasoning into deck  | Keep `selectionReason` transient and strip before persistence.       |

## Suggested First PR Slices

1. Table element data model, validation, canvas rendering, and export spec.
2. Template taxonomy and metadata types with catalog tests.
3. Theme generation script update for semantic templates and metadata.
4. Package template materializer with deterministic slot fixtures.
5. Package-template AI prompt, plan repair, route flag, and fallback.
6. Editor picker grouping and package-template generation UX integration.
7. Fixture acceptance suite and docs updates.
