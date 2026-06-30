# V7 Render And Export Support Matrix

**Status:** Current

**Last updated:** 2026-06-30

This matrix records current v7 behavior for render, present/public/embed,
prototype HTML, and PPTX export. Source, tests, and schemas remain
authoritative; this document is the written release support matrix for the E08
render/export parity gate.

## Legend

| Status                        | Meaning                                                                   |
| ----------------------------- | ------------------------------------------------------------------------- |
| Supported                     | Rendered/exported through the v7 render tree without known fidelity loss. |
| Fallback                      | Rendered/exported deterministically with documented fidelity reduction.   |
| Unsupported                   | Not exported/rendered by that surface.                                    |
| Diagnostic required / emitted | Fallback or unsupported behavior must produce a stable diagnostic.        |

## Consumption Surfaces

| Surface              | V7 boundary and render source                                 | Theme/assets behavior                                            |
| -------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| Editor stage         | `resolveDeckRenderTree` + `SlideCanvasVNext`.                 | Uses resolved theme package and protected asset resolver.        |
| In-app present       | `PresentModeVNext` uses `resolveDeckRenderTree`.              | Uses the same v7 deck/theme inputs as the editor.                |
| Public present/embed | `buildPublicPresentationModel` opens `deckJson` with v7 only. | Resolves the runtime package and preserves protected asset URLs. |
| Prototype HTML       | `renderPrototypeSlideHtml` resolves the product render tree.  | Reads validated v7 deck/package fixtures.                        |
| PPTX                 | `resolveDeckRenderTree` → `buildExportSpec` → PPTX adapter.   | Resolves deck image/file asset sources before PptxGenJS apply.   |

## Node, Style, And Chrome Support

| Category               | Product render / prototype HTML                                      | PPTX export behavior                                                                                           | Diagnostics                                           |
| ---------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Slide backgrounds      | Solid, gradient, pattern, and image fills render.                    | Solid supported; gradients/patterns use deterministic color fallback; image fill has no fill.                  | Yes for PPTX fallbacks.                               |
| Text                   | Paragraphs, runs, alignment, rotation, and local style.              | Text boxes/runs, font face, size, color, bold/italic/underline, alignment, rotation.                           | Missing tokens diagnose.                              |
| Images                 | Asset-resolved image render with fit/crop surface rules.             | URL/data/file source embeds as image with alt text and rotation.                                               | Missing assets diagnose before export.                |
| Visuals                | Asset-backed visuals render; unresolved visuals show placeholder.    | Rendered visual asset embeds as image; visual-id-only nodes use a labeled placeholder.                         | Placeholder and unsupported visual channels diagnose. |
| Shapes                 | Rect, ellipse/circle, line, triangle, diamond/path fallback styling. | Core shapes map to PptxGenJS shapes; unknown/path shapes fall back to rect.                                    | Unsupported fills/effects diagnose.                   |
| Connectors             | Straight, elbow, and curved SVG paths with dash/arrows.              | Straight and elbow connectors preserve endpoints, dash, stroke, and arrowheads; curved uses straight fallback. | Curved routing diagnoses.                             |
| Tables                 | Header/body rows, fills, alternate rows, borders, text.              | Native PPTX table operation with header/row fill and text style.                                               | Unsupported table fills diagnose.                     |
| Decorations/chrome     | Theme decorations render behind user nodes.                          | Decoration nodes export in render order; unsupported decoration styles diagnose as style fallbacks.            | Yes when fallback is lossy.                           |
| Effects                | Blur, glass, glow render in CSS where supported.                     | Effects are not native in PPTX and use deterministic style fallback.                                           | Yes.                                                  |
| Blend/clip/image masks | Product CSS behavior where implemented.                              | Not native in current PPTX adapter unless represented by image asset.                                          | Diagnostic required when user-visible.                |

## Representative Fixtures And Checks

- Prototype fixture decks live in `prototypes/slide-themes/decks/*.deck.json`
  with matching packages in `prototypes/slide-themes/packages/*.package.json`.
- `src/lib/presentation-vnext/render-export-parity.test.ts` builds a
  representative v7 deck with text, image, shape, connector, table, visual,
  notes, protected image sources, and a rendered visual snapshot. It compares
  editor/present/public render-tree signatures, verifies prototype HTML node
  output, and checks PPTX operation coverage.
- `src/lib/presentation-vnext/pptx-export-adapter.test.ts` covers PPTX
  diagnostics, visual fallbacks, and connector endpoint/dash/arrow fidelity.
- `src/lib/public-render/presentation.test.ts` verifies public v7 boundary,
  theme fallback diagnostics, and protected asset preservation.

## Release Gate

Parity failures either block release or become explicit diagnostics/fallbacks in
the matrix above. New v7 node kinds, styles, effects, or chrome layers must
update this document, fixtures, adapter behavior, and focused tests in the same
change.
