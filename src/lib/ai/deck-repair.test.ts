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
    repairElement(
      { kind: "visual", content: { kind: "visual", visualId: "" } },
      0,
      usedIds,
    ),
    undefined,
  );

  const visual = repairElement(
    {
      kind: "visual",
      content: { kind: "visual", visualId: "vis-1" },
      box: {},
    },
    0,
    usedIds,
  );
  assert.equal(visual?.kind, "visual");
  assert.equal((visual as any).content.visualId, "vis-1");
  assert.equal((visual as any).visualId, undefined);
});

test("repairElement emits text elements in v6 content/designOverrides shape", () => {
  const text = repairElement(
    {
      kind: "text",
      role: "title",
      content: { kind: "text", text: "Launch plan" },
      designOverrides: {
        textStyle: { fontSize: 7, bold: true, italic: false, align: "center" },
      },
    },
    0,
  );
  assert.equal(text?.kind, "text");
  assert.equal((text as any).role, "title");
  assert.deepEqual((text as any).content, {
    kind: "text",
    text: "Launch plan",
    paragraphs: [{ text: "Launch plan" }],
  });
  assert.equal((text as any).designOverrides.textStyle.align, "center");
  assert.equal((text as any).text, undefined);
  assert.equal((text as any).style, undefined);
});

test("repairElement assigns fallback ids and default text roles", () => {
  const text = repairElement(
    {
      kind: "text",
      role: "legacy",
      content: { kind: "text" },
      designOverrides: { textStyle: { color: "not-a-color" } },
    },
    0,
    new Set(["el-1"]),
  );
  assert.equal(text?.id, "el-2");
  assert.equal((text as any).role, "body");
  assert.equal((text as any).content.text, "");
  assert.equal((text as any).designOverrides.textStyle.color, undefined);
});

test("repairElement normalizes generated table elements with strict slide limits", () => {
  const table = repairElement(
    {
      kind: "table",
      content: {
        kind: "table",
        header: true,
        caption: "Evidence",
        columns: ["Source", "Claim", "Weight", "Note", "Overflow"],
        rows: [
          ["A", "One", "High", "Keep", "Drop"],
          ["B", "Two", "Low", "Keep", "Drop"],
        ],
      },
      designOverrides: {
        tableStyle: { borderColor: "#abcdef", borderWidth: 0.2 },
      },
    },
    0,
  );

  assert.equal(table?.kind, "table");
  if (table?.kind === "table") {
    assert.equal(table.role, "table");
    assert.equal(table.content.columns.length, 4);
    assert.equal(table.content.rows.length, 2);
    assert.equal(table.content.rows[0].cells.length, 4);
    assert.equal(
      (table as any).designOverrides.tableStyle.borderColor,
      "#abcdef",
    );
  }
});

test("repairSlide moves generated table overflow into notes", () => {
  const slide = repairSlide(
    {
      id: "slide-1",
      title: "Evidence",
      notes: "Existing notes",
      elements: [
        {
          id: "table-1",
          kind: "table",
          box: { x: 10, y: 20, w: 80, h: 50 },
          content: {
            kind: "table",
            columns: ["A", "B", "C", "D", "E"],
            rows: [
              ["1", "2", "3", "4", "5"],
              ["6", "7", "8", "9", "10"],
              ["11", "12", "13", "14", "15"],
              ["16", "17", "18", "19", "20"],
              ["21", "22", "23", "24", "25"],
              ["26", "27", "28", "29", "30"],
              ["31", "32", "33", "34", "35"],
            ],
          },
        },
      ],
    },
    0,
  );

  assert.match(slide.notes, /Existing notes/);
  assert.match(slide.notes, /Table overflow:/);
  assert.match(slide.notes, /Table omitted columns: E/);
  assert.match(slide.notes, /Table omitted rows:/);
  assert.match(slide.notes, /omitted cells/);
});

test("repairSlide normalizes ids, template ids, and duplicate element ids", () => {
  const [rawSlide] = repairableDeckModelOutput().slides as unknown[];
  const slide = repairSlide(rawSlide, 0);
  assert.equal(slide.id, "sl-1");
  assert.equal(slide.templateId, undefined);
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
  assert.equal(repairDeck([{ notSlides: [] }]), undefined);
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
