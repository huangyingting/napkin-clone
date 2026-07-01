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

  test("accepts current deck chrome schema", () => {
    resetBuilderCounter();
    const deck = buildDeckV7([buildCoverSlide()], {
      chrome: {
        logo: { enabled: true, assetId: "img-001" },
        footer: { enabled: true, text: "Footer", align: "center" },
        pageNumber: { enabled: true, format: "number-total" },
        watermark: { enabled: true, text: "Draft", opacity: 0.2 },
        border: { enabled: true, color: "#111111", widthPt: 1 },
        safeArea: {
          enabled: true,
          insets: { top: 5, right: 5, bottom: 5, left: 5 },
        },
      },
    });

    const result = safeParseDeckV7(deck);
    assert.ok(result.success);
  });

  test("rejects invalid deck chrome contracts", () => {
    const deck = {
      ...buildMinimalDeckV7(),
      chrome: {
        footer: { enabled: "yes" },
        safeArea: { insets: { top: 1, right: 1, bottom: 1, left: "bad" } },
      },
    };
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((error) => /Deck\.chrome/.test(error)));
    }
  });

  test("accepts valid deck metadata and theme binding fields", () => {
    resetBuilderCounter();
    const deck = buildDeckV7([buildCoverSlide()], {
      metadata: {
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z",
        sourceDocumentId: "doc-123",
        contentHash: "hash-123",
        locale: "en-US",
        extra: {
          review: { by: "qa", approved: true },
          tags: ["deck", "theme"],
        },
      },
      theme: {
        packageId: "neutral",
        packageVersion: "1.2.3",
        brandKitId: "brand-123",
        overrides: {
          disabledDecorations: ["logo", "footer"],
          chrome: {
            footer: { enabled: true, text: "Footer" },
          },
          styles: {
            "text.body": {
              default: { text: { color: "#111111" } },
            },
          },
        },
      },
    });
    const result = safeParseDeckV7(deck);
    assert.ok(
      result.success,
      `Expected success but got errors: ${!result.success && result.errors.join(", ")}`,
    );
  });

  test("rejects malformed and unknown metadata fields", () => {
    const deck = {
      ...buildMinimalDeckV7(),
      metadata: {
        createdAt: 123,
        unknownField: "kept",
        extra: "not-object",
      },
    };
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(
        result.errors.some((error) => /Deck\.metadata\.createdAt/.test(error)),
      );
      assert.ok(
        result.errors.some((error) =>
          /Deck\.metadata\.unknownField/.test(error),
        ),
      );
      assert.ok(
        result.errors.some((error) => /Deck\.metadata\.extra/.test(error)),
      );
    }
  });

  test("rejects unknown deck theme and override fields", () => {
    const deck = {
      ...buildMinimalDeckV7(),
      theme: {
        packageId: "neutral",
        unexpected: true,
        overrides: {
          extraUnknown: true,
        },
      },
    };
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(
        result.errors.some((error) => /Deck\.theme\.unexpected/.test(error)),
      );
      assert.ok(
        result.errors.some((error) =>
          /Deck\.theme\.overrides\.extraUnknown/.test(error),
        ),
      );
    }
  });

  test("rejects malformed theme scalar fields", () => {
    const deck = {
      ...buildMinimalDeckV7(),
      theme: {
        packageId: "neutral",
        packageVersion: 123,
        brandKitId: false,
      },
    };
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(
        result.errors.some((error) =>
          /Deck\.theme\.packageVersion/.test(error),
        ),
      );
      assert.ok(
        result.errors.some((error) => /Deck\.theme\.brandKitId/.test(error)),
      );
    }
  });

  test("rejects invalid disabledDecorations payloads", () => {
    const badOverrides: unknown[] = [
      { disabledDecorations: "all" },
      { disabledDecorations: ["logo", 42] },
    ];

    for (const overrides of badOverrides) {
      const deck = {
        ...buildMinimalDeckV7(),
        theme: {
          packageId: "neutral",
          overrides,
        },
      };
      const result = safeParseDeckV7(deck);
      assert.ok(!result.success);
      if (!result.success) {
        assert.ok(
          result.errors.some((error) =>
            /Deck\.theme\.overrides\.disabledDecorations/.test(error),
          ),
        );
      }
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

  test("rejects non-string slide notes", () => {
    resetBuilderCounter();
    const invalidNotesValues: unknown[] = [
      { text: "note" },
      ["note"],
      123,
      true,
    ];

    for (const notes of invalidNotesValues) {
      const slide = { ...buildCoverSlide(), notes } as unknown as SlideNode;
      const deck = buildDeckV7([slide]);
      const result = safeParseDeckV7(deck);
      assert.ok(!result.success);
      if (!result.success) {
        assert.ok(result.errors.some((e) => /slides\[0\]\.notes/.test(e)));
      }
    }
  });

  test("accepts string slide notes", () => {
    resetBuilderCounter();
    const slide = { ...buildCoverSlide(), notes: "Presenter reminder" };
    const deck = buildDeckV7([slide]);
    const result = safeParseDeckV7(deck);
    assert.ok(
      result.success,
      `Expected success but got errors: ${!result.success && result.errors.join(", ")}`,
    );
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
    const paragraphText = "TOP SECRET PARAGRAPH TEXT";
    const runText = "TOP SECRET RUN CONTENT";
    const badNode = {
      ...slide.children[0],
      type: "text",
      content: {
        paragraphs: [
          {
            id: "para-001",
            text: paragraphText,
            runs: [{ text: runText }],
          },
        ],
      },
    };
    const badSlide = { ...slide, children: [badNode] };
    const deck = buildDeckV7([badSlide as unknown as SlideNode]);
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(
        result.errors.some((e) =>
          /runs text must concatenate to paragraph text/.test(e),
        ),
      );
      const joinedErrors = result.errors.join(" ");
      assert.ok(!joinedErrors.includes(paragraphText));
      assert.ok(!joinedErrors.includes(runText));
    }
  });

  test("accepts text content fit and language values", () => {
    const fitModes = ["auto-height", "fixed-box", "shrink-to-fit"] as const;
    const nodes = fitModes.map((fit, index) =>
      buildTextNode({
        id: `text-fit-${index}`,
        content: {
          paragraphs: [{ id: `para-fit-${index}`, text: `Fit ${fit}` }],
          fit,
          language: "en-US",
        },
      }),
    );
    const deck = buildDeckV7([buildSlideV7("content", nodes)]);
    const result = safeParseDeckV7(deck);

    assert.ok(
      result.success,
      `Expected success but got errors: ${!result.success && result.errors.join(", ")}`,
    );
    if (result.success) {
      const parsedNodes = result.data.slides[0].children;
      assert.deepEqual(
        parsedNodes.map((node) =>
          node.type === "text" ? node.content.fit : undefined,
        ),
        fitModes,
      );
      assert.deepEqual(
        parsedNodes.map((node) =>
          node.type === "text" ? node.content.language : undefined,
        ),
        ["en-US", "en-US", "en-US"],
      );
    }
  });

  test("rejects invalid text content fit mode", () => {
    const badNode = buildTextNode({
      content: {
        paragraphs: [{ id: "para-001", text: "hello world" }],
        fit: "squash" as unknown as "auto-height",
      },
    });
    const deck = buildDeckV7([buildSlideV7("content", [badNode])]);
    const result = safeParseDeckV7(deck);

    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((error) => /content\.fit/.test(error)));
    }
  });

  test("rejects non-string text content language", () => {
    const badNode = buildTextNode({
      content: {
        paragraphs: [{ id: "para-001", text: "hello world" }],
        language: 42 as unknown as string,
      },
    });
    const deck = buildDeckV7([buildSlideV7("content", [badNode])]);
    const result = safeParseDeckV7(deck);

    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((error) => /content\.language/.test(error)));
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

  test("accepts image node with valid crop, fit, focalPoint, and alt", () => {
    resetBuilderCounter();
    const slide = buildCoverSlide();
    const imageNode = {
      id: "img-rich",
      type: "image",
      layout: { frame: { x: 0, y: 0, w: 20, h: 20 }, zIndex: 1 },
      style: { ref: "media.hero" },
      content: {
        assetId: "img-001",
        crop: { top: 5, right: 10, bottom: 5, left: 10 },
        fit: "cover",
        focalPoint: { x: 45, y: 55 },
        alt: "Descriptive alt text",
      },
    };
    const deck = buildDeckV7([
      { ...slide, children: [imageNode] } as SlideNode,
    ]);
    const result = safeParseDeckV7(deck);
    assert.ok(
      result.success,
      `Expected success but got errors: ${!result.success && result.errors.join(", ")}`,
    );
  });

  test("rejects image node with malformed crop, fit, focalPoint, and alt", () => {
    resetBuilderCounter();
    const slide = buildCoverSlide();
    const baseNode = {
      id: "img-base",
      type: "image",
      layout: { frame: { x: 0, y: 0, w: 20, h: 20 }, zIndex: 1 },
      style: { ref: "media.hero" },
      content: { assetId: "img-001" },
    };
    const cases: Array<{
      name: string;
      node: Record<string, unknown>;
      errorPattern: RegExp;
    }> = [
      {
        name: "invalid-fit",
        node: {
          ...baseNode,
          content: { ...baseNode.content, fit: "stretchy" },
        },
        errorPattern: /content\.fit|contain|cover|fill|none/i,
      },
      {
        name: "invalid-crop",
        node: {
          ...baseNode,
          content: {
            ...baseNode.content,
            crop: { top: "5", right: 2, bottom: 3, left: 4 },
          },
        },
        errorPattern: /content\.crop\.top|finite number/i,
      },
      {
        name: "invalid-focal-point",
        node: {
          ...baseNode,
          content: {
            ...baseNode.content,
            focalPoint: { x: "50", y: 50 },
          },
        },
        errorPattern: /content\.focalPoint\.x|finite number/i,
      },
      {
        name: "invalid-alt",
        node: {
          ...baseNode,
          content: { ...baseNode.content, alt: 7 },
        },
        errorPattern: /content\.alt|string/i,
      },
    ];

    for (const testCase of cases) {
      const badNode = { ...testCase.node, id: `img-${testCase.name}` };
      const badSlide = {
        ...slide,
        children: [badNode as unknown as SlideChildNode],
      };
      const deck = buildDeckV7([badSlide as unknown as SlideNode]);
      const result = safeParseDeckV7(deck);
      assert.ok(!result.success, `Expected parse failure for ${testCase.name}`);
      if (!result.success) {
        assert.ok(
          result.errors.some((error) => testCase.errorPattern.test(error)),
          `Expected ${testCase.name} to fail with pattern ${testCase.errorPattern}, got: ${result.errors.join(" | ")}`,
        );
      }
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

  test("accepts valid canvas safeArea insets", () => {
    const deck = {
      ...buildMinimalDeckV7(),
      canvas: {
        format: "16:9",
        width: 100,
        height: 56.25,
        unit: "percent",
        safeArea: { top: 6, right: 6, bottom: 6, left: 6 },
      },
    };
    const result = safeParseDeckV7(deck);
    assert.ok(result.success);
  });

  test("rejects non-object canvas safeArea", () => {
    const deck = {
      ...buildMinimalDeckV7(),
      canvas: {
        format: "16:9",
        width: 100,
        height: 56.25,
        unit: "percent",
        safeArea: "bad",
      },
    };
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(
        result.errors.some((e) =>
          /Deck\.canvas\.safeArea must be an object/.test(e),
        ),
      );
    }
  });

  test("rejects canvas safeArea with missing or non-finite inset fields", () => {
    const deck = {
      ...buildMinimalDeckV7(),
      canvas: {
        format: "16:9",
        width: 100,
        height: 56.25,
        unit: "percent",
        safeArea: { top: 6, right: 6, bottom: 6 },
      },
    };
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(
        result.errors.some((e) =>
          /Deck\.canvas\.safeArea\.left must be a finite number/.test(e),
        ),
      );
    }
  });

  test("rejects canvas safeArea with unknown inset keys", () => {
    const deck = {
      ...buildMinimalDeckV7(),
      canvas: {
        format: "16:9",
        width: 100,
        height: 56.25,
        unit: "percent",
        safeArea: { top: 6, right: 6, bottom: 6, left: 6, horizontal: 12 },
      },
    };
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(
        result.errors.some((e) =>
          /Deck\.canvas\.safeArea\.horizontal is not a known inset field/.test(
            e,
          ),
        ),
      );
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

  test("rejects invalid deck chrome enum and scalar values", () => {
    resetBuilderCounter();
    const deck = buildDeckV7([buildCoverSlide()], {
      chrome: {
        logo: { enabled: true, assetId: "img-001", size: "huge" },
        footer: { enabled: true, text: 42, align: "wide" },
        pageNumber: { enabled: true, format: "roman", placement: "top-left" },
        watermark: {
          enabled: true,
          text: "Draft",
          layoutMode: "tilted",
          size: "giant",
          opacity: "faint",
        },
        border: { enabled: true, color: 123, widthPt: "thick" },
        safeArea: { enabled: true, color: false, widthPt: "thin" },
      },
    } as unknown as Parameters<typeof buildDeckV7>[1]);
    const result = safeParseDeckV7(deck);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((e) => /logo\.size/.test(e)));
      assert.ok(result.errors.some((e) => /footer\.align/.test(e)));
      assert.ok(result.errors.some((e) => /pageNumber\.format/.test(e)));
      assert.ok(result.errors.some((e) => /watermark\.opacity/.test(e)));
      assert.ok(result.errors.some((e) => /border\.widthPt/.test(e)));
      assert.ok(result.errors.some((e) => /safeArea\.color/.test(e)));
    }
  });

  test("rejects slide deck chrome override without an object value", () => {
    resetBuilderCounter();
    const slide = {
      ...buildCoverSlide(),
      props: {
        deckChrome: {
          footer: { mode: "override" },
        },
      },
    } as unknown as SlideNode;
    const result = safeParseDeckV7(buildDeckV7([slide]));
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.errors.some((e) => /footer\.value/.test(e)));
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

  test("accepts valid slide and child base-node metadata", () => {
    resetBuilderCounter();
    const node = buildTextNode({
      name: "Body content",
      role: "body",
      slot: "body",
      locked: false,
      hidden: false,
      accessibility: {
        label: "Body content",
        alt: "Body content",
        decorative: false,
        readingOrder: 2,
      },
    });
    const slide = buildSlideV7("content", [node], {
      name: "Slide name",
      role: "slide",
      slot: "title",
      locked: false,
      hidden: false,
      accessibility: {
        label: "Slide label",
        decorative: false,
        readingOrder: 1,
      },
    });
    const result = safeParseDeckV7(buildDeckV7([slide]));
    assert.ok(
      result.success,
      `Expected success but got errors: ${!result.success && result.errors.join(", ")}`,
    );
  });

  test("rejects malformed child base-node metadata with precise paths", () => {
    resetBuilderCounter();
    const badNode = {
      ...buildTextNode(),
      name: 42,
      role: "unknown-role",
      slot: "not-a-slot",
      locked: "yes",
      hidden: "no",
      accessibility: {
        label: 123,
        alt: false,
        decorative: "yes",
        readingOrder: "first",
        mystery: true,
      },
    } as unknown as SlideChildNode;
    const result = safeParseDeckV7(
      buildDeckV7([buildSlideV7("content", [badNode])]),
    );

    assert.ok(!result.success);
    if (!result.success) {
      for (const pattern of [
        /slides\[0\]\.children\[0\]\.name must be a string/,
        /slides\[0\]\.children\[0\]\.role is not a known semantic role/,
        /slides\[0\]\.children\[0\]\.slot is not a known slot key/,
        /slides\[0\]\.children\[0\]\.locked must be a boolean/,
        /slides\[0\]\.children\[0\]\.hidden must be a boolean/,
        /slides\[0\]\.children\[0\]\.accessibility\.label must be a string/,
        /slides\[0\]\.children\[0\]\.accessibility\.alt must be a string/,
        /slides\[0\]\.children\[0\]\.accessibility\.decorative must be a boolean/,
        /slides\[0\]\.children\[0\]\.accessibility\.readingOrder must be a finite number/,
        /slides\[0\]\.children\[0\]\.accessibility\.mystery is not a known accessibility field/,
      ]) {
        assert.ok(
          result.errors.some((error) => pattern.test(error)),
          `missing error matching ${pattern}\n${result.errors.join("\n")}`,
        );
      }
    }
  });

  test("rejects malformed slide base-node metadata with precise paths", () => {
    resetBuilderCounter();
    const badSlide = {
      ...buildCoverSlide(),
      name: 42,
      role: "unknown-role",
      slot: "not-a-slot",
      locked: "yes",
      hidden: "no",
      accessibility: {
        label: 123,
        alt: false,
        decorative: "yes",
        readingOrder: "first",
        mystery: true,
      },
    } as unknown as SlideNode;
    const result = safeParseDeckV7(buildDeckV7([badSlide]));

    assert.ok(!result.success);
    if (!result.success) {
      for (const pattern of [
        /slides\[0\]\.name must be a string/,
        /slides\[0\]\.role is not a known semantic role/,
        /slides\[0\]\.slot is not a known slot key/,
        /slides\[0\]\.locked must be a boolean/,
        /slides\[0\]\.hidden must be a boolean/,
        /slides\[0\]\.accessibility\.label must be a string/,
        /slides\[0\]\.accessibility\.alt must be a string/,
        /slides\[0\]\.accessibility\.decorative must be a boolean/,
        /slides\[0\]\.accessibility\.readingOrder must be a finite number/,
        /slides\[0\]\.accessibility\.mystery is not a known accessibility field/,
      ]) {
        assert.ok(
          result.errors.some((error) => pattern.test(error)),
          `missing error matching ${pattern}\n${result.errors.join("\n")}`,
        );
      }
    }
  });

  test("reports malformed nested optional contracts with specific paths", () => {
    resetBuilderCounter();
    const slide = buildCoverSlide();
    const malformedText = {
      ...slide.children[0],
      id: "malformed-text",
      role: "unknown-role",
      layout: {
        frame: null,
        zIndex: "front",
        rotation: "quarter-turn",
        anchor: "middle",
        constraints: {
          minW: "wide",
          preserveAspectRatio: "yes",
          extra: true,
        },
      },
      source: {
        documentId: 123,
        blockKind: "audio",
        unlinked: "yes",
        display: {
          documentTitle: 42,
          unknown: true,
        },
        refresh: {
          state: "later",
          checkedAt: 42,
          mystery: true,
        },
        extra: "bad",
      },
      content: {
        paragraphs: [
          null,
          { id: "", text: 42, runs: [{ text: "does-not-match" }] },
        ],
      },
    };
    const malformedTable = {
      ...buildTextNode(),
      id: "malformed-table",
      type: "table",
      role: "table",
      content: {
        columns: [
          { id: "dup", label: "A" },
          { id: "dup", label: "B" },
        ],
        rows: [{ id: "row-1", cells: [{ text: "only one cell" }] }],
      },
    };
    const malformedConnector = {
      ...buildTextNode(),
      id: "malformed-connector",
      type: "connector",
      role: "connector",
      style: { ref: "connector.primary" },
      content: { from: null, to: "bad" },
    };
    const malformedShape = {
      ...buildTextNode(),
      id: "malformed-shape",
      type: "shape",
      role: "callout",
      style: { ref: "surface.card" },
      content: { shape: "rect", text: { paragraphs: "not-array" } },
    };
    const badSlide = {
      ...slide,
      props: {
        decoration: "maximal",
        chrome: "full",
        deckChrome: {
          sidebar: { mode: "override", value: {} },
          footer: { mode: "override", value: { enabled: true, text: 123 } },
        },
      },
      children: [
        malformedText,
        malformedTable,
        malformedConnector,
        malformedShape,
      ],
    };
    const result = safeParseDeckV7(
      buildDeckV7([badSlide as unknown as SlideNode], {
        canvas: null,
        assets: { images: null },
        chrome: {
          unexpected: {},
          logo: "bad",
          safeArea: { enabled: true, insets: "bad" },
        },
      } as unknown as Parameters<typeof buildDeckV7>[1]),
    );

    assert.ok(!result.success);
    if (!result.success) {
      for (const pattern of [
        /Deck\.canvas must be an object/,
        /Deck\.assets\.images/,
        /Deck\.chrome\.unexpected/,
        /Deck\.chrome\.logo must be an object/,
        /Deck\.chrome\.safeArea\.insets must be an object/,
        /props\.decoration/,
        /props\.chrome/,
        /deckChrome\.sidebar/,
        /deckChrome\.footer\.value\.footer\.text/,
        /role is not a known semantic role/,
        /layout\.frame must be an object/,
        /layout\.zIndex/,
        /layout\.rotation/,
        /layout\.anchor/,
        /constraints\.extra/,
        /constraints\.minW/,
        /constraints\.preserveAspectRatio/,
        /source\.documentId/,
        /source\.blockKind/,
        /source\.unlinked/,
        /source\.display\.unknown/,
        /source\.display\.documentTitle/,
        /source\.refresh\.mystery/,
        /source\.refresh\.state/,
        /source\.refresh\.checkedAt/,
        /source\.extra/,
        /content\.paragraphs\[0\]/,
        /content\.paragraphs\[1\]\.id/,
        /content\.paragraphs\[1\]\.text/,
        /columns\[1\]\.id/,
        /must have exactly 2 cells/,
        /content\.from must be an object/,
        /content\.to must be an object/,
        /content\.text\.paragraphs/,
      ]) {
        assert.ok(
          result.errors.some((error) => pattern.test(error)),
          `missing error matching ${pattern}\n${result.errors.join("\n")}`,
        );
      }
    }
  });
});
