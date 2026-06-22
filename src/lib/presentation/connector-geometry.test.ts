import assert from "node:assert/strict";
import test from "node:test";

import type { ElementBox, ShapeElement, SlideElement } from "./deck";
import {
  anchorPoint,
  lineBoxFromEndpoints,
  lineEndpoints,
  resolveLineEndpoints,
  snapLineEndpoint,
} from "./connector-geometry";

function shape(
  id: string,
  box: ElementBox,
  overrides: Partial<ShapeElement> = {},
): ShapeElement {
  return {
    id,
    kind: "shape",
    shape: "rect",
    color: "#000000",
    zIndex: 0,
    box,
    ...overrides,
  };
}

const resolveBox = (element: SlideElement) => element.box;

test("anchorPoint returns named anchor positions", () => {
  const box = { x: 10, y: 20, w: 30, h: 40 };

  assert.deepEqual(anchorPoint(box, "center"), { x: 25, y: 40 });
  assert.deepEqual(anchorPoint(box, "top"), { x: 25, y: 20 });
  assert.deepEqual(anchorPoint(box, "bottom"), { x: 25, y: 60 });
  assert.deepEqual(anchorPoint(box, "left"), { x: 10, y: 40 });
  assert.deepEqual(anchorPoint(box, "right"), { x: 40, y: 40 });
});

test("lineEndpoints and lineBoxFromEndpoints round-trip an unrotated line", () => {
  const box = { x: 10, y: 20, w: 40, h: 2 };
  const endpoints = lineEndpoints(box, undefined, 16 / 9);

  assert.deepEqual(endpoints, {
    start: { x: 10, y: 21 },
    end: { x: 50, y: 21 },
  });
  assert.deepEqual(lineBoxFromEndpoints(endpoints.start, endpoints.end, 2, 16 / 9), {
    box,
  });
});

test("resolveLineEndpoints uses connector bindings when available", () => {
  const start = shape("start", { x: 10, y: 10, w: 20, h: 20 });
  const end = shape("end", { x: 70, y: 20, w: 20, h: 20 });
  const line = shape(
    "line",
    { x: 20, y: 30, w: 50, h: 2 },
    {
      shape: "line",
      connector: {
        start: { elementId: "start", anchor: "right" },
        end: { elementId: "end", anchor: "left" },
      },
    },
  );

  assert.deepEqual(resolveLineEndpoints(line, [start, end, line], resolveBox, 16 / 9), {
    start: { x: 30, y: 20 },
    end: { x: 70, y: 30 },
  });
});

test("snapLineEndpoint returns the closest eligible anchor binding", () => {
  const target = shape("target", { x: 20, y: 20, w: 20, h: 20 });
  const line = shape("line", { x: 0, y: 0, w: 10, h: 2 }, { shape: "line" });

  const snapped = snapLineEndpoint(
    { x: 39, y: 31 },
    line.id,
    [target, line],
    resolveBox,
    16 / 9,
  );

  assert.deepEqual(snapped, {
    point: { x: 40, y: 30 },
    binding: { elementId: "target", anchor: "right" },
  });
});
