import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resolvePublicAssetAccessForDocument,
  resolvePublicRenderWithSource,
  type PublicRenderDocumentRow,
  type PublicRenderSource,
} from "./resolver-core";

const NOW = new Date("2026-06-25T00:00:00Z");

function document(
  overrides: Partial<PublicRenderDocumentRow> = {},
): PublicRenderDocumentRow {
  return {
    id: "doc-1",
    title: "Shared Doc",
    content: "Public content",
    contentJson: { root: { children: [] } },
    deckJson: null,
    slug: "shared-doc",
    ownerId: "owner-1",
    workspaceId: null,
    workspace: null,
    shareId: "share123",
    isShared: true,
    deletedAt: null,
    shareExpiresAt: null,
    shareEmbedEnabled: true,
    sharePresentEnabled: true,
    shareMetadataMode: "generic",
    shareDiscoverable: false,
    owner: { name: null, plan: "free" },
    ...overrides,
  };
}

function source(row: PublicRenderDocumentRow | null): PublicRenderSource {
  return {
    async findByShareId() {
      return row;
    },
    async findByDocumentId() {
      return row;
    },
  };
}

test("resolvePublicRenderWithSource parses raw share segments and returns a render-ready document", async () => {
  const result = await resolvePublicRenderWithSource(source(document()), {
    params: { shareId: "shared-doc-share123" },
    mode: "view",
    projection: "document",
    now: NOW,
  });

  assert.equal(result.ok, true);
  assert.equal(result.projection, "document");
  if (!result.ok || result.projection !== "document") {
    throw new Error("Expected document projection.");
  }
  assert.equal(result.shareId, "share123");
  assert.equal(result.document.ownerName, "Document owner");
  assert.equal(result.document.title, "Shared Doc");
});

test("resolvePublicRenderWithSource preserves display names without email fallback", async () => {
  const result = await resolvePublicRenderWithSource(
    source(document({ owner: { name: "Ada", plan: "free" } })),
    {
      params: { shareId: "shared-doc-share123" },
      mode: "view",
      projection: "document",
      now: NOW,
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok || result.projection !== "document") {
    throw new Error("Expected document projection.");
  }
  assert.equal(result.document.ownerName, "Ada");
});

test("resolvePublicRenderWithSource denies regenerated links without returning document data", async () => {
  const result = await resolvePublicRenderWithSource(
    source(document({ shareId: "new-share" })),
    {
      params: { shareId: "shared-doc-share123" },
      mode: "view",
      projection: "metadata",
      now: NOW,
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.decision.allow, false);
  if (result.decision.allow) {
    throw new Error("Expected a denied access decision.");
  }
  assert.equal(result.decision.status, 404);
  assert.equal(result.decision.concealResource, true);
});

test("resolvePublicRenderWithSource applies embed mode policy centrally", async () => {
  const result = await resolvePublicRenderWithSource(
    source(document({ shareEmbedEnabled: false })),
    {
      params: { shareId: "shared-doc-share123" },
      mode: "embed",
      projection: "document",
      now: NOW,
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.decision.allow, false);
  if (result.decision.allow) {
    throw new Error("Expected a denied access decision.");
  }
  assert.equal(result.decision.status, 404);
  assert.equal(result.decision.concealResource, true);
});

test("resolvePublicAssetAccessForDocument preserves present-first then embed public asset access", () => {
  assert.deepEqual(resolvePublicAssetAccessForDocument(document(), NOW), {
    allow: true,
    via: "share-present",
  });
  assert.deepEqual(
    resolvePublicAssetAccessForDocument(
      document({ sharePresentEnabled: false }),
      NOW,
    ),
    { allow: true, via: "share-embed" },
  );
});

test("resolvePublicRenderWithSource resolves asset mode and projection for route access checks", async () => {
  const result = await resolvePublicRenderWithSource(
    source(document({ sharePresentEnabled: false })),
    {
      params: { documentId: "doc-1" },
      mode: "asset",
      projection: "assetAccess",
      now: NOW,
    },
  );

  assert.equal(result.projection, "assetAccess");
  assert.equal(result.ok, true);
  assert.deepEqual(result.publicAccess, { allow: true, via: "share-embed" });
  assert.equal(result.document?.id, "doc-1");
});

test("resolvePublicAssetAccessForDocument keeps private live documents forbidden, not not-found", () => {
  assert.deepEqual(
    resolvePublicAssetAccessForDocument(
      document({ isShared: false, shareId: null }),
      NOW,
    ),
    { allow: false, status: 403, reason: "forbidden" },
  );
});
