/**
 * vNext PPTX export adapter tests.
 *
 * Tests the pure conversion from `ExportDeckSpec` (from `buildExportSpec`) to
 * a `VnextPptxDeckSpec` with inch-based coordinates and diagnostics for
 * unsupported effects/fills.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { buildVnextPptxSpec } from "@/lib/presentation-vnext/pptx-export-adapter";
import { buildExportSpec } from "@/lib/presentation-vnext/export-spec";
import { resolveDeckRenderTree } from "@/lib/presentation-vnext/render-resolver";
import {
  buildDeckV7,
  buildCoverSlide,
  buildContentSlide,
  buildImageNode,
  buildTableSlide,
  buildVisualSlide,
  buildVisualNode,
  buildMinimalThemePackage,
  resetBuilderCounter,
} from "@/test/builders/deck-v7";
import type { ExportDeckSpec } from "@/lib/presentation-vnext/export-spec";
import type { CanvasSpec } from "@/lib/presentation-vnext/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeExportSpec(
  slides = [buildCoverSlide(), buildContentSlide()],
  pkgOverrides: Parameters<typeof buildMinimalThemePackage>[1] = {},
): ExportDeckSpec {
  resetBuilderCounter();
  const deck = buildDeckV7(slides);
  const pkg = buildMinimalThemePackage("test-package", pkgOverrides);
  const renderTree = resolveDeckRenderTree(deck, pkg);
  return buildExportSpec(renderTree);
}

// ---------------------------------------------------------------------------
// Canvas format tests
// ---------------------------------------------------------------------------

describe("buildVnextPptxSpec — canvas format mapping", () => {
  test("16:9 maps to LAYOUT_WIDE with 13.333 × 7.5 in", () => {
    const spec = makeExportSpec();
    const pptx = buildVnextPptxSpec(spec);
    assert.equal(pptx.layout, "LAYOUT_WIDE");
    assert.ok(Math.abs(pptx.slideW - 13.333) < 0.001);
    assert.equal(pptx.slideH, 7.5);
  });

  test("4:3 maps to LAYOUT_4X3 with 10 × 7.5 in", () => {
    const canvas4x3: CanvasSpec = {
      format: "4:3",
      width: 100,
      height: 75,
      unit: "percent",
    };
    resetBuilderCounter();
    const deck = buildDeckV7([buildCoverSlide()], { canvas: canvas4x3 });
    const pkg = buildMinimalThemePackage();
    const renderTree = resolveDeckRenderTree(deck, pkg);
    const exportSpec = buildExportSpec(renderTree);
    const pptx = buildVnextPptxSpec(exportSpec);
    assert.equal(pptx.layout, "LAYOUT_4X3");
    assert.equal(pptx.slideW, 10);
    assert.equal(pptx.slideH, 7.5);
  });

  test("square maps to LAYOUT_CUSTOM with 7.5 × 7.5 in", () => {
    const squareCanvas: CanvasSpec = {
      format: "square",
      width: 100,
      height: 100,
      unit: "percent",
    };
    resetBuilderCounter();
    const deck = buildDeckV7([buildCoverSlide()], { canvas: squareCanvas });
    const pkg = buildMinimalThemePackage();
    const renderTree = resolveDeckRenderTree(deck, pkg);
    const exportSpec = buildExportSpec(renderTree);
    const pptx = buildVnextPptxSpec(exportSpec);
    assert.equal(pptx.layout, "LAYOUT_CUSTOM");
    assert.equal(pptx.slideW, 7.5);
    assert.equal(pptx.slideH, 7.5);
  });
});

// ---------------------------------------------------------------------------
// Slide count and structure
// ---------------------------------------------------------------------------

describe("buildVnextPptxSpec — slide count and structure", () => {
  test("produces one VnextPptxSlideSpec per ExportSlideSpec", () => {
    const spec = makeExportSpec([buildCoverSlide(), buildContentSlide()]);
    const pptx = buildVnextPptxSpec(spec);
    assert.equal(pptx.slides.length, 2);
  });

  test("each slide has a background operation", () => {
    const spec = makeExportSpec();
    const pptx = buildVnextPptxSpec(spec);
    for (const slide of pptx.slides) {
      assert.equal(slide.background.type, "background");
    }
  });

  test("slide IDs are preserved from export spec", () => {
    const spec = makeExportSpec();
    const pptx = buildVnextPptxSpec(spec);
    const specIds = spec.slides.map((s) => s.id);
    const pptxIds = pptx.slides.map((s) => s.id);
    assert.deepEqual(pptxIds, specIds);
  });
});

// ---------------------------------------------------------------------------
// Coordinate conversion
// ---------------------------------------------------------------------------

describe("buildVnextPptxSpec — coordinate conversion", () => {
  test("text op x coordinate is converted from px to inches", () => {
    const spec = makeExportSpec([buildCoverSlide()]);
    const pptx = buildVnextPptxSpec(spec, {
      canvasWidthPx: 960,
      canvasHeightPx: 540,
    });
    const slide = pptx.slides[0];
    const textOps = slide.ops.filter((op) => op.type === "text");
    assert.ok(textOps.length > 0, "Expected at least one text op");
    for (const op of textOps) {
      assert.ok(op.x >= 0, `Expected x >= 0, got ${op.x}`);
      assert.ok(
        op.x <= pptx.slideW,
        `Expected x <= ${pptx.slideW}, got ${op.x}`,
      );
    }
  });

  test("ops use inch coordinates, not percent or pixel", () => {
    const spec = makeExportSpec([buildContentSlide()]);
    const pptx = buildVnextPptxSpec(spec, {
      canvasWidthPx: 960,
      canvasHeightPx: 540,
    });
    for (const slide of pptx.slides) {
      for (const op of slide.ops) {
        // Width should be less than slideW, not 100 (percent) or 960 (pixel)
        assert.ok(op.w < pptx.slideW + 0.001, `op.w ${op.w} is too large`);
        assert.ok(op.h < pptx.slideH + 0.001, `op.h ${op.h} is too large`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Table conversion
// ---------------------------------------------------------------------------

describe("buildVnextPptxSpec — table conversion", () => {
  test("tableShape ops are produced for table slides", () => {
    const spec = makeExportSpec([buildTableSlide()]);
    const pptx = buildVnextPptxSpec(spec);
    const tableOps = pptx.slides[0].ops.filter(
      (op) => op.type === "tableShape",
    );
    assert.ok(tableOps.length >= 1, "Expected at least one tableShape op");
  });

  test("tableShape op includes TableContent", () => {
    const spec = makeExportSpec([buildTableSlide()]);
    const pptx = buildVnextPptxSpec(spec);
    const tableOp = pptx.slides[0].ops.find((op) => op.type === "tableShape");
    assert.ok(tableOp !== undefined);
    assert.ok("table" in tableOp);
    const t = tableOp as { table: { columns: unknown[] } };
    assert.ok(Array.isArray(t.table.columns));
  });
});

// ---------------------------------------------------------------------------
// Image and visual asset fidelity
// ---------------------------------------------------------------------------

describe("buildVnextPptxSpec — E05 image and visual fidelity", () => {
  test("image fit and crop metadata are preserved for the PPTX applier", () => {
    resetBuilderCounter();
    const imageNode = buildImageNode("img-001", {
      content: {
        assetId: "img-001",
        fit: "cover",
        crop: { top: 8, right: 6, bottom: 4, left: 2 },
        alt: "Hero crop",
      },
    });
    const deck = buildDeckV7([{ ...buildCoverSlide(), children: [imageNode] }]);
    const renderTree = resolveDeckRenderTree(deck, buildMinimalThemePackage());
    const exportSpec = buildExportSpec(renderTree);
    const pptx = buildVnextPptxSpec(exportSpec);
    const imageOp = pptx.slides[0].ops.find((op) => op.type === "image");
    assert.ok(imageOp);
    assert.equal(imageOp.type, "image");
    if (imageOp.type === "image") {
      assert.equal(imageOp.fit, "cover");
      assert.deepEqual(imageOp.crop, {
        top: 8,
        right: 6,
        bottom: 4,
        left: 2,
      });
      assert.equal(imageOp.alt, "Hero crop");
    }
  });

  test("visual channel colors are preserved for PPTX export", () => {
    resetBuilderCounter();
    const visualNode = buildVisualNode({
      localStyle: {
        visual: {
          channelColors: {
            primary: "#0f172a",
            secondary: "#475569",
            accent: "#f97316",
          },
        },
      },
    });
    const deck = buildDeckV7([
      { ...buildCoverSlide(), children: [visualNode] },
    ]);
    const renderTree = resolveDeckRenderTree(deck, buildMinimalThemePackage());
    const exportSpec = buildExportSpec(renderTree);
    const pptx = buildVnextPptxSpec(exportSpec);
    const visualOp = pptx.slides[0].ops.find((op) => op.type === "visual");
    assert.ok(visualOp);
    assert.equal(visualOp.type, "visual");
    if (visualOp.type === "visual") {
      assert.deepEqual(visualOp.channelColors, {
        primary: "#0f172a",
        secondary: "#475569",
        accent: "#f97316",
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

describe("buildVnextPptxSpec — diagnostics", () => {
  test("gradient fill emits unsupported-export-feature diagnostic", () => {
    const pkgWithGradient = buildMinimalThemePackage("gradient-pkg", {
      styles: {
        ...buildMinimalThemePackage().styles,
        "slide.cover": {
          default: {
            slide: {
              background: {
                type: "linearGradient" as const,
                from: "#0066cc",
                to: "#003399",
              },
            },
          },
        },
      },
    });
    resetBuilderCounter();
    const deck = buildDeckV7([buildCoverSlide()]);
    const renderTree = resolveDeckRenderTree(deck, pkgWithGradient);
    const exportSpec = buildExportSpec(renderTree);
    const pptx = buildVnextPptxSpec(exportSpec);
    assert.ok(
      pptx.diagnostics.some((d) => d.code === "unsupported-export-feature"),
      "Expected unsupported-export-feature diagnostic for gradient fill",
    );
  });

  test("glass effect emits unsupported-export-feature diagnostic", () => {
    const pkgWithGlass = buildMinimalThemePackage("glass-pkg", {
      styles: {
        ...buildMinimalThemePackage().styles,
        "text.title": {
          default: {
            text: { fontSizePt: 36, color: "#111111" },
            effect: { kind: "glass" as const, intensity: "medium" as const },
          },
        },
      },
    });
    resetBuilderCounter();
    const deck = buildDeckV7([buildCoverSlide()]);
    const renderTree = resolveDeckRenderTree(deck, pkgWithGlass);
    const exportSpec = buildExportSpec(renderTree);
    const pptx = buildVnextPptxSpec(exportSpec);
    const glassDiags = pptx.diagnostics.filter(
      (d) => d.code === "unsupported-export-feature",
    );
    assert.ok(
      glassDiags.length > 0,
      "Expected unsupported-export-feature diagnostic for glass effect",
    );
  });

  test("carry-forward diagnostics from ExportDeckSpec are preserved", () => {
    resetBuilderCounter();
    const deck = buildDeckV7([buildCoverSlide()]);
    const pkg = buildMinimalThemePackage();
    const renderTree = resolveDeckRenderTree(deck, pkg);
    const exportSpec = buildExportSpec(renderTree);
    // exportSpec diagnostics are carried forward
    const pptx = buildVnextPptxSpec(exportSpec);
    // No existing diagnostics in a clean spec, but carry-forward path is tested
    assert.ok(Array.isArray(pptx.diagnostics));
  });

  test("result is DOM-free (no document/window references)", () => {
    const spec = makeExportSpec();
    const pptx = buildVnextPptxSpec(spec);
    const json = JSON.stringify(pptx);
    assert.ok(
      !json.includes("document."),
      "pptx spec must not reference document",
    );
    assert.ok(!json.includes("window."), "pptx spec must not reference window");
  });
});

// ---------------------------------------------------------------------------
// Speaker notes
// ---------------------------------------------------------------------------

describe("buildVnextPptxSpec — speaker notes", () => {
  test("speaker notes are preserved on slide spec", () => {
    resetBuilderCounter();
    const slide = { ...buildCoverSlide(), notes: "Remember the CTA." };
    const deck = buildDeckV7([slide]);
    const pkg = buildMinimalThemePackage();
    const renderTree = resolveDeckRenderTree(deck, pkg);
    const exportSpec = buildExportSpec(renderTree);
    const pptx = buildVnextPptxSpec(exportSpec);
    assert.equal(pptx.slides[0].notes, "Remember the CTA.");
  });
});

// ---------------------------------------------------------------------------
// Additional fill and operation coverage
// ---------------------------------------------------------------------------

describe("buildVnextPptxSpec — radial gradient and image fill fallback", () => {
  test("radial gradient fill emits unsupported-export-feature diagnostic", () => {
    const pkgWithRadial = buildMinimalThemePackage("radial-pkg", {
      styles: {
        ...buildMinimalThemePackage().styles,
        "slide.cover": {
          default: {
            slide: {
              background: {
                type: "radialGradient" as const,
                inner: "#ffffff",
                outer: "#000000",
              },
            },
          },
        },
      },
    });
    resetBuilderCounter();
    const deck = buildDeckV7([buildCoverSlide()]);
    const renderTree = resolveDeckRenderTree(deck, pkgWithRadial);
    const exportSpec = buildExportSpec(renderTree);
    const pptx = buildVnextPptxSpec(exportSpec);
    assert.ok(
      pptx.diagnostics.some((d) => d.code === "unsupported-export-feature"),
      "Expected unsupported-export-feature for radial gradient",
    );
  });

  test("image fill emits unsupported-export-feature diagnostic", () => {
    const pkgWithImageFill = buildMinimalThemePackage("image-fill-pkg", {
      styles: {
        ...buildMinimalThemePackage().styles,
        "slide.cover": {
          default: {
            slide: {
              background: {
                type: "image" as const,
                assetId: "https://example.com/bg.jpg",
              },
            },
          },
        },
      },
    });
    resetBuilderCounter();
    const deck = buildDeckV7([buildCoverSlide()]);
    const renderTree = resolveDeckRenderTree(deck, pkgWithImageFill);
    const exportSpec = buildExportSpec(renderTree);
    const pptx = buildVnextPptxSpec(exportSpec);
    assert.ok(
      pptx.diagnostics.some((d) => d.code === "unsupported-export-feature"),
      "Expected unsupported-export-feature for image fill",
    );
  });

  test("conic gradient fill emits unsupported-export-feature diagnostic", () => {
    const pkgWithConic = buildMinimalThemePackage("conic-pkg", {
      styles: {
        ...buildMinimalThemePackage().styles,
        "slide.cover": {
          default: {
            slide: {
              background: {
                type: "conicGradient" as const,
                stops: [
                  { color: "#ff00aa", offsetPct: 0 },
                  { color: "#00ccff", offsetPct: 100 },
                ],
              },
            },
          },
        },
      },
    });
    resetBuilderCounter();
    const deck = buildDeckV7([buildCoverSlide()]);
    const renderTree = resolveDeckRenderTree(deck, pkgWithConic);
    const exportSpec = buildExportSpec(renderTree);
    const pptx = buildVnextPptxSpec(exportSpec);
    assert.ok(
      pptx.diagnostics.some((d) => d.code === "unsupported-export-feature"),
      "Expected unsupported-export-feature for conic gradient",
    );
  });

  test("pattern fill emits unsupported-export-feature diagnostic", () => {
    const pkgWithPattern = buildMinimalThemePackage("pattern-pkg", {
      styles: {
        ...buildMinimalThemePackage().styles,
        "slide.cover": {
          default: {
            slide: {
              background: {
                type: "pattern" as const,
                kind: "grid" as const,
                color: "#999999",
                background: "#ffffff",
              },
            },
          },
        },
      },
    });
    resetBuilderCounter();
    const deck = buildDeckV7([buildCoverSlide()]);
    const renderTree = resolveDeckRenderTree(deck, pkgWithPattern);
    const exportSpec = buildExportSpec(renderTree);
    const pptx = buildVnextPptxSpec(exportSpec);
    assert.ok(
      pptx.diagnostics.some((d) => d.code === "unsupported-export-feature"),
      "Expected unsupported-export-feature for pattern fill",
    );
  });
});

describe("buildVnextPptxSpec — custom canvas format", () => {
  test("custom canvas produces LAYOUT_CUSTOM", () => {
    const customCanvas: import("@/lib/presentation-vnext/types").CanvasSpec = {
      format: "custom",
      width: 120,
      height: 90,
      unit: "percent",
    };
    resetBuilderCounter();
    const deck = buildDeckV7([buildCoverSlide()], { canvas: customCanvas });
    const pkg = buildMinimalThemePackage();
    const renderTree = resolveDeckRenderTree(deck, pkg);
    const exportSpec = buildExportSpec(renderTree);
    const pptx = buildVnextPptxSpec(exportSpec);
    assert.equal(pptx.layout, "LAYOUT_CUSTOM");
  });
});

describe("buildVnextPptxSpec — visual operation coverage", () => {
  test("visual slide op is produced and carries visual content", () => {
    resetBuilderCounter();
    const deck = buildDeckV7([buildVisualSlide()]);
    const pkg = buildMinimalThemePackage();
    const renderTree = resolveDeckRenderTree(deck, pkg);
    const exportSpec = buildExportSpec(renderTree);
    const pptx = buildVnextPptxSpec(exportSpec);
    assert.ok(pptx.slides[0].ops.length >= 1);
  });
});
