/**
 * v7 deck schema parsing and validation tests.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { safeParseDeckV7 } from "@/lib/presentation-vnext/validation";
import type {
  SlideChildNode,
  SlideNode,
} from "@/lib/presentation-vnext/schema";
import {
  buildDeckV7,
  buildMinimalDeckV7,
  buildCoverSlide,
  buildContentSlide,
  buildSlideV7,
  buildTableSlide,
  buildTextNode,
  resetBuilderCounter,
} from "@/test/builders/deck-v7";

describe("safeParseDeckV7", () => {
  test("accepts a valid minimal v7 deck", () => {
    resetBuilderCounter();
    const deck = buildMinimalDeckV7();
    const result = safeParseDeckV7(deck);
    assert.ok(
      result.success,
      `Expected success but got errors: ${!result.success && result.errors.join(", ")}`,
    );
    if (result.success) {
      assert.equal(result.data.schemaVersion, 7);
    }
  });

  test("accepts a multi-slide deck", () => {
    resetBuilderCounter();
    const deck = buildDeckV7([
      buildCoverSlide(),
      buildContentSlide(),
      buildTableSlide(),
    ]);
    const result = safeParseDeckV7(deck);
    assert.ok(result.success);
    if (result.success) {
      assert.equal(result.data.slides.length, 3);
    }
  });

  test("rejects non-object input", () => {
    const result = safeParseDeckV7("not-an-object");
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((e) => /object/.test(e)));
    }
  });

  test("rejects null input", () => {
    const result = safeParseDeckV7(null);
    assert.ok(!result.success);
  });

  test("rejects missing schemaVersion", () => {
    const deck = buildMinimalDeckV7();
    const { schemaVersion: _, ...noVersion } = deck;
    const result = safeParseDeckV7(noVersion);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((e) => /schemaVersion/.test(e)));
    }
  });

  test("rejects schemaVersion 6 (v6 deck)", () => {
    const deck = { ...buildMinimalDeckV7(), schemaVersion: 6 };
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((e) => /v7|schemaVersion/.test(e)));
    }
  });

  test("rejects v6 fields (elements, masters, design)", () => {
    const deck = { ...buildMinimalDeckV7(), elements: [], masters: [] };
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((e) => /v6|masters|elements/.test(e)));
    }
  });

  test("rejects empty slides array", () => {
    const deck = { ...buildMinimalDeckV7(), slides: [] };
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((e) => /slides/.test(e)));
    }
  });

  test("rejects duplicate node ids", () => {
    resetBuilderCounter();
    const slide = buildCoverSlide();
    // Duplicate node id within the slide
    const dupeSlide = {
      ...slide,
      children: [
        { ...slide.children[0], id: "dup-id" },
        { ...slide.children[0], id: "dup-id" }, // deliberate duplicate
      ],
    };
    const deck = buildDeckV7([dupeSlide]);
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((e) => /duplicat/.test(e)));
    }
  });

  test("rejects unknown node type", () => {
    resetBuilderCounter();
    const slide = buildCoverSlide();
    const badSlide = {
      ...slide,
      children: [
        {
          id: "bad-node",
          type: "widget",
          layout: { frame: { x: 0, y: 0, w: 10, h: 10 }, zIndex: 1 },
          style: { ref: "text.body" },
          content: {},
        },
      ],
    };
    const deck = buildDeckV7([badSlide as unknown as SlideNode]);
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
  });

  test("rejects unknown template kind", () => {
    resetBuilderCounter();
    const slide = {
      ...buildCoverSlide(),
      template: { kind: "nonexistent-kind" },
    };
    const deck = buildDeckV7([slide as unknown as SlideNode]);
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((e) => /template.kind|kind/.test(e)));
    }
  });

  test("rejects invalid canvas format", () => {
    const deck = {
      ...buildMinimalDeckV7(),
      canvas: { format: "8:5", width: 100, height: 62.5, unit: "percent" },
    };
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((e) => /format/.test(e)));
    }
  });

  test("rejects unknown style ref in node", () => {
    resetBuilderCounter();
    const slide = buildCoverSlide();
    const badChild = {
      ...slide.children[0],
      style: { ref: "not.a.real.ref" },
    };
    const badSlide = { ...slide, children: [badChild] };
    const deck = buildDeckV7([badSlide as unknown as SlideNode]);
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((e) => /StyleRef|style/.test(e)));
    }
  });

  test("rejects invalid text runs (runs don't match paragraph text)", () => {
    resetBuilderCounter();
    const slide = buildContentSlide();
    const badNode = {
      ...slide.children[0],
      type: "text",
      content: {
        paragraphs: [
          {
            id: "para-001",
            text: "hello world",
            runs: [{ text: "hello" }, { text: " mismatch" }],
          },
        ],
      },
    };
    const badSlide = { ...slide, children: [badNode] };
    const deck = buildDeckV7([badSlide as unknown as SlideNode]);
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((e) => /run/.test(e)));
    }
  });

  test("rejects table with too many columns (>8)", () => {
    resetBuilderCounter();
    const tableSlide = buildTableSlide();
    const badTable = {
      ...tableSlide.children[1],
      content: {
        columns: Array.from({ length: 9 }, (_, i) => ({
          id: `col-${i}`,
          label: `C${i}`,
        })),
        rows: [
          {
            id: "row-0",
            cells: Array.from({ length: 9 }, (_, i) => ({ text: `v${i}` })),
          },
        ],
      },
    };
    const badSlide = { ...tableSlide, children: [badTable] };
    const deck = buildDeckV7([badSlide as unknown as SlideNode]);
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((e) => /column/.test(e)));
    }
  });

  test("rejects w=0 in frame", () => {
    resetBuilderCounter();
    const slide = buildCoverSlide();
    const badChild = {
      ...slide.children[0],
      layout: { frame: { x: 0, y: 0, w: 0, h: 10 }, zIndex: 1 },
    };
    const badSlide = { ...slide, children: [badChild] };
    const deck = buildDeckV7([badSlide]);
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((e) => /w.*h|0/.test(e)));
    }
  });

  test("accepts auto-height layout metadata", () => {
    resetBuilderCounter();
    const slide = buildCoverSlide();
    const sourceChild = slide.children[0];
    assert.ok(sourceChild.layout);
    const child = {
      ...sourceChild,
      layout: {
        ...sourceChild.layout,
        autoHeight: true,
        flipX: true,
        flipY: false,
        constraints: { minH: 6, preserveAspectRatio: false },
      },
    };
    const deck = buildDeckV7([{ ...slide, children: [child] }]);
    const result = safeParseDeckV7(deck);
    assert.ok(
      result.success,
      `Expected success but got errors: ${!result.success && result.errors.join(", ")}`,
    );
  });

  test("rejects invalid auto-height layout metadata", () => {
    resetBuilderCounter();
    const slide = buildCoverSlide();
    const sourceChild = slide.children[0];
    assert.ok(sourceChild.layout);
    const child = {
      ...sourceChild,
      layout: {
        ...sourceChild.layout,
        autoHeight: "yes",
      },
    } as unknown as SlideChildNode;
    const deck = buildDeckV7([{ ...slide, children: [child] }]);
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((error) => /autoHeight/.test(error)));
    }
  });

  test("rejects invalid layout flip metadata", () => {
    resetBuilderCounter();
    const slide = buildCoverSlide();
    const sourceChild = slide.children[0];
    assert.ok(sourceChild.layout);
    const child = {
      ...sourceChild,
      layout: {
        ...sourceChild.layout,
        flipX: "yes",
        flipY: "no",
      },
    } as unknown as SlideChildNode;
    const deck = buildDeckV7([{ ...slide, children: [child] }]);
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((error) => /flipX/.test(error)));
      assert.ok(result.errors.some((error) => /flipY/.test(error)));
    }
  });

  test("rejects deck with unknown top-level field", () => {
    const deck = { ...buildMinimalDeckV7(), unknownField: "oops" };
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((e) => /unknownField/.test(e)));
    }
  });

  test("rejects connector node missing content", () => {
    resetBuilderCounter();
    const slide = buildCoverSlide();
    const badNode = {
      id: "conn-1",
      type: "connector",
      layout: { frame: { x: 0, y: 0, w: 40, h: 5 }, zIndex: 1 },
      style: { ref: "connector.primary" },
      content: null,
    };
    const badSlide = { ...slide, children: [badNode] };
    const deck = buildDeckV7([badSlide as unknown as SlideNode]);
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((e) => /content/.test(e)));
    }
  });

  test("rejects connector endpoint with invalid kind", () => {
    resetBuilderCounter();
    const slide = buildCoverSlide();
    const badNode = {
      id: "conn-2",
      type: "connector",
      layout: { frame: { x: 0, y: 0, w: 40, h: 5 }, zIndex: 1 },
      style: { ref: "connector.primary" },
      content: {
        from: { kind: "anchor" }, // invalid: must be "point" or "node"
        to: { kind: "point", point: { x: 40, y: 2.5 } },
      },
    };
    const badSlide = { ...slide, children: [badNode] };
    const deck = buildDeckV7([badSlide as unknown as SlideNode]);
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((e) => /kind.*point.*node|anchor/i.test(e)));
    }
  });

  test("rejects shape with invalid shape kind", () => {
    resetBuilderCounter();
    const slide = buildCoverSlide();
    const badNode = {
      id: "shape-bad",
      type: "shape",
      layout: { frame: { x: 0, y: 0, w: 10, h: 10 }, zIndex: 1 },
      style: { ref: "surface.card" },
      content: { shape: "hexagon" }, // not in SHAPE_KINDS
    };
    const badSlide = { ...slide, children: [badNode] };
    const deck = buildDeckV7([badSlide as unknown as SlideNode]);
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((e) => /shape/.test(e)));
    }
  });

  test("rejects shape with kind=path but missing path string", () => {
    resetBuilderCounter();
    const slide = buildCoverSlide();
    const badNode = {
      id: "path-shape",
      type: "shape",
      layout: { frame: { x: 0, y: 0, w: 10, h: 10 }, zIndex: 1 },
      style: { ref: "surface.card" },
      content: { shape: "path" }, // path required when shape is "path"
    };
    const badSlide = { ...slide, children: [badNode] };
    const deck = buildDeckV7([badSlide as unknown as SlideNode]);
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((e) => /path/.test(e)));
    }
  });

  test("rejects image node with missing assetId", () => {
    resetBuilderCounter();
    const slide = buildCoverSlide();
    const badNode = {
      id: "img-bad",
      type: "image",
      layout: { frame: { x: 0, y: 0, w: 20, h: 20 }, zIndex: 1 },
      style: { ref: "media.hero" },
      content: {}, // missing assetId
    };
    const badSlide = { ...slide, children: [badNode] };
    const deck = buildDeckV7([badSlide as unknown as SlideNode]);
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((e) => /assetId/.test(e)));
    }
  });

  test("rejects visual node with neither assetId nor visualId", () => {
    resetBuilderCounter();
    const slide = buildCoverSlide();
    const badNode = {
      id: "vis-bad",
      type: "visual",
      layout: { frame: { x: 0, y: 0, w: 20, h: 20 }, zIndex: 1 },
      style: { ref: "media.hero" },
      content: {}, // neither assetId nor visualId
    };
    const badSlide = { ...slide, children: [badNode] };
    const deck = buildDeckV7([badSlide as unknown as SlideNode]);
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((e) => /assetId|visualId/.test(e)));
    }
  });

  test("rejects group node with invalid component kind", () => {
    resetBuilderCounter();
    const slide = buildCoverSlide();
    const innerNode = { ...slide.children[0], id: "inner-node" };
    const badGroup = {
      id: "group-bad",
      type: "group",
      component: "unknownWidget", // invalid component
      layout: { frame: { x: 0, y: 0, w: 50, h: 50 }, zIndex: 1 },
      style: { ref: "surface.card" },
      children: [innerNode],
    };
    const badSlide = { ...slide, children: [badGroup] };
    const deck = buildDeckV7([badSlide as unknown as SlideNode]);
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((e) => /component/.test(e)));
    }
  });

  test("rejects group node with empty children array", () => {
    resetBuilderCounter();
    const slide = buildCoverSlide();
    const badGroup = {
      id: "group-empty",
      type: "group",
      component: "custom",
      layout: { frame: { x: 0, y: 0, w: 50, h: 50 }, zIndex: 1 },
      style: { ref: "surface.card" },
      children: [], // empty is invalid
    };
    const badSlide = { ...slide, children: [badGroup] };
    const deck = buildDeckV7([badSlide as unknown as SlideNode]);
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((e) => /children/.test(e)));
    }
  });

  test("rejects invalid canvas unit", () => {
    const deck = {
      ...buildMinimalDeckV7(),
      canvas: { format: "16:9", width: 100, height: 56.25, unit: "pixel" },
    };
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((e) => /unit.*percent/i.test(e)));
    }
  });

  test("rejects non-object asset registry", () => {
    const deck = { ...buildMinimalDeckV7(), assets: "not-an-object" };
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((e) => /assets/.test(e)));
    }
  });

  test("rejects layout box with non-integer zIndex", () => {
    resetBuilderCounter();
    const slide = buildCoverSlide();
    const badChild = {
      ...slide.children[0],
      layout: { frame: { x: 0, y: 0, w: 10, h: 10 }, zIndex: 1.5 },
    };
    const badSlide = { ...slide, children: [badChild] };
    const deck = buildDeckV7([badSlide]);
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((e) => /zIndex/.test(e)));
    }
  });

  test("rejects slide with unknown controls.tone", () => {
    resetBuilderCounter();
    const slide = buildCoverSlide();
    const badSlide = {
      ...slide,
      controls: { tone: "furious" }, // invalid tone
    };
    const deck = buildDeckV7([badSlide as unknown as SlideNode]);
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((e) => /tone/.test(e)));
    }
  });

  test("rejects table content with too few rows", () => {
    resetBuilderCounter();
    const tableSlide = buildTableSlide();
    const tableNode = tableSlide.children.find(
      (n) => n.type === "table",
    ) as unknown as { content: { columns: unknown[]; rows: unknown[] } };
    if (!tableNode) return;
    const badTable = {
      ...tableSlide.children[1],
      content: {
        columns: [{ id: "c1", label: "A" }],
        rows: [], // must have at least 1 row
      },
    };
    const badSlide = { ...tableSlide, children: [badTable] };
    const deck = buildDeckV7([badSlide as unknown as SlideNode]);
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((e) => /rows/.test(e)));
    }
  });

  test("accepts current source metadata contract", () => {
    const node = buildTextNode({
      source: {
        documentId: "doc-1",
        blockId: "block-1",
        blockKind: "text",
        contentHash: "hash-1",
        blockRevision: "rev-1",
        linkedAt: "2026-06-30T10:00:00.000Z",
        display: {
          documentTitle: "Source document",
          blockLabel: "Executive summary",
          blockKindLabel: "Text",
        },
        refresh: {
          state: "fresh",
          checkedAt: "2026-06-30T10:00:00.000Z",
          refreshedAt: "2026-06-30T10:00:00.000Z",
          sourceHash: "hash-1",
          reason: "current",
        },
      },
    });
    const deck = buildDeckV7([buildSlideV7("content", [node])]);
    const result = safeParseDeckV7(deck);

    assert.ok(result.success, !result.success ? result.errors.join("; ") : "");
    if (result.success) {
      assert.equal(
        result.data.slides[0].children[0].source?.refresh?.state,
        "fresh",
      );
    }
  });

  test("rejects invalid source metadata fields", () => {
    const badNode = {
      ...buildTextNode(),
      source: {
        documentId: "doc-1",
        blockId: "block-1",
        contentHash: "hash-1",
        refresh: { state: "invalid" },
        mystery: true,
      },
    } as unknown as SlideChildNode;
    const deck = buildDeckV7([buildSlideV7("content", [badNode])]);
    const result = safeParseDeckV7(deck);

    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((error) => error.includes("refresh.state")));
      assert.ok(result.errors.some((error) => /mystery/.test(error)));
    }
  });
});
