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
  ResolvedNodeContent,
  ResolvedRenderNode,
  ResolvedSlideRenderTree,
} from "@/lib/presentation-vnext/render-tree";
import type { StyleObject } from "@/lib/presentation-vnext/style-schema";

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
    chrome: [],
    nodes,
  };
}

function renderNode(
  id: string,
  content: ResolvedNodeContent,
  style: StyleObject = {},
  options: Partial<ResolvedRenderNode> = {},
): ResolvedRenderNode {
  return {
    id,
    type: content.type,
    role: "body",
    layout: {
      frame: { x: 10, y: 10, w: 40, h: 24 },
      rotation: 8,
      zIndex: 2,
      flipX: true,
    },
    style,
    content,
    source: "user",
    ...options,
  };
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

  test("renders generated chrome without intercepting pointer events", () => {
    const html = renderToStaticMarkup(
      createElement(SlideNodeRenderer, {
        node: textNode(
          "deck-chrome-footer",
          { x: 0, y: 90, w: 100, h: 10 },
          { source: "deckChrome", chromeKind: "footer" },
        ),
      }),
    );

    assert.match(html, /pointer-events:none/);
    assert.match(html, /aria-hidden="true"/);
  });

  test("renders foreground chrome in z-index order", () => {
    const html = renderToStaticMarkup(
      createElement(SlideCanvasVNext, {
        slide: {
          ...slide([]),
          chrome: [
            textNode(
              "deck-chrome-pageNumber",
              { x: 90, y: 90, w: 6, h: 5 },
              {
                source: "deckChrome",
                chromeKind: "pageNumber",
                layout: { frame: { x: 90, y: 90, w: 6, h: 5 }, zIndex: 910 },
              },
            ),
            textNode(
              "deck-chrome-footer",
              { x: 10, y: 90, w: 80, h: 5 },
              {
                source: "deckChrome",
                chromeKind: "footer",
                layout: { frame: { x: 10, y: 90, w: 80, h: 5 }, zIndex: 900 },
              },
            ),
          ],
        },
      }),
    );

    assert.ok(
      html.indexOf("deck-chrome-footer") <
        html.indexOf("deck-chrome-pageNumber"),
    );
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

  test("renders active resize handles for selected unlocked nodes", () => {
    const selection = setSelection(createSelectionState("normal"), [
      "resizable",
    ]);
    const html = renderToStaticMarkup(
      createElement(SlideCanvasVNext, {
        slide: slide([
          textNode("resizable", { x: 10, y: 10, w: 30, h: 20 }),
          textNode(
            "locked-resizable",
            { x: 50, y: 10, w: 20, h: 10 },
            { locked: true },
          ),
        ]),
        selection,
        focusedNodeId: "resizable",
        onNodeClick: () => undefined,
        onResizeHandlePointerDown: () => undefined,
        activeResizeHandle: { nodeId: "resizable", handle: "se" },
      }),
    );

    assert.match(html, /data-resize-handle="nw"/);
    assert.match(html, /data-resize-handle="se"/);
    assert.doesNotMatch(html, /locked-resizable-resize-overlay/);
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

  test("renders supported background fill styles and deck canvas fallbacks", () => {
    const fills: ResolvedSlideRenderTree["background"]["fill"][] = [
      { type: "solid", color: "#ffffff" },
      {
        type: "linearGradient",
        from: "#111111",
        to: "#eeeeee",
        stops: [
          { color: "#111111", offsetPct: 0 },
          { color: "#eeeeee", offsetPct: 100 },
        ],
      },
      {
        type: "radialGradient",
        inner: "#111111",
        outer: "#eeeeee",
        cx: 45,
        cy: 55,
      },
      {
        type: "conicGradient",
        stops: [
          { color: "#111111", offsetPct: 0 },
          { color: "#eeeeee", offsetPct: 100 },
        ],
      },
      {
        type: "repeatingLinearGradient",
        angle: 45,
        stops: [
          { color: "#111111", offsetPct: 0 },
          { color: "#eeeeee", offsetPct: 20 },
        ],
      },
      {
        type: "pattern",
        kind: "grid",
        color: "#94a3b8",
        background: "#ffffff",
      },
      {
        type: "pattern",
        kind: "dots",
        color: "#94a3b8",
        background: "#ffffff",
      },
      {
        type: "pattern",
        kind: "scanlines",
        color: "#94a3b8",
        background: "#ffffff",
      },
      { type: "image", assetId: "bg", opacity: 0.4 },
    ];
    const html = fills
      .map((fill) =>
        renderToStaticMarkup(
          createElement(SlideCanvasVNext, {
            slide: {
              ...slide([]),
              background: { fill, decorationLevel: "expressive" },
            },
            canvas: { format: "custom", width: 0, height: 0, unit: "percent" },
            assetResolver: (assetId) => `https://example.com/${assetId}.png`,
            className: "custom-canvas",
          }),
        ),
      )
      .join("\n");
    const deckHtml = renderToStaticMarkup(
      createElement(DeckCanvasVNext, {
        deck: {
          canvas: {
            format: "16:9",
            width: 100,
            height: 56.25,
            unit: "percent",
          },
          theme: {
            tokens: {
              colors: {
                canvas: {
                  fill: "#fff",
                  text: "#111",
                  mutedText: "#666",
                },
                surface: {
                  fill: "#fff",
                  text: "#111",
                  mutedText: "#666",
                },
                accent: { fill: "#2563eb", text: "#fff" },
              },
              fonts: { heading: "Inter", body: "Inter" },
            },
            packageId: "test",
          },
          diagnostics: [],
          slides: [
            slide([textNode("deck-node", { x: 1, y: 1, w: 10, h: 10 })]),
          ],
        },
        activeSlideIndex: 0,
        onNodeClick: () => undefined,
        onNodePointerDown: () => undefined,
        onResizeHandlePointerDown: () => undefined,
        className: "deck-canvas",
      }),
    );
    const missingDeckHtml = renderToStaticMarkup(
      createElement(DeckCanvasVNext, {
        deck: {
          canvas: {
            format: "16:9",
            width: 100,
            height: 56.25,
            unit: "percent",
          },
          theme: {
            tokens: {
              colors: {
                canvas: {
                  fill: "#fff",
                  text: "#111",
                  mutedText: "#666",
                },
                surface: {
                  fill: "#fff",
                  text: "#111",
                  mutedText: "#666",
                },
                accent: { fill: "#2563eb", text: "#fff" },
              },
              fonts: { heading: "Inter", body: "Inter" },
            },
            packageId: "test",
          },
          diagnostics: [],
          slides: [],
        },
        activeSlideIndex: 4,
      }),
    );

    assert.match(html, /linear-gradient/);
    assert.match(html, /radial-gradient/);
    assert.match(html, /conic-gradient/);
    assert.match(html, /repeating-linear-gradient/);
    assert.match(html, /bg.png/);
    assert.match(deckHtml, /deck-canvas/);
    assert.equal(missingDeckHtml, "");
  });
});

describe("SlideNodeRenderer resolved node content branches", () => {
  test("converts fill, effect, stroke, radius, shadow, and blend styles to CSS", () => {
    const styles = [
      styleObjectToContainerCss({
        fill: { type: "solid", color: "#ffffff" },
        stroke: { color: "#111827", widthPt: 2, dash: "dotted" },
        radius: { allPt: 8 },
        shadow: { xPt: 1, yPt: 2, blurPt: 4, color: "#000000" },
        effect: { kind: "glass", intensity: "strong" },
        opacity: 0.8,
        clip: { enabled: true },
        blendMode: "multiply",
      }),
      styleObjectToContainerCss({
        fill: {
          type: "linearGradient",
          angle: 45,
          from: "#000000",
          to: "#ffffff",
          stops: [
            { color: "#111111", offsetPct: 0 },
            { color: "#eeeeee", offsetPct: 100 },
          ],
        },
        radius: {
          topLeftPt: 1,
          topRightPt: 2,
          bottomRightPt: 3,
          bottomLeftPt: 4,
        },
        effect: { kind: "blur", radiusPt: 3 },
      }),
      styleObjectToContainerCss({
        fill: {
          type: "radialGradient",
          inner: "#111111",
          outer: "#eeeeee",
          cx: 45,
          cy: 55,
          r: 60,
        },
        effect: { kind: "glow", color: "#4f46e5", blurPt: 6 },
      }),
      styleObjectToContainerCss({
        fill: {
          type: "conicGradient",
          fromAngle: 90,
          stops: [
            { color: "#f00", offsetPct: 0 },
            { color: "#00f", offsetPct: 100 },
          ],
        },
      }),
      styleObjectToContainerCss({
        fill: {
          type: "repeatingLinearGradient",
          angle: 135,
          stops: [
            { color: "#f8fafc", offsetPct: 0 },
            { color: "#cbd5e1", offsetPct: 20 },
          ],
        },
      }),
      styleObjectToContainerCss({
        fill: {
          type: "pattern",
          kind: "grid",
          color: "#94a3b8",
          background: "#ffffff",
        },
      }),
      styleObjectToContainerCss({
        fill: {
          type: "pattern",
          kind: "dots",
          color: "#94a3b8",
          background: "#ffffff",
        },
      }),
      styleObjectToContainerCss({
        fill: {
          type: "pattern",
          kind: "stripes",
          color: "#94a3b8",
          background: "#ffffff",
        },
      }),
      styleObjectToContainerCss(
        { fill: { type: "image", assetId: "bg", opacity: 0.5 } },
        (assetId) => `https://example.com/${assetId}.png`,
      ),
    ];

    assert.match(String(styles[0].border), /dotted/);
    assert.match(String(styles[1].background), /linear-gradient/);
    assert.match(String(styles[2].background), /radial-gradient/);
    assert.match(String(styles[3].background), /conic-gradient/);
    assert.match(String(styles[4].background), /repeating-linear-gradient/);
    assert.match(String(styles[5].backgroundImage), /linear-gradient/);
    assert.match(String(styles[6].backgroundImage), /radial-gradient/);
    assert.match(
      String(styles[7].backgroundImage),
      /repeating-linear-gradient/,
    );
    assert.match(String(styles[8].backgroundImage), /bg.png/);
  });

  test("renders text, shape, media, table, connector, visual, and group node content", () => {
    const richText = renderNode(
      "render-text",
      {
        type: "text",
        content: {
          paragraphs: [
            {
              id: "text-para",
              text: "rich text",
              list: { kind: "bullet", indent: 2 },
              runs: [
                {
                  text: "Docs",
                  bold: true,
                  italic: true,
                  underline: true,
                  strikethrough: true,
                  code: true,
                  link: "https://example.com",
                  localStyle: {
                    color: "#2563eb",
                    fontSizePt: 16,
                    fontFamily: "Inter",
                  },
                },
              ],
            },
          ],
        },
      },
      {
        text: {
          fontFamily: "Inter",
          fontSizePt: 14,
          weight: 600,
          italic: true,
          underline: true,
          color: "#111827",
          lineHeight: 1.2,
          align: "center",
          letterSpacingEm: 0.02,
          textTransform: "uppercase",
        },
      },
    );
    const shape = renderNode(
      "render-shape",
      {
        type: "shape",
        content: {
          shape: "path",
          path: "M 0 0 L 100 0 L 50 100 Z",
          text: { paragraphs: [{ id: "shape-label", text: "Shape label" }] },
        },
      },
      {
        fill: { type: "solid", color: "#dbeafe" },
        stroke: { color: "#2563eb", widthPt: 2 },
      },
    );
    const table = renderNode(
      "render-table",
      {
        type: "table",
        content: {
          columns: [
            { id: "metric", label: "Metric" },
            { id: "value", label: "Value" },
          ],
          rows: [
            {
              id: "row-1",
              cells: [
                { text: "Revenue" },
                { text: "42", runs: [{ text: "42", bold: true }] },
              ],
            },
            { id: "row-2", cells: [{ text: "Cost" }, { text: "12" }] },
          ],
          header: true,
        },
      },
      {
        table: {
          headerFill: { type: "solid", color: "#0f172a" },
          rowFill: { type: "solid", color: "#f8fafc" },
          alternateRowFill: { type: "solid", color: "#e0e7ff" },
          border: { color: "#cbd5e1", widthPt: 1 },
          cellPaddingPt: { top: 1, right: 2, bottom: 1, left: 2 },
        },
      },
    );
    const connector = renderNode(
      "render-connector",
      {
        type: "connector",
        content: {
          from: { kind: "node", nodeId: "a", anchor: "left" },
          to: { kind: "node", nodeId: "b", anchor: "bottom" },
          routing: "curved",
        },
      },
      {
        connector: {
          stroke: { color: "#334155", widthPt: 2, dash: "dashed" },
          startArrow: "filled",
          endArrow: "arrow",
        },
      },
    );
    const image = renderNode(
      "render-image",
      {
        type: "image",
        content: {
          assetId: "asset-image",
          alt: "Resolved image",
          fit: "contain",
          crop: { top: 5, right: 10, bottom: 15, left: 20 },
        },
      },
      { image: { brightness: 1.1, contrast: 0.9, saturation: 1.2 } },
    );
    const missingImage = renderNode("render-image-missing", {
      type: "image",
      content: { assetId: "missing-image", alt: "Missing image" },
    });
    const visual = renderNode("render-visual", {
      type: "visual",
      content: {
        assetId: "asset-visual",
        visualId: "chart-1",
        alt: "Resolved visual",
      },
    });
    const missingVisual = renderNode("render-visual-missing", {
      type: "visual",
      content: { visualId: "chart-2", alt: "Missing visual" },
    });
    const group = renderNode("render-group", { type: "group" });

    const html = [
      richText,
      shape,
      table,
      connector,
      image,
      missingImage,
      visual,
      missingVisual,
      group,
    ]
      .map((node) =>
        renderToStaticMarkup(
          createElement(SlideNodeRenderer, {
            node,
            selected: true,
            hovered: true,
            focused: true,
            interactive: true,
            tabIndex: 0,
            onClick: () => undefined,
            onDoubleClick: () => undefined,
            onPointerDown: () => undefined,
            onFocus: () => undefined,
            onHoverChange: () => undefined,
            assetResolver: (assetId) =>
              assetId.startsWith("missing")
                ? undefined
                : `https://example.com/${assetId}.png`,
          }),
        ),
      )
      .join("\n");

    assert.match(html, /href="https:\/\/example.com"/);
    assert.match(html, /Shape label/);
    assert.match(html, /Revenue/);
    assert.match(html, /connector-start-arrow-v7/);
    assert.match(html, /Resolved image/);
    assert.match(html, /Missing image/);
    assert.match(html, /Resolved visual/);
    assert.match(html, /Missing visual/);
    assert.match(html, /data-node-type="group"/);
  });
});
