/**
 * Tests for legacy data URL migration (issue #397).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseDataUrl,
  isEligibleDataUrl,
  migrateDataUrlSrc,
  migrateDataUrlImages,
  type MigrationDb,
  type MigrationStorage,
} from "./asset-migration";
import type { Deck, Slide, ImageElement } from "@/lib/presentation/deck";

// ---------------------------------------------------------------------------
// parseDataUrl
// ---------------------------------------------------------------------------

test("#397: parseDataUrl extracts mime and buffer from valid PNG data URL", () => {
  const pngBytes = Buffer.from([137, 80, 78, 71]);
  const dataUrl = `data:image/png;base64,${pngBytes.toString("base64")}`;
  const result = parseDataUrl(dataUrl);
  assert.ok(result !== null);
  assert.equal(result.mimeType, "image/png");
  assert.deepEqual(result.buffer, pngBytes);
});

test("#397: parseDataUrl returns null for non-data URL", () => {
  assert.equal(parseDataUrl("https://example.com/img.png"), null);
  assert.equal(parseDataUrl("/slide-assets/doc/abc.png"), null);
});

test("#397: parseDataUrl returns null for invalid data URL (no base64)", () => {
  assert.equal(parseDataUrl("data:image/png;charset=utf-8,hello"), null);
});

test("#397: parseDataUrl returns null for empty data URL", () => {
  assert.equal(parseDataUrl("data:image/png;base64,"), null);
});

// ---------------------------------------------------------------------------
// isEligibleDataUrl
// ---------------------------------------------------------------------------

test("#397: isEligibleDataUrl returns true for data:image/ base64 URLs", () => {
  assert.ok(isEligibleDataUrl("data:image/png;base64,abc"));
  assert.ok(isEligibleDataUrl("data:image/jpeg;base64,xyz"));
});

test("#397: isEligibleDataUrl returns false for remote URLs", () => {
  assert.ok(!isEligibleDataUrl("https://example.com/img.png"));
  assert.ok(!isEligibleDataUrl("/slide-assets/doc/abc.png"));
});

test("#397: isEligibleDataUrl returns false for non-image data URLs", () => {
  assert.ok(!isEligibleDataUrl("data:application/json;base64,abc"));
});

test("#397: isEligibleDataUrl returns false for undefined/empty", () => {
  assert.ok(!isEligibleDataUrl(undefined));
  assert.ok(!isEligibleDataUrl(""));
});

// ---------------------------------------------------------------------------
// migrateDataUrlSrc
// ---------------------------------------------------------------------------

function makePngDataUrl(): string {
  // Minimal valid PNG header
  const pngBytes = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108000000003a7e9b55",
    "hex",
  );
  return `data:image/png;base64,${pngBytes.toString("base64")}`;
}

function makeMigrationDb(existingAsset?: {
  id: string;
  storageKey: string;
}): MigrationDb & { createdAssets: string[] } {
  const createdAssets: string[] = [];
  return {
    createdAssets,
    asset: {
      findFirst: async () => existingAsset ?? null,
      create: async (_args) => {
        const id = `new-asset-${createdAssets.length + 1}`;
        createdAssets.push(id);
        return { id };
      },
    },
  };
}

function makeMigrationStorage(): MigrationStorage & { storedKeys: string[] } {
  const storedKeys: string[] = [];
  return {
    storedKeys,
    store: async (key: string) => {
      storedKeys.push(key);
      return `/slide-assets/${key}`;
    },
    urlFor: (key: string) => `/slide-assets/${key}`,
  };
}

test("#397: migrateDataUrlSrc converts valid data URL to Asset record", async () => {
  const dataUrl = makePngDataUrl();
  const db = makeMigrationDb();
  const storage = makeMigrationStorage();
  const cache = new Map<string, { assetId: string; url: string }>();

  const result = await migrateDataUrlSrc({
    src: dataUrl,
    documentId: "doc-1",
    db,
    storage,
    checksumCache: cache,
  });

  assert.equal(result.kind, "migrated");
  if (result.kind === "migrated") {
    assert.ok(result.assetId.startsWith("new-asset-"));
    assert.ok(result.url.startsWith("/slide-assets/"));
  }
  assert.equal(storage.storedKeys.length, 1);
});

test("#397: migrateDataUrlSrc deduplicates identical data URLs via checksum cache", async () => {
  const dataUrl = makePngDataUrl();
  const db = makeMigrationDb();
  const storage = makeMigrationStorage();
  const cache = new Map<string, { assetId: string; url: string }>();

  // First call — creates asset
  const r1 = await migrateDataUrlSrc({
    src: dataUrl,
    documentId: "doc-1",
    db,
    storage,
    checksumCache: cache,
  });
  // Second call — deduplication via cache
  const r2 = await migrateDataUrlSrc({
    src: dataUrl,
    documentId: "doc-1",
    db,
    storage,
    checksumCache: cache,
  });

  assert.equal(r1.kind, "migrated");
  assert.equal(r2.kind, "migrated");
  if (r1.kind === "migrated" && r2.kind === "migrated") {
    assert.equal(r1.assetId, r2.assetId);
  }
  // Storage should only have been called once
  assert.equal(storage.storedKeys.length, 1);
});

test("#397: migrateDataUrlSrc deduplicates via existing DB asset", async () => {
  const dataUrl = makePngDataUrl();
  const existingAsset = {
    id: "existing-asset-1",
    storageKey: "doc-1/abc123.png",
  };
  const db = makeMigrationDb(existingAsset);
  const storage = makeMigrationStorage();
  const cache = new Map<string, { assetId: string; url: string }>();

  const result = await migrateDataUrlSrc({
    src: dataUrl,
    documentId: "doc-1",
    db,
    storage,
    checksumCache: cache,
  });

  assert.equal(result.kind, "migrated");
  if (result.kind === "migrated") {
    assert.equal(result.assetId, "existing-asset-1");
  }
  // No new storage write should occur
  assert.equal(storage.storedKeys.length, 0);
});

test("#397: migrateDataUrlSrc returns invalid for unsupported MIME type", async () => {
  // SVG is not in the accepted MIME type list.
  const svgData = "data:image/svg+xml;base64,PHN2Zz4=";
  const db = makeMigrationDb();
  const storage = makeMigrationStorage();
  const cache = new Map<string, { assetId: string; url: string }>();

  const result = await migrateDataUrlSrc({
    src: svgData,
    documentId: "doc-1",
    db,
    storage,
    checksumCache: cache,
  });

  assert.equal(result.kind, "invalid");
});

test("#397: migrateDataUrlSrc returns invalid for bad data URL", async () => {
  const db = makeMigrationDb();
  const storage = makeMigrationStorage();
  const cache = new Map<string, { assetId: string; url: string }>();

  const result = await migrateDataUrlSrc({
    src: "data:image/png;charset=utf-8,not-base64",
    documentId: "doc-1",
    db,
    storage,
    checksumCache: cache,
  });

  assert.equal(result.kind, "invalid");
});

// ---------------------------------------------------------------------------
// migrateDataUrlImages (full deck)
// ---------------------------------------------------------------------------

function minSlide(overrides: Partial<Slide> = {}): Slide {
  return {
    id: "s1",
    index: 0,
    title: "Slide",
    notes: "",
    bullets: [],
    visualIds: [],
    layout: "blank",
    theme: "default",
    ...overrides,
  };
}

function deckWith(slides: Slide[]): Deck {
  return {
    slides,
    theme: "default",
    schemaVersion: 1,
  };
}

test("#397: migrateDataUrlImages migrates image element data URLs", async () => {
  const dataUrl = makePngDataUrl();
  const imageEl: ImageElement = {
    kind: "image",
    id: "e1",
    src: dataUrl,
    zIndex: 0,
    box: { x: 0, y: 0, w: 100, h: 100 },
    locked: false,
  };
  const deck = deckWith([minSlide({ elements: [imageEl] })]);
  const db = makeMigrationDb();
  const storage = makeMigrationStorage();

  const result = await migrateDataUrlImages(deck, "doc-1", db, storage);
  assert.equal(result.migratedCount, 1);
  assert.equal(result.errorCount, 0);

  const migratedEl = result.deck.slides[0].elements![0] as ImageElement;
  assert.ok(migratedEl.assetId?.startsWith("new-asset-"));
  assert.ok(migratedEl.src.startsWith("/slide-assets/"));
  // Data URL should no longer be in src
  assert.ok(!migratedEl.src.startsWith("data:"));
});

test("#397: migrateDataUrlImages migrates background image data URLs", async () => {
  const dataUrl = makePngDataUrl();
  const deck = deckWith([minSlide({ backgroundImage: dataUrl })]);
  const db = makeMigrationDb();
  const storage = makeMigrationStorage();

  const result = await migrateDataUrlImages(deck, "doc-1", db, storage);
  assert.equal(result.migratedCount, 1);
  assert.ok(!result.deck.slides[0].backgroundImage!.startsWith("data:"));
  assert.ok(result.deck.slides[0].backgroundAssetId?.startsWith("new-asset-"));
});

test("#397: migrateDataUrlImages skips elements already having assetId", async () => {
  const imageEl: ImageElement = {
    kind: "image",
    id: "e1",
    src: "/slide-assets/doc/abc.png",
    assetId: "existing-asset-1",
    zIndex: 0,
    box: { x: 0, y: 0, w: 100, h: 100 },
    locked: false,
  };
  const deck = deckWith([minSlide({ elements: [imageEl] })]);
  const db = makeMigrationDb();
  const storage = makeMigrationStorage();

  const result = await migrateDataUrlImages(deck, "doc-1", db, storage);
  assert.equal(result.migratedCount, 0);
  assert.equal(storage.storedKeys.length, 0);
  // Element unchanged
  const el = result.deck.slides[0].elements![0] as ImageElement;
  assert.equal(el.assetId, "existing-asset-1");
});

test("#397: migrateDataUrlImages is idempotent (double migration)", async () => {
  const dataUrl = makePngDataUrl();
  const deck = deckWith([minSlide({ backgroundImage: dataUrl })]);
  const db = makeMigrationDb();
  const storage = makeMigrationStorage();

  const r1 = await migrateDataUrlImages(deck, "doc-1", db, storage);
  assert.equal(r1.migratedCount, 1);

  // Second run on the already-migrated deck — should be a no-op
  const db2 = makeMigrationDb({
    id: "new-asset-1",
    storageKey: "doc-1/abc.png",
  });
  const storage2 = makeMigrationStorage();
  const r2 = await migrateDataUrlImages(r1.deck, "doc-1", db2, storage2);
  assert.equal(r2.migratedCount, 0);
  assert.equal(storage2.storedKeys.length, 0);
});

test("#397: migrateDataUrlImages preserves legacy remote URL images without migration", async () => {
  const imageEl: ImageElement = {
    kind: "image",
    id: "e1",
    src: "https://example.com/photo.jpg",
    zIndex: 0,
    box: { x: 0, y: 0, w: 100, h: 100 },
    locked: false,
  };
  const deck = deckWith([minSlide({ elements: [imageEl] })]);
  const db = makeMigrationDb();
  const storage = makeMigrationStorage();

  const result = await migrateDataUrlImages(deck, "doc-1", db, storage);
  assert.equal(result.migratedCount, 0);
  const el = result.deck.slides[0].elements![0] as ImageElement;
  assert.equal(el.src, "https://example.com/photo.jpg");
  assert.equal(el.assetId, undefined);
});

test("#397: migrateDataUrlImages counts errors for invalid data URLs", async () => {
  const imageEl: ImageElement = {
    kind: "image",
    id: "e1",
    src: "data:image/svg+xml;base64,PHN2Zz4=", // SVG not accepted
    zIndex: 0,
    box: { x: 0, y: 0, w: 100, h: 100 },
    locked: false,
  };
  const deck = deckWith([minSlide({ elements: [imageEl] })]);
  const db = makeMigrationDb();
  const storage = makeMigrationStorage();

  const result = await migrateDataUrlImages(deck, "doc-1", db, storage);
  assert.equal(result.errorCount, 1);
  assert.equal(result.migratedCount, 0);
  // Element should be preserved as-is
  const el = result.deck.slides[0].elements![0] as ImageElement;
  assert.equal(el.src, imageEl.src);
});
