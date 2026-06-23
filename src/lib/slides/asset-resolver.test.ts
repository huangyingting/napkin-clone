/**
 * Tests for asset resolver (issue #394).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ClientAssetResolver,
  ServerAssetResolver,
  resolveAssetSync,
  effectiveImageUrl,
  MISSING_ASSET_PLACEHOLDER,
  type AssetResolverDb,
  type AssetResolverStorage,
} from "./asset-resolver";

// ---------------------------------------------------------------------------
// resolveAssetSync (pure helper)
// ---------------------------------------------------------------------------

test("#394: resolveAssetSync returns loaded for fallbackUrl-only (legacy url)", () => {
  const result = resolveAssetSync({
    fallbackUrl: "https://example.com/img.png",
  });
  assert.equal(result.status, "loaded");
  assert.equal(result.url, "https://example.com/img.png");
});

test("#394: resolveAssetSync returns loaded for data URL fallback (legacy inline)", () => {
  const dataUrl = "data:image/png;base64,abc";
  const result = resolveAssetSync({ fallbackUrl: dataUrl });
  assert.equal(result.status, "loaded");
  assert.equal(result.url, dataUrl);
});

test("#394: resolveAssetSync returns missing when neither assetId nor fallbackUrl set", () => {
  const result = resolveAssetSync({});
  assert.equal(result.status, "missing");
  assert.equal(result.url, undefined);
});

test("#394: resolveAssetSync returns missing for empty fallbackUrl", () => {
  const result = resolveAssetSync({ fallbackUrl: "" });
  assert.equal(result.status, "missing");
});

test("#394: resolveAssetSync returns loaded when assetId + fallbackUrl present", () => {
  const result = resolveAssetSync({
    assetId: "asset-1",
    fallbackUrl: "https://cdn.example.com/a.png",
  });
  assert.equal(result.status, "loaded");
  assert.equal(result.url, "https://cdn.example.com/a.png");
});

test("#394: resolveAssetSync returns missing when assetId present but no fallbackUrl", () => {
  const result = resolveAssetSync({ assetId: "asset-1" });
  assert.equal(result.status, "missing");
  assert.equal(result.url, undefined);
});

// ---------------------------------------------------------------------------
// ClientAssetResolver
// ---------------------------------------------------------------------------

test("#394: ClientAssetResolver resolves fallback URL for legacy element", async () => {
  const resolver = new ClientAssetResolver();
  const result = await resolver.resolve({ fallbackUrl: "/assets/img.png" });
  assert.equal(result.status, "loaded");
  assert.equal(result.url, "/assets/img.png");
});

test("#394: ClientAssetResolver resolves loaded for assetId + fallbackUrl", async () => {
  const resolver = new ClientAssetResolver();
  const result = await resolver.resolve({
    assetId: "a1",
    fallbackUrl: "/slide-assets/doc/abc.png",
  });
  assert.equal(result.status, "loaded");
  assert.equal(result.url, "/slide-assets/doc/abc.png");
});

test("#394: ClientAssetResolver returns missing for assetId without fallbackUrl", async () => {
  const resolver = new ClientAssetResolver();
  const result = await resolver.resolve({ assetId: "missing-asset" });
  assert.equal(result.status, "missing");
  assert.equal(result.url, undefined);
});

test("#394: ClientAssetResolver returns missing for empty element", async () => {
  const resolver = new ClientAssetResolver();
  const result = await resolver.resolve({});
  assert.equal(result.status, "missing");
});

// ---------------------------------------------------------------------------
// ServerAssetResolver
// ---------------------------------------------------------------------------

function makeDb(
  row: { storageKey: string; mimeType: string; deletedAt: Date | null } | null,
): AssetResolverDb {
  return {
    asset: {
      findUnique: async () => row,
    },
  };
}

function makeStorage(baseUrl: string = "/slide-assets"): AssetResolverStorage {
  return { urlFor: (key) => `${baseUrl}/${key}` };
}

test("#394: ServerAssetResolver resolves assetId via DB lookup", async () => {
  const db = makeDb({
    storageKey: "doc1/abc.png",
    mimeType: "image/png",
    deletedAt: null,
  });
  const resolver = new ServerAssetResolver(db, makeStorage());
  const result = await resolver.resolve({ assetId: "asset-1" });
  assert.equal(result.status, "loaded");
  assert.equal(result.url, "/slide-assets/doc1/abc.png");
  assert.equal(result.mimeType, "image/png");
});

test("#394: ServerAssetResolver returns missing for soft-deleted asset", async () => {
  const db = makeDb({
    storageKey: "doc1/abc.png",
    mimeType: "image/png",
    deletedAt: new Date(),
  });
  const resolver = new ServerAssetResolver(db, makeStorage());
  const result = await resolver.resolve({ assetId: "asset-1" });
  assert.equal(result.status, "missing");
  assert.equal(result.url, undefined);
});

test("#394: ServerAssetResolver returns missing when asset row not found", async () => {
  const db = makeDb(null);
  const resolver = new ServerAssetResolver(db, makeStorage());
  const result = await resolver.resolve({ assetId: "ghost-asset" });
  assert.equal(result.status, "missing");
});

test("#394: ServerAssetResolver passes through legacy URL when no assetId", async () => {
  const db = makeDb(null);
  const resolver = new ServerAssetResolver(db, makeStorage());
  const result = await resolver.resolve({
    fallbackUrl: "https://example.com/legacy.png",
  });
  assert.equal(result.status, "loaded");
  assert.equal(result.url, "https://example.com/legacy.png");
});

test("#394: ServerAssetResolver falls back to fallbackUrl on DB error", async () => {
  const db: AssetResolverDb = {
    asset: {
      findUnique: async () => {
        throw new Error("DB down");
      },
    },
  };
  const resolver = new ServerAssetResolver(db, makeStorage());
  const result = await resolver.resolve({
    assetId: "asset-1",
    fallbackUrl: "https://cdn.example.com/img.png",
  });
  assert.equal(result.status, "loaded");
  assert.equal(result.url, "https://cdn.example.com/img.png");
});

test("#394: ServerAssetResolver returns missing on DB error with no fallback", async () => {
  const db: AssetResolverDb = {
    asset: {
      findUnique: async () => {
        throw new Error("DB down");
      },
    },
  };
  const resolver = new ServerAssetResolver(db, makeStorage());
  const result = await resolver.resolve({ assetId: "asset-1" });
  assert.equal(result.status, "missing");
});

// ---------------------------------------------------------------------------
// effectiveImageUrl
// ---------------------------------------------------------------------------

test("#394: effectiveImageUrl returns URL when loaded", () => {
  const url = effectiveImageUrl({
    status: "loaded",
    url: "/slide-assets/doc/img.png",
  });
  assert.equal(url, "/slide-assets/doc/img.png");
});

test("#394: effectiveImageUrl returns MISSING_ASSET_PLACEHOLDER when missing", () => {
  const url = effectiveImageUrl({ status: "missing", url: undefined });
  assert.equal(url, MISSING_ASSET_PLACEHOLDER);
});

test("#394: effectiveImageUrl returns MISSING_ASSET_PLACEHOLDER when denied", () => {
  const url = effectiveImageUrl({ status: "denied", url: undefined });
  assert.equal(url, MISSING_ASSET_PLACEHOLDER);
});
