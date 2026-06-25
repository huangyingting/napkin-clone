import assert from "node:assert/strict";
import test from "node:test";

import {
  deleteAccountAssetStorage,
  verifyAccountErasure,
  type AccountAssetDeletionTarget,
  type AccountErasureClient,
} from "@/lib/account/erasure";

function clientWithCounts(
  counts: Record<string, number>,
): AccountErasureClient {
  const delegate = (model: string) => ({
    count: async () => counts[model] ?? 0,
  });
  return {
    user: delegate("User"),
    document: delegate("Document"),
    documentVersion: delegate("DocumentVersion"),
    comment: delegate("Comment"),
    commentRead: delegate("CommentRead"),
    workspace: delegate("Workspace"),
    workspaceMember: delegate("WorkspaceMember"),
    tag: delegate("Tag"),
    brand: delegate("Brand"),
    subscription: delegate("Subscription"),
    inviteLink: delegate("InviteLink"),
    inviteLinkUse: delegate("InviteLinkUse"),
    usageLedgerEntry: delegate("UsageLedgerEntry"),
    rateLimitHit: delegate("RateLimitHit"),
    asset: delegate("Asset"),
  };
}

test("verifyAccountErasure reports residual inventoried personal data", async () => {
  const findings = await verifyAccountErasure(
    clientWithCounts({ Comment: 2, RateLimitHit: 1 }),
    "user_1",
  );

  assert.deepEqual(findings, [
    { model: "Comment", count: 2 },
    { model: "RateLimitHit", count: 1 },
  ]);
});

test("deleteAccountAssetStorage purges slide and brand storage keys", async () => {
  const assets: AccountAssetDeletionTarget[] = [
    {
      id: "slide_asset",
      storageKey: "doc/file.png",
      thumbnailKey: "doc/thumb.png",
      brandId: null,
      documentId: "doc_1",
      workspaceId: null,
    },
    {
      id: "brand_asset",
      storageKey: "user/logo.png",
      thumbnailKey: null,
      brandId: "brand_1",
      documentId: null,
      workspaceId: null,
    },
  ];
  const deleted: string[] = [];

  await deleteAccountAssetStorage(assets, {
    slide: {
      delete: async (key) => {
        deleted.push(`slide:${key}`);
      },
    },
    brand: {
      delete: async (key) => {
        deleted.push(`brand:${key}`);
      },
    },
  });

  assert.deepEqual(deleted, [
    "slide:doc/file.png",
    "slide:doc/thumb.png",
    "brand:user/logo.png",
  ]);
});
