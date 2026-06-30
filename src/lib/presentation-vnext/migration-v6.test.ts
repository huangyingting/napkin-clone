import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { looksLikeLegacyDeckV6, migrateLegacyDeckV6 } from "./migration-v6";

function migrateOk(raw: unknown) {
  const result = migrateLegacyDeckV6(raw);
  if (!result.ok) {
    assert.fail(result.error);
  }
  return result;
}

describe("migrateLegacyDeckV6 identity and shape coverage", () => {
  test("detects v6 decks by schemaVersion or legacy slide elements", () => {
    assert.equal(looksLikeLegacyDeckV6({ schemaVersion: 6 }), true);
    assert.equal(looksLikeLegacyDeckV6({ slides: [{ elements: [] }] }), true);
    assert.equal(looksLikeLegacyDeckV6({ slides: [{}] }), false);
    assert.equal(looksLikeLegacyDeckV6(null), false);
    assert.equal(looksLikeLegacyDeckV6([]), false);
  });

  test("rejects values that are not legacy v6 decks", () => {
    const result = migrateLegacyDeckV6({ schemaVersion: 5, slides: [] });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, "Deck JSON is not a legacy v6 deck.");
      assert.deepEqual(result.diagnostics, []);
    }
  });

  test("fails safely when filtering legacy slides leaves no valid v7 slides", () => {
    const result = migrateLegacyDeckV6({ schemaVersion: 6, slides: [null] });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /failed v7 validation/);
      assert.equal(result.diagnostics[0]?.severity, "fatal");
    }
  });

  test("migrates content-rich elements, metadata, assets, and connectors", () => {
    const result = migrateOk({
      schemaVersion: 6,
      id: "deck-rich",
      deckContentHash: "content-hash-1",
      canvas: { format: "4:3" },
      design: { themeId: "ocean" },
      slides: [
        {
          id: "slide-rich",
          title: "Rich slide",
          templateId: "theme:agenda",
          notes: "Speaker notes",
          elements: [
            {
              id: "subtitle-node",
              kind: "text",
              role: "subtitle",
              name: "Subtitle",
              locked: true,
              hidden: true,
              box: { x: 1, y: 2, w: -5, h: 0 },
              rotation: "bad",
              zIndex: 3.7,
              source: {
                documentId: "doc-1",
                blockId: "block-image",
                blockKind: "image",
                contentHash: "hash-1",
                linkedAt: "2026-06-30T00:00:00.000Z",
                unlinked: true,
              },
              content: {
                fitMode: "fixed-box",
                paragraphs: [
                  {
                    text: "Bold Italic",
                    runs: [
                      {
                        text: "Bold ",
                        bold: true,
                        italic: true,
                        underline: true,
                        code: true,
                        link: "https://example.com",
                        color: "#123456",
                      },
                      { text: "Italic" },
                    ],
                    listType: "number",
                    indent: 2,
                  },
                  {
                    text: "Bullet",
                    runs: [{ text: "Mismatch" }],
                    indent: 1,
                  },
                ],
              },
            },
            {
              id: "shape-path",
              kind: "shape",
              role: "card",
              box: { x: 20, y: 10, w: 20, h: 10 },
              content: {
                shape: "path",
                path: "M 0 0 L 10 10",
                text: "Path label",
                textRuns: [{ text: "Path label", bold: true }],
              },
            },
            {
              id: "shape-fallback",
              kind: "shape",
              role: "not-a-role",
              source: { documentId: "doc-1" },
              content: { shape: "path" },
            },
            {
              id: "visual-node",
              kind: "visual",
              role: "visual",
              content: { visualId: "visual-1", alt: "Revenue chart" },
            },
            {
              id: "image-generated",
              kind: "image",
              role: "image",
              content: {
                src: "https://example.com/generated.png",
                alt: "Generated image",
              },
            },
            {
              id: "image-external",
              kind: "image",
              content: { assetId: "external-asset" },
            },
            {
              id: "table-rich",
              kind: "table",
              content: {
                columns: [
                  { id: "c1", label: "First", width: 42 },
                  { label: "Second" },
                ],
                rows: [
                  {
                    id: "r1",
                    cells: [{ text: "A1" }, { text: "A2" }, { text: "A3" }],
                  },
                  { cells: [{ text: "B1" }] },
                ],
                header: true,
                caption: "Table caption",
              },
            },
            {
              id: "table-empty",
              kind: "table",
              content: {},
            },
            {
              id: "connector-node",
              kind: "connector",
              content: {
                start: { elementId: "subtitle-node", anchor: "diagonal" },
                end: { elementId: "shape-path", anchor: "top" },
              },
            },
            {
              id: "connector-points",
              kind: "connector",
              content: {
                start: { x: 12, y: 34 },
                end: "not-an-endpoint",
                routing: "elbow",
              },
            },
          ],
        },
      ],
    });

    assert.equal(result.deck.canvas.format, "4:3");
    assert.equal(result.deck.theme.packageId, "ocean");
    assert.equal(result.deck.metadata?.contentHash, "content-hash-1");
    const slide = result.deck.slides[0];
    assert.ok(slide);
    assert.equal(slide.template.kind, "agenda");
    assert.equal(slide.style?.ref, "slide.content");
    assert.equal(slide.name, "Rich slide");
    assert.equal(slide.notes, "Speaker notes");

    const text = slide.children[0];
    assert.ok(text);
    assert.equal(text.type, "text");
    if (text.type === "text") {
      assert.equal(text.style?.ref, "text.subtitle");
      assert.equal(text.locked, true);
      assert.equal(text.hidden, true);
      assert.equal(text.name, "Subtitle");
      assert.deepEqual(text.layout?.frame, { x: 1, y: 2, w: 0.1, h: 0.1 });
      assert.equal(text.layout?.rotation, 0);
      assert.equal(text.layout?.zIndex, 3);
      assert.equal(text.source?.blockKind, "image");
      assert.equal(text.source?.contentHash, "hash-1");
      assert.equal(text.source?.linkedAt, "2026-06-30T00:00:00.000Z");
      assert.equal(text.source?.unlinked, true);
      assert.equal(text.content.fit, "fixed-box");
      assert.deepEqual(text.content.paragraphs[0].list, {
        kind: "number",
        indent: 2,
      });
      assert.equal(
        text.content.paragraphs[0].runs?.[0].localStyle?.color,
        "#123456",
      );
      assert.deepEqual(text.content.paragraphs[1].list, {
        kind: "bullet",
        indent: 1,
      });
      assert.equal(text.content.paragraphs[1].runs, undefined);
    }

    const shape = result.deck.slides[0].children.find(
      (node) => node.id === "shape-path",
    );
    assert.equal(shape?.type, "shape");
    if (shape?.type === "shape") {
      assert.equal(shape.content.shape, "path");
      assert.equal(shape.content.path, "M 0 0 L 10 10");
      assert.equal(shape.content.text?.paragraphs[0].runs?.[0].bold, true);
    }

    const fallbackShape = result.deck.slides[0].children.find(
      (node) => node.id === "shape-fallback",
    );
    assert.equal(fallbackShape?.type, "shape");
    if (fallbackShape?.type === "shape") {
      assert.equal(fallbackShape.role, undefined);
      assert.equal(fallbackShape.source, undefined);
      assert.equal(fallbackShape.content.shape, "rect");
    }

    const visual = result.deck.slides[0].children.find(
      (node) => node.id === "visual-node",
    );
    assert.equal(visual?.type, "visual");
    if (visual?.type === "visual") {
      assert.equal(visual.role, "visual");
      assert.equal(visual.content.visualId, "visual-1");
      assert.equal(visual.content.alt, "Revenue chart");
    }

    const generatedImage = result.deck.slides[0].children.find(
      (node) => node.id === "image-generated",
    );
    assert.equal(generatedImage?.type, "image");
    if (generatedImage?.type === "image") {
      assert.equal(generatedImage.role, "image");
      assert.equal(generatedImage.content.assetId, "image-generated-asset");
      assert.equal(
        result.deck.assets.images["image-generated-asset"]?.src,
        "https://example.com/generated.png",
      );
    }

    const externalImage = result.deck.slides[0].children.find(
      (node) => node.id === "image-external",
    );
    assert.equal(externalImage?.type, "image");
    if (externalImage?.type === "image") {
      assert.equal(externalImage.content.assetId, "external-asset");
      assert.equal(result.deck.assets.images["external-asset"], undefined);
    }

    const table = result.deck.slides[0].children.find(
      (node) => node.id === "table-rich",
    );
    assert.equal(table?.type, "table");
    if (table?.type === "table") {
      assert.equal(table.content.columns[1].id, "table-rich-col-2");
      assert.equal(table.content.rows[1].id, "table-rich-row-2");
      assert.deepEqual(table.content.rows[1].cells, [
        { text: "B1" },
        { text: "" },
      ]);
      assert.equal(table.content.header, true);
      assert.equal(table.content.caption, "Table caption");
    }

    const emptyTable = result.deck.slides[0].children.find(
      (node) => node.id === "table-empty",
    );
    assert.equal(emptyTable?.type, "table");
    if (emptyTable?.type === "table") {
      assert.deepEqual(emptyTable.content.columns, [
        { id: "table-empty-col-1", label: "Column 1" },
      ]);
      assert.deepEqual(emptyTable.content.rows, [
        { id: "table-empty-row-1", cells: [{ text: "" }] },
      ]);
    }

    const nodeConnector = result.deck.slides[0].children.find(
      (node) => node.id === "connector-node",
    );
    assert.equal(nodeConnector?.type, "connector");
    if (nodeConnector?.type === "connector") {
      assert.deepEqual(nodeConnector.content.from, {
        kind: "node",
        nodeId: "subtitle-node",
        anchor: "center",
      });
      assert.deepEqual(nodeConnector.content.to, {
        kind: "node",
        nodeId: "shape-path",
        anchor: "top",
      });
      assert.equal(nodeConnector.content.routing, "straight");
    }

    const pointConnector = result.deck.slides[0].children.find(
      (node) => node.id === "connector-points",
    );
    assert.equal(pointConnector?.type, "connector");
    if (pointConnector?.type === "connector") {
      assert.deepEqual(pointConnector.content.from, {
        kind: "point",
        point: { x: 12, y: 34 },
      });
      assert.deepEqual(pointConnector.content.to, {
        kind: "point",
        point: { x: 0, y: 0 },
      });
      assert.equal(pointConnector.content.routing, "elbow");
    }

    assert.equal(result.idMap.sources["block-image"], "block-image");
  });

  test("maps text semantic roles to v7 style references", () => {
    const cases = [
      ["title", "text.title"],
      ["subtitle", "text.subtitle"],
      ["kicker", "text.kicker"],
      ["caption", "text.caption"],
      ["quote", "text.quote"],
      ["metric", "text.metric"],
      ["label", "text.body"],
    ] as const;
    const result = migrateOk({
      schemaVersion: 6,
      slides: [
        {
          id: "slide-roles",
          elements: cases.map(([role]) => ({
            id: `text-${role}`,
            kind: "text",
            role,
            content: { text: role, fitMode: "shrink-to-fit" },
          })),
        },
      ],
    });

    for (const [role, styleRef] of cases) {
      const node = result.deck.slides[0].children.find(
        (child) => child.id === `text-${role}`,
      );
      assert.equal(node?.type, "text");
      if (node?.type === "text") {
        assert.equal(node.style?.ref, styleRef);
        assert.equal(node.content.fit, "shrink-to-fit");
      }
    }
  });

  test("resolves legacy template ids, square canvas, and section styles", () => {
    const kinds = [
      "cover",
      "section",
      "agenda",
      "detail",
      "quote",
      "big-stat",
      "metric-row",
      "insight",
      "evidence",
      "table",
      "comparison",
      "matrix",
      "framework",
    ] as const;
    const result = migrateOk({
      schemaVersion: 6,
      canvas: { format: "square" },
      slides: kinds.map((kind, index) => ({
        id: `slide-${kind}`,
        templateId: `legacy:${kind}`,
        elements:
          index === 0
            ? [
                {
                  id: "cover-title",
                  kind: "text",
                  role: "title",
                  content: { text: "Cover" },
                },
              ]
            : [],
      })),
    });

    assert.equal(result.deck.canvas.format, "square");
    assert.deepEqual(
      result.deck.slides.map((slide) => slide.template.kind),
      [...kinds],
    );
    const [cover, section, agenda] = result.deck.slides;
    assert.ok(cover);
    assert.ok(section);
    assert.ok(agenda);
    assert.equal(cover.style?.ref, "slide.cover");
    assert.equal(section.style?.ref, "slide.section");
    assert.equal(agenda.style?.ref, "slide.content");
  });

  test("records duplicate and invalid id rewrites plus dropped elements", () => {
    const longId = "a".repeat(129);
    const result = migrateOk({
      schemaVersion: 6,
      id: longId,
      design: { themeId: "missing-theme" },
      slides: [
        {
          id: "duplicate",
          elements: [
            {
              id: "duplicate",
              kind: "text",
              content: { text: "Duplicate id" },
            },
            {
              id: "unsupported-node",
              kind: "video",
              content: {},
            },
            {
              id: "image-without-source",
              kind: "image",
              content: {},
            },
            {
              id: "visual-without-id",
              kind: "visual",
              content: {},
            },
            null,
          ],
        },
      ],
    });

    assert.equal(result.deck.id, "a".repeat(128));
    assert.equal(result.deck.theme.packageId, "neutral");
    assert.equal(result.idMap.decks[longId], "a".repeat(128));
    assert.equal(result.idMap.nodes.duplicate, "duplicate-2");
    assert.ok(
      result.idMap.rewrites.some(
        (rewrite) =>
          rewrite.kind === "node" &&
          rewrite.from === "duplicate" &&
          rewrite.reason === "duplicate-id",
      ),
    );
    assert.ok(
      result.idMap.rewrites.some(
        (rewrite) =>
          rewrite.kind === "deck" &&
          rewrite.from === longId &&
          rewrite.reason === "invalid-id",
      ),
    );
    assert.ok(
      result.idMap.rewrites.some(
        (rewrite) =>
          rewrite.kind === "theme" &&
          rewrite.from === "missing-theme" &&
          rewrite.to === "neutral" &&
          rewrite.reason === "theme-package-remapped",
      ),
    );
    assert.deepEqual(
      result.idMap.dropped.map((drop) => [drop.from, drop.reason]),
      [
        ["unsupported-node", 'Unsupported element kind "video".'],
        ["image-without-source", "Image element has no resolvable source."],
        ["visual-without-id", "Visual element has no visualId."],
      ],
    );
    assert.equal(
      result.diagnostics.filter(
        (diagnostic) => diagnostic.code === "migration-dropped-node",
      ).length,
      3,
    );
  });
});

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
