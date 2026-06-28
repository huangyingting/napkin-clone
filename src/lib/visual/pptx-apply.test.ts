import assert from "node:assert/strict";
import { test } from "node:test";

import { applySpecsToSlide } from "@/lib/visual/pptx-apply";
import type { PptxSpec } from "@/lib/visual/pptx-shapes";

function recordingSlide() {
  const calls = {
    shapes: [] as Array<{ shape: unknown; options: unknown }>,
    texts: [] as Array<{ text: string; options: unknown }>,
  };
  return {
    calls,
    slide: {
      addShape(shape: unknown, options: unknown) {
        calls.shapes.push({ shape, options });
      },
      addText(text: string, options: unknown) {
        calls.texts.push({ text, options });
      },
    },
  };
}

test("applySpecsToSlide applies diamond specs as native shapes", () => {
  const { calls, slide } = recordingSlide();
  const specs: PptxSpec[] = [
    {
      kind: "diamond",
      x: 1,
      y: 2,
      w: 3,
      h: 4,
      fill: "FFAA00",
      stroke: "111111",
      strokeWidth: 2,
    },
  ];

  applySpecsToSlide(slide as never, specs);

  assert.deepEqual(calls.shapes, [
    {
      shape: "diamond",
      options: {
        x: 1,
        y: 2,
        w: 3,
        h: 4,
        fill: { color: "FFAA00" },
        line: { color: "111111", width: 2 },
      },
    },
  ]);
});

test("applySpecsToSlide applies text geometry and defaults", () => {
  const { calls, slide } = recordingSlide();
  const specs: PptxSpec[] = [
    {
      kind: "text",
      text: "Hello",
      x: 1,
      y: 2,
      w: 3,
      h: 4,
      color: "222222",
      fontSize: 18,
      fontFace: "Aptos",
    },
  ];

  applySpecsToSlide(slide as never, specs);

  assert.deepEqual(calls.texts, [
    {
      text: "Hello",
      options: {
        x: 1,
        y: 2,
        w: 3,
        h: 4,
        color: "222222",
        fontSize: 18,
        bold: false,
        align: "center",
        valign: "middle",
        fontFace: "Aptos",
        wrap: true,
      },
    },
  ]);
});

test("applySpecsToSlide applies negative dashed arrow lines with flips", () => {
  const { calls, slide } = recordingSlide();
  const specs: PptxSpec[] = [
    {
      kind: "line",
      x1: 4,
      y1: 5,
      x2: 1,
      y2: 2,
      color: "334455",
      strokeWidth: 1.5,
      dashed: true,
      arrowEnd: true,
    },
  ];

  applySpecsToSlide(slide as never, specs);

  assert.deepEqual(calls.shapes, [
    {
      shape: "line",
      options: {
        x: 4,
        y: 5,
        w: -3,
        h: -3,
        line: {
          color: "334455",
          width: 1.5,
          dashType: "dash",
          endArrowType: "triangle",
        },
        flipH: true,
        flipV: true,
      },
    },
  ]);
});
