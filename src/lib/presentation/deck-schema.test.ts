import assert from "node:assert/strict";
import { test } from "node:test";

import { CURRENT_DECK_SCHEMA_VERSION } from "./deck";
import { safeParseDeck } from "./deck-schema";

function textElement(overrides: Record<string, unknown> = {}) {
  return {
    id: "el-title",
    kind: "text",
    role: "title",
    box: { x: 8, y: 8, w: 84, h: 12 },
    zIndex: 0,
    content: {
      kind: "text",
      text: "Hello",
      paragraphs: [{ text: "Hello" }],
    },
    ...overrides,
  };
}

function shapeElement(overrides: Record<string, unknown> = {}) {
  return {
    id: "el-shape",
    kind: "shape",
    role: "background",
    box: { x: 10, y: 12, w: 40, h: 30 },
    zIndex: 1,
    content: { kind: "shape", shape: "rect" },
    ...overrides,
  };
}

function masterElement(overrides: Record<string, unknown> = {}) {
  return {
    id: "master-footer",
    kind: "text",
    role: "footer",
    masterChromeKind: "footer",
    layer: "foreground",
    locked: true,
    box: { x: 8, y: 92, w: 84, h: 4 },
    zIndex: 0,
    content: {
      kind: "text",
      text: "Footer",
      paragraphs: [{ text: "Footer" }],
    },
    ...overrides,
  };
}

function minimalV6Deck(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    canvas: { format: "16:9" },
    design: { themeId: "default" },
    masters: [
      {
        id: "master-default",
        name: "Default",
        elements: [masterElement()],
      },
    ],
    defaultMasterId: "master-default",
    slides: [
      {
        id: "slide-1",
        index: 0,
        title: "Hello",
        elements: [textElement()],
      },
    ],
    ...overrides,
  };
}

test("safeParseDeck accepts a minimal v6 deck", () => {
  const result = safeParseDeck(minimalV6Deck());
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.schemaVersion, CURRENT_DECK_SCHEMA_VERSION);
});

test("safeParseDeck rejects unknown top-level fields", () => {
  const result = safeParseDeck(minimalV6Deck({ unexpectedDeckField: true }));
  assert.equal(result.success, false);
  assert.match(result.error, /Deck\.unexpectedDeckField/);
});

test("safeParseDeck rejects unknown slide fields", () => {
  const deck = minimalV6Deck();
  const slide = (deck.slides as Record<string, unknown>[])[0];
  slide.unexpectedSlideField = true;
  const result = safeParseDeck(deck);
  assert.equal(result.success, false);
  assert.match(result.error, /slides\[0\]\.unexpectedSlideField/);
});

test("safeParseDeck rejects mismatched element kind and content.kind", () => {
  const deck = minimalV6Deck({
    slides: [
      {
        id: "slide-1",
        index: 0,
        title: "Hello",
        elements: [
          textElement({
            content: { kind: "image", src: "https://example.test/a.png" },
          }),
        ],
      },
    ],
  });
  const result = safeParseDeck(deck);
  assert.equal(result.success, false);
  assert.match(result.error, /content\.kind must match element kind/);
});

test("safeParseDeck requires master element layer and locked=true", () => {
  const missingLayer = safeParseDeck(
    minimalV6Deck({
      masters: [
        {
          id: "master-default",
          name: "Default",
          elements: [masterElement({ layer: undefined })],
        },
      ],
    }),
  );
  assert.equal(missingLayer.success, false);
  assert.match(missingLayer.error, /layer must/);

  const unlocked = safeParseDeck(
    minimalV6Deck({
      masters: [
        {
          id: "master-default",
          name: "Default",
          elements: [masterElement({ locked: false })],
        },
      ],
    }),
  );
  assert.equal(unlocked.success, false);
  assert.match(unlocked.error, /locked must be true/);
});

test("safeParseDeck rejects masterChromeKind on slide elements", () => {
  const result = safeParseDeck(
    minimalV6Deck({
      slides: [
        {
          id: "slide-1",
          index: 0,
          title: "Hello",
          elements: [textElement({ masterChromeKind: "footer" })],
        },
      ],
    }),
  );
  assert.equal(result.success, false);
  assert.match(result.error, /masterChromeKind is not part/);
});

test("safeParseDeck requires defaultMasterId to reference an existing master", () => {
  const result = safeParseDeck(minimalV6Deck({ defaultMasterId: "missing" }));
  assert.equal(result.success, false);
  assert.match(result.error, /defaultMasterId must reference/);
});

test("safeParseDeck preserves optional design, slide, master, and custom template payloads", () => {
  const result = safeParseDeck(
    minimalV6Deck({
      design: {
        themeId: "  ocean  ",
        themeOverrides: { tokenSet: { id: "custom:ocean" } },
      },
      masters: [
        {
          id: "master-default",
          name: "Default",
          background: {
            type: "solid",
            color: { value: "#112233" },
          },
          designOverrides: {
            background: {
              type: "gradient",
              from: { token: "slideBg" },
              to: { value: "#445566" },
              angle: 45,
            },
          },
          elements: [masterElement()],
        },
      ],
      customTemplates: [
        {
          id: "template-report",
          name: "Report",
          category: "content",
          defaultMasterId: "master-default",
          slideDesignDefaults: {
            background: {
              type: "image",
              url: "https://example.test/bg.png",
              assetId: "asset-bg",
            },
          },
          elements: [
            {
              id: "slot-title",
              kind: "text",
              role: "title",
              box: { x: 8, y: 8, w: 84, h: 12 },
              contentDefaults: { kind: "text", text: "Default title" },
              designOverrides: { textStyle: { fontSize: 6 } },
            },
          ],
        },
      ],
      slides: [
        {
          id: "slide-1",
          index: 0,
          title: "Hello",
          notes: "Speaker notes",
          masterId: "master-default",
          templateId: "template-report",
          designOverrides: {
            background: {
              type: "solid",
              color: { token: "surface" },
            },
          },
          source: { documentId: "doc-1" },
          elements: [textElement()],
        },
      ],
    }),
  );

  assert.equal(result.success, true, result.success ? undefined : result.error);
  if (!result.success) return;
  assert.ok(result.data.design);
  assert.equal(result.data.design.themeId, "ocean");
  assert.equal(result.data.slides[0]?.notes, "Speaker notes");
  assert.equal(result.data.slides[0]?.masterId, "master-default");
  assert.equal(
    result.data.customTemplates?.[0]?.defaultMasterId,
    "master-default",
  );
});

test("safeParseDeck round-trips radial backgrounds, radial fills, and glass effects", () => {
  const result = safeParseDeck(
    minimalV6Deck({
      slides: [
        {
          id: "slide-1",
          index: 0,
          title: "Hello",
          designOverrides: {
            background: {
              type: "radialGradient",
              inner: { value: "#ffffff" },
              outer: { token: "slideBg" },
              cx: 45,
              cy: 40,
              r: 75,
            },
          },
          elements: [
            shapeElement({
              designOverrides: {
                fill: {
                  type: "radialGradient",
                  inner: { token: "surface" },
                  outer: { value: "#112233" },
                  cx: 50,
                  cy: 45,
                  r: 70,
                },
                effect: { kind: "glass", intensity: "medium" },
              },
            }),
          ],
        },
      ],
    }),
  );

  assert.equal(result.success, true, result.success ? undefined : result.error);
  if (!result.success) return;
  const slide = result.data.slides[0] as any;
  assert.equal(slide.designOverrides.background.type, "radialGradient");
  assert.equal(slide.designOverrides.background.r, 75);
  const element = slide.elements[0] as any;
  assert.equal(element.designOverrides.fill.type, "radialGradient");
  assert.deepEqual(element.designOverrides.effect, {
    kind: "glass",
    intensity: "medium",
  });
});

test("safeParseDeck rejects glass effects outside non-line shapes", () => {
  const textResult = safeParseDeck(
    minimalV6Deck({
      slides: [
        {
          id: "slide-1",
          index: 0,
          title: "Hello",
          elements: [
            textElement({
              designOverrides: {
                effect: { kind: "glass", intensity: "light" },
              },
            }),
          ],
        },
      ],
    }),
  );
  assert.equal(textResult.success, false);

  const lineResult = safeParseDeck(
    minimalV6Deck({
      slides: [
        {
          id: "slide-1",
          index: 0,
          title: "Hello",
          elements: [
            shapeElement({
              content: { kind: "shape", shape: "line" },
              designOverrides: {
                effect: { kind: "glass", intensity: "strong" },
              },
            }),
          ],
        },
      ],
    }),
  );
  assert.equal(lineResult.success, false);
});

test("safeParseDeck rejects invalid optional object payloads", () => {
  const invalidDesign = safeParseDeck(
    minimalV6Deck({ design: { themeId: "default", themeOverrides: null } }),
  );
  assert.equal(invalidDesign.success, false);
  assert.match(invalidDesign.error, /themeOverrides must be an object/);

  const invalidSlideSource = safeParseDeck(
    minimalV6Deck({
      slides: [
        {
          id: "slide-1",
          index: 0,
          title: "Hello",
          source: null,
          elements: [textElement()],
        },
      ],
    }),
  );
  assert.equal(invalidSlideSource.success, false);
  assert.match(invalidSlideSource.error, /source must be an object/);
});

test("safeParseDeck rejects invalid masters and custom templates", () => {
  const invalidMaster = safeParseDeck(
    minimalV6Deck({
      masters: [{ id: "master-default", name: "", elements: [] }],
    }),
  );
  assert.equal(invalidMaster.success, false);
  assert.match(invalidMaster.error, /name must be a non-empty string/);

  const invalidTemplateCategory = safeParseDeck(
    minimalV6Deck({
      customTemplates: [
        {
          id: "template-1",
          name: "Invalid",
          category: "poster",
          elements: [],
        },
      ],
    }),
  );
  assert.equal(invalidTemplateCategory.success, false);
  assert.match(invalidTemplateCategory.error, /category must be one of/);

  const invalidTemplateElement = safeParseDeck(
    minimalV6Deck({
      customTemplates: [
        {
          id: "template-1",
          name: "Invalid",
          category: "content",
          elements: [null],
        },
      ],
    }),
  );
  assert.equal(invalidTemplateElement.success, false);
  assert.match(invalidTemplateElement.error, /elements\[0\] must be an object/);
});
