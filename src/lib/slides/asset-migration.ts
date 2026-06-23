/**
 * Migration helpers for legacy data-URL images in slide decks (Epic #374,
 * issue #397).
 *
 * Legacy decks store large base64 payloads directly in `deckJson` as
 * `data:image/...;base64,...` strings on image elements and slide backgrounds.
 * This module provides a controlled conversion path that:
 *
 *  1. Extracts the binary data from valid `data:image/...;base64,...` strings.
 *  2. Deduplicates by checksum so two slides sharing the same pixel data
 *     produce only one Asset row.
 *  3. Replaces the inlined payload with `{ src: resolvedUrl, assetId }` on
 *     image elements and `{ backgroundImage: url, backgroundAssetId }` on
 *     slides.
 *  4. Leaves invalid / unsupported data URLs as-is (never throws for bad data).
 *  5. Preserves regular `http(s)` and relative URLs without modification.
 *
 * Migration is idempotent: elements that already have an `assetId` are
 * skipped, so re-running on a partially-migrated deck is safe.
 *
 * Design decision: migration is lazy and happens per-document — not globally.
 * It is triggered explicitly by a server action or maintenance routine rather
 * than automatically on save, so no deck is silently mutated during normal
 * editing (issue #397).
 *
 * No React / browser APIs — safe to call from server actions and node:test.
 */

import { createHash } from "node:crypto";

import type { Deck, ImageElement, Slide } from "@/lib/presentation/deck";
import {
  isAcceptedSlideImageType,
  type SlideImageMime,
} from "@/lib/slides/asset-upload";
import { deriveStorageKey } from "@/lib/slides/asset-storage";
import { logError, logInfo } from "@/lib/log";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal DB interface required by the migration. */
export interface MigrationDb {
  asset: {
    findFirst(args: {
      where: { documentId: string; checksum: string };
      select: { id: true; storageKey: true };
    }): Promise<{ id: string; storageKey: string } | null>;
    create(args: {
      data: {
        documentId: string;
        mimeType: string;
        byteSize: number;
        checksum: string;
        storageKey: string;
        originalName?: string;
      };
      select: { id: true };
    }): Promise<{ id: string }>;
  };
}

/** Minimal storage interface required by the migration. */
export interface MigrationStorage {
  store(key: string, buffer: Buffer, mimeType: string): Promise<string>;
  urlFor(key: string): string;
}

/** Per-element migration outcome. */
export type ElementMigrationResult =
  | { kind: "migrated"; assetId: string; url: string }
  | { kind: "skipped" }
  | { kind: "invalid"; reason: string };

/** Result of a full deck migration run. */
export interface DeckMigrationResult {
  /** The (possibly updated) deck. Equal to the input when nothing changed. */
  deck: Deck;
  /** Number of data URLs successfully converted to Asset records. */
  migratedCount: number;
  /** Number of elements/backgrounds skipped (already migrated or no data URL). */
  skippedCount: number;
  /** Number of data URLs that could not be converted (invalid format, etc.). */
  errorCount: number;
}

// ---------------------------------------------------------------------------
// Data URL helpers
// ---------------------------------------------------------------------------

/**
 * Parses a `data:image/...;base64,...` URI into its MIME type and raw bytes.
 * Returns `null` for any string that does not match the expected format.
 */
export function parseDataUrl(
  dataUrl: string,
): { mimeType: string; buffer: Buffer } | null {
  if (!dataUrl.startsWith("data:")) return null;
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) return null;

  const header = dataUrl.slice(5, commaIndex); // after "data:" before ","
  const base64Data = dataUrl.slice(commaIndex + 1);

  // Must be base64-encoded.
  if (!header.includes(";base64")) return null;

  const mimeType = header.split(";")[0];
  if (!mimeType) return null;

  try {
    const buffer = Buffer.from(base64Data, "base64");
    if (buffer.length === 0) return null;
    return { mimeType, buffer };
  } catch {
    return null;
  }
}

/**
 * Returns `true` when `src` is a `data:image/...;base64,...` string that
 * should be considered for migration.  Remote URLs and already-resolved
 * server URLs are not eligible.
 */
export function isEligibleDataUrl(src: string | undefined): boolean {
  if (!src) return false;
  if (!src.startsWith("data:image/")) return false;
  if (!src.includes(";base64,")) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Core migration
// ---------------------------------------------------------------------------

/**
 * Attempts to migrate a single data URL src to a server-stored Asset.
 *
 * Deduplicates by checksum within the document so two identical images share
 * one Asset row.  Uses the `checksumCache` map to avoid redundant DB queries
 * within the same migration run.
 *
 * @returns A {@link ElementMigrationResult} describing the outcome.
 */
export async function migrateDataUrlSrc(opts: {
  src: string;
  documentId: string;
  db: MigrationDb;
  storage: MigrationStorage;
  checksumCache: Map<string, { assetId: string; url: string }>;
}): Promise<ElementMigrationResult> {
  const { src, documentId, db, storage, checksumCache } = opts;

  const parsed = parseDataUrl(src);
  if (!parsed) {
    return { kind: "invalid", reason: "Could not parse data URL" };
  }
  if (!isAcceptedSlideImageType(parsed.mimeType)) {
    return {
      kind: "invalid",
      reason: `Unsupported MIME type: ${parsed.mimeType}`,
    };
  }

  const mimeType = parsed.mimeType as SlideImageMime;
  const checksum = createHash("sha256").update(parsed.buffer).digest("hex");

  // Check in-run dedup cache first.
  const cached = checksumCache.get(checksum);
  if (cached) {
    return { kind: "migrated", assetId: cached.assetId, url: cached.url };
  }

  // Check DB for existing asset with the same checksum in this document.
  const existing = await db.asset.findFirst({
    where: { documentId, checksum },
    select: { id: true, storageKey: true },
  });
  if (existing) {
    const url = storage.urlFor(existing.storageKey);
    checksumCache.set(checksum, { assetId: existing.id, url });
    return { kind: "migrated", assetId: existing.id, url };
  }

  // Store the file and create the Asset row.
  const storageKey = deriveStorageKey(documentId, checksum, mimeType);
  const url = await storage.store(storageKey, parsed.buffer, mimeType);

  const asset = await db.asset.create({
    data: {
      documentId,
      mimeType,
      byteSize: parsed.buffer.length,
      checksum,
      storageKey,
    },
    select: { id: true },
  });

  checksumCache.set(checksum, { assetId: asset.id, url });
  return { kind: "migrated", assetId: asset.id, url };
}

// ---------------------------------------------------------------------------
// Deck-level migration
// ---------------------------------------------------------------------------

/**
 * Migrates all eligible data URL images in `deck` to server-stored Assets for
 * `documentId`.  Returns a new deck (immutable) with `assetId`s set and inline
 * payloads replaced by server URLs.
 *
 * Idempotent: elements with an existing `assetId` are skipped regardless of
 * what `src` contains.
 */
export async function migrateDataUrlImages(
  deck: Deck,
  documentId: string,
  db: MigrationDb,
  storage: MigrationStorage,
): Promise<DeckMigrationResult> {
  let migratedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const checksumCache = new Map<string, { assetId: string; url: string }>();

  const slides: Slide[] = [];

  for (const slide of deck.slides) {
    let updatedSlide = { ...slide };

    // ── Background image ─────────────────────────────────────────────
    if (!slide.backgroundAssetId && isEligibleDataUrl(slide.backgroundImage)) {
      try {
        const result = await migrateDataUrlSrc({
          src: slide.backgroundImage!,
          documentId,
          db,
          storage,
          checksumCache,
        });
        if (result.kind === "migrated") {
          updatedSlide = {
            ...updatedSlide,
            backgroundImage: result.url,
            backgroundAssetId: result.assetId,
          };
          migratedCount++;
        } else if (result.kind === "invalid") {
          logError("slide-asset-migrate-bg", new Error(result.reason), {
            slideId: slide.id,
          });
          errorCount++;
        }
      } catch (err) {
        logError("slide-asset-migrate-bg", err, { slideId: slide.id });
        errorCount++;
      }
    } else if (
      slide.backgroundImage !== undefined ||
      slide.backgroundAssetId !== undefined
    ) {
      skippedCount++;
    }

    // ── Image elements ────────────────────────────────────────────────
    const updatedElements = [];
    for (const element of slide.elements ?? []) {
      if (element.kind !== "image") {
        updatedElements.push(element);
        continue;
      }
      const imgEl = element as ImageElement;
      if (imgEl.assetId || !isEligibleDataUrl(imgEl.src)) {
        updatedElements.push(imgEl);
        skippedCount++;
        continue;
      }
      try {
        const result = await migrateDataUrlSrc({
          src: imgEl.src,
          documentId,
          db,
          storage,
          checksumCache,
        });
        if (result.kind === "migrated") {
          updatedElements.push({
            ...imgEl,
            src: result.url,
            assetId: result.assetId,
          });
          migratedCount++;
        } else if (result.kind === "invalid") {
          logError("slide-asset-migrate-el", new Error(result.reason), {
            elementId: imgEl.id,
          });
          updatedElements.push(imgEl);
          errorCount++;
        } else {
          updatedElements.push(imgEl);
        }
      } catch (err) {
        logError("slide-asset-migrate-el", err, { elementId: imgEl.id });
        updatedElements.push(imgEl);
        errorCount++;
      }
    }

    slides.push({
      ...updatedSlide,
      elements: updatedElements,
    });
  }

  logInfo("slide-asset-migrate", "data URL migration complete", {
    documentId,
    migratedCount,
    skippedCount,
    errorCount,
  });

  return {
    deck: { ...deck, slides },
    migratedCount,
    skippedCount,
    errorCount,
  };
}
