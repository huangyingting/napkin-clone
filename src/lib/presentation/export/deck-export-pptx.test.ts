import assert from "node:assert/strict";
import { test } from "node:test";

import { applyBulletsOp, applyShapeOp } from "./deck-export-pptx";
import type { DeckBulletsOp, DeckShapeOp } from "./deck-export-spec";

interface TextCall {
  text: unknown;
  options: Record<string, unknown>;
}

interface ShapeCall {
  shape: unknown;
  options: {
    fill?: { transparency?: number };
    line?: { dashType?: string; transparency?: number };
    shadow?: unknown;
    [key: string]: unknown;
  };
}

function recordingSlide() {
  const textCalls: TextCall[] = [];
  const shapeCalls: ShapeCall[] = [];
  const slide = {
    addText(text: unknown, options: Record<string, unknown>) {
      textCalls.push({ text, options });
    },
    addShape(shape: unknown, options: ShapeCall["options"]) {
      shapeCalls.push({ shape, options });
    },
  } as Parameters<typeof applyShapeOp>[0];
  return { slide, textCalls, shapeCalls };
}

test("applyShapeOp maps all shape variants to meaningful PPTX calls", () => {
  const { slide, shapeCalls, textCalls } = recordingSlide();
  const base = {
    kind: "shape",
    x: 1,
    y: 2,
    w: 3,
    h: 4,
    color: "112233",
  } satisfies Omit<DeckShapeOp, "shape">;

  applyShapeOp(slide, {
    ...base,
    shape: "line",
    stroke: { color: "445566", width: 2, dash: true },
    opacity: 0.6,
  });
  applyShapeOp(slide, {
    ...base,
    shape: "triangle",
    rotation: 15,
    shadow: true,
    opacity: 0.25,
  });
  applyShapeOp(slide, { ...base, shape: "ellipse" });
  applyShapeOp(slide, {
    ...base,
    shape: "rect",
    radius: 0.2,
    stroke: { color: "778899", width: 1 },
    text: "Label",
    textRuns: [{ text: "Label", bold: true }],
  });

  assert.deepEqual(
    shapeCalls.map((call) => call.shape),
    ["line", "triangle", "ellipse", "roundRect"],
  );
  assert.equal(shapeCalls[0]?.options.line?.dashType, "dash");
  assert.equal(shapeCalls[0]?.options.line?.transparency, 40);
  assert.equal(shapeCalls[1]?.options.fill?.transparency, 75);
  assert.equal(shapeCalls[3]?.options.rectRadius, 0.2);
  assert.equal(textCalls.length, 1);
});

test("applyBulletsOp emits paragraph options for plain bullet rows", () => {
  const { slide, textCalls } = recordingSlide();
  const op: DeckBulletsOp = {
    kind: "bullets",
    items: ["plain", "numbered"],
    itemDetails: [
      { listType: "bullet", indent: 0 },
      { listType: "number", indent: 1 },
    ],
    x: 0,
    y: 0,
    w: 4,
    h: 2,
    color: "111111",
    fontSize: 12,
    bold: false,
    italic: false,
    align: "left",
    verticalAlign: "bottom",
  };

  applyBulletsOp(slide, op);

  assert.equal(textCalls[0]?.options.valign, "bottom");
  assert.deepEqual((textCalls[0]?.text as any[])[0].options.bullet, true);
  assert.deepEqual((textCalls[0]?.text as any[])[1].options.bullet, {
    type: "number",
  });
});
