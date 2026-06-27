import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CURRENT_DECK_SCHEMA_VERSION,
  type Deck,
  type SlideElement,
} from "./deck";
import { resolveSlideRenderModel } from "./slide-render-model";

function shapeElement(
  id: string,
  zIndex: number,
  layer?: "background" | "foreground",
): SlideElement {
  return {
    id,
    kind: "shape",
    role: layer === "background" ? "background" : "label",
    box: { x: 0, y: 0, w: 10, h: 10 },
    zIndex,
    ...(layer ? { layer, locked: true } : {}),
    content: { kind: "shape", shape: "rect" },
    designOverrides: { fill: { value: "#123456" } },
  } as unknown as SlideElement;
}

function deck(): Deck {
  return {
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    canvas: { format: "16:9" },
    design: { themeId: "indigo" },
    defaultMasterId: "master-default",
    masters: [
      {
        id: "master-default",
        name: "Default",
        background: { type: "solid", color: { value: "#eeeeee" } },
        elements: [
          shapeElement("master-fg", 2, "foreground"),
          shapeElement("master-bg", 1, "background"),
        ],
      },
    ],
    slides: [
      {
        id: "slide-1",
        index: 0,
        title: "Slide",
        designOverrides: {
          background: { type: "solid", color: { value: "#ffffff" } },
        },
        elements: [shapeElement("slide-el", 0)],
      },
    ],
  } as unknown as Deck;
}

test("resolveSlideRenderModel includes master layers around slide elements", () => {
  const d = deck();
  const model = resolveSlideRenderModel(d, d.slides[0]!);

  assert.equal(model.master?.id, "master-default");
  assert.equal(model.background.type, "solid");
  if (model.background.type === "solid") {
    assert.equal(model.background.color, "#ffffff");
  }
  assert.deepEqual(
    model.masterBackgroundElements.map((element) => element.id),
    ["master-bg"],
  );
  assert.deepEqual(
    model.slideElements.map((element) => element.id),
    ["slide-el"],
  );
  assert.deepEqual(
    model.masterForegroundElements.map((element) => element.id),
    ["master-fg"],
  );
});
