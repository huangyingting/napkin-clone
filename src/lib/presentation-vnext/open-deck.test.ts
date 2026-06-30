import assert from "node:assert/strict";
import { test, describe } from "node:test";

import {
  decideDeckOpen,
  openAiGeneratedDeck,
  openDeckFromJson,
  looksLikeDeckV7,
} from "./open-deck";
import { safeParseDeckV7 } from "./validation";

// ---------------------------------------------------------------------------
// Minimal v7 fixture
// ---------------------------------------------------------------------------

const MINIMAL_V7 = {
  schemaVersion: 7,
  id: "deck-0001",
  title: "Identity deck",
  canvas: { format: "16:9", width: 100, height: 56.25, unit: "percent" },
  theme: { packageId: "neutral", brandKitId: "brand-0001" },
  assets: {
    images: {
      "asset-0001": {
        id: "asset-0001",
        src: "https://example.com/asset.png",
        alt: "Asset",
      },
    },
  },
  slides: [
    {
      id: "slide-0001",
      type: "slide",
      template: { kind: "cover" },
      style: { ref: "slide.cover" },
      children: [],
    },
  ],
};

// ---------------------------------------------------------------------------
// Minimal v6 fixture
// ---------------------------------------------------------------------------

const MINIMAL_V6 = {
  schemaVersion: 6,
  canvas: { format: "16:9" },
  design: { themeId: "default" },
  slides: [
    {
      id: "s1",
      title: "Title Slide",
      elements: [
        {
          id: "e1",
          kind: "text",
          role: "title",
          box: { x: 8, y: 8, w: 84, h: 14 },
          zIndex: 1,
          content: { text: "Hello" },
          source: {
            documentId: "doc-1",
            blockId: "block-1",
            blockKind: "text",
          },
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// openDeckFromJson — v7 pass-through
// ---------------------------------------------------------------------------

describe("openDeckFromJson — v7 pass-through", () => {
  test("accepts a valid v7 deck", () => {
    const result = openDeckFromJson(MINIMAL_V7);
    assert.ok(result.ok);
    assert.equal(result.deck.schemaVersion, 7);
  });

  test("preserves valid v7 deck JSON and identities unchanged", () => {
    const result = openDeckFromJson(MINIMAL_V7);
    assert.ok(result.ok);
    assert.equal(result.source, "v7");
    assert.equal(result.deck, MINIMAL_V7);
    assert.equal(result.deck.id, "deck-0001");
    assert.equal(result.deck.theme.packageId, "neutral");
    assert.equal(result.deck.theme.brandKitId, "brand-0001");
    assert.equal(result.deck.assets.images["asset-0001"]?.id, "asset-0001");
    assert.equal(result.deck.slides[0].id, "slide-0001");
  });

  test("routes AI deck proposals through the same v7 validation boundary", () => {
    const valid = openAiGeneratedDeck(MINIMAL_V7);
    assert.ok(valid.ok);
    assert.equal(valid.source, "v7");
    assert.equal(valid.deck, MINIMAL_V7);

    const invalid = openAiGeneratedDeck({ schemaVersion: 7, slides: [] });
    assert.ok(!invalid.ok);
    assert.match(invalid.error, /v7 deck validation failed/);
  });

  test("returns ok=false with validation errors for a malformed v7 deck", () => {
    const bad = { ...MINIMAL_V7, slides: [] }; // slides must be non-empty
    const result = openDeckFromJson(bad);
    assert.ok(!result.ok);
    assert.ok(result.error.length > 0);
  });

  test("returns ok=false for a v7 deck missing required fields", () => {
    const bad = { schemaVersion: 7, slides: null };
    const result = openDeckFromJson(bad);
    assert.ok(!result.ok);
  });
});

// ---------------------------------------------------------------------------
// openDeckFromJson — legacy schemas
// ---------------------------------------------------------------------------

describe("openDeckFromJson — legacy schemas", () => {
  test("migrates a v6 deck to valid DeckV7", () => {
    const result = openDeckFromJson(MINIMAL_V6);
    assert.ok(result.ok);
    assert.equal(result.source, "legacy-v6");
    assert.equal(result.deck.schemaVersion, 7);
    assert.equal(result.deck.slides[0].children[0].type, "text");
    assert.equal(result.idMap?.slides.s1, "s1");
    assert.equal(result.idMap?.nodes.e1, "e1");
    assert.equal(result.idMap?.sources["block-1"], "block-1");
    assert.equal(result.diagnostics[0]?.message.includes("migrated"), true);
  });

  test("migrated v6 decks are save-ready v7 without legacy-only fields", () => {
    const result = openDeckFromJson(MINIMAL_V6);
    assert.ok(result.ok);
    assert.equal(result.source, "legacy-v6");

    const validation = safeParseDeckV7(result.deck);
    assert.ok(
      validation.success,
      !validation.success ? validation.errors.join("; ") : "",
    );
    assert.equal("design" in result.deck, false);
    assert.equal("masters" in result.deck, false);
    assert.equal(
      "elements" in (result.deck.slides[0] as Record<string, unknown>),
      false,
    );
  });

  test("migrates rewritten v6 ids with old-to-new idMap and connector remap", () => {
    const legacy = {
      schemaVersion: 6,
      id: "deck 1",
      canvas: { format: "16:9" },
      design: { themeId: "default" },
      slides: [
        {
          id: "slide 1",
          title: "Mapped slide",
          elements: [
            {
              id: "target node",
              kind: "text",
              role: "body",
              box: { x: 10, y: 10, w: 20, h: 10 },
              content: { text: "Target" },
              source: {
                documentId: "doc-1",
                blockId: "source-block",
                blockKind: "text",
              },
            },
            {
              id: "connector 1",
              kind: "connector",
              box: { x: 10, y: 30, w: 40, h: 10 },
              content: {
                start: { elementId: "target node", anchor: "right" },
                end: { elementId: "missing node", anchor: "left" },
              },
            },
            {
              id: "image node",
              kind: "image",
              box: { x: 10, y: 45, w: 20, h: 20 },
              content: {
                assetId: "asset one",
                src: "https://example.com/image.png",
                alt: "Image",
              },
            },
          ],
        },
      ],
    };

    const result = openDeckFromJson(legacy);
    assert.ok(result.ok);
    assert.equal(result.deck.id, "deck-1");
    assert.equal(result.deck.slides[0].id, "slide-1");
    assert.equal(result.idMap?.decks["deck 1"], "deck-1");
    assert.equal(result.idMap?.slides["slide 1"], "slide-1");
    assert.equal(result.idMap?.nodes["target node"], "target-node");
    assert.equal(result.idMap?.nodes["connector 1"], "connector-1");
    assert.equal(result.idMap?.assets["asset one"], "asset-one");
    assert.equal(result.idMap?.themes.default, "clarity");
    assert.equal(result.idMap?.sources["source-block"], "source-block");
    const connector = result.deck.slides[0].children.find(
      (node) => node.type === "connector",
    );
    assert.equal(connector?.type, "connector");
    if (connector?.type === "connector") {
      assert.deepEqual(connector.content.from, {
        kind: "node",
        nodeId: "target-node",
        anchor: "right",
      });
      assert.deepEqual(connector.content.to, {
        kind: "point",
        point: { x: 100, y: 50 },
      });
    }
    assert.ok(
      result.diagnostics.some(
        (diagnostic) => diagnostic.code === "migration-id-rewrite",
      ),
    );
    assert.ok(
      result.diagnostics.some(
        (diagnostic) => diagnostic.code === "migration-unmapped-reference",
      ),
    );
  });

  test("rejects a v6 deck with no slides", () => {
    const noSlides = { ...MINIMAL_V6, slides: [] };
    const result = openDeckFromJson(noSlides);
    assert.ok(!result.ok);
    assert.equal(result.diagnostics[0]?.severity, "fatal");
  });

  describe("decideDeckOpen", () => {
    test("starts blank only for absent deck JSON", () => {
      assert.deepEqual(decideDeckOpen(null), { mode: "blank" });
      assert.deepEqual(decideDeckOpen(undefined), { mode: "blank" });
    });

    test("routes invalid non-empty input to recovery instead of blank", () => {
      const result = decideDeckOpen({ schemaVersion: 7, slides: [] });
      assert.equal(result.mode, "recovery");
      if (result.mode === "recovery") {
        assert.match(result.error, /v7 deck validation failed/);
        assert.ok(
          (result.errors ?? []).some((error) => error.includes("slides")),
        );
      }
    });

    test("routes failed v6 migration to recovery with fatal diagnostics", () => {
      const result = decideDeckOpen({ ...MINIMAL_V6, slides: [] });
      assert.equal(result.mode, "recovery");
      if (result.mode === "recovery") {
        assert.match(result.error, /no slides to migrate/i);
        assert.equal(result.diagnostics[0]?.severity, "fatal");
      }
    });
  });
});

// ---------------------------------------------------------------------------
// openDeckFromJson — unknown / missing version
// ---------------------------------------------------------------------------

describe("openDeckFromJson — unknown schema version", () => {
  test("returns ok=false for a non-object input", () => {
    assert.ok(!openDeckFromJson(null).ok);
    assert.ok(!openDeckFromJson("string").ok);
    assert.ok(!openDeckFromJson(42).ok);
    assert.ok(!openDeckFromJson([]).ok);
  });

  test("returns ok=false for an object with no schemaVersion", () => {
    const result = openDeckFromJson({ slides: [] });
    assert.ok(!result.ok);
  });

  test("returns ok=false for a string schemaVersion", () => {
    const result = openDeckFromJson({ schemaVersion: "7", slides: [] });
    assert.ok(!result.ok);
  });
});

// ---------------------------------------------------------------------------
// looksLikeDeckV7
// ---------------------------------------------------------------------------

describe("looksLikeDeckV7", () => {
  test("returns true for an object with schemaVersion 7", () => {
    assert.equal(looksLikeDeckV7({ schemaVersion: 7 }), true);
  });

  test("returns false for schemaVersion 6", () => {
    assert.equal(looksLikeDeckV7({ schemaVersion: 6 }), false);
  });

  test("returns false for null and non-objects", () => {
    assert.equal(looksLikeDeckV7(null), false);
    assert.equal(looksLikeDeckV7("7"), false);
    assert.equal(looksLikeDeckV7(7), false);
  });

  test("returns false for an object without schemaVersion", () => {
    assert.equal(looksLikeDeckV7({}), false);
  });
});
