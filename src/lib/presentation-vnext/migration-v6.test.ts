import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  looksLikeLegacyDeckV6,
  migrateLegacyDeckV6,
} from "@/lib/presentation-vnext/migration-v6";

describe("legacy v6 deck migration", () => {
  test("rejects non-v6 payloads and empty legacy slide lists with diagnostics", () => {
    assert.equal(looksLikeLegacyDeckV6({ slides: [] }), false);
    assert.equal(looksLikeLegacyDeckV6({ schemaVersion: 6 }), true);
    assert.equal(
      looksLikeLegacyDeckV6({ slides: [{ elements: [{ kind: "text" }] }] }),
      true,
    );

    const notLegacy = migrateLegacyDeckV6({ schemaVersion: 5 });
    assert.equal(notLegacy.ok, false);
    assert.equal(notLegacy.error, "Deck JSON is not a legacy v6 deck.");

    const emptyDeck = migrateLegacyDeckV6({ schemaVersion: 6, slides: [] });
    assert.equal(emptyDeck.ok, false);
    assert.equal(emptyDeck.diagnostics[0]?.severity, "fatal");
  });

  test("migrates rich legacy elements into validated DeckV7 nodes and assets", () => {
    const result = migrateLegacyDeckV6({
      schemaVersion: 6,
      canvas: { format: "4:3" },
      design: { themeId: "neutral" },
      deckContentHash: "legacy-hash",
      slides: [
        {
          id: "1 legacy slide",
          title: "Opening",
          templateId: "legacy:section",
          notes: "Legacy notes",
          elements: [
            {
              id: "text one",
              kind: "text",
              role: "title",
              name: "Title text",
              box: { x: 5, y: 6, w: 70, h: 12 },
              zIndex: 3.8,
              rotation: 15,
              locked: true,
              source: {
                documentId: "doc-1",
                blockId: "block-1",
                blockKind: "text",
                contentHash: "hash-1",
                linkedAt: "2026-06-30T07:00:00.000Z",
              },
              content: {
                fitMode: "shrink-to-fit",
                paragraphs: [
                  {
                    text: "Hello world",
                    listType: "number",
                    indent: 2,
                    runs: [
                      {
                        text: "Hello ",
                        bold: true,
                        italic: true,
                        underline: true,
                        code: true,
                        color: "#2563eb",
                      },
                      { text: "world", link: "https://example.com" },
                    ],
                  },
                ],
              },
            },
            {
              id: "image-existing",
              kind: "image",
              role: "image",
              hidden: true,
              content: {
                assetId: "hero-image",
                src: "https://example.com/hero.png",
                alt: "Hero",
              },
            },
            {
              id: "image-generated",
              kind: "image",
              content: {
                src: "https://example.com/generated.png",
                alt: "Generated",
              },
            },
            {
              id: "visual-node",
              kind: "visual",
              content: { visualId: "chart-1", alt: "Chart" },
            },
            {
              id: "shape-path",
              kind: "shape",
              content: {
                shape: "path",
                path: "M 0 0 L 100 0 L 50 100 Z",
                text: "Path label",
                textRuns: [{ text: "Path label", bold: true }],
              },
            },
            {
              id: "shape-path-missing",
              kind: "shape",
              content: { shape: "path", text: "Fallback shape" },
            },
            {
              id: "connector-node",
              kind: "connector",
              content: {
                start: { elementId: "shape-path", anchor: "top" },
                end: { x: 100, y: 50 },
                routing: "elbow",
              },
            },
            {
              id: "table-node",
              kind: "table",
              content: {
                columns: [
                  { id: "metric", label: "Metric", width: 60 },
                  { label: "Value" },
                ],
                rows: [
                  { id: "row-1", cells: [{ text: "Revenue" }, { text: "42" }] },
                ],
                header: true,
                caption: "Metrics",
              },
            },
            {
              id: "empty-table",
              kind: "table",
              content: {},
            },
            { kind: "image", content: {} },
            { kind: "visual", content: {} },
            { kind: "unknown", content: {} },
            "not-an-element",
          ],
        },
        {
          title: "Follow-up",
          elements: [
            {
              id: "text one",
              kind: "text",
              role: "not-a-role",
              content: {
                text: "Plain fallback",
                runs: [{ text: "Plain fallback", italic: true }],
              },
            },
            {
              id: "connector-defaults",
              kind: "connector",
              content: {
                start: { elementId: "text one", anchor: "diagonal" },
                end: "bad endpoint",
              },
            },
          ],
        },
      ],
    });

    assert.equal(result.ok, true);
    assert.equal(result.diagnostics[0]?.severity, "info");
    if (!result.ok) return;

    assert.equal(result.deck.canvas.format, "4:3");
    assert.equal(result.deck.metadata?.contentHash, "legacy-hash");
    assert.equal(result.deck.slides[0].template.kind, "section");
    assert.equal(result.deck.slides[1].template.kind, "content");
    assert.equal(result.deck.assets.images["hero-image"]?.alt, "Hero");
    assert.equal(
      result.deck.assets.images["image-generated-asset"]?.src,
      "https://example.com/generated.png",
    );

    const firstSlideNodes = result.deck.slides[0].children;
    assert.deepEqual(
      firstSlideNodes.map((node) => node.type),
      [
        "text",
        "image",
        "image",
        "visual",
        "shape",
        "shape",
        "connector",
        "table",
        "table",
      ],
    );
    const migratedText = firstSlideNodes[0];
    assert.equal(migratedText.id, "text-one");
    assert.equal(migratedText.layout?.zIndex, 3);
    assert.equal(migratedText.locked, true);
    assert.equal(migratedText.source?.contentHash, "hash-1");
    assert.equal(migratedText.type, "text");
    if (migratedText.type === "text") {
      assert.equal(migratedText.content.fit, "shrink-to-fit");
      assert.equal(migratedText.content.paragraphs[0].list?.kind, "number");
      assert.equal(migratedText.content.paragraphs[0].runs?.length, 2);
    }

    const pathShape = firstSlideNodes.find((node) => node.id === "shape-path");
    assert.equal(pathShape?.type, "shape");
    if (pathShape?.type === "shape") {
      assert.equal(pathShape.content.shape, "path");
      assert.equal(pathShape.content.path, "M 0 0 L 100 0 L 50 100 Z");
      assert.equal(pathShape.content.text?.paragraphs[0].runs?.[0].bold, true);
    }

    const fallbackShape = firstSlideNodes.find(
      (node) => node.id === "shape-path-missing",
    );
    assert.equal(fallbackShape?.type, "shape");
    if (fallbackShape?.type === "shape") {
      assert.equal(fallbackShape.content.shape, "rect");
    }

    const table = firstSlideNodes.find((node) => node.id === "table-node");
    assert.equal(table?.type, "table");
    if (table?.type === "table") {
      assert.equal(table.content.columns[1].id, "table-node-col-2");
      assert.equal(table.content.caption, "Metrics");
      assert.equal(table.content.header, true);
    }

    const secondSlideText = result.deck.slides[1].children[0];
    assert.equal(secondSlideText.id, "text-one-2");
    assert.equal(secondSlideText.type, "text");
    if (secondSlideText.type === "text") {
      assert.equal(
        secondSlideText.content.paragraphs[0].runs?.[0].italic,
        true,
      );
    }
  });

  test("migrates square legacy canvases and cover fallback templates", () => {
    const result = migrateLegacyDeckV6({
      schemaVersion: 6,
      canvas: { format: "square" },
      design: { themeId: "missing-theme" },
      slides: [
        {
          elements: [
            { kind: "text", content: { text: "Cover fallback" } },
            {
              kind: "shape",
              content: { shape: "triangle", text: "Triangle" },
            },
          ],
        },
      ],
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.deck.canvas.format, "square");
    assert.equal(result.deck.theme.packageId, "neutral");
    assert.equal(result.deck.slides[0].template.kind, "cover");
    assert.equal(result.deck.slides[0].style?.ref, "slide.cover");
  });
});
