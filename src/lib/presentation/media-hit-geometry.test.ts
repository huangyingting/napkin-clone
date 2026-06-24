import assert from "node:assert/strict";
import { test } from "node:test";

import type { ElementBox, SlideElement } from "./deck";
import { buildMediaHitGeometry } from "./media-hit-geometry";
import type { Visual } from "@/lib/visual/schema";

function box(x: number, y: number, w: number, h: number): ElementBox {
  return { x, y, w, h };
}

function visualElement(
  id: string,
  visualId: string,
  elementBox: ElementBox,
): SlideElement {
  return {
    id,
    kind: "visual",
    visualId,
    zIndex: 1,
    box: elementBox,
  };
}

function baseVisual(overrides: Partial<Visual> = {}): Visual {
  return {
    version: 1,
    type: "flowchart",
    width: 200,
    height: 100,
    nodes: [],
    edges: [],
    style: {
      palette: [],
      background: "#ffffff",
      nodeFill: "#ffffff",
      nodeStroke: "#000000",
      nodeText: "#000000",
      edgeColor: "#000000",
      fontFamily: "sans-serif",
      fontSize: 14,
      fontWeight: 600,
    },
    ...overrides,
  };
}

test("buildMediaHitGeometry maps visual node bounds into element percent regions", () => {
  const element = visualElement("visual-1", "v1", box(10, 20, 40, 20));
  const visual = baseVisual({
    nodes: [{ id: "n1", label: "Node", x: 100, y: 50, width: 50, height: 20 }],
  });

  const geometry = buildMediaHitGeometry({
    elements: [element],
    fittedBoxes: new Map([[element.id, element.box]]),
    visuals: new Map([["v1", visual]]),
  });

  assert.deepEqual(geometry.get("visual-1")?.regions, [
    { x: 25, y: 28, w: 10, h: 4 },
  ]);
});

test("buildMediaHitGeometry skips visuals without positioned nodes", () => {
  const element = visualElement("visual-1", "v1", box(10, 20, 40, 20));
  const visual = baseVisual({
    nodes: [{ id: "n1", label: "Node" }],
  });

  const geometry = buildMediaHitGeometry({
    elements: [element],
    fittedBoxes: new Map([[element.id, element.box]]),
    visuals: new Map([["v1", visual]]),
  });

  assert.equal(geometry.has("visual-1"), false);
});

test("buildMediaHitGeometry leaves images on box fallback until alpha geometry is supplied", () => {
  const image: SlideElement = {
    id: "image-1",
    kind: "image",
    src: "/image.png",
    zIndex: 1,
    box: box(0, 0, 50, 50),
  };

  const geometry = buildMediaHitGeometry({
    elements: [image],
    fittedBoxes: new Map([[image.id, image.box]]),
    visuals: new Map(),
  });

  assert.equal(geometry.size, 0);
});
