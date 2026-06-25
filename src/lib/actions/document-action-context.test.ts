import assert from "node:assert/strict";
import { test } from "node:test";

import { DocumentPermissionError } from "@/lib/auth/document-permissions";
import {
  createRequireDocumentActionContext,
  type DocumentActionUser,
} from "./document-action-context";

const user = {
  id: "user-1",
  email: "user@example.com",
} as DocumentActionUser;

test("requireDocumentActionContext: returns the current user and authorization", async () => {
  const calls: unknown[] = [];
  const authorization = {
    role: "editor" as const,
    canView: true,
    canEdit: true,
    canManage: false,
    document: { id: "doc-1", ownerId: "owner-1", workspaceId: "ws-1" },
  };

  const requireDocumentActionContext = createRequireDocumentActionContext({
    async requireUser() {
      calls.push("requireUser");
      return user;
    },
    async requireDocumentCapability(userId, documentId, capability) {
      calls.push({ userId, documentId, capability });
      return authorization;
    },
  });

  const result = await requireDocumentActionContext("doc-1", "edit");

  assert.deepEqual(calls, [
    "requireUser",
    { userId: "user-1", documentId: "doc-1", capability: "edit" },
  ]);
  assert.equal(result.user, user);
  assert.equal(result.authorization, authorization);
});

test("requireDocumentActionContext: propagates unauthenticated redirects before capability checks", async () => {
  const redirect = new Error("NEXT_REDIRECT");
  let checkedCapability = false;

  const requireDocumentActionContext = createRequireDocumentActionContext({
    async requireUser() {
      throw redirect;
    },
    async requireDocumentCapability() {
      checkedCapability = true;
      throw new Error("should not run");
    },
  });

  await assert.rejects(
    () => requireDocumentActionContext("doc-1", "view"),
    (error) => error === redirect,
  );
  assert.equal(checkedCapability, false);
});

test("requireDocumentActionContext: propagates document permission denials", async () => {
  const denial = new DocumentPermissionError(
    "You do not have permission to edit this document.",
    "edit",
  );

  const requireDocumentActionContext = createRequireDocumentActionContext({
    async requireUser() {
      return user;
    },
    async requireDocumentCapability(userId, documentId, capability) {
      assert.equal(userId, "user-1");
      assert.equal(documentId, "doc-1");
      assert.equal(capability, "edit");
      throw denial;
    },
  });

  await assert.rejects(
    () => requireDocumentActionContext("doc-1", "edit"),
    (error) => error === denial,
  );
});
