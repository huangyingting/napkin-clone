import assert from "node:assert/strict";
import { test } from "node:test";

import {
  accessibleDocumentWhere,
  accessibleWorkspaceWhere,
  documentAccessOr,
  workspaceAccessOr,
} from "./access-query";

test("workspaceAccessOr preserves owner-or-member scope", () => {
  assert.deepEqual(workspaceAccessOr("user-1"), [
    { ownerId: "user-1" },
    { members: { some: { userId: "user-1" } } },
  ]);
});

test("accessibleWorkspaceWhere scopes a concrete workspace to owner-or-member", () => {
  assert.deepEqual(accessibleWorkspaceWhere("user-1", "workspace-1"), {
    id: "workspace-1",
    OR: workspaceAccessOr("user-1"),
  });
});

test("documentAccessOr preserves owner-or-accessible-workspace scope", () => {
  assert.deepEqual(documentAccessOr("user-1"), [
    { ownerId: "user-1" },
    {
      workspaceId: { not: null },
      workspace: { OR: workspaceAccessOr("user-1") },
    },
  ]);
});

test("accessibleDocumentWhere excludes deleted rows unless requested", () => {
  assert.deepEqual(accessibleDocumentWhere("user-1", "doc-1"), {
    id: "doc-1",
    deletedAt: null,
    OR: documentAccessOr("user-1"),
  });
  assert.deepEqual(
    accessibleDocumentWhere("user-1", "doc-1", {
      includeDeleted: true,
    }),
    {
      id: "doc-1",
      OR: documentAccessOr("user-1"),
    },
  );
});
