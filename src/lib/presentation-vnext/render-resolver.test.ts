/**
 * Render resolver, render tree ordering, and decoration layering tests.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resolveDeckRenderTree } from "@/lib/presentation-vnext/render-resolver";
import {
  buildDeckV7,
  buildCoverSlide,
  buildContentSlide,
  buildMinimalThemePackage,
  buildTextNode,
  buildImageNode,
  resetBuilderCounter,
} from "@/test/builders/deck-v7";
import type { SlideNode } from "@/lib/presentation-vnext/schema";

function makeSlideWithZIndices(zIndices: number[]): SlideNode {
  resetBuilderCounter();
  const slide = buildCoverSlide();
  const children = zIndices.map((z, i) =>
    buildTextNode({
      id: `z-node-${i}`,
      layout: { frame: { x: 8, y: 8 + i * 5, w: 30, h: 5 }, zIndex: z },
    }),
  );
  return { ...slide, children };
}

describe("resolveDeckRenderTree", () => {
  test("returns a resolved tree with correct canvas", () => {
    resetBuilderCounter();
    const deck = buildDeckV7([buildCoverSlide()]);
    const pkg = buildMinimalThemePackage();
    const result = resolveDeckRenderTree(deck, pkg);
    assert.equal(result.canvas.format, "16:9");
    assert.equal(result.slides.length, 1);
  });

  test("excludes hidden nodes from resolved output", () => {
    resetBuilderCounter();
    const slide = buildCoverSlide();
    const hiddenNode = buildTextNode({
      id: "hidden-text",
      hidden: true,
    });
    const slideWithHidden = {
      ...slide,
      children: [...slide.children, hiddenNode],
    };
    const deck = buildDeckV7([slideWithHidden]);
    const pkg = buildMinimalThemePackage();
    const result = resolveDeckRenderTree(deck, pkg);
    const resolvedSlide = result.slides[0];
    assert.ok(
      !resolvedSlide.nodes.some((n) => n.id === "hidden-text"),
      "Hidden node should not appear in resolved output",
    );
  });

  test("orders user nodes by ascending zIndex", () => {
    resetBuilderCounter();
    const slide = makeSlideWithZIndices([3, 1, 2]);
    const deck = buildDeckV7([slide]);
    const pkg = buildMinimalThemePackage();
    const result = resolveDeckRenderTree(deck, pkg);
    const nodes = result.slides[0].nodes;
    const zOrders = nodes.map((n) => n.layout.zIndex);
    for (let i = 1; i < zOrders.length; i++) {
      assert.ok(
        zOrders[i] >= zOrders[i - 1],
        `Expected ascending zIndex order, got ${zOrders}`,
      );
    }
  });

  test("resolves theme decorations into decorations array", () => {
    resetBuilderCounter();
    const slide = buildCoverSlide();
    const deck = buildDeckV7([slide]);
    const pkg = buildMinimalThemePackage("test-package", {
      decorations: {
        "bg-corner": {
          id: "bg-corner",
          component: "shape",
          role: "themeDecoration",
          layout: { frame: { x: 0, y: 0, w: 20, h: 20 }, zIndex: 0 },
          style: { fill: { type: "solid", color: "#cccccc" } },
          visibility: "default",
        },
      },
    });
    const result = resolveDeckRenderTree(deck, pkg);
    const resolvedSlide = result.slides[0];
    assert.ok(
      resolvedSlide.decorations.length >= 1,
      "Expected at least one decoration",
    );
    assert.ok(
      resolvedSlide.decorations[0].source === "themeDecoration",
      "Decoration source must be 'themeDecoration'",
    );
  });

  test("respects disabledDecorations from deck theme overrides", () => {
    resetBuilderCounter();
    const slide = buildCoverSlide();
    const deck = buildDeckV7([slide], {
      theme: {
        packageId: "test-package",
        overrides: { disabledDecorations: ["bg-corner"] },
      },
    });
    const pkg = buildMinimalThemePackage("test-package", {
      decorations: {
        "bg-corner": {
          id: "bg-corner",
          component: "shape",
          role: "themeDecoration",
          layout: { frame: { x: 0, y: 0, w: 20, h: 20 }, zIndex: 0 },
          style: {},
        },
      },
    });
    const result = resolveDeckRenderTree(deck, pkg);
    assert.equal(
      result.slides[0].decorations.length,
      0,
      "Disabled decoration should not appear",
    );
  });

  test("filters decorations by template kind", () => {
    resetBuilderCounter();
    const deck = buildDeckV7([buildCoverSlide(), buildContentSlide()]);
    const pkg = buildMinimalThemePackage("test-package", {
      decorations: {
        "cover-only": {
          id: "cover-only",
          component: "shape",
          role: "themeDecoration",
          layout: { frame: { x: 0, y: 0, w: 100, h: 100 }, zIndex: 0 },
          style: { fill: { type: "solid", color: "#cccccc" } },
          appliesTo: { templateKinds: ["cover"] },
        },
      },
    });

    const result = resolveDeckRenderTree(deck, pkg);

    assert.deepEqual(
      result.slides[0].decorations.map((decoration) => decoration.id),
      ["decoration-cover-only"],
    );
    assert.deepEqual(result.slides[1].decorations, []);
  });

  test("filters decorations by slide decoration level", () => {
    resetBuilderCounter();
    const slide = {
      ...buildCoverSlide(),
      props: { decoration: "subtle" as const },
    };
    const deck = buildDeckV7([slide]);
    const pkg = buildMinimalThemePackage("test-package", {
      decorations: {
        "expressive-bg": {
          id: "expressive-bg",
          component: "shape",
          role: "themeDecoration",
          layout: { frame: { x: 0, y: 0, w: 100, h: 100 }, zIndex: 0 },
          style: {},
          visibility: "expressive", // only shows at "expressive" level
        },
        "subtle-bg": {
          id: "subtle-bg",
          component: "shape",
          role: "themeDecoration",
          layout: { frame: { x: 0, y: 0, w: 100, h: 100 }, zIndex: 0 },
          style: {},
          visibility: "subtle",
        },
      },
    });
    const result = resolveDeckRenderTree(deck, pkg);
    const decorIds = result.slides[0].decorations.map((d) => d.id);
    assert.ok(
      !decorIds.includes("decoration-expressive-bg"),
      "Expressive decoration should be filtered at 'subtle' level",
    );
    assert.ok(
      decorIds.includes("decoration-subtle-bg"),
      "Subtle decoration should show at 'subtle' level",
    );
  });

  test("emits missing-asset diagnostic for unresolved image", () => {
    resetBuilderCounter();
    const slide = buildCoverSlide();
    const imageNode = buildImageNode("nonexistent-asset");
    const slideWithImage = {
      ...slide,
      children: [...slide.children, imageNode],
    };
    const deck = buildDeckV7([slideWithImage]);
    const pkg = buildMinimalThemePackage();
    const result = resolveDeckRenderTree(deck, pkg);
    assert.ok(
      result.diagnostics.some((d) => d.code === "missing-asset"),
      "Expected missing-asset diagnostic",
    );
  });

  test("emits missing-node-layout diagnostic for nodes without layout", () => {
    resetBuilderCounter();
    const slide = buildCoverSlide();
    const noLayoutNode = {
      ...buildTextNode({ id: "no-layout-node" }),
      layout:
        undefined as unknown as import("@/lib/presentation-vnext/schema").LayoutBox,
    };
    const badSlide = { ...slide, children: [...slide.children, noLayoutNode] };
    const deck = buildDeckV7([badSlide]);
    const pkg = buildMinimalThemePackage();
    const result = resolveDeckRenderTree(deck, pkg);
    assert.ok(
      result.diagnostics.some((d) => d.code === "missing-node-layout"),
      "Expected missing-node-layout diagnostic",
    );
  });

  test("theme switch preserves node layout frames", () => {
    resetBuilderCounter();
    const slide = buildContentSlide("Layout check");
    const deck = buildDeckV7([slide]);
    const pkg1 = buildMinimalThemePackage("pkg-a");
    const pkg2 = buildMinimalThemePackage("pkg-b");

    const result1 = resolveDeckRenderTree(deck, pkg1);
    const result2 = resolveDeckRenderTree(deck, pkg2);

    // Frames should be identical regardless of theme
    for (let i = 0; i < result1.slides[0].nodes.length; i++) {
      const n1 = result1.slides[0].nodes[i];
      const n2 = result2.slides[0].nodes[i];
      assert.deepEqual(
        n1.layout.frame,
        n2.layout.frame,
        `Frame should not change after theme switch for node ${n1.id}`,
      );
    }
  });

  test("provides framePx for each resolved node", () => {
    resetBuilderCounter();
    const deck = buildDeckV7([buildContentSlide()]);
    const pkg = buildMinimalThemePackage();
    const result = resolveDeckRenderTree(deck, pkg, {
      canvasWidthPx: 1280,
      canvasHeightPx: 720,
    });
    for (const node of result.slides[0].nodes) {
      assert.ok(node.layout.framePx, `Expected framePx on node ${node.id}`);
    }
  });
});
