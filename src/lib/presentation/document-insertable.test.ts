import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  DocumentBlock,
  DocumentTableBlock,
  DocumentTextBlock,
} from "@/lib/content";
import type { Visual } from "@/lib/visual/schema";

import {
  buildInsertables,
  buildSourceRefFromBlock,
  insertableTableElement,
  insertableTextElement,
  type Insertable,
} from "./document-insertable";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function heading(text: string, level: 1 | 2 | 3): DocumentTextBlock {
  return { kind: "text", blockType: "heading", level, text };
}

function para(text: string, runs?: DocumentTextBlock["runs"]): DocumentBlock {
  return {
    kind: "text",
    blockType: "paragraph",
    text,
    ...(runs ? { runs } : {}),
  };
}

function hr(): DocumentBlock {
  return { kind: "text", blockType: "hr", text: "" };
}

const FAKE_VISUAL = { type: "chart" } as unknown as Visual;

function visual(visualId: string): DocumentBlock {
  return { kind: "visual", visualId, visual: FAKE_VISUAL };
}

function tableBlock(
  overrides: Partial<DocumentTableBlock> = {},
): DocumentTableBlock {
  return {
    kind: "table",
    blockId: "table-1",
    caption: "Pipeline",
    columns: [
      { id: "col-1", label: "Stage" },
      { id: "col-2", label: "Value" },
    ],
    rows: [
      {
        id: "row-1",
        cells: [
          { text: "Qualified" },
          { text: "$2M", runs: [{ text: "$2M", bold: true }] },
        ],
      },
    ],
    ...overrides,
  };
}

function elementRole(element: unknown): string | undefined {
  return (element as any).role;
}

function elementText(element: unknown): string | undefined {
  return (element as any).content?.text;
}

function elementRuns(element: unknown): unknown {
  return (element as any).content?.runs;
}

function elementTextStyle(element: unknown): any {
  return (element as any).designOverrides?.textStyle;
}

function textItems(
  items: Insertable[],
): Extract<Insertable, { kind: "text" }>[] {
  return items.filter(
    (item): item is Extract<Insertable, { kind: "text" }> =>
      item.kind === "text",
  );
}

// ---------------------------------------------------------------------------
// buildInsertables
// ---------------------------------------------------------------------------

test("skips hr and empty / whitespace-only text blocks", () => {
  const blocks: DocumentBlock[] = [
    para("Real text"),
    hr(),
    para(""),
    para("   \n\t "),
    para("Another"),
  ];
  const items = buildInsertables(blocks);
  assert.deepEqual(
    items.map((i) =>
      i.kind === "text" ? i.text : i.kind === "visual" ? i.visualId : i.label,
    ),
    ["Real text", "Another"],
  );
});

test("dedupes visuals by visualId keeping the first occurrence", () => {
  const blocks: DocumentBlock[] = [
    visual("v1"),
    visual("v2"),
    visual("v1"),
    visual("v2"),
  ];
  const items = buildInsertables(blocks);
  assert.deepEqual(
    items.map((i) => (i.kind === "visual" ? i.visualId : null)),
    ["v1", "v2"],
  );
});

test("buildInsertables carries non-empty table blocks with stable metadata", () => {
  const block = tableBlock();
  const [item] = buildInsertables([block]);

  assert.equal(item.kind, "table");
  if (item.kind !== "table") return;
  assert.equal(item.label, "Pipeline");
  assert.equal(item.block, block);
  assert.equal(item.blockId, "table-1");
  assert.equal(item.contentHash, hashDocumentBlock(block));
});

test("buildInsertables labels captionless tables from columns", () => {
  const tableWithoutCaption = tableBlock({
    caption: undefined,
    blockId: undefined,
  });
  const structuralTable = tableBlock({
    caption: undefined,
    columns: [],
    rows: [],
  });

  const items = buildInsertables([tableWithoutCaption, structuralTable]);

  assert.equal(items.length, 2);
  assert.equal(items[0].kind, "table");
  if (items[0].kind !== "table") return;
  assert.equal(items[0].label, "Stage / Value");
  assert.equal(items[0].blockId, undefined);
  assert.equal(items[1].kind, "table");
  if (items[1].kind !== "table") return;
  assert.equal(items[1].label, "");
});

test("preserves document order across text and visuals", () => {
  const blocks: DocumentBlock[] = [
    heading("Title", 1),
    visual("v1"),
    para("Body"),
    visual("v2"),
  ];
  const items = buildInsertables(blocks);
  assert.deepEqual(
    items.map((i) => i.kind),
    ["text", "visual", "text", "visual"],
  );
});

test("truncates long text labels with an ellipsis but keeps full text", () => {
  const long =
    "This is a very long paragraph that easily exceeds the forty character label limit";
  const items = textItems(buildInsertables([para(long)]));
  assert.equal(items.length, 1);
  assert.ok(items[0].label.length <= 40);
  assert.ok(items[0].label.endsWith("…"));
  assert.equal(items[0].text, long);
});

test("does not truncate short labels", () => {
  const items = textItems(buildInsertables([para("Short line")]));
  assert.equal(items[0].label, "Short line");
});

test("marks heading blocks and carries level; paragraphs are not headings", () => {
  const items = textItems(buildInsertables([heading("H2", 2), para("Body")]));
  assert.equal(items[0].heading, true);
  assert.equal(items[0].level, 2);
  assert.equal(items[1].heading, false);
  assert.equal(items[1].level, undefined);
});

test("carries runs through only when present and non-empty", () => {
  const runs = [{ text: "Bold", bold: true }];
  const items = textItems(
    buildInsertables([para("Bold", runs), para("Plain")]),
  );
  assert.deepEqual(items[0].runs, runs);
  assert.equal(items[1].runs, undefined);
});

// ---------------------------------------------------------------------------
// insertableTextElement
// ---------------------------------------------------------------------------

test("maps a level-1 heading to a large bold title element", () => {
  const [item] = textItems(buildInsertables([heading("Hello", 1)]));
  const el = insertableTextElement(item, { id: "fixed" });
  assert.equal(el.id, "fixed");
  assert.equal(el.kind, "text");
  assert.equal(elementRole(el), "title");
  assert.equal(elementText(el), "Hello");
  assert.equal(elementTextStyle(el).bold, true);
  assert.equal(elementTextStyle(el).fontSize, 6.5);
  assert.equal(elementTextStyle(el).italic, false);
  assert.equal(elementTextStyle(el).align, "left");
});

test("maps lower-level headings to bold body elements with smaller sizes", () => {
  const [h2] = textItems(buildInsertables([heading("H2", 2)]));
  const [h3] = textItems(buildInsertables([heading("H3", 3)]));
  assert.equal(elementRole(insertableTextElement(h2)), "sectionTitle");
  assert.equal(elementTextStyle(insertableTextElement(h2)).fontSize, 5.5);
  assert.equal(elementTextStyle(insertableTextElement(h2)).bold, true);
  assert.equal(elementTextStyle(insertableTextElement(h3)).fontSize, 5);
});

test("maps document heading levels to semantic presentation roles (#610)", () => {
  const [h1] = textItems(buildInsertables([heading("H1", 1)]));
  const [h2] = textItems(buildInsertables([heading("H2", 2)]));
  const [h3] = textItems(buildInsertables([heading("H3", 3)]));
  const [body] = textItems(buildInsertables([para("Body")]));
  assert.equal(elementRole(insertableTextElement(h1)), "title");
  assert.equal(elementRole(insertableTextElement(h2)), "sectionTitle");
  assert.equal(elementRole(insertableTextElement(h3)), "body");
  assert.equal(elementRole(insertableTextElement(body)), "body");
});

test("maps a paragraph to a non-bold body element at body size", () => {
  const [item] = textItems(buildInsertables([para("Body text")]));
  const el = insertableTextElement(item);
  assert.equal(elementRole(el), "body");
  assert.equal(elementTextStyle(el).bold, false);
  assert.equal(elementTextStyle(el).fontSize, 4);
  assert.ok(el.id.length > 0);
});

test("passes runs through to the built element only when present", () => {
  const runs = [{ text: "Hi", italic: true }];
  const [withRuns] = textItems(buildInsertables([para("Hi", runs)]));
  const [plain] = textItems(buildInsertables([para("Plain")]));
  assert.deepEqual(elementRuns(insertableTextElement(withRuns)), runs);
  assert.equal(elementRuns(insertableTextElement(plain)), undefined);
});

// ---------------------------------------------------------------------------
// contentHash and blockId on Insertable (issue #377)
// ---------------------------------------------------------------------------

test("text insertables always carry a contentHash string", () => {
  const items = textItems(buildInsertables([para("Body"), heading("H1", 1)]));
  for (const item of items) {
    assert.equal(typeof item.contentHash, "string");
    assert.ok(item.contentHash.length > 0);
  }
});

test("contentHash is deterministic: same block same hash", () => {
  const [a] = textItems(buildInsertables([para("Stable")]));
  const [b] = textItems(buildInsertables([para("Stable")]));
  assert.equal(a.contentHash, b.contentHash);
});

test("contentHash differs for different block text", () => {
  const [a] = textItems(buildInsertables([para("Alpha")]));
  const [b] = textItems(buildInsertables([para("Beta")]));
  assert.notEqual(a.contentHash, b.contentHash);
});

test("contentHash differs for heading vs paragraph with same text", () => {
  const [h] = textItems(buildInsertables([heading("Intro", 1)]));
  const [p] = textItems(buildInsertables([para("Intro")]));
  assert.notEqual(h.contentHash, p.contentHash);
});

test("blockId is absent when block has no blockId", () => {
  const [item] = textItems(buildInsertables([para("No id")]));
  assert.equal(item.blockId, undefined);
});

test("blockId is carried through when block has a blockId", () => {
  const block: DocumentTextBlock = {
    kind: "text",
    blockType: "paragraph",
    text: "With id",
    blockId: "block-abc-123",
  };
  const [item] = textItems(buildInsertables([block]));
  assert.equal(item.blockId, "block-abc-123");
});

// ---------------------------------------------------------------------------
// buildSourceRefFromBlock
// ---------------------------------------------------------------------------

test("buildSourceRefFromBlock returns a valid SourceRef", () => {
  const ref = buildSourceRefFromBlock(
    "doc-1",
    "block-42",
    "a1b2c3d4",
    "2026-01-01T00:00:00.000Z",
  );
  assert.equal(ref.documentId, "doc-1");
  assert.equal(ref.blockId, "block-42");
  assert.equal(ref.contentHash, "a1b2c3d4");
  assert.equal(ref.linkedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(ref.unlinked, undefined);
});

// ---------------------------------------------------------------------------
// insertableTextElement sourceRef stamping (issue #377)
// ---------------------------------------------------------------------------

test("insertableTextElement omits sourceRef when documentId is absent", () => {
  const block: DocumentTextBlock = {
    kind: "text",
    blockType: "paragraph",
    text: "No doc id",
    blockId: "blk-1",
  };
  const [item] = textItems(buildInsertables([block]));
  const el = insertableTextElement(item);
  assert.equal(el.source, undefined);
});

test("insertableTextElement omits sourceRef when blockId is absent even with documentId", () => {
  const [item] = textItems(buildInsertables([para("No block id")]));
  const el = insertableTextElement(item, {
    documentId: "doc-1",
    linkedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(el.source, undefined);
});

test("insertableTextElement stamps sourceRef when documentId and blockId are both provided", () => {
  const block: DocumentTextBlock = {
    kind: "text",
    blockType: "paragraph",
    text: "Linked text",
    blockId: "blk-linked",
  };
  const [item] = textItems(buildInsertables([block]));
  const el = insertableTextElement(item, {
    documentId: "doc-xyz",
    linkedAt: "2026-06-01T12:00:00.000Z",
  });
  assert.ok(el.source !== undefined, "sourceRef should be set");
  assert.equal(el.source!.documentId, "doc-xyz");
  assert.equal(el.source!.blockId, "blk-linked");
  assert.equal(el.source!.linkedAt, "2026-06-01T12:00:00.000Z");
  assert.equal(typeof el.source!.contentHash, "string");
  assert.ok(el.source!.contentHash!.length > 0);
  assert.equal(el.source!.unlinked, undefined);
});

test("insertableTextElement sourceRef contentHash matches block contentHash", () => {
  const block: DocumentTextBlock = {
    kind: "text",
    blockType: "paragraph",
    text: "Consistent hash",
    blockId: "blk-hash",
  };
  const [item] = textItems(buildInsertables([block]));
  const el = insertableTextElement(item, {
    documentId: "doc-1",
    linkedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(el.source!.contentHash, item.contentHash);
});

test("insertableTextElement defaults linkedAt to now when documentId set but linkedAt omitted", () => {
  const block: DocumentTextBlock = {
    kind: "text",
    blockType: "paragraph",
    text: "Auto time",
    blockId: "blk-auto",
  };
  const before = Date.now();
  const [item] = textItems(buildInsertables([block]));
  const el = insertableTextElement(item, { documentId: "doc-1" });
  const after = Date.now();
  assert.ok(el.source !== undefined);
  const ts = Date.parse(el.source!.linkedAt);
  assert.ok(ts >= before && ts <= after, "linkedAt should be near now");
});

test("insertableTextElement heading stamps sourceRef when both ids present", () => {
  const block: DocumentTextBlock = {
    kind: "text",
    blockType: "heading",
    level: 2,
    text: "Section Title",
    blockId: "blk-h2",
  };
  const [item] = textItems(buildInsertables([block]));
  const el = insertableTextElement(item, {
    documentId: "doc-2",
    linkedAt: "2026-06-01T00:00:00.000Z",
  });
  assert.equal(el.source!.documentId, "doc-2");
  assert.equal(el.source!.blockId, "blk-h2");
  assert.equal(elementRole(el), "sectionTitle");
  assert.equal(elementTextStyle(el).bold, true);
});

// ---------------------------------------------------------------------------
// Visual insertable source metadata (#424)
// ---------------------------------------------------------------------------

import { insertableVisualElement } from "./document-insertable";
import { hashDocumentBlock } from "./document-block-hash";

function visualBlock(visualId: string): DocumentBlock {
  return { kind: "visual", visualId, visual: {} as Visual };
}

test("visual insertable carries contentHash", () => {
  const block = visualBlock("vis-abc");
  const items = buildInsertables([block]);
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "visual");
  const item = items[0] as Extract<(typeof items)[0], { kind: "visual" }>;
  assert.equal(typeof item.contentHash, "string");
  assert.ok(item.contentHash.length > 0);
  assert.equal(item.contentHash, hashDocumentBlock(block));
});

test("visual insertable contentHash is deterministic", () => {
  const b1 = visualBlock("vis-x");
  const b2 = visualBlock("vis-x");
  const items1 = buildInsertables([b1]);
  const items2 = buildInsertables([b2]);
  const i1 = items1[0] as Extract<(typeof items1)[0], { kind: "visual" }>;
  const i2 = items2[0] as Extract<(typeof items2)[0], { kind: "visual" }>;
  assert.equal(i1.contentHash, i2.contentHash);
});

test("visual insertable contentHash differs for different visual ids", () => {
  const items = buildInsertables([visualBlock("vis-1"), visualBlock("vis-2")]);
  const i1 = items[0] as Extract<(typeof items)[0], { kind: "visual" }>;
  const i2 = items[1] as Extract<(typeof items)[1], { kind: "visual" }>;
  assert.notEqual(i1.contentHash, i2.contentHash);
});

test("insertableVisualElement: builds element without sourceRef when documentId absent", () => {
  const block = visualBlock("vis-abc");
  const [item] = buildInsertables([block]) as Extract<
    ReturnType<typeof buildInsertables>[number],
    { kind: "visual" }
  >[];
  const el = insertableVisualElement(item);
  assert.equal(el.kind, "visual");
  assert.equal((el as any).content.visualId, "vis-abc");
  assert.equal((el as any).source, undefined);
});

test("insertableVisualElement: stamps sourceRef with blockKind visual when documentId provided", () => {
  const block = visualBlock("vis-xyz");
  const items = buildInsertables([block]);
  const item = items[0] as Extract<(typeof items)[0], { kind: "visual" }>;
  const el = insertableVisualElement(item, {
    documentId: "doc-1",
    linkedAt: "2026-06-01T00:00:00.000Z",
  });
  const source = (el as any).source;
  assert.ok(source !== undefined);
  assert.equal(source.documentId, "doc-1");
  assert.equal(source.blockId, "vis-xyz");
  assert.equal(source.blockKind, "visual");
  assert.equal(source.contentHash, item.contentHash);
  assert.equal(source.linkedAt, "2026-06-01T00:00:00.000Z");
  assert.equal(source.unlinked, undefined);
});

test("insertableVisualElement: visualId matches the sourceRef blockId", () => {
  const block = visualBlock("vis-q");
  const [item] = buildInsertables([block]) as Extract<
    ReturnType<typeof buildInsertables>[number],
    { kind: "visual" }
  >[];
  const el = insertableVisualElement(item, {
    documentId: "doc-2",
    linkedAt: "2026-06-01T00:00:00.000Z",
  });
  assert.equal((el as any).content.visualId, (el as any).source.blockId);
});

test("insertableVisualElement: defaults linkedAt to now when omitted", () => {
  const block = visualBlock("vis-time");
  const [item] = buildInsertables([block]) as Extract<
    ReturnType<typeof buildInsertables>[number],
    { kind: "visual" }
  >[];
  const before = Date.now();
  const el = insertableVisualElement(item, { documentId: "doc-1" });
  const after = Date.now();
  const ts = Date.parse((el as any).source.linkedAt);
  assert.ok(ts >= before && ts <= after, "linkedAt should be near now");
});

test("insertableTableElement maps table content, runs, source, and overrides", () => {
  const [item] = buildInsertables([tableBlock()]) as Extract<
    ReturnType<typeof buildInsertables>[number],
    { kind: "table" }
  >[];

  const el = insertableTableElement(item, {
    id: "table-fixed",
    box: { x: 1, y: 2, w: 3, h: 4 },
    documentId: "doc-1",
    linkedAt: "2026-06-01T00:00:00.000Z",
  });

  assert.equal(el.id, "table-fixed");
  assert.equal(el.kind, "table");
  assert.equal(el.role, "table");
  assert.deepEqual(el.box, { x: 1, y: 2, w: 3, h: 4 });
  assert.equal(el.content.caption, "Pipeline");
  assert.deepEqual(el.content.columns, [
    { id: "col-1", label: "Stage" },
    { id: "col-2", label: "Value" },
  ]);
  assert.deepEqual(el.content.rows[0]?.cells[1]?.runs, [
    { text: "$2M", bold: true },
  ]);
  assert.deepEqual(el.source, {
    documentId: "doc-1",
    blockId: "table-1",
    contentHash: item.contentHash,
    linkedAt: "2026-06-01T00:00:00.000Z",
    blockKind: "table",
  });
});

test("insertableTableElement omits source when table block ids are unavailable", () => {
  const [item] = buildInsertables([
    tableBlock({ blockId: undefined }),
  ]) as Extract<
    ReturnType<typeof buildInsertables>[number],
    { kind: "table" }
  >[];

  const el = insertableTableElement(item, { documentId: "doc-1" });

  assert.equal(el.source, undefined);
  assert.deepEqual(el.box, { x: 12, y: 22, w: 76, h: 48 });
});
