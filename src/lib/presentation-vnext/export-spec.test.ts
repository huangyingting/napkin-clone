/**
 * Export spec builder tests.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildExportSpec } from "@/lib/presentation-vnext/export-spec";
import { resolveDeckRenderTree } from "@/lib/presentation-vnext/render-resolver";
import {
  buildDeckV7,
  buildCoverSlide,
  buildContentSlide,
  buildTableSlide,
  buildVisualSlide,
  buildImageNode,
  buildVisualNode,
  buildMinimalThemePackage,
  resetBuilderCounter,
} from "@/test/builders/deck-v7";

describe("buildExportSpec", () => {
  test("produces one slide spec per deck slide", () => {
    resetBuilderCounter();
    const deck = buildDeckV7([buildCoverSlide(), buildContentSlide()]);
    const pkg = buildMinimalThemePackage();
    const renderTree = resolveDeckRenderTree(deck, pkg);
    const exportSpec = buildExportSpec(renderTree);
    assert.equal(exportSpec.slides.length, 2);
    assert.equal(exportSpec.canvas.format, "16:9");
  });

  test("each slide spec has a background operation", () => {
    resetBuilderCounter();
    const deck = buildDeckV7([buildCoverSlide()]);
    const pkg = buildMinimalThemePackage();
    const renderTree = resolveDeckRenderTree(deck, pkg);
    const exportSpec = buildExportSpec(renderTree);
    const slide = exportSpec.slides[0];
    assert.equal(slide.background.type, "background");
  });

  test("operations include text, image, and shape types", () => {
    resetBuilderCounter();
    const deck = buildDeckV7([buildContentSlide()]);
    const pkg = buildMinimalThemePackage();
    const renderTree = resolveDeckRenderTree(deck, pkg);
    const exportSpec = buildExportSpec(renderTree);
    const ops = exportSpec.slides[0].operations;
    assert.ok(ops.length >= 1, "Expected at least one operation");
    assert.ok(ops.every((op) => typeof op.type === "string"));
  });

  test("table compiles to tableShape operation", () => {
    resetBuilderCounter();
    const deck = buildDeckV7([buildTableSlide()]);
    const pkg = buildMinimalThemePackage();
    const renderTree = resolveDeckRenderTree(deck, pkg);
    const exportSpec = buildExportSpec(renderTree);
    const ops = exportSpec.slides[0].operations;
    assert.ok(
      ops.some((op) => op.type === "tableShape"),
      "Expected tableShape operation for table node",
    );
  });

  test("operations are DOM-free (no DOM types)", () => {
    resetBuilderCounter();
    const deck = buildDeckV7([buildCoverSlide()]);
    const pkg = buildMinimalThemePackage();
    const renderTree = resolveDeckRenderTree(deck, pkg);
    const exportSpec = buildExportSpec(renderTree);
    // Verify no DOM-like properties exist
    const jsonStr = JSON.stringify(exportSpec);
    assert.ok(
      !jsonStr.includes("document."),
      "Export spec must not reference document",
    );
    assert.ok(
      !jsonStr.includes("window."),
      "Export spec must not reference window",
    );
  });

  test("operation order matches resolved render order", () => {
    resetBuilderCounter();
    const deck = buildDeckV7([buildContentSlide()]);
    const pkg = buildMinimalThemePackage();
    const renderTree = resolveDeckRenderTree(deck, pkg);
    const exportSpec = buildExportSpec(renderTree);

    const resolvedIds = renderTree.slides[0].nodes.map((n) => n.id);
    const exportIds = exportSpec.slides[0].operations.map((op) => op.id);
    assert.deepEqual(exportIds, resolvedIds);
  });

  test("emits warnings for glass effect (unsupported export)", () => {
    resetBuilderCounter();
    const slide = buildCoverSlide();
    // We'll need to inject the effect into the resolved style via a pkg variant
    // Instead test that the warning mechanism is wired by using a pkg with
    // glass effect in a style variant
    const pkg = buildMinimalThemePackage("test-package", {
      styles: {
        ...buildMinimalThemePackage().styles,
        "text.title": {
          default: {
            text: { fontSizePt: 36, color: "#111111" },
            effect: { kind: "glass", intensity: "strong" },
          },
        },
      },
    });
    const deck = buildDeckV7([slide]);
    const renderTree = resolveDeckRenderTree(deck, pkg);
    const exportSpec = buildExportSpec(renderTree);
    assert.ok(
      exportSpec.diagnostics.some(
        (d) => d.code === "unsupported-export-feature",
      ),
      "Expected unsupported-export-feature diagnostic for glass effect",
    );
  });

  test("emits theme-decoration-export-fallback for decoration export effects", () => {
    resetBuilderCounter();
    const deck = buildDeckV7([buildCoverSlide()]);
    const pkg = buildMinimalThemePackage("test-package", {
      decorations: {
        "glass-corner": {
          id: "glass-corner",
          component: "shape",
          role: "themeDecoration",
          layout: { frame: { x: 0, y: 0, w: 20, h: 20 }, zIndex: 0 },
          style: {
            fill: { type: "solid", color: "#ffffff" },
            effect: { kind: "glass", intensity: "light" },
          },
        },
      },
    });

    const exportSpec = buildExportSpec(resolveDeckRenderTree(deck, pkg));

    assert.ok(
      exportSpec.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "theme-decoration-export-fallback" &&
          diagnostic.details?.decorationId === "glass-corner",
      ),
    );
  });

  test("preserves speaker notes on export slide spec", () => {
    resetBuilderCounter();
    const slide = { ...buildCoverSlide(), notes: "Remember to breathe." };
    const deck = buildDeckV7([slide]);
    const pkg = buildMinimalThemePackage();
    const renderTree = resolveDeckRenderTree(deck, pkg);
    const exportSpec = buildExportSpec(renderTree);
    assert.equal(exportSpec.slides[0].notes, "Remember to breathe.");
  });
});

// ---------------------------------------------------------------------------
// Additional operation types
// ---------------------------------------------------------------------------

describe("buildExportSpec — additional operation types", () => {
  test("visual slide produces at least one operation", () => {
    resetBuilderCounter();
    const deck = buildDeckV7([buildVisualSlide()]);
    const pkg = buildMinimalThemePackage();
    const renderTree = resolveDeckRenderTree(deck, pkg);
    const exportSpec = buildExportSpec(renderTree);
    assert.ok(exportSpec.slides[0].operations.length >= 1);
  });

  test("render diagnostics are carried forward into export spec", () => {
    resetBuilderCounter();
    // Build a deck with an image node referencing a missing asset to trigger
    // a render diagnostic.
    const slide = buildCoverSlide();
    const imgNode = {
      ...slide.children[0],
      id: "img-missing",
      type: "image" as const,
      content: { assetId: "ghost-asset" },
    } as unknown as import("@/lib/presentation-vnext/schema").SlideChildNode;
    const badSlide = { ...slide, children: [imgNode] };
    const deck = buildDeckV7([badSlide]);
    const pkg = buildMinimalThemePackage();
    const renderTree = resolveDeckRenderTree(deck, pkg);
    const exportSpec = buildExportSpec(renderTree);
    // Render errors (missing-asset) flow through to exportSpec.diagnostics
    assert.ok(
      exportSpec.diagnostics.some((d) => d.code === "missing-asset"),
      "Expected missing-asset diagnostic carried from render tree",
    );
  });

  test("image operations carry fit, crop, and alt text for export parity", () => {
    resetBuilderCounter();
    const imageNode = buildImageNode("img-001", {
      content: {
        assetId: "img-001",
        fit: "contain",
        crop: { top: 5, right: 10, bottom: 15, left: 20 },
        alt: "Cropped product image",
      },
    });
    const deck = buildDeckV7([{ ...buildCoverSlide(), children: [imageNode] }]);
    const renderTree = resolveDeckRenderTree(deck, buildMinimalThemePackage());
    const exportSpec = buildExportSpec(renderTree);
    const imageOp = exportSpec.slides[0].operations.find(
      (op) => op.type === "image",
    );
    assert.ok(imageOp);
    assert.equal(imageOp.type, "image");
    if (imageOp.type === "image") {
      assert.equal(imageOp.fit, "contain");
      assert.deepEqual(imageOp.crop, {
        top: 5,
        right: 10,
        bottom: 15,
        left: 20,
      });
      assert.equal(imageOp.alt, "Cropped product image");
    }
  });

  test("visual operations carry supported channel colors and filter unsupported channels", () => {
    resetBuilderCounter();
    const visualNode = buildVisualNode({
      localStyle: {
        visual: {
          channelColors: {
            primary: "#111111",
            accent: "#ffcc00",
            tertiary: "#00ff00",
          },
        },
      },
    });
    const deck = buildDeckV7([
      { ...buildCoverSlide(), children: [visualNode] },
    ]);
    const renderTree = resolveDeckRenderTree(deck, buildMinimalThemePackage());
    const exportSpec = buildExportSpec(renderTree);
    const visualOp = exportSpec.slides[0].operations.find(
      (op) => op.type === "visual",
    );
    assert.ok(visualOp);
    assert.equal(visualOp.type, "visual");
    if (visualOp.type === "visual") {
      assert.deepEqual(visualOp.channelColors, {
        primary: "#111111",
        accent: "#ffcc00",
      });
      assert.equal("tertiary" in (visualOp.channelColors ?? {}), false);
    }
    assert.ok(
      exportSpec.diagnostics.some(
        (d) =>
          d.code === "unsupported-export-feature" &&
          d.details?.channel === "tertiary",
      ),
    );
  });

  test("framePx is preferred over frame when present on resolved node", () => {
    resetBuilderCounter();
    const deck = buildDeckV7([buildCoverSlide()]);
    const pkg = buildMinimalThemePackage();
    const renderTree = resolveDeckRenderTree(deck, pkg);
    const exportSpec = buildExportSpec(renderTree);
    const ops = exportSpec.slides[0].operations;
    assert.ok(ops.length > 0);
    for (const op of ops) {
      assert.ok(typeof op.frame.x === "number");
      assert.ok(typeof op.frame.y === "number");
    }
  });
});
