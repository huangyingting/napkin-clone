import assert from "node:assert/strict";
import test from "node:test";

import {
  REPAIRED_DECK_MAX_SLIDES,
  repairBox,
  repairDeck,
  repairElement,
  repairSlide,
  repairTextStyle,
} from "@/lib/ai/deck-repair";
import { repairableDeckModelOutput } from "@/lib/ai/__fixtures__/model-contract-fixtures";
import { safeParseDeck } from "@/lib/presentation/deck-schema";
import { CURRENT_DECK_SCHEMA_VERSION } from "@/lib/presentation/deck";

test("repairBox clamps finite coordinates into slide percentage bounds", () => {
  assert.deepEqual(repairBox({ x: -1, y: 101, w: 50, h: Number.NaN }), {
    x: 0,
    y: 100,
    w: 50,
    h: 20,
  });
});

test("repairTextStyle keeps valid style fields and defaults invalid ones", () => {
  assert.deepEqual(
    repairTextStyle({
      fontSize: 7,
      bold: 1,
      italic: 0,
      align: "sideways",
      color: "#abc",
    }),
    {
      fontSize: 7,
      bold: true,
      italic: false,
      align: "left",
      color: "#abc",
    },
  );
});

test("repairElement drops unsupported and unusable visual elements", () => {
  const usedIds = new Set<string>();
  assert.equal(repairElement({ kind: "unknown" }, 0, usedIds), undefined);
  assert.equal(
    repairElement({ kind: "visual", visualId: "" }, 0, usedIds),
    undefined,
  );

  const visual = repairElement(
    { kind: "visual", visualId: "vis-1", box: {} },
    0,
    usedIds,
  );
  assert.equal(visual?.kind, "visual");
});

test("repairSlide normalizes ids, layout, bullets, and duplicate element ids", () => {
  const [rawSlide] = repairableDeckModelOutput().slides as unknown[];
  const slide = repairSlide(rawSlide, 0);
  assert.equal(slide.id, "sl-1");
  assert.equal(slide.layout, "blank");
  assert.deepEqual(slide.bullets, ["Keep this"]);
  assert.equal(slide.elements?.length, 3);
  const ids = slide.elements?.map((element) => element.id) ?? [];
  assert.equal(new Set(ids).size, ids.length);
});

test("repairDeck repairs malformed model output into a schema-valid deck candidate", () => {
  const repaired = repairDeck(repairableDeckModelOutput());
  assert.ok(repaired);
  assert.equal((repaired as any).design.themeId, "indigo");
  assert.equal(repaired.schemaVersion, CURRENT_DECK_SCHEMA_VERSION);
  assert.equal(repaired.slides.length, 1);
  assert.equal(safeParseDeck(repaired).success, true);
});

test("repairDeck rejects non-deck payloads and caps slide count", () => {
  assert.equal(repairDeck({ notSlides: [] }), undefined);
  const repaired = repairDeck({
    slides: Array.from(
      { length: REPAIRED_DECK_MAX_SLIDES + 3 },
      (_, index) => ({
        title: `Slide ${index}`,
      }),
    ),
  });
  assert.ok(repaired);
  assert.equal(repaired.slides.length, REPAIRED_DECK_MAX_SLIDES);
});
