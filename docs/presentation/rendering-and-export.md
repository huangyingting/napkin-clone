# Presentation Rendering And Export

**Status:** Current  
**Last updated:** 2026-06-29

This document describes how authored decks render in the editor, present mode,
public viewers, and export pipeline. For the deck JSON shape, see
[../data-model/deck.md](../data-model/deck.md). For theme/layout resolution,
see [../editor/theme-layout.md](../editor/theme-layout.md).

## Source Files

| Area                     | Source                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Shared slide canvas      | [`src/components/presentation/slide-canvas.tsx`](../../src/components/presentation/slide-canvas.tsx)                   |
| Resolved render model    | [`src/lib/presentation/slide-render-model.ts`](../../src/lib/presentation/slide-render-model.ts)                       |
| In-app present mode      | [`src/components/presentation/present-mode.tsx`](../../src/components/presentation/present-mode.tsx)                   |
| Public present viewer    | [`src/components/presentation/public-present-viewer.tsx`](../../src/components/presentation/public-present-viewer.tsx) |
| Slide format geometry    | [`src/lib/presentation/slide-format.ts`](../../src/lib/presentation/slide-format.ts)                                   |
| Style cascade            | [`src/lib/presentation/style-cascade.ts`](../../src/lib/presentation/style-cascade.ts)                                 |
| Deck export specs        | [`src/lib/presentation/export/deck-export.ts`](../../src/lib/presentation/export/deck-export.ts)                       |
| Export preflight         | [`src/lib/visual/export-preflight.ts`](../../src/lib/visual/export-preflight.ts)                                       |
| PPTX native visual specs | [`src/lib/visual/pptx-shapes.ts`](../../src/lib/visual/pptx-shapes.ts)                                                 |
| PPTX applier             | [`src/lib/visual/pptx-apply.ts`](../../src/lib/visual/pptx-apply.ts)                                                   |

## Rendering Contract

`SlideCanvas` renders one slide from `resolveSlideRenderModel(deck, slide)`. It
is shared by:

- the editor stage;
- the thumbnail rail;
- in-app present mode;
- public present/share viewers.

The render model resolves canvas format/dimensions, background, accent, token
defaults, master background elements, slide elements, master foreground
elements, flat rendered element order, and concrete per-element design metadata
before React rendering.
Design token refs and partial overrides are resolved before reaching React or
export appliers; renderers do not receive unresolved color refs, theme ids, or
template blueprints.
Normal rendering order is:

```text
theme/master/slide background
  -> master background elements
  -> slide elements
  -> master foreground elements
```

Master elements are locked shared chrome and are not selectable in normal slide
editing mode.

Supported element rendering:

| Element     | Runtime behavior                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------- |
| `text`      | `content.paragraphs`, rich text runs, fit mode, alignment, rotation, opacity, and design overrides. |
| `visual`    | Looks up the referenced `Visual` in the provided visual map and renders through `VisualRenderer`.   |
| `image`     | Renders data URL, remote URL, or asset-resolved URL; empty image treatment depends on `editable`.   |
| `shape`     | Renders rect/ellipse/line/triangle with stroke, radius, label, shadow, opacity, and rotation.       |
| `connector` | Resolves free/bound endpoints and renders straight/elbow connector geometry.                        |
| `table`     | Renders a clipped grid with optional header, caption, alternating rows, borders, and cell runs.     |

Renderers do not synthesize elements from flat slide fields. A stored slide must
already carry current `elements[]`.

## Present Mode

`PresentMode` is a full-screen, portal-mounted surface for the authenticated app.
It renders the current slide through `SlideCanvas` and adds presentation chrome:

- keyboard navigation: arrows, space, page keys, home/end;
- click and touch navigation;
- fullscreen toggle;
- speaker notes;
- slide overview;
- timer;
- laser pointer;
- keyboard help;
- HUD auto-hide.

The present surface fits the active slide format into the available viewport via
`fitAspectRatio` and `slideAspectRatio`. It does not mutate the deck.

Public present/share viewers use the same rendering primitive so public output
tracks in-app rendering.

## Export Pipeline

The PPTX export path is split into a pure spec builder and a browser/PPTX
applier.

```text
Deck + Visual map
  -> buildDeckSpecs(deck, visuals)
  -> DeckSlideSpec[]
  -> exportDeckAsPPTX(...)
  -> PptxGenJS file Blob
```

`buildDeckSpecs` is DOM-free and unit tested. It consumes the same resolved
slide render model order as `SlideCanvas`, converts percentage element boxes
into physical slide units, and emits operations such as text, bullets, shape,
image, connector, native visual, and visual image retry.

Table export is deliberately compiled into deterministic shape and text
operations for the first version. Each table cell emits a shape fill/border op
and a text op; headers use the resolved header fill/text style, body rows use
resolved row/alternate fills, and captions emit as text below the grid inside
the table element box. Cell `runs` are passed through the same rich-text export
path used by text elements. Native PPTX table output is a future optimization,
not the current fidelity path.

`exportDeckAsPPTX` applies those descriptors with PptxGenJS. Visual elements use
`visualToNativeSpecs` when native PPTX output is available. Otherwise the applier
can request an SVG/PNG image for the visual and embed that image.

## Preflight

`runExportPreflight(deck, options)` inspects the current deck before export and
returns fatal errors plus fidelity warnings.

Current diagnostic categories:

| Code                       | Severity | Meaning                                                               |
| -------------------------- | -------- | --------------------------------------------------------------------- |
| `missing-asset`            | fatal    | An image element has no resolvable source.                            |
| `missing-font`             | warning  | A presentation theme/brand typography font is not embeddable in PPTX. |
| `font-cjk-mapping`         | warning  | Editable PPTX maps the self-hosted CJK font to an Office face.        |
| `unsupported-pptx-feature` | warning  | A used feature has partial or unsupported PPTX fidelity.              |
| `raster-fallback`          | warning  | An image feature will rasterize rather than remain vector/native.     |
| `remote-image-failure`     | warning  | A remote image may fail during export.                                |
| `oversized-deck`           | warning  | Slide count exceeds the configured recommendation.                    |

Callers decide whether to block export based on `hasFatal` / `canExport` and
surface warnings separately.

## Slide Fonts

Slide typography uses self-hosted fonts from the registry in
[`src/lib/presentation/slide-fonts.ts`](../../src/lib/presentation/slide-fonts.ts),
served from `public/fonts/slides/` and loaded via
[`src/app/slide-fonts.css`](../../src/app/slide-fonts.css). This keeps rendering
deterministic across platforms.

- Element font selection is a stable `fontId` (`TextElementStyle.fontId`); the
  cascade resolves it to a CSS stack via `slideFontCssStack`.
- Deck/theme typography stays as CSS stacks. Every resolved role token gets the
  self-hosted CJK fallback (`Noto Sans SC`) appended by `ensureCjkFallback` in
  the token resolver, so Simplified Chinese renders deterministically even for
  theme-default text.
- Editable PPTX export maps registry fonts to Office-compatible faces
  (`slideFontExportFace`), choosing the CJK face for primarily-Chinese text.
  Preflight emits a non-blocking `font-cjk-mapping` notice when the deck
  contains Chinese text.
- Rasterized exports (PDF, per-slide PNG) and present mode await
  `loadSlideFonts()` so output/first paint use the real fonts. The shrink-to-fit
  measurement re-runs once fonts are ready.

Current bundled registry entries are:

| `fontId`         | CSS family     | Editable PPTX mapping | CJK PPTX mapping |
| ---------------- | -------------- | --------------------- | ---------------- |
| `inter`          | Inter          | Aptos                 | Microsoft YaHei  |
| `source-sans-3`  | Source Sans 3  | Aptos                 | Microsoft YaHei  |
| `ibm-plex-sans`  | IBM Plex Sans  | Aptos                 | Microsoft YaHei  |
| `manrope`        | Manrope        | Aptos                 | Microsoft YaHei  |
| `space-grotesk`  | Space Grotesk  | Aptos Display         | Microsoft YaHei  |
| `source-serif-4` | Source Serif 4 | Georgia               | Microsoft YaHei  |
| `jetbrains-mono` | JetBrains Mono | Consolas              | Microsoft YaHei  |
| `noto-sans-sc`   | Noto Sans SC   | Microsoft YaHei       | Microsoft YaHei  |

Editable PPTX export remains native and editable. It maps TextIQ-hosted fonts
to Office-compatible faces and may differ slightly from TextIQ browser
rendering on machines without the same fonts.

## Slide Format And Geometry

Decks specify `canvas.format`. Rendering uses aspect ratio, while PPTX export
uses physical dimensions from `slideFormatConfig`.

Element boxes are stored as percentages of slide width/height. Export converts
those percentages into inches; text font sizes authored as slide-height percent
are converted into points.

## Visual Export Fidelity

Visual export has two tiers:

1. **Native PPTX specs**: supported visual kinds map to PPTX shapes via
   `visualToNativeSpecs` and `applySpecsToSlide`.
2. **Image retry**: unsupported or fidelity-sensitive cases can embed a rendered
   image produced from the visual SVG/PNG path.

Preflight warnings describe expected fidelity changes before the export starts.

## Invariants

1. `SlideCanvas` is the shared runtime renderer.
2. Render/export code consumes `resolveSlideRenderModel` inputs.
3. Export specs are pure and testable without DOM/PptxGenJS.
4. Browser/PPTX appliers consume specs and own file-generation side effects.
5. Preflight runs before export and reports stable diagnostic codes.
6. Present/public viewers do not mutate decks.

## Primary Tests

- [`src/lib/presentation/export/rendering-regression.test.ts`](../../src/lib/presentation/export/rendering-regression.test.ts)
- [`src/lib/presentation/export/deck-export.test.ts`](../../src/lib/presentation/export/deck-export.test.ts)
- [`src/lib/visual/export-preflight.test.ts`](../../src/lib/visual/export-preflight.test.ts)
- [`src/lib/visual/pptx-shapes.test.ts`](../../src/lib/visual/pptx-shapes.test.ts)
- [`src/lib/visual/export-fidelity.test.ts`](../../src/lib/visual/export-fidelity.test.ts)
- [`src/lib/presentation/stage-fit.test.ts`](../../src/lib/presentation/stage-fit.test.ts)
- [`e2e/slides-smoke.spec.ts`](../../e2e/slides-smoke.spec.ts)
- [`e2e/public-pages.spec.ts`](../../e2e/public-pages.spec.ts)
