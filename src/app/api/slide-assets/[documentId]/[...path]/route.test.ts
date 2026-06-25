/**
 * Access-control regression coverage for the slide-asset serving route
 * (Epic #495, issue #510; route: `/api/slide-assets/[documentId]/[...path]`).
 *
 * Why this tests `decideSlideAssetAccess` rather than the `GET` handler:
 * the handler imports `@/lib/prisma` and `@/lib/session`, which require a live
 * DB and Auth.js context, and this harness runs under `node --import tsx
 * --test` with NO module-mocking flag (`mock.module` is unavailable), so the
 * HTTP handler cannot be invoked in isolation. The route was refactored (#510)
 * so its ENTIRE allow/deny decision lives in the pure `decideSlideAssetAccess`
 * function it calls; exercising that function therefore exercises the exact
 * route boundary decision — authenticated owner/editor/viewer/unrelated user,
 * anonymous present/embed (enabled and disabled), and expired/revoked/deleted/
 * missing cases — including the privacy guarantee that private assets are never
 * served via a predictable URL.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decideSlideAssetAccess,
  type SlideAssetDocument,
} from "@/lib/slides/asset-access";

const NOW = new Date("2026-06-23T00:00:00Z");
const ASSET = { id: "asset-1" };

/** Builds a document row, defaulting to a private, owned, live document. */
function makeDoc(
  overrides: Partial<SlideAssetDocument> = {},
): SlideAssetDocument {
  return {
    ownerId: "owner-1",
    workspaceId: null,
    workspace: null,
    shareId: null,
    isShared: false,
    deletedAt: null,
    shareExpiresAt: null,
    shareEmbedEnabled: false,
    sharePresentEnabled: false,
    ...overrides,
  };
}

/** A document publicly shared via a present/embed link. */
function sharedDoc(
  overrides: Partial<SlideAssetDocument> = {},
): SlideAssetDocument {
  return makeDoc({
    shareId: "share-abc",
    isShared: true,
    shareEmbedEnabled: true,
    sharePresentEnabled: true,
    workspaceId: "ws-1",
    workspace: { ownerId: "owner-1", members: [] },
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Authenticated capability access
// ---------------------------------------------------------------------------

test("#510: owner is served their own private asset", () => {
  const decision = decideSlideAssetAccess({
    asset: ASSET,
    document: makeDoc({ ownerId: "owner-1" }),
    userId: "owner-1",
    now: NOW,
  });
  assert.deepEqual(decision, { allow: true, via: "capability" });
});

test("#510: workspace editor is served the asset", () => {
  const decision = decideSlideAssetAccess({
    asset: ASSET,
    document: makeDoc({
      ownerId: "owner-1",
      workspaceId: "ws-1",
      workspace: {
        ownerId: "ws-owner",
        members: [{ userId: "editor-1", role: "EDITOR" }],
      },
    }),
    userId: "editor-1",
    now: NOW,
  });
  assert.deepEqual(decision, { allow: true, via: "capability" });
});

test("#510: workspace viewer is served the asset (read access is enough)", () => {
  const decision = decideSlideAssetAccess({
    asset: ASSET,
    document: makeDoc({
      ownerId: "owner-1",
      workspaceId: "ws-1",
      workspace: {
        ownerId: "ws-owner",
        members: [{ userId: "viewer-1", role: "VIEWER" }],
      },
    }),
    userId: "viewer-1",
    now: NOW,
  });
  assert.deepEqual(decision, { allow: true, via: "capability" });
});

test("#510: unrelated authenticated user is forbidden (private asset not served)", () => {
  const decision = decideSlideAssetAccess({
    asset: ASSET,
    document: makeDoc({
      ownerId: "owner-1",
      workspaceId: "ws-1",
      workspace: { ownerId: "ws-owner", members: [] },
    }),
    userId: "stranger-1",
    now: NOW,
  });
  assert.deepEqual(decision, {
    allow: false,
    status: 403,
    reason: "forbidden",
  });
});

// ---------------------------------------------------------------------------
// Anonymous share access (enabled)
// ---------------------------------------------------------------------------

test("#510: anonymous request is served when present link is enabled", () => {
  const decision = decideSlideAssetAccess({
    asset: ASSET,
    document: sharedDoc(),
    userId: null,
    now: NOW,
  });
  assert.deepEqual(decision, { allow: true, via: "share-present" });
});

test("#510: anonymous request falls back to embed link when present is disabled", () => {
  const decision = decideSlideAssetAccess({
    asset: ASSET,
    document: sharedDoc({
      sharePresentEnabled: false,
      shareEmbedEnabled: true,
    }),
    userId: null,
    now: NOW,
  });
  assert.deepEqual(decision, { allow: true, via: "share-embed" });
});

test("#721/#747: anonymous public asset access can be supplied by the public render resolver", () => {
  const decision = decideSlideAssetAccess({
    asset: ASSET,
    document: sharedDoc({
      sharePresentEnabled: false,
      shareEmbedEnabled: true,
    }),
    userId: null,
    publicAssetAccess: { allow: true, via: "share-embed" },
    now: NOW,
  });
  assert.deepEqual(decision, { allow: true, via: "share-embed" });
});

// ---------------------------------------------------------------------------
// Anonymous share access (disabled / unauthorized — private never served)
// ---------------------------------------------------------------------------

test("#510: anonymous request to a private (unshared) document is forbidden", () => {
  const decision = decideSlideAssetAccess({
    asset: ASSET,
    document: makeDoc({ isShared: false }),
    userId: null,
    now: NOW,
  });
  assert.deepEqual(decision, {
    allow: false,
    status: 403,
    reason: "forbidden",
  });
});

test("#510: anonymous request denied when both present and embed are disabled", () => {
  const decision = decideSlideAssetAccess({
    asset: ASSET,
    document: sharedDoc({
      sharePresentEnabled: false,
      shareEmbedEnabled: false,
    }),
    userId: null,
    now: NOW,
  });
  assert.deepEqual(decision, {
    allow: false,
    status: 403,
    reason: "forbidden",
  });
});

test("#510: anonymous request denied for an expired share link", () => {
  const decision = decideSlideAssetAccess({
    asset: ASSET,
    document: sharedDoc({
      shareExpiresAt: new Date(NOW.getTime() - 1000),
    }),
    userId: null,
    now: NOW,
  });
  assert.deepEqual(decision, {
    allow: false,
    status: 403,
    reason: "forbidden",
  });
});

test("#510: anonymous request denied for a revoked (rotated shareId) link", () => {
  // shareId was rotated, but the asset row still carries the document's current
  // shareId; an old predictable URL must not resolve. The decision derives the
  // requested id from the document's current shareId, so a mismatch can only
  // occur via a stale link — modeled here by clearing isShared after rotation.
  const decision = decideSlideAssetAccess({
    asset: ASSET,
    document: sharedDoc({ isShared: false, shareId: "rotated-id" }),
    userId: null,
    now: NOW,
  });
  assert.deepEqual(decision, {
    allow: false,
    status: 403,
    reason: "forbidden",
  });
});

// ---------------------------------------------------------------------------
// Existence-hiding (privacy 404 — never downgraded to 403)
// ---------------------------------------------------------------------------

test("#510: missing asset yields a privacy 404 (not a 403)", () => {
  const decision = decideSlideAssetAccess({
    asset: null,
    document: makeDoc({ ownerId: "owner-1" }),
    userId: "owner-1",
    now: NOW,
  });
  assert.deepEqual(decision, {
    allow: false,
    status: 404,
    reason: "asset-not-found",
  });
});

test("#510: missing document yields a privacy 404", () => {
  const decision = decideSlideAssetAccess({
    asset: ASSET,
    document: null,
    userId: "owner-1",
    now: NOW,
  });
  assert.deepEqual(decision, {
    allow: false,
    status: 404,
    reason: "document-not-found",
  });
});

test("#510: soft-deleted document yields a privacy 404 even for the owner", () => {
  const decision = decideSlideAssetAccess({
    asset: ASSET,
    document: makeDoc({ ownerId: "owner-1", deletedAt: NOW }),
    userId: "owner-1",
    now: NOW,
  });
  assert.deepEqual(decision, {
    allow: false,
    status: 404,
    reason: "document-not-found",
  });
});

test("#510: a deleted but publicly shared document is not served anonymously", () => {
  const decision = decideSlideAssetAccess({
    asset: ASSET,
    document: sharedDoc({ deletedAt: NOW }),
    userId: null,
    now: NOW,
  });
  assert.deepEqual(decision, {
    allow: false,
    status: 404,
    reason: "document-not-found",
  });
});
