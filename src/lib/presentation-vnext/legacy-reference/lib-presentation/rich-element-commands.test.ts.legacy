import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck, SlideElement } from "./deck";
import { safeParseDeck } from "./deck-schema";
import { executeCommand } from "./slide-commands";

/**
 * Command-coverage + field-preservation guarantees for the rich media / visual
 * / connector editing workflows (#645).
 *
 * Image, visual, and connector edits route through v6 content/design commands
 * (crop/alt/replace/routing for content; fit/mask/restyle/arrows/stroke for
 * design overrides). These tests assert the command updates the intended v6
 * field while preserving unrelated element fields.
 */

function deckWith(element: SlideElement): Deck {
  return {
    schemaVersion: 6,
    canvas: { format: "16:9" },
    design: { themeId: "default" },
    masters: [{ id: "master-default", name: "Default", elements: [] }],
    defaultMasterId: "master-default",
    slides: [
      {
        id: "s1",
        index: 0,
        title: "",
        notes: "",
        elements: [element],
      },
    ],
  } as unknown as Deck;
}

function elementFromResult(deck: Deck): SlideElement {
  const el = deck.slides[0]!.elements?.find((e) => e.id === "e1");
  assert.ok(el, "element survives the patch");
  return el!;
}

function patchedContent(
  deck: Deck,
  content: Record<string, unknown>,
): SlideElement {
  const result = executeCommand(deck, {
    type: "UPDATE_ELEMENT_CONTENT",
    slideId: "s1",
    elementId: "e1",
    content,
  });
  assert.equal(result.ok, true);
  assert.equal(result.patches[0]!.op, "element.update_content");
  const parsed = safeParseDeck(result.deck);
  assert.equal(parsed.success, true, parsed.success ? undefined : parsed.error);
  return elementFromResult(result.deck);
}

function patchedDesign(
  deck: Deck,
  designOverrides: Record<string, unknown>,
): SlideElement {
  const result = executeCommand(deck, {
    type: "UPDATE_ELEMENT_DESIGN_OVERRIDES",
    slideId: "s1",
    elementId: "e1",
    designOverrides,
  });
  assert.equal(result.ok, true);
  assert.equal(result.patches[0]!.op, "element.update_design_overrides");
  const parsed = safeParseDeck(result.deck);
  assert.equal(parsed.success, true, parsed.success ? undefined : parsed.error);
  return elementFromResult(result.deck);
}

const imageEl = {
  id: "e1",
  kind: "image",
  role: "image",
  content: {
    kind: "image",
    src: "data:image/png;base64,AAAA",
    alt: "A diagram",
    crop: { top: 0.05, right: 0.05, bottom: 0.05, left: 0.05 },
  },
  designOverrides: { fitMode: "cover", maskShape: "circle" },
  box: { x: 10, y: 10, w: 30, h: 30 },
  zIndex: 2,
} as unknown as SlideElement;

test("image: cropping preserves src, alt, fit, and mask", () => {
  const current = (imageEl as any).content;
  const el = patchedContent(deckWith(imageEl), {
    ...current,
    crop: { top: 0.2, right: 0, bottom: 0.2, left: 0 },
  });
  assert.deepEqual((el as any).content.crop, {
    top: 0.2,
    right: 0,
    bottom: 0.2,
    left: 0,
  });
  assert.equal((el as any).content.src, current.src);
  assert.equal((el as any).content.alt, "A diagram");
  assert.deepEqual((el as any).designOverrides, {
    fitMode: "cover",
    maskShape: "circle",
  });
});

test("image: changing fit preserves crop, alt, and src", () => {
  const el = patchedDesign(deckWith(imageEl), {
    ...(imageEl as any).designOverrides,
    fitMode: "contain",
  });
  assert.equal((el as any).designOverrides.fitMode, "contain");
  assert.deepEqual((el as any).content, (imageEl as any).content);
});

test("image: replacing src + alt preserves crop, fit, and mask", () => {
  const el = patchedContent(deckWith(imageEl), {
    ...(imageEl as any).content,
    src: "data:image/png;base64,BBBB",
    alt: "Replaced",
  });
  assert.equal((el as any).content.src, "data:image/png;base64,BBBB");
  assert.equal((el as any).content.alt, "Replaced");
  assert.deepEqual((el as any).content.crop, (imageEl as any).content.crop);
  assert.deepEqual(
    (el as any).designOverrides,
    (imageEl as any).designOverrides,
  );
});

const visualEl = {
  id: "e1",
  kind: "visual",
  role: "visual",
  content: { kind: "visual", visualId: "v-original", alt: "Flow" },
  designOverrides: { styleThemeId: "ocean" },
  box: { x: 0, y: 0, w: 50, h: 50 },
  zIndex: 1,
} as unknown as SlideElement;

test("visual: replacing visualId preserves restyle, alt, and box", () => {
  const el = patchedContent(deckWith(visualEl), {
    ...(visualEl as any).content,
    visualId: "v-replacement",
  });
  assert.equal((el as any).content.visualId, "v-replacement");
  assert.equal((el as any).designOverrides.styleThemeId, "ocean");
  assert.equal((el as any).content.alt, "Flow");
  assert.deepEqual(el.box, visualEl.box);
});

test("visual: restyling preserves visualId and box", () => {
  const el = patchedDesign(deckWith(visualEl), {
    ...(visualEl as any).designOverrides,
    styleThemeId: "sunset",
  });
  assert.equal((el as any).designOverrides.styleThemeId, "sunset");
  assert.equal((el as any).content.visualId, "v-original");
  assert.deepEqual(el.box, visualEl.box);
});

const connectorEl = {
  id: "e1",
  kind: "connector",
  role: "label",
  content: {
    kind: "connector",
    start: { x: 10, y: 10 },
    end: { x: 80, y: 60 },
    routing: "straight",
  },
  designOverrides: {
    stroke: { color: "#123456", width: 0.8 },
    arrowStart: "none",
    arrowEnd: "filled",
    dash: true,
  },
  box: { x: 10, y: 10, w: 70, h: 50 },
  zIndex: 3,
} as unknown as SlideElement;

test("connector: switching to elbow routing preserves stroke, arrows, dash, endpoints", () => {
  const el = patchedContent(deckWith(connectorEl), {
    ...(connectorEl as any).content,
    routing: "elbow",
  });
  assert.equal((el as any).content.routing, "elbow");
  assert.deepEqual((el as any).designOverrides.stroke, {
    color: "#123456",
    width: 0.8,
  });
  assert.equal((el as any).designOverrides.arrowStart, "none");
  assert.equal((el as any).designOverrides.arrowEnd, "filled");
  assert.equal((el as any).designOverrides.dash, true);
  assert.deepEqual((el as any).content.start, { x: 10, y: 10 });
  assert.deepEqual((el as any).content.end, { x: 80, y: 60 });
});

test("connector: changing arrowhead preserves routing and stroke", () => {
  const el = patchedDesign(deckWith(connectorEl), {
    ...(connectorEl as any).designOverrides,
    arrowEnd: "arrow",
  });
  assert.equal((el as any).designOverrides.arrowEnd, "arrow");
  assert.equal((el as any).content.routing, "straight");
  assert.deepEqual((el as any).designOverrides.stroke, {
    color: "#123456",
    width: 0.8,
  });
});

test("connector: changing stroke preserves routing and arrowheads", () => {
  const el = patchedDesign(deckWith(connectorEl), {
    ...(connectorEl as any).designOverrides,
    stroke: { color: "#abcdef", width: 1.5 },
  });
  assert.deepEqual((el as any).designOverrides.stroke, {
    color: "#abcdef",
    width: 1.5,
  });
  assert.equal((el as any).content.routing, "straight");
  assert.equal((el as any).designOverrides.arrowEnd, "filled");
});
