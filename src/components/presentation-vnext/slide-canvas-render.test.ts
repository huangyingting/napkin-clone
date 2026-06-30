import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DeckCanvasVNext, SlideCanvasVNext } from "./slide-canvas";
import {
  SlideNodeRenderer,
  styleObjectToContainerCss,
} from "./slide-node-renderer";
import { createSelectionState, setSelection } from "./selection-model";
import type {
  ResolvedDeckRenderTree,
  ResolvedRenderNode,
  ResolvedSlideRenderTree,
} from "@/lib/presentation-vnext/render-tree";
import type {
  FillStyle,
  StyleObject,
} from "@/lib/presentation-vnext/style-schema";

function textNode(
  id: string,
  frame: { x: number; y: number; w: number; h: number },
  options: Partial<ResolvedRenderNode> = {},
): ResolvedRenderNode {
  return {
    id,
    type: "text",
    role: "body",
    layout: { frame, zIndex: 1 },
    style: {},
    content: {
      type: "text",
      content: { paragraphs: [{ id: `${id}-p1`, text: id }] },
    },
    source: "user",
    ...options,
  };
}

function imageNode(
  id: string,
  frame: { x: number; y: number; w: number; h: number },
  options: Partial<ResolvedRenderNode> = {},
): ResolvedRenderNode {
  return {
    id,
    type: "image",
    role: "body",
    layout: { frame, zIndex: 1 },
    style: {},
    content: {
      type: "image",
      content: { assetId: "image-1", fit: "cover" },
    },
    source: "user",
    ...options,
  };
}

function slide(nodes: ResolvedRenderNode[]): ResolvedSlideRenderTree {
  return {
    id: "slide-1",
    background: {
      fill: { type: "solid", color: "#ffffff" },
      decorationLevel: "none",
    },
    decorations: [],
    nodes,
  };
}

function renderNode(node: ResolvedRenderNode): string {
  return renderToStaticMarkup(
    createElement(SlideNodeRenderer, {
      node,
      interactive: true,
      selected: true,
      hovered: true,
      focused: true,
      tabIndex: 0,
      onClick: () => undefined,
      onDoubleClick: () => undefined,
      onPointerDown: () => undefined,
      onFocus: () => undefined,
      onHoverChange: () => undefined,
      assetResolver: (assetId) =>
        assetId === "missing"
          ? undefined
          : `https://example.com/${assetId}.png`,
    }),
  );
}

describe("SlideCanvasVNext stage editing render affordances", () => {
  test("renders stage nodes as accessible roving-tabindex controls", () => {
    const selection = setSelection(createSelectionState("normal"), ["node-1"]);
    const html = renderToStaticMarkup(
      createElement(SlideCanvasVNext, {
        slide: slide([textNode("node-1", { x: 10, y: 10, w: 20, h: 10 })]),
        selection,
        focusedNodeId: "node-1",
        onNodeClick: () => undefined,
      }),
    );

    assert.match(html, /role="button"/);
    assert.match(html, /tabindex="0"/);
    assert.match(html, /aria-label="Text: node-1"/);
  });

  test("renders locked selected nodes with disabled state", () => {
    const selection = setSelection(createSelectionState("normal"), ["locked"]);
    const html = renderToStaticMarkup(
      createElement(SlideCanvasVNext, {
        slide: slide([
          textNode("locked", { x: 10, y: 10, w: 20, h: 10 }, { locked: true }),
        ]),
        selection,
        focusedNodeId: "locked",
        onNodeClick: () => undefined,
      }),
    );

    assert.match(html, /aria-disabled="true"/);
    assert.match(html, /data-node-chrome-frame="selected"/);
    assert.match(html, /border:2px dashed var\(--ds-border, #9ca3af\)/);
  });

  test("renders hover chrome as a separate preselection frame", () => {
    const html = renderToStaticMarkup(
      createElement(SlideCanvasVNext, {
        slide: slide([textNode("hovered", { x: 10, y: 10, w: 20, h: 10 })]),
        hoveredNodeId: "hovered",
        onNodeClick: () => undefined,
      }),
    );

    assert.match(html, /data-node-chrome-frame="preselected"/);
    assert.match(html, /border:1.5px solid var\(--ds-border, #cbd5e1\)/);
  });

  test("renders a multi-selection bounding box", () => {
    const selection = setSelection(createSelectionState("normal"), ["a", "b"]);
    const html = renderToStaticMarkup(
      createElement(SlideCanvasVNext, {
        slide: slide([
          textNode("a", { x: 10, y: 10, w: 20, h: 10 }),
          textNode("b", { x: 40, y: 30, w: 20, h: 10 }),
        ]),
        selection,
        focusedNodeId: "a",
        onNodeClick: () => undefined,
      }),
    );

    assert.match(html, /border-dashed border-ds-accent-border/);
    assert.match(html, /left:10%/);
    assert.match(html, /top:10%/);
    assert.match(html, /width:50%/);
    assert.match(html, /height:30%/);
  });

  test("renders crop handles for a selected image", () => {
    const selection = setSelection(createSelectionState("normal"), ["image-1"]);
    const html = renderToStaticMarkup(
      createElement(SlideCanvasVNext, {
        slide: slide([imageNode("image-1", { x: 10, y: 10, w: 30, h: 20 })]),
        selection,
        focusedNodeId: "image-1",
        onNodeClick: () => undefined,
        onCropHandlePointerDown: () => undefined,
      }),
    );

    assert.match(html, /data-crop-handle="top"/);
    assert.match(html, /data-crop-handle="right"/);
    assert.match(html, /data-crop-handle="bottom"/);
    assert.match(html, /data-crop-handle="left"/);
  });

  test("renders paragraph list markers", () => {
    const node = textNode("list-node", { x: 10, y: 10, w: 40, h: 20 });
    const html = renderToStaticMarkup(
      createElement(SlideCanvasVNext, {
        slide: slide([
          {
            ...node,
            content: {
              type: "text",
              content: {
                paragraphs: [
                  { id: "p1", text: "First", list: { kind: "bullet" } },
                  { id: "p2", text: "Second", list: { kind: "number" } },
                ],
              },
            },
          },
        ]),
        onNodeClick: () => undefined,
      }),
    );

    assert.match(html, />•<\/span>/);
    assert.match(html, />2\.<\/span>/);
  });

  test("converts rich container styles for fills, effects, borders, and media backgrounds", () => {
    const assetResolver = (assetId: string) =>
      assetId === "hero" ? "https://example.com/hero.png" : undefined;
    const cases: StyleObject[] = [
      {
        fill: { type: "solid", color: "#ffffff" },
        stroke: { color: "#111111", widthPt: 2, dash: "dashed" },
        radius: { allPt: 8 },
        shadow: { xPt: 1, yPt: 2, blurPt: 3, color: "#000000" },
        effect: { kind: "glass", intensity: "strong" },
        opacity: 0.5,
        clip: { enabled: true },
        blendMode: "multiply",
      },
      {
        fill: {
          type: "linearGradient",
          from: "#000000",
          to: "#ffffff",
          angle: 45,
          stops: [
            { color: "#000000", offsetPct: 0 },
            { color: "#ffffff", offsetPct: 100 },
          ],
        },
      },
      {
        fill: {
          type: "radialGradient",
          inner: "#111111",
          outer: "#eeeeee",
          r: 60,
          cx: 20,
          cy: 30,
        },
        radius: {
          topLeftPt: 1,
          topRightPt: 2,
          bottomRightPt: 3,
          bottomLeftPt: 4,
        },
      },
      {
        fill: {
          type: "conicGradient",
          fromAngle: 30,
          stops: [{ color: "#ff0000", offsetPct: 0 }],
        },
      },
      {
        fill: {
          type: "repeatingLinearGradient",
          angle: 12,
          stops: [{ color: "#00ff00", offsetPct: 20 }],
        },
      },
      {
        fill: {
          type: "pattern",
          kind: "grid",
          color: "#111111",
          background: "#eeeeee",
        },
      },
      {
        fill: { type: "pattern", kind: "dots", color: "#111111" },
      },
      {
        fill: {
          type: "pattern",
          kind: "stripes",
          color: "#111111",
          angle: 20,
        },
      },
      {
        fill: { type: "pattern", kind: "scanlines", color: "#111111" },
      },
      {
        fill: { type: "image", assetId: "hero", opacity: 0.7 },
        effect: { kind: "blur", radiusPt: 4 },
      },
      {
        fill: { type: "image", assetId: "missing" },
        effect: { kind: "glow", color: "#4f46e5", blurPt: 10, opacity: 0.4 },
      },
      {
        effect: { kind: "glass", intensity: "light" },
      },
    ];

    const css = cases.map((style) =>
      styleObjectToContainerCss(style, assetResolver),
    );

    assert.equal(css[0].backgroundColor, "#ffffff");
    assert.equal(css[0].border, "2pt dashed #111111");
    assert.equal(css[0].borderRadius, "8pt");
    assert.equal(css[0].backdropFilter, "blur(22px) saturate(1.25)");
    assert.equal(css[0].mixBlendMode, "multiply");
    assert.equal(
      css[1].background,
      "linear-gradient(45deg, #000000 0%, #ffffff 100%)",
    );
    assert.match(String(css[2].background), /radial-gradient/);
    assert.equal(css[2].borderTopLeftRadius, "1pt");
    assert.match(String(css[3].background), /conic-gradient/);
    assert.match(String(css[4].background), /repeating-linear-gradient/);
    assert.match(String(css[5].backgroundImage), /linear-gradient/);
    assert.match(String(css[6].backgroundImage), /radial-gradient/);
    assert.match(String(css[7].backgroundImage), /repeating-linear-gradient/);
    assert.match(String(css[8].backgroundImage), /0deg/);
    assert.match(String(css[9].backgroundImage), /hero.png/);
    assert.equal(css[9].filter, "blur(4pt)");
    assert.equal(css[10].backgroundImage, undefined);
    assert.equal(css[10].filter, "drop-shadow(0 0 10pt #4f46e5)");
    assert.equal(css[11].backdropFilter, "blur(8px) saturate(1.25)");
  });

  test("renders rich text, shapes, media, tables, connectors, and groups", () => {
    const richText = textNode(
      "rich-text",
      { x: 2, y: 4, w: 30, h: 12 },
      {
        layout: {
          frame: { x: 2, y: 4, w: 30, h: 12 },
          zIndex: 2,
          rotation: 12,
          flipX: true,
          flipY: true,
        },
        style: {
          text: {
            fontFamily: "Inter",
            fontSizePt: 16,
            weight: 700,
            italic: true,
            underline: true,
            color: "#111827",
            lineHeight: 1.4,
            align: "center",
            letterSpacingEm: 0.04,
            textTransform: "uppercase",
          },
        },
        content: {
          type: "text",
          content: {
            paragraphs: [
              {
                id: "p1",
                text: "Linked bold",
                runs: [
                  {
                    text: "Linked ",
                    bold: true,
                    link: "https://example.com",
                    localStyle: {
                      color: "#2563eb",
                      fontSizePt: 18,
                      fontFamily: "Mono",
                    },
                  },
                  {
                    text: "bold",
                    italic: true,
                    underline: true,
                    strikethrough: true,
                    code: true,
                  },
                ],
                list: { kind: "bullet", indent: 2 },
              },
            ],
          },
        },
      },
    );

    const triangle = {
      ...textNode("triangle", { x: 4, y: 18, w: 12, h: 12 }),
      type: "shape" as const,
      style: {
        fill: { type: "solid" as const, color: "#f97316" },
        stroke: { color: "#7c2d12", widthPt: 1 },
      },
      content: {
        type: "shape" as const,
        content: { shape: "triangle" as const },
      },
    };
    const diamond = {
      ...triangle,
      id: "diamond",
      content: {
        type: "shape" as const,
        content: { shape: "diamond" as const },
      },
    };
    const pathShape = {
      ...triangle,
      id: "path-shape",
      content: {
        type: "shape" as const,
        content: {
          shape: "path" as const,
          path: "M 0 0 L 100 0 L 50 100 Z",
          text: { paragraphs: [{ id: "shape-label", text: "Label" }] },
        },
      },
    };
    const resolvedImage = imageNode(
      "resolved-image",
      { x: 20, y: 18, w: 20, h: 12 },
      {
        style: {
          image: { brightness: 1.1, contrast: 0.9, saturation: 1.2 },
        },
        content: {
          type: "image",
          content: {
            assetId: "image-1",
            alt: "Resolved image",
            fit: "contain",
            crop: { top: 4, right: 6, bottom: 8, left: 10 },
          },
        },
      },
    );
    const missingImage = imageNode(
      "missing-image",
      { x: 42, y: 18, w: 20, h: 12 },
      {
        content: {
          type: "image",
          content: { assetId: "missing", alt: "Missing image" },
        },
      },
    );
    const tableNode = {
      ...textNode("table-node", { x: 2, y: 34, w: 40, h: 18 }),
      type: "table" as const,
      style: {
        table: {
          headerFill: { type: "solid" as const, color: "#e0f2fe" },
          rowFill: { type: "solid" as const, color: "#ffffff" },
          alternateRowFill: { type: "solid" as const, color: "#f8fafc" },
          border: { color: "#0f172a", widthPt: 1 },
          cellPaddingPt: { top: 2, right: 3, bottom: 4, left: 5 },
        },
      },
      content: {
        type: "table" as const,
        content: {
          columns: [
            { id: "metric", label: "Metric" },
            { id: "value", label: "Value" },
          ],
          rows: [
            { id: "r1", cells: [{ text: "ARR" }, { text: "$12M" }] },
            {
              id: "r2",
              cells: [
                { text: "NRR" },
                { text: "118%", runs: [{ text: "118%", bold: true }] },
              ],
            },
          ],
          header: true,
        },
      },
    };
    const visualWithAsset = {
      ...textNode("visual-asset", { x: 44, y: 34, w: 20, h: 12 }),
      type: "visual" as const,
      content: {
        type: "visual" as const,
        content: { assetId: "visual-1", visualId: "chart-1", alt: "Chart" },
      },
    };
    const visualPlaceholder = {
      ...visualWithAsset,
      id: "visual-placeholder",
      content: {
        type: "visual" as const,
        content: { visualId: "chart-2", alt: "Chart placeholder" },
      },
    };
    const connectorCurved = {
      ...textNode("connector-curved", { x: 2, y: 56, w: 24, h: 12 }),
      type: "connector" as const,
      style: {
        connector: {
          stroke: { color: "#2563eb", widthPt: 2, dash: "dotted" as const },
          startArrow: "filled" as const,
          endArrow: "none" as const,
          routing: "curved" as const,
        },
      },
      content: {
        type: "connector" as const,
        content: {
          from: { kind: "node" as const, nodeId: "a", anchor: "top" as const },
          to: { kind: "node" as const, nodeId: "b", anchor: "right" as const },
        },
      },
    };
    const connectorElbow = {
      ...connectorCurved,
      id: "connector-elbow",
      style: {
        stroke: { color: "#16a34a", widthPt: 3, dash: "dashed" as const },
        connector: {
          startArrow: "arrow" as const,
          endArrow: "filled" as const,
        },
      },
      content: {
        type: "connector" as const,
        content: {
          routing: "elbow" as const,
          from: {
            kind: "node" as const,
            nodeId: "a",
            anchor: "bottom" as const,
          },
          to: { kind: "node" as const, nodeId: "b", anchor: "left" as const },
        },
      },
    };
    const group = {
      ...textNode("group-node", { x: 60, y: 56, w: 20, h: 12 }),
      type: "group" as const,
      content: { type: "group" as const },
    };

    const nodes: ResolvedRenderNode[] = [
      richText,
      triangle,
      diamond,
      pathShape,
      resolvedImage,
      missingImage,
      tableNode,
      visualWithAsset,
      visualPlaceholder,
      connectorCurved,
      connectorElbow,
      group,
    ];
    const html = nodes.map(renderNode).join("");

    assert.match(html, /href="https:\/\/example.com"/);
    assert.match(html, /line-through/);
    assert.match(html, /rotate\(12deg\) scaleX\(-1\) scaleY\(-1\)/);
    assert.match(html, /M 50 0 L 100 100 L 0 100 Z/);
    assert.match(html, /M 50 0 L 100 50 L 50 100 L 0 50 Z/);
    assert.match(html, /M 0 0 L 100 0 L 50 100 Z/);
    assert.match(html, /Resolved image/);
    assert.match(html, /brightness\(1.1\) contrast\(0.9\) saturate\(1.2\)/);
    assert.match(html, /Missing image/);
    assert.match(html, /Metric/);
    assert.match(html, /118%/);
    assert.match(html, /Chart/);
    assert.match(html, /Chart placeholder/);
    assert.match(html, /connector-start-arrow-v7/);
    assert.match(html, /stroke-dasharray="1 4"/);
    assert.match(html, /stroke-dasharray="6 4"/);
    assert.match(html, /Group node/);
  });

  test("renders background variants, active handles, hidden nodes, and deck selection", () => {
    const backgroundFills: FillStyle[] = [
      { type: "solid", color: "#ffffff" },
      {
        type: "linearGradient",
        from: "#000000",
        to: "#ffffff",
        stops: [{ color: "#333333", offsetPct: 50 }],
      },
      {
        type: "radialGradient",
        inner: "#111111",
        outer: "#eeeeee",
        rx: 40,
        ry: 50,
      },
      { type: "conicGradient", stops: [{ color: "#ff0000", offsetPct: 0 }] },
      {
        type: "repeatingLinearGradient",
        stops: [{ color: "#00ff00", offsetPct: 25 }],
      },
      {
        type: "pattern",
        kind: "grid",
        color: "#111111",
        background: "#eeeeee",
      },
      { type: "pattern", kind: "dots", color: "#111111" },
      { type: "pattern", kind: "stripes", color: "#111111" },
      { type: "pattern", kind: "scanlines", color: "#111111" },
      { type: "image", assetId: "bg", opacity: 0.6 },
      { type: "image", assetId: "missing" },
    ];
    const backgroundsHtml = backgroundFills
      .map((fill) =>
        renderToStaticMarkup(
          createElement(SlideCanvasVNext, {
            slide: {
              ...slide([]),
              background: { fill, decorationLevel: "default" },
            },
            canvas: { format: "custom", width: 0, height: 0, unit: "percent" },
            assetResolver: (assetId: string) =>
              assetId === "bg" ? "https://example.com/bg.png" : undefined,
          }),
        ),
      )
      .join("");

    const selection = setSelection(createSelectionState("normal"), [
      "resize-me",
      "image-1",
    ]);
    const handlesHtml = renderToStaticMarkup(
      createElement(SlideCanvasVNext, {
        slide: {
          ...slide([
            textNode("resize-me", { x: 5, y: 5, w: 15, h: 10 }),
            imageNode("image-1", { x: 25, y: 5, w: 15, h: 10 }),
            {
              ...textNode("group-parent", { x: 45, y: 5, w: 15, h: 10 }),
              type: "group",
              content: { type: "group" },
              children: [textNode("group-child", { x: 46, y: 6, w: 10, h: 8 })],
            },
          ]),
          decorations: [
            textNode(
              "decor",
              { x: 1, y: 1, w: 8, h: 8 },
              { source: "themeDecoration" },
            ),
          ],
        },
        selection,
        focusedNodeId: undefined,
        hoveredNodeId: "group-child",
        hiddenNodeIds: new Set(["decor", "group-child"]),
        onNodeClick: () => undefined,
        onNodeDoubleClick: () => undefined,
        onNodePointerDown: () => undefined,
        onNodeFocus: () => undefined,
        onNodeHoverChange: () => undefined,
        onResizeHandlePointerDown: () => undefined,
        onCropHandlePointerDown: () => undefined,
        activeResizeHandle: { nodeId: "resize-me", handle: "se" },
        activeCropHandle: { nodeId: "image-1", handle: "right" },
      }),
    );
    const previewHtml = renderToStaticMarkup(
      createElement(SlideCanvasVNext, {
        slide: slide([textNode("preview-node", { x: 5, y: 5, w: 15, h: 10 })]),
        selection: setSelection(createSelectionState("normal"), [
          "preview-node",
        ]),
        hoveredNodeId: "preview-node",
        onNodeClick: () => undefined,
        preview: true,
      }),
    );
    const deck: ResolvedDeckRenderTree = {
      canvas: { format: "16:9", width: 100, height: 56.25, unit: "percent" },
      theme: {} as ResolvedDeckRenderTree["theme"],
      diagnostics: [],
      slides: [
        slide([textNode("first-slide-node", { x: 5, y: 5, w: 10, h: 8 })]),
        slide([textNode("second-slide-node", { x: 5, y: 5, w: 10, h: 8 })]),
      ],
    };
    const deckHtml = renderToStaticMarkup(
      createElement(DeckCanvasVNext, { deck, activeSlideIndex: 1 }),
    );
    const missingDeckHtml = renderToStaticMarkup(
      createElement(DeckCanvasVNext, { deck, activeSlideIndex: 99 }),
    );

    assert.match(backgroundsHtml, /linear-gradient/);
    assert.match(backgroundsHtml, /radial-gradient/);
    assert.match(backgroundsHtml, /conic-gradient/);
    assert.match(backgroundsHtml, /repeating-linear-gradient/);
    assert.match(backgroundsHtml, /bg.png/);
    assert.match(handlesHtml, /data-resize-handle="se"/);
    assert.match(handlesHtml, /data-crop-handle="right"/);
    assert.match(handlesHtml, /visibility:hidden/);
    assert.match(handlesHtml, /aria-hidden="true"/);
    assert.doesNotMatch(previewHtml, /data-node-chrome-frame/);
    assert.doesNotMatch(previewHtml, /role="button"/);
    assert.match(deckHtml, /second-slide-node/);
    assert.equal(missingDeckHtml, "");
  });
});
