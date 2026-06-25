# Presentation Rendering And Export

**Status:** Current  
**Last updated:** 2026-06-25

This document describes how authored decks render in the editor, present mode,
public viewers, and export pipeline. For the deck JSON shape, see
[../data-model/deck.md](../data-model/deck.md). For theme/layout resolution,
see [../editor/theme-layout.md](../editor/theme-layout.md).

## Source Files

| Area                     | Source                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Shared slide canvas      | [`src/components/presentation/slide-canvas.tsx`](../../../src/components/presentation/slide-canvas.tsx)                   |
| In-app present mode      | [`src/components/presentation/present-mode.tsx`](../../../src/components/presentation/present-mode.tsx)                   |
| Public present viewer    | [`src/components/presentation/public-present-viewer.tsx`](../../../src/components/presentation/public-present-viewer.tsx) |
| Slide format geometry    | [`src/lib/presentation/slide-format.ts`](../../../src/lib/presentation/slide-format.ts)                                   |
| Style cascade            | [`src/lib/presentation/style-cascade.ts`](../../../src/lib/presentation/style-cascade.ts)                                 |
| Deck export specs        | [`src/lib/visual/deck-export.ts`](../../../src/lib/visual/deck-export.ts)                                                 |
| Export preflight         | [`src/lib/visual/export-preflight.ts`](../../../src/lib/visual/export-preflight.ts)                                       |
| PPTX native visual specs | [`src/lib/visual/pptx-shapes.ts`](../../../src/lib/visual/pptx-shapes.ts)                                                 |
| PPTX applier             | [`src/lib/visual/pptx-apply.ts`](../../../src/lib/visual/pptx-apply.ts)                                                   |

## Rendering Contract

`SlideCanvas` renders one slide from `slide.elements[]`. It is shared by:

- the editor stage;
- the thumbnail rail;
- in-app present mode;
- public present/share viewers.

The canvas resolves its flat renderer colors with
`resolveSlideThemeColors(deck, slide)` and non-text defaults with
`resolveSlideTokenSet(deck, slide)`. When deck context is available, master
slides and custom token sets participate in the cascade; isolated previews fall
back through the same built-in token sets.

Supported element rendering:

| Element       | Runtime behavior                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------- |
| `text`        | Rich text runs, fit mode, alignment, rotation, opacity, and style overrides.                      |
| `bullets`     | `items[]` is authoritative; nested indentation and run details are rendered when present.         |
| `visual`      | Looks up the referenced `Visual` in the provided visual map and renders through `VisualRenderer`. |
| `image`       | Renders data URL, remote URL, or asset-resolved URL; empty image treatment depends on `editable`. |
| `shape`       | Renders rect/ellipse/line/triangle with stroke, radius, label, shadow, opacity, and rotation.     |
| `connector`   | Resolves free/bound endpoints and renders straight/elbow connector geometry.                      |
| `placeholder` | Renders placeholder content/labels according to the resolved style.                               |

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

`buildDeckSpecs` is DOM-free and unit tested. It walks `deck.slides`, converts
percentage element boxes into physical slide units, and emits operations such as
text, bullets, shape, image, connector, native visual, and visual image retry.

`exportDeckAsPPTX` applies those descriptors with PptxGenJS. Visual elements use
`visualToNativeSpecs` when native PPTX output is available. Otherwise the applier
can request an SVG/PNG image for the visual and embed that image.

## Preflight

`runExportPreflight(deck, options)` inspects the current deck before export and
returns fatal errors plus fidelity warnings.

Current diagnostic categories:

| Code                       | Severity | Meaning                                                           |
| -------------------------- | -------- | ----------------------------------------------------------------- |
| `missing-asset`            | fatal    | An image element has no resolvable source.                        |
| `missing-font`             | warning  | PPTX cannot embed a custom font used by text/bullets.             |
| `unsupported-pptx-feature` | warning  | A used feature has partial or unsupported PPTX fidelity.          |
| `raster-fallback`          | warning  | An image feature will rasterize rather than remain vector/native. |
| `remote-image-failure`     | warning  | A remote image may fail during export.                            |
| `oversized-deck`           | warning  | Slide count exceeds the configured recommendation.                |

Callers decide whether to block export based on `hasFatal` / `canExport` and
surface warnings separately.

## Slide Format And Geometry

Decks can specify a slide format. Rendering uses aspect ratio, while PPTX export
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
2. Render/export code reads `Slide.elements[]` directly.
3. Export specs are pure and testable without DOM/PptxGenJS.
4. Browser/PPTX appliers consume specs and own file-generation side effects.
5. Preflight runs before export and reports stable diagnostic codes.
6. Present/public viewers do not mutate decks.

## Primary Tests

- [`src/lib/presentation/rendering-regression.test.ts`](../../../src/lib/presentation/rendering-regression.test.ts)
- [`src/lib/visual/deck-export.test.ts`](../../../src/lib/visual/deck-export.test.ts)
- [`src/lib/visual/export-preflight.test.ts`](../../../src/lib/visual/export-preflight.test.ts)
- [`src/lib/visual/pptx-shapes.test.ts`](../../../src/lib/visual/pptx-shapes.test.ts)
- [`src/lib/visual/export-fidelity.test.ts`](../../../src/lib/visual/export-fidelity.test.ts)
- [`src/lib/presentation/stage-fit.test.ts`](../../../src/lib/presentation/stage-fit.test.ts)
- [`e2e/slides-smoke.spec.ts`](../../../e2e/slides-smoke.spec.ts)
- [`e2e/public-pages.spec.ts`](../../../e2e/public-pages.spec.ts)
