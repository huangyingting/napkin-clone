/**
 * Tests for asset access control helper logic (issue #395).
 *
 * The HTTP route itself can't be tested under node:test without a running
 * Next.js server.  These tests verify the access-control decision logic by
 * testing the underlying permission helpers that the route delegates to:
 *  - documentCapabilities (from document-permissions)
 *  - evaluateShareAccess (from share-access)
 *
 * This covers: owner access, workspace viewer access, public share access,
 * and denied access — matching the acceptance criteria of issue #395.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  documentCapabilities,
  deriveDocumentRole,
  type DocumentRoleInput,
} from "@/lib/auth/document-permissions";
import {
  evaluateShareAccess,
  toShareAccessInput,
  type ShareAccessFields,
} from "@/lib/share-access";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDoc(opts: {
  ownerId: string;
  workspaceId?: string;
  workspaceOwnerId?: string;
  members?: { userId: string; role: string }[];
}): DocumentRoleInput {
  return {
    ownerId: opts.ownerId,
    workspaceId: opts.workspaceId ?? null,
    workspace: opts.workspaceId
      ? {
          ownerId: opts.workspaceOwnerId ?? opts.ownerId,
          members: opts.members ?? [],
        }
      : null,
  };
}

function sharedDoc(
  overrides: Partial<ShareAccessFields> = {},
): ShareAccessFields {
  return {
    shareId: "share-abc",
    isShared: true,
    deletedAt: null,
    shareExpiresAt: null,
    shareEmbedEnabled: true,
    sharePresentEnabled: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Owner access
// ---------------------------------------------------------------------------

test("#395: document owner has view capability", () => {
  const doc = makeDoc({ ownerId: "owner-1" });
  const caps = documentCapabilities(doc, "owner-1");
  assert.ok(caps.canView);
  assert.ok(caps.canEdit);
  assert.ok(caps.canManage);
});

// ---------------------------------------------------------------------------
// Workspace viewer access
// ---------------------------------------------------------------------------

test("#395: workspace viewer has view capability but not edit", () => {
  const doc = makeDoc({
    ownerId: "owner-1",
    workspaceId: "ws-1",
    workspaceOwnerId: "ws-owner",
    members: [{ userId: "viewer-1", role: "VIEWER" }],
  });
  const caps = documentCapabilities(doc, "viewer-1");
  assert.ok(caps.canView);
  assert.ok(!caps.canEdit);
});

test("#395: workspace editor has view + edit capability", () => {
  const doc = makeDoc({
    ownerId: "owner-1",
    workspaceId: "ws-1",
    workspaceOwnerId: "ws-owner",
    members: [{ userId: "editor-1", role: "EDITOR" }],
  });
  const caps = documentCapabilities(doc, "editor-1");
  assert.ok(caps.canView);
  assert.ok(caps.canEdit);
});

// ---------------------------------------------------------------------------
// Denied access
// ---------------------------------------------------------------------------

test("#395: non-member has no access", () => {
  const doc = makeDoc({
    ownerId: "owner-1",
    workspaceId: "ws-1",
    workspaceOwnerId: "ws-owner",
    members: [],
  });
  const caps = documentCapabilities(doc, "random-user");
  assert.ok(!caps.canView);
  assert.ok(!caps.canEdit);
});

test("#395: deriveDocumentRole returns none for non-member", () => {
  const doc = makeDoc({
    ownerId: "owner-1",
    workspaceId: "ws-1",
    workspaceOwnerId: "ws-owner",
    members: [],
  });
  const role = deriveDocumentRole(doc, "intruder");
  assert.equal(role, "none");
});

// ---------------------------------------------------------------------------
// Public share access
// ---------------------------------------------------------------------------

test("#395: publicly shared document allows present access", () => {
  const doc = sharedDoc();
  const decision = evaluateShareAccess(
    toShareAccessInput(doc, "share-abc", "present"),
  );
  assert.ok(decision.allow);
});

test("#395: publicly shared document allows embed access", () => {
  const doc = sharedDoc();
  const decision = evaluateShareAccess(
    toShareAccessInput(doc, "share-abc", "embed"),
  );
  assert.ok(decision.allow);
});

test("#395: revoked share link is denied", () => {
  const doc = sharedDoc({ shareId: "new-share-id" });
  const decision = evaluateShareAccess(
    // Old shareId no longer matches
    toShareAccessInput(doc, "share-abc", "present"),
  );
  assert.ok(!decision.allow);
});

test("#395: expired share link is denied", () => {
  const doc = sharedDoc({ shareExpiresAt: new Date(Date.now() - 1000) });
  const decision = evaluateShareAccess(
    toShareAccessInput(doc, "share-abc", "present"),
  );
  assert.ok(!decision.allow);
});

test("#395: deleted document share is denied", () => {
  const doc = sharedDoc({ deletedAt: new Date() });
  const decision = evaluateShareAccess(
    toShareAccessInput(doc, "share-abc", "present"),
  );
  assert.ok(!decision.allow);
});

test("#395: present-disabled share denies present access", () => {
  const doc = sharedDoc({ sharePresentEnabled: false });
  const decision = evaluateShareAccess(
    toShareAccessInput(doc, "share-abc", "present"),
  );
  assert.ok(!decision.allow);
});

test("#395: embed-disabled share denies embed access", () => {
  const doc = sharedDoc({ shareEmbedEnabled: false });
  const decision = evaluateShareAccess(
    toShareAccessInput(doc, "share-abc", "embed"),
  );
  assert.ok(!decision.allow);
});
