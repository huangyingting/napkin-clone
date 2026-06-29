/**
 * v6 -> v7 migration utility tests.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { migrateV6ToDeckV7 } from "@/lib/presentation-vnext/migration-v6";
import { safeParseDeckV7 } from "@/lib/presentation-vnext/validation";

const MINIMAL_V6_DECK = {
  schemaVersion: 6,
  canvas: { format: "16:9" },
  design: { themeId: "clarity" },
  masters: [{ id: "master-1", name: "Default", elements: [] }],
  defaultMasterId: "master-1",
  slides: [
    {
      id: "slide-1",
      index: 0,
      title: "Hello World",
      elements: [
        {
          id: "el-1",
          kind: "title",
          role: "title",
          box: { x: 10, y: 20, w: 80, h: 15 },
          zIndex: 1,
          content: { text: "Welcome" },
        },
        {
          id: "el-2",
          kind: "text",
          role: "body",
          box: { x: 10, y: 40, w: 80, h: 40 },
          zIndex: 2,
          content: { text: "Subtitle text here" },
        },
      ],
    },
    {
      id: "slide-2",
      index: 1,
      title: "Image Slide",
      elements: [
        {
          id: "el-3",
          kind: "image",
          role: "image",
          box: { x: 20, y: 20, w: 60, h: 60 },
          zIndex: 1,
          content: { assetId: "img-abc" },
        },
      ],
    },
  ],
};

describe("migrateV6ToDeckV7", () => {
  test("produces a valid v7 deck from a v6 deck", () => {
    const { deck } = migrateV6ToDeckV7(MINIMAL_V6_DECK);
    const parseResult = safeParseDeckV7(deck);
    assert.ok(
      parseResult.success,
      `Migration output failed v7 parse: ${!parseResult.success && parseResult.errors.join(", ")}`,
    );
  });

  test("preserves slide count", () => {
    const { deck } = migrateV6ToDeckV7(MINIMAL_V6_DECK);
    assert.equal(deck.slides.length, 2);
  });

  test("preserves text content from v6 text elements", () => {
    const { deck } = migrateV6ToDeckV7(MINIMAL_V6_DECK);
    const slide1 = deck.slides[0];
    const titleNode = slide1.children.find(
      (c) => c.type === "text" && c.role === "title",
    );
    assert.ok(titleNode, "Expected a title text node");
    if (titleNode && titleNode.type === "text") {
      assert.equal(titleNode.content.paragraphs[0].text, "Welcome");
    }
  });

  test("maps themeId to packageId in theme binding", () => {
    const { deck } = migrateV6ToDeckV7(MINIMAL_V6_DECK);
    assert.equal(deck.theme.packageId, "clarity");
  });

  test("maps canvas format correctly", () => {
    const { deck } = migrateV6ToDeckV7(MINIMAL_V6_DECK);
    assert.equal(deck.canvas.format, "16:9");
    assert.equal(deck.canvas.unit, "percent");
  });

  test("produces a placeholder slide for empty v6 deck", () => {
    const emptyV6 = {
      ...MINIMAL_V6_DECK,
      slides: [],
    };
    const { deck, warnings } = migrateV6ToDeckV7(emptyV6);
    assert.ok(deck.slides.length >= 1);
    assert.ok(warnings.some((w) => /placeholder|No slides/.test(w)));
  });

  test("handles non-object input gracefully", () => {
    const { deck, warnings } = migrateV6ToDeckV7(null);
    assert.ok(deck.slides.length >= 1, "Should produce fallback deck");
    assert.ok(warnings.length >= 1);
  });

  test("warns when schemaVersion is not 6", () => {
    const weirdV6 = { ...MINIMAL_V6_DECK, schemaVersion: 5 };
    const { warnings } = migrateV6ToDeckV7(weirdV6);
    assert.ok(warnings.some((w) => /schemaVersion|version/.test(w)));
  });

  test("migrated deck does not contain v6-only fields", () => {
    const { deck } = migrateV6ToDeckV7(MINIMAL_V6_DECK);
    const deckRecord = deck as unknown as Record<string, unknown>;
    assert.equal(deckRecord.masters, undefined, "No masters field in v7");
    assert.equal(deckRecord.design, undefined, "No design field in v7");
    assert.equal(
      deckRecord.defaultMasterId,
      undefined,
      "No defaultMasterId in v7",
    );
  });

  test("migrated output passes strict v7 parse (no elements/masters/design)", () => {
    const { deck } = migrateV6ToDeckV7(MINIMAL_V6_DECK);
    const result = safeParseDeckV7(deck);
    assert.ok(
      result.success,
      !result.success ? result.errors.join("; ") : "passed",
    );
  });

  test("migrates 4:3 canvas format correctly", () => {
    const v6with4x3 = {
      ...MINIMAL_V6_DECK,
      canvas: { format: "4:3" },
    };
    const { deck } = migrateV6ToDeckV7(v6with4x3);
    assert.equal(deck.canvas.format, "4:3");
    assert.equal(deck.canvas.unit, "percent");
  });

  test("migrates square canvas format correctly", () => {
    const v6withSquare = {
      ...MINIMAL_V6_DECK,
      canvas: { format: "square" },
    };
    const { deck } = migrateV6ToDeckV7(v6withSquare);
    assert.equal(deck.canvas.format, "square");
  });

  test("unknown canvas format defaults to 16:9", () => {
    const v6withCustom = {
      ...MINIMAL_V6_DECK,
      canvas: { format: "widescreen" },
    };
    const { deck } = migrateV6ToDeckV7(v6withCustom);
    assert.equal(deck.canvas.format, "16:9");
  });

  test("migrates element with rotation and locked fields", () => {
    const v6withRotation = {
      ...MINIMAL_V6_DECK,
      slides: [
        {
          id: "slide-rot",
          index: 0,
          title: "Rotated",
          elements: [
            {
              id: "el-rot",
              kind: "text",
              role: "title",
              box: { x: 10, y: 10, w: 80, h: 20 },
              zIndex: 1,
              rotation: 45,
              locked: true,
              content: { text: "Tilted" },
            },
          ],
        },
      ],
    };
    const { deck } = migrateV6ToDeckV7(v6withRotation);
    const node = deck.slides[0].children[0];
    assert.equal((node.layout as any)?.rotation, 45);
  });

  test("migrates image element to image node", () => {
    const v6withImage = {
      ...MINIMAL_V6_DECK,
      slides: [
        {
          id: "slide-img",
          index: 0,
          title: "Image Slide",
          elements: [
            {
              id: "el-img",
              kind: "image",
              role: "image",
              box: { x: 10, y: 10, w: 80, h: 60 },
              zIndex: 1,
              content: { assetId: "img-abc" },
            },
          ],
        },
      ],
    };
    const { deck } = migrateV6ToDeckV7(v6withImage);
    const imgNode = deck.slides[0].children[0];
    assert.equal(imgNode.type, "image");
  });

  test("migrates visual element to visual node", () => {
    const v6withVisual = {
      ...MINIMAL_V6_DECK,
      slides: [
        {
          id: "slide-vis",
          index: 0,
          title: "Visual",
          elements: [
            {
              id: "el-vis",
              kind: "visual",
              role: "visual",
              box: { x: 10, y: 10, w: 80, h: 60 },
              zIndex: 1,
              content: { visualId: "chart-001" },
            },
          ],
        },
      ],
    };
    const { deck } = migrateV6ToDeckV7(v6withVisual);
    const visNode = deck.slides[0].children[0];
    assert.equal(visNode.type, "visual");
  });

  test("migrates connector element to connector node", () => {
    const v6withConnector = {
      ...MINIMAL_V6_DECK,
      slides: [
        {
          id: "slide-conn",
          index: 0,
          title: "Connector",
          elements: [
            {
              id: "el-conn",
              kind: "connector",
              role: "connector",
              box: { x: 10, y: 30, w: 60, h: 0 },
              zIndex: 1,
              content: {},
            },
          ],
        },
      ],
    };
    const { deck } = migrateV6ToDeckV7(v6withConnector);
    const connNode = deck.slides[0].children[0];
    assert.equal(connNode.type, "connector");
  });

  test("migrates various roles to correct style refs", () => {
    const v6withRoles = {
      ...MINIMAL_V6_DECK,
      slides: [
        {
          id: "slide-roles",
          index: 0,
          title: "Roles",
          elements: [
            {
              id: "e1",
              kind: "text",
              role: "kicker",
              box: {},
              zIndex: 1,
              content: { text: "Kicker" },
            },
            {
              id: "e2",
              kind: "text",
              role: "caption",
              box: {},
              zIndex: 2,
              content: { text: "Cap" },
            },
            {
              id: "e3",
              kind: "text",
              role: "quote",
              box: {},
              zIndex: 3,
              content: { text: "Quote" },
            },
            {
              id: "e4",
              kind: "text",
              role: "metric",
              box: {},
              zIndex: 4,
              content: { text: "42" },
            },
            {
              id: "e5",
              kind: "shape",
              role: "callout",
              box: {},
              zIndex: 5,
              content: {},
            },
          ],
        },
      ],
    };
    const { deck } = migrateV6ToDeckV7(v6withRoles);
    const slide = deck.slides[0];
    assert.equal(slide.children.length, 5);
    const kickerNode = slide.children[0];
    assert.equal((kickerNode.style as any)?.ref, "text.kicker");
  });

  test("migrates element without box using defaults", () => {
    const v6noBox = {
      ...MINIMAL_V6_DECK,
      slides: [
        {
          id: "slide-nobox",
          index: 0,
          title: "No Box",
          elements: [
            {
              id: "el-nobox",
              kind: "text",
              role: "body",
              zIndex: 1,
              content: { text: "Fallback" },
            },
          ],
        },
      ],
    };
    const { deck } = migrateV6ToDeckV7(v6noBox);
    const node = deck.slides[0].children[0];
    const w = node.layout?.frame?.w;
    assert.ok(typeof w === "number" && w > 0, "Expected default frame width");
  });
});
