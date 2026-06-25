import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  ConnectorElement,
  Deck,
  ImageElement,
  SlideElement,
  VisualElement,
} from "./deck";
import { executeCommand } from "./slide-commands";

/**
 * Command-coverage + field-preservation guarantees for the rich media / visual
 * / connector editing workflows (#645).
 *
 * Image, visual, and connector edits ride on the generic `UPDATE_ELEMENT`
 * command (crop/fit/mask/alt/replace for images; replace/restyle for visuals;
 * routing/arrowheads/stroke for connectors). These tests assert the command is
 * a non-destructive merge: the patched field changes while every unrelated
 * field on the element is preserved.
 */

function deckWith(element: SlideElement): Deck {
  return {
    theme: "default",
    slides: [
      {
        id: "s1",
        index: 0,
        title: "",
        bullets: [],
        visualIds: [],
        layout: "blank",
        notes: "",
        theme: "default",
        elements: [element],
        elementsDerived: false,
      },
    ],
  };
}

function patched(deck: Deck, patch: Partial<SlideElement>): SlideElement {
  const result = executeCommand(deck, {
    type: "UPDATE_ELEMENT",
    slideId: "s1",
    elementId: "e1",
    patch: patch as never,
  });
  assert.equal(result.ok, true);
  const el = result.deck.slides[0]!.elements?.find((e) => e.id === "e1");
  assert.ok(el, "element survives the patch");
  return el!;
}

const imageEl: ImageElement = {
  id: "e1",
  kind: "image",
  src: "data:image/png;base64,AAAA",
  alt: "A diagram",
  fitMode: "cover",
  maskShape: "circle",
  crop: { top: 5, right: 5, bottom: 5, left: 5 },
  box: { x: 10, y: 10, w: 30, h: 30 },
  zIndex: 2,
};

test("image: cropping preserves src, alt, fit, and mask", () => {
  const el = patched(deckWith(imageEl), {
    crop: { top: 20, right: 0, bottom: 20, left: 0 },
  }) as ImageElement;
  assert.deepEqual(el.crop, { top: 20, right: 0, bottom: 20, left: 0 });
  assert.equal(el.src, imageEl.src);
  assert.equal(el.alt, "A diagram");
  assert.equal(el.fitMode, "cover");
  assert.equal(el.maskShape, "circle");
});

test("image: changing fit preserves crop, alt, and src", () => {
  const el = patched(deckWith(imageEl), { fitMode: "contain" }) as ImageElement;
  assert.equal(el.fitMode, "contain");
  assert.deepEqual(el.crop, imageEl.crop);
  assert.equal(el.alt, "A diagram");
  assert.equal(el.src, imageEl.src);
});

test("image: replacing src + alt preserves crop, fit, and mask", () => {
  const el = patched(deckWith(imageEl), {
    src: "data:image/png;base64,BBBB",
    alt: "Replaced",
  }) as ImageElement;
  assert.equal(el.src, "data:image/png;base64,BBBB");
  assert.equal(el.alt, "Replaced");
  assert.deepEqual(el.crop, imageEl.crop);
  assert.equal(el.fitMode, "cover");
  assert.equal(el.maskShape, "circle");
});

const visualEl: VisualElement = {
  id: "e1",
  kind: "visual",
  visualId: "v-original",
  styleThemeId: "ocean",
  alt: "Flow",
  box: { x: 0, y: 0, w: 50, h: 50 },
  zIndex: 1,
};

test("visual: replacing visualId preserves restyle, alt, and box", () => {
  const el = patched(deckWith(visualEl), {
    visualId: "v-replacement",
  }) as VisualElement;
  assert.equal(el.visualId, "v-replacement");
  assert.equal(el.styleThemeId, "ocean");
  assert.equal(el.alt, "Flow");
  assert.deepEqual(el.box, visualEl.box);
});

test("visual: restyling preserves visualId and box", () => {
  const el = patched(deckWith(visualEl), {
    styleThemeId: "sunset",
  }) as VisualElement;
  assert.equal(el.styleThemeId, "sunset");
  assert.equal(el.visualId, "v-original");
  assert.deepEqual(el.box, visualEl.box);
});

const connectorEl: ConnectorElement = {
  id: "e1",
  kind: "connector",
  start: { x: 10, y: 10 },
  end: { x: 80, y: 60 },
  stroke: { color: "#123456", width: 0.8 },
  arrowStart: "none",
  arrowEnd: "filled",
  dash: true,
  routing: "straight",
  box: { x: 10, y: 10, w: 70, h: 50 },
  zIndex: 3,
};

test("connector: switching to elbow routing preserves stroke, arrows, dash, endpoints", () => {
  const el = patched(deckWith(connectorEl), {
    routing: "elbow",
  }) as ConnectorElement;
  assert.equal(el.routing, "elbow");
  assert.deepEqual(el.stroke, { color: "#123456", width: 0.8 });
  assert.equal(el.arrowStart, "none");
  assert.equal(el.arrowEnd, "filled");
  assert.equal(el.dash, true);
  assert.deepEqual(el.start, { x: 10, y: 10 });
  assert.deepEqual(el.end, { x: 80, y: 60 });
});

test("connector: changing arrowhead preserves routing and stroke", () => {
  const el = patched(deckWith(connectorEl), {
    arrowEnd: "arrow",
  }) as ConnectorElement;
  assert.equal(el.arrowEnd, "arrow");
  assert.equal(el.routing, "straight");
  assert.deepEqual(el.stroke, { color: "#123456", width: 0.8 });
});

test("connector: changing stroke preserves routing and arrowheads", () => {
  const el = patched(deckWith(connectorEl), {
    stroke: { color: "#abcdef", width: 1.5 },
  }) as ConnectorElement;
  assert.deepEqual(el.stroke, { color: "#abcdef", width: 1.5 });
  assert.equal(el.routing, "straight");
  assert.equal(el.arrowEnd, "filled");
});
