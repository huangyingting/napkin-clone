import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SlideCanvasVNext } from "./slide-canvas";
import { createSelectionState, setSelection } from "./selection-model";
import type {
  ResolvedRenderNode,
  ResolvedSlideRenderTree,
} from "@/lib/presentation-vnext/render-tree";

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
});
