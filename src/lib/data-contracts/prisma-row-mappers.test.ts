import assert from "node:assert/strict";
import test from "node:test";

import { CURRENT_DECK_SCHEMA_VERSION } from "@/lib/presentation/deck";

import {
  mapCommentRowToDto,
  mapDocumentRowToDto,
  mapSubscriptionLiterals,
  mapTagRowToDto,
  mapUsageLedgerLiterals,
  mapVisualRowToDto,
  mapWorkspaceRowToDto,
  type CommentDtoRow,
  type DocumentDtoRow,
  type TagDtoRow,
  type VisualDtoRow,
  type WorkspaceDtoRow,
} from "./prisma-row-mappers";

const now = new Date("2026-06-25T15:15:00.000Z");

function deck(): unknown {
  return {
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    canvas: { format: "16:9" },
    design: { themeId: "indigo" },
    masters: [{ id: "master-default", name: "Default", elements: [] }],
    defaultMasterId: "master-default",
    slides: [
      {
        id: "s1",
        index: 0,
        title: "Title",
        notes: "",
        elements: [],
      },
    ],
  };
}

function visual(): unknown {
  return {
    version: 1,
    type: "flowchart",
    width: 760,
    height: 480,
    nodes: [{ id: "n1", label: "Start" }],
    edges: [],
  };
}

test("maps document rows to serial DTOs and validates current JSON contracts", () => {
  const dto = mapDocumentRowToDto({
    id: "doc-1",
    title: "Doc",
    content: "Body",
    contentJson: { root: { children: [] } },
    deckJson: deck(),
    deckRevisionToken: "rev",
    ownerId: "user-1",
    workspaceId: null,
    shareId: null,
    slug: null,
    isShared: false,
    favorite: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  } as DocumentDtoRow);

  assert.equal(dto.createdAt, "2026-06-25T15:15:00.000Z");
  assert.equal(dto.favorite, true);
  assert.throws(
    () =>
      mapDocumentRowToDto({
        ...dto,
        createdAt: now,
        updatedAt: now,
        deckJson: JSON.stringify(deck()),
      } as DocumentDtoRow),
    /Deck must be an object/,
  );
});

test("maps visual rows with matching literal type and data type", () => {
  const row = {
    id: "visual-1",
    documentId: "doc-1",
    anchorBlockId: "block-1",
    orderIndex: 0,
    type: "flowchart",
    title: null,
    data: visual(),
    createdAt: now,
    updatedAt: now,
  } as VisualDtoRow;
  const dto = mapVisualRowToDto(row);
  assert.equal(dto.type, "flowchart");
  assert.equal(dto.data.type, "flowchart");
  assert.throws(
    () =>
      mapVisualRowToDto({
        ...row,
        type: "bogus",
      } as VisualDtoRow),
    /Visual type/,
  );
});

test("maps comment, tag, workspace, and literal rows", () => {
  const comment = mapCommentRowToDto({
    id: "comment-1",
    documentId: "doc-1",
    authorId: "user-1",
    body: "Looks good",
    resolved: false,
    parentId: null,
    anchorType: "text",
    anchorText: "Looks",
    anchorNodeId: "block-1",
    slideId: null,
    elementId: null,
    anchorGeometry: null,
    createdAt: now,
    updatedAt: now,
  } as CommentDtoRow);
  assert.equal(comment.anchor.kind, "text");

  const tag = mapTagRowToDto({
    id: "tag-1",
    name: "Product Plan",
    slug: "product-plan",
    ownerId: "user-1",
    createdAt: now,
    updatedAt: now,
  } as TagDtoRow);
  assert.equal(tag.slug, "product-plan");

  const workspace = mapWorkspaceRowToDto({
    id: "workspace-1",
    name: "Team",
    ownerId: "owner-1",
    createdAt: now,
    updatedAt: now,
    members: [
      { id: "member-1", userId: "user-1", role: "EDITOR", createdAt: now },
    ],
  } as WorkspaceDtoRow);
  assert.equal(workspace.members[0]?.role, "EDITOR");

  assert.deepEqual(
    mapSubscriptionLiterals({ plan: "plus", status: "active" }),
    {
      plan: "plus",
      status: "active",
    },
  );
  assert.deepEqual(mapUsageLedgerLiterals({ status: "captured" }), {
    status: "captured",
  });
});
