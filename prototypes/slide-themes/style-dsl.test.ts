import assert from "node:assert/strict";
import test from "node:test";

import { boxFromStyle, parseBackground, shapeFromStyle } from "./style-dsl";

test("boxFromStyle converts CSS-like lengths to slide percent boxes", () => {
  assert.deepEqual(
    boxFromStyle({ left: "8%", top: "12%", width: "84%", height: "11%" }),
    { x: 8, y: 12, w: 84, h: 11 },
  );
});

test("parseBackground compiles tokenized radial gradients", () => {
  assert.deepEqual(
    parseBackground(
      "radial-gradient(78% 78% at 35% 20%, var(--surface), var(--slideBg))",
    ),
    {
      type: "radialGradient",
      inner: { token: "surface" },
      outer: { token: "slideBg" },
      r: 78,
      cx: 35,
      cy: 20,
    },
  );
});

test("shapeFromStyle compiles glass panel declarations to v6 design overrides", () => {
  const element = shapeFromStyle({
    zIndex: 8,
    shape: "rect",
    box: { x: 8, y: 30, w: 26, h: 46 },
    style: {
      background:
        "radial-gradient(78% 78% at 35% 20%, #ffffff, var(--slideBg))",
      border: "0.18cqmin solid #ffffff",
      borderRadius: "12cqmin",
      backdropFilter: "glass(medium)",
    },
  }) as { designOverrides?: unknown };

  assert.deepEqual(element.designOverrides, {
    fill: {
      type: "radialGradient",
      inner: { value: "#ffffff" },
      outer: { token: "slideBg" },
      r: 78,
      cx: 35,
      cy: 20,
    },
    stroke: { color: "#ffffff", width: 0.18 },
    radius: 12,
    effect: { kind: "glass", intensity: "medium" },
  });
});

test("style parser rejects unsupported passthrough CSS values", () => {
  assert.throws(
    () => parseBackground("repeating-linear-gradient(#fff, #000)"),
    /Unsupported color value/,
  );
  assert.throws(
    () =>
      shapeFromStyle({
        zIndex: 8,
        shape: "rect",
        box: { x: 0, y: 0, w: 10, h: 10 },
        style: { borderRadius: "12px" },
      }),
    /borderRadius only supports/,
  );
  assert.throws(
    () =>
      shapeFromStyle({
        zIndex: 8,
        shape: "rect",
        box: { x: 0, y: 0, w: 10, h: 10 },
        style: { backdropFilter: "blur(8px)" },
      }),
    /backdropFilter only supports/,
  );
});
