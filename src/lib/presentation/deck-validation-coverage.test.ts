import assert from "node:assert/strict";
import { test } from "node:test";

import { safeParseDeck } from "./deck-schema";
import {
  validateBackgroundDesign,
  validateElement,
  validateMasterElement,
} from "./deck-validation/elements";

function baseTextElement(): Record<string, unknown> {
  return {
    id: "text-base",
    kind: "text",
    zIndex: 0,
    box: { x: 0, y: 0, w: 20, h: 10 },
    content: { kind: "text", text: "Hello" },
  };
}

function baseShapeElement(): Record<string, unknown> {
  return {
    id: "shape-base",
    kind: "shape",
    zIndex: 0,
    box: { x: 0, y: 0, w: 20, h: 10 },
    content: { kind: "shape", shape: "rect" },
  };
}

function currentDeck(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 6,
    canvas: { format: "16:9" },
    design: { themeId: "default" },
    defaultMasterId: "master-1",
    masters: [
      {
        id: "master-1",
        name: "Master",
        elements: [
          {
            ...baseTextElement(),
            id: "master-footer",
            role: "footer",
            layer: "foreground",
            locked: true,
            masterChromeKind: "footer",
          },
        ],
      },
    ],
    slides: [
      {
        id: "slide-1",
        index: 0,
        title: "Slide",
        elements: [],
      },
    ],
    ...overrides,
  };
}

test("deck validation accepts radial backgrounds and rich residual element effects", () => {
  assert.deepEqual(
    validateBackgroundDesign(
      {
        type: "radialGradient",
        inner: { value: "#ffffff" },
        outer: { token: "surface" },
        cx: -5,
        cy: 50,
        r: 150,
        rx: 30,
        ry: 40,
        stops: [
          { color: { value: "#ffffff" }, offset: 0 },
          { color: { token: "accent" }, offset: 100 },
        ],
      },
      "background",
    ),
    {
      type: "radialGradient",
      inner: { value: "#ffffff" },
      outer: { token: "surface" },
      cx: 0,
      cy: 50,
      r: 100,
      rx: 30,
      ry: 40,
      stops: [
        { color: { value: "#ffffff" }, offset: 0 },
        { color: { token: "accent" }, offset: 100 },
      ],
    },
  );

  const element = validateElement(
    {
      ...baseShapeElement(),
      shadow: { x: 1, y: 2, blur: 3, color: "#000000", opacity: -1 },
      designOverrides: {
        fill: {
          type: "linearGradient",
          from: { value: "#111111" },
          to: { value: "#eeeeee" },
          stops: [
            { color: { value: "#111111" }, offset: 0 },
            { color: { value: "#eeeeee" }, offset: 100 },
          ],
        },
        effect: { kind: "glow", color: "#ffcc00", blur: 4, opacity: 2 },
        radius: {
          topLeft: -1,
          topRight: 10,
          bottomRight: 60,
          bottomLeft: 20,
        },
      },
    },
    "element",
  ) as Record<string, any>;

  assert.equal(element.designOverrides.effect.kind, "glow");
  assert.equal(element.designOverrides.effect.opacity, 1);
  assert.deepEqual(element.designOverrides.radius, {
    topLeft: 0,
    topRight: 10,
    bottomRight: 50,
    bottomLeft: 20,
  });
  assert.equal(element.shadow.opacity, 0);
});

test("deck validation rejects malformed radial gradients, effects, and master contracts", () => {
  assert.throws(
    () =>
      validateBackgroundDesign(
        {
          type: "radialGradient",
          inner: { value: "#ffffff" },
          outer: { value: "#000000" },
          stops: [{ color: { value: "#ffffff" } }],
        },
        "background",
      ),
    /background\.stops must contain at least two stops/,
  );
  assert.throws(
    () =>
      validateElement(
        {
          ...baseShapeElement(),
          designOverrides: { effect: { kind: "blur", radius: "large" } },
        },
        "element",
      ),
    /effect\.radius must be a finite number/,
  );
  assert.throws(
    () =>
      validateElement(
        {
          ...baseTextElement(),
          shadow: { color: "black", x: 0, y: 0, blur: 1 },
        },
        "element",
      ),
    /shadow\.color must be a hex color/,
  );
  assert.throws(
    () =>
      validateMasterElement(
        {
          ...baseTextElement(),
          role: "footer",
          layer: "foreground",
          locked: true,
          masterChromeKind: "logo",
        },
        "master.logo",
      ),
    /kind must be "image"/,
  );
});

test("safeParseDeck validates custom template residual branches and deck references", () => {
  const result = safeParseDeck(
    currentDeck({
      deckContentHash: "",
      customTemplates: [
        {
          id: "template-1",
          name: "Template",
          category: "content",
          source: "custom",
          semanticKind: "detail",
          layoutFamily: "single-column",
          styleMode: "theme-aware",
          accepts: ["title", "body"],
          capacity: { maxItems: 3 },
          bindings: [{ slot: "title", elementId: "title" }],
          defaultMasterId: "master-1",
          slideDesignDefaults: {
            background: {
              type: "radialGradient",
              inner: { value: "#ffffff" },
              outer: { value: "#f4f4f5" },
            },
          },
          elements: [
            {
              id: "template-title",
              kind: "text",
              role: "title",
              box: { x: 5, y: 5, w: 90, h: 10 },
              contentDefaults: { text: "Title" },
              opacity: 2,
              rotation: 45,
              locked: 1,
              name: "Template title",
            },
          ],
        },
      ],
    }),
  );

  assert.equal(result.success, true);
  if (!result.success) return;
  const template = (result.data as any).customTemplates[0];
  assert.equal(template.elements[0].opacity, 1);
  assert.equal(template.elements[0].rotation, 45);
  assert.equal(template.elements[0].locked, true);
  assert.equal((result.data as any).deckContentHash, undefined);

  const missingMaster = safeParseDeck(
    currentDeck({ defaultMasterId: "missing-master" }),
  );
  assert.equal(missingMaster.success, false);
  if (!missingMaster.success) {
    assert.match(missingMaster.error, /defaultMasterId must reference/);
  }

  const invalidTemplate = safeParseDeck(
    currentDeck({
      customTemplates: [
        {
          id: "template-1",
          name: "Template",
          category: "content",
          elements: [{ id: "bad", kind: "text", unknown: true }],
        },
      ],
    }),
  );
  assert.equal(invalidTemplate.success, false);
  if (!invalidTemplate.success) {
    assert.match(
      invalidTemplate.error,
      /unknown is not part of the current schema/,
    );
  }
});
