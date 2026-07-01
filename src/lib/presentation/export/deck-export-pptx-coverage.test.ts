import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyBulletsOp,
  applyConnectorOp,
  applyDeckOp,
  applyImageOp,
  applyTextOp,
  exportDeckAsPPTX,
} from "./deck-export-pptx";
import type {
  DeckBulletsOp,
  DeckConnectorOp,
  DeckImageOp,
  DeckTextOp,
} from "./deck-export-spec";
import { currentDeck } from "../deck-schema.test-helpers";
import type { Deck } from "../deck-core";

interface RecordedTextCall {
  text: unknown;
  options: Record<string, unknown>;
}

interface RecordedShapeCall {
  shape: unknown;
  options: Record<string, unknown>;
}

interface RecordedImageCall {
  options: Record<string, unknown>;
}

function recordingSlide() {
  const textCalls: RecordedTextCall[] = [];
  const shapeCalls: RecordedShapeCall[] = [];
  const imageCalls: RecordedImageCall[] = [];
  const slide = {
    addText(text: unknown, options: Record<string, unknown>) {
      textCalls.push({ text, options });
    },
    addShape(shape: unknown, options: Record<string, unknown>) {
      shapeCalls.push({ shape, options });
    },
    addImage(options: Record<string, unknown>) {
      imageCalls.push({ options });
    },
  } as Parameters<typeof applyTextOp>[0];

  return { slide, textCalls, shapeCalls, imageCalls };
}

test("applyTextOp maps rich and plain text fallbacks into PPTX calls", () => {
  const { slide, textCalls } = recordingSlide();

  const rich: DeckTextOp = {
    kind: "text",
    text: "Hello\nWorld",
    runs: [
      {
        text: "Hello",
        bold: true,
        italic: true,
        underline: true,
        code: true,
        color: "#123456",
        link: "https://example.test",
      },
      { text: "\n" },
      { text: "World", fontSize: 18 },
    ],
    x: 1,
    y: 2,
    w: 3,
    h: 4,
    color: "111111",
    fontSize: 14,
    fontFace: "Inter",
    bold: false,
    italic: false,
    underline: true,
    align: "right",
    verticalAlign: "top",
    lineHeight: 1.25,
    paragraphSpacingPt: 6,
    fitMode: "shrink-to-fit",
    rotation: 15,
    shadow: true,
    opacity: 0.4,
  };
  applyTextOp(slide, rich);

  const plain: DeckTextOp = {
    ...rich,
    text: "Plain",
    runs: undefined,
    verticalAlign: "bottom",
    fitMode: undefined,
    rotation: undefined,
    shadow: undefined,
    opacity: undefined,
  };
  applyTextOp(slide, plain);

  assert.equal(textCalls.length, 2);
  const richRuns = textCalls[0]?.text as Array<{
    text: string;
    options: Record<string, unknown>;
  }>;
  assert.equal(richRuns[0]?.options.bold, true);
  assert.equal(richRuns[0]?.options.fontFace, "Courier New");
  assert.deepEqual(richRuns[0]?.options.hyperlink, {
    url: "https://example.test",
  });
  assert.equal(richRuns[1]?.options.breakLine, true);
  assert.equal(textCalls[0]?.options.valign, "top");
  assert.equal(textCalls[0]?.options.shrinkText, true);
  assert.equal(textCalls[0]?.options.rotate, 15);
  assert.equal(textCalls[0]?.options.transparency, 60);
  assert.equal(textCalls[1]?.text, "Plain");
  assert.equal(textCalls[1]?.options.valign, "bottom");
});

test("applyBulletsOp emits mixed rich runs and empty line fallbacks", () => {
  const { slide, textCalls } = recordingSlide();
  const op: DeckBulletsOp = {
    kind: "bullets",
    items: ["rich", "plain", "empty"],
    itemRuns: [[{ text: "rich", bold: true }], [], [{ text: "\n" }]],
    itemDetails: [
      { indent: 1, listType: "bullet" },
      { indent: 0, listType: "number" },
      { indent: 2, listType: "number" },
    ],
    x: 0,
    y: 0,
    w: 6,
    h: 3,
    color: "222222",
    fontSize: 12,
    fontFace: "Aptos",
    bold: false,
    italic: true,
    underline: true,
    align: "center",
    verticalAlign: "top",
    lineHeight: 1.1,
    fitMode: "shrink-to-fit",
    shadow: true,
    opacity: 0.25,
  };

  applyBulletsOp(slide, op);

  const runs = textCalls[0]?.text as Array<{
    text: string;
    options: Record<string, unknown>;
  }>;
  assert.equal(textCalls[0]?.options.valign, "top");
  assert.equal(textCalls[0]?.options.shrinkText, true);
  assert.equal(textCalls[0]?.options.transparency, 75);
  assert.deepEqual(runs[0]?.options.bullet, { type: "bullet" });
  assert.equal(runs[0]?.options.indentLevel, 1);
  assert.equal(runs[1]?.text, "plain");
  assert.deepEqual(runs[1]?.options.bullet, { type: "number" });
  assert.equal(runs[2]?.text, "");
});

test("applyImageOp uses native image insertion when raster fallback is unavailable", async () => {
  const { slide, imageCalls } = recordingSlide();
  const cropped: DeckImageOp = {
    kind: "image",
    src: "data:image/png;base64,abc",
    alt: "Cropped image",
    x: 1,
    y: 2,
    w: 3,
    h: 4,
    fitMode: "none",
    maskShape: "rounded",
    crop: { top: 0.1, right: 0.2, bottom: 0.1, left: 0.2 },
    radius: 0.25,
    rotation: 30,
    shadow: true,
    opacity: 0.5,
  };
  const cover: DeckImageOp = {
    ...cropped,
    src: "https://example.test/image.png",
    alt: undefined,
    fitMode: "cover",
    maskShape: undefined,
    crop: undefined,
    radius: undefined,
    rotation: undefined,
    shadow: undefined,
    opacity: undefined,
  };

  await applyImageOp(slide, cropped);
  await applyImageOp(slide, cover);

  assert.equal(imageCalls.length, 2);
  assert.equal(imageCalls[0]?.options.data, cropped.src);
  assert.equal(imageCalls[0]?.options.altText, "Cropped image");
  assert.equal(imageCalls[0]?.options.rotate, 30);
  assert.equal(imageCalls[0]?.options.transparency, 50);
  assert.equal(imageCalls[1]?.options.path, cover.src);
  assert.deepEqual(imageCalls[1]?.options.sizing, {
    type: "cover",
    w: cover.w,
    h: cover.h,
  });
});

test("applyConnectorOp and applyDeckOp cover zero-length and fallback dispatch paths", async () => {
  const { slide, textCalls, shapeCalls, imageCalls } = recordingSlide();
  const connector: DeckConnectorOp = {
    kind: "connector",
    x1: 1,
    y1: 1,
    x2: 4,
    y2: 5,
    color: "abcdef",
    width: 2,
    dash: true,
    arrowStart: "arrow",
    arrowEnd: "filled",
    opacity: 0.5,
  };

  applyConnectorOp(slide, { ...connector, x2: connector.x1, y2: connector.y1 });
  applyConnectorOp(slide, connector);
  await applyDeckOp(
    slide,
    {
      kind: "text",
      text: "via dispatch",
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      color: "111111",
      fontSize: 10,
      bold: false,
      italic: false,
      align: "left",
    },
    () => null,
  );
  await applyDeckOp(
    slide,
    {
      kind: "image",
      src: "https://example.test/dispatch.png",
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    },
    () => null,
  );
  await applyDeckOp(
    slide,
    {
      kind: "shape",
      shape: "rect",
      fill: {
        type: "linearGradient",
        from: "111111",
        to: "eeeeee",
        stops: [
          { color: "111111", offset: 0 },
          { color: "eeeeee", offset: 100 },
        ],
      },
      effect: { kind: "glass", intensity: "medium" },
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      color: "111111",
    },
    () => null,
  );
  await applyDeckOp(
    slide,
    {
      kind: "visual-fallback",
      visualId: "missing-visual",
      x: 0,
      y: 0,
      w: 2,
      h: 2,
    },
    () => null,
  );

  assert.equal(shapeCalls.length, 2);
  assert.equal(shapeCalls[0]?.shape, "line");
  assert.deepEqual(shapeCalls[0]?.options.line as Record<string, unknown>, {
    color: "abcdef",
    width: 2,
    dashType: "dash",
    endArrowType: "arrow",
    beginArrowType: "arrow",
    transparency: 50,
  });
  assert.equal(textCalls.at(-1)?.text, "via dispatch");
  assert.equal(shapeCalls.at(-1)?.shape, "rect");
  assert.equal(
    imageCalls.at(-1)?.options.path,
    "https://example.test/dispatch.png",
  );
});

test("exportDeckAsPPTX returns null when assembly rejects malformed deck input", async () => {
  const result = await exportDeckAsPPTX(
    { slides: null } as never,
    new Map(),
    () => null,
  );

  assert.equal(result, null);
});

test("exportDeckAsPPTX writes a Blob for a minimal current deck", async () => {
  const result = await exportDeckAsPPTX(
    currentDeck() as Deck,
    new Map(),
    () => null,
  );

  assert.equal(
    result?.type,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  );
  assert.ok((result?.size ?? 0) > 0);
});
