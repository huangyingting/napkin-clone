import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildDuplicateDocumentCreateData,
  remapDeckSourceRefs,
} from "./duplicate";
import { CURRENT_DECK_SCHEMA_VERSION } from "@/lib/presentation/deck";

const sourceRef = {
  documentId: "source-doc",
  blockId: "old-bid",
  linkedAt: "2026-06-25T00:00:00.000Z",
  blockKind: "text" as const,
};

function deckWithSourceRefs() {
  return {
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    canvas: { format: "16:9" },
    design: { themeId: "default" },
    masters: [{ id: "master-default", name: "Default", elements: [] }],
    defaultMasterId: "master-default",
    slides: [
      {
        id: "slide-1",
        index: 0,
        title: "",
        notes: "",
        elements: [
          {
            id: "el-linked",
            kind: "visual",
            role: "visual",
            content: { kind: "visual", visualId: "visual-1" },
            box: { x: 0, y: 0, w: 10, h: 10 },
            zIndex: 1,
            source: sourceRef,
          },
          {
            id: "el-other-doc",
            kind: "visual",
            role: "visual",
            content: { kind: "visual", visualId: "visual-2" },
            box: { x: 10, y: 10, w: 10, h: 10 },
            zIndex: 2,
            source: { ...sourceRef, documentId: "other-doc" },
          },
        ],
      },
    ],
  };
}

test("remapDeckSourceRefs updates source document id and regenerated block id", () => {
  const remapped = remapDeckSourceRefs(
    deckWithSourceRefs(),
    "source-doc",
    "copy-doc",
    new Map([["old-bid", "new-bid"]]),
  ) as ReturnType<typeof deckWithSourceRefs>;

  const linked = (remapped.slides[0]!.elements[0]! as any).source!;
  assert.equal(linked.documentId, "copy-doc");
  assert.equal(linked.blockId, "new-bid");
  assert.equal(linked.blockKind, "text");

  const other = (remapped.slides[0]!.elements[1]! as any).source!;
  assert.equal(other.documentId, "other-doc");
  assert.equal(other.blockId, "old-bid");
});

test("duplicate create data is private and clones visuals without comments or share state", () => {
  const data = buildDuplicateDocumentCreateData(
    {
      title: "Source",
      contentJson: { root: { children: [] } },
      deckJson: null,
      visuals: [
        {
          anchorBlockId: "old-bid",
          orderIndex: 0,
          type: "flowchart",
          title: "Visual",
          data: { kind: "flowchart" },
        },
      ],
    },
    "user-1",
    { root: { children: [] } },
    new Map([["old-bid", "new-bid"]]),
  );

  assert.equal(data.ownerId, "user-1");
  assert.equal(data.title, "Source (copy)");
  assert.equal(data.visuals.create[0]!.anchorBlockId, "new-bid");
  assert.equal("isShared" in data, false);
  assert.equal("shareId" in data, false);
  assert.equal("comments" in data, false);
  assert.equal("tags" in data, false);
});
