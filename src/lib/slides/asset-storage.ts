/**
 * Storage adapter abstraction for slide assets (Epic #374).
 *
 * Provides a testable interface for persisting uploaded asset bytes and
 * returning a publicly accessible URL. The default adapter writes files to the
 * Next.js `public/slide-assets/` directory and returns a root-relative URL,
 * making it work out of the box in development without any extra infrastructure.
 *
 * Swap the default by calling `setDefaultStorageAdapter` before the first
 * request — useful in tests and in future cloud deployments (S3, Azure Blob…).
 */

import fs from "node:fs/promises";
import path from "node:path";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * Minimal contract for a slide-asset storage backend.
 *
 * @param key      - Opaque storage key (e.g. `${documentId}/${checksum}.png`).
 * @param buffer   - Raw file bytes to persist.
 * @param mimeType - MIME type of the stored file.
 * @returns A publicly accessible URL for the stored asset.
 */
export interface AssetStorageAdapter {
  store(key: string, buffer: Buffer, mimeType: string): Promise<string>;
  /** Returns the public URL for an existing storage key without writing. */
  urlFor(key: string): string;
}

// ---------------------------------------------------------------------------
// Local adapter (default)
// ---------------------------------------------------------------------------

/**
 * Writes assets to `{rootDir}/{key}` and serves them at `{baseUrl}/{key}`.
 *
 * The default instance uses `<cwd>/public/slide-assets` as the root so
 * Next.js's built-in static file server exposes them at `/slide-assets/{key}`.
 * Intermediate directories are created automatically on first write.
 */
export class LocalAssetStorageAdapter implements AssetStorageAdapter {
  constructor(
    /** Absolute directory where assets are written. */
    readonly rootDir: string,
    /** Base URL prefix prepended to the key in the returned public URL. */
    readonly baseUrl: string,
  ) {}

  async store(
    key: string,
    buffer: Buffer,
    _mimeType?: string,
  ): Promise<string> {
    const dest = path.join(this.rootDir, key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, buffer);
    return this.urlFor(key);
  }

  urlFor(key: string): string {
    return `${this.baseUrl}/${key}`;
  }
}

// ---------------------------------------------------------------------------
// Default adapter singleton
// ---------------------------------------------------------------------------

let _defaultAdapter: AssetStorageAdapter | undefined;

/**
 * Returns the process-wide default storage adapter, creating a
 * {@link LocalAssetStorageAdapter} targeting `public/slide-assets/` on first
 * call.
 *
 * Override before the first upload by calling {@link setDefaultStorageAdapter}.
 */
export function getDefaultStorageAdapter(): AssetStorageAdapter {
  if (!_defaultAdapter) {
    _defaultAdapter = new LocalAssetStorageAdapter(
      path.join(process.cwd(), "public", "slide-assets"),
      "/slide-assets",
    );
  }
  return _defaultAdapter;
}

/** Replaces the default adapter — for tests and alternative deployments. */
export function setDefaultStorageAdapter(adapter: AssetStorageAdapter): void {
  _defaultAdapter = adapter;
}

/** Resets the singleton so the next call re-initialises with defaults. */
export function resetDefaultStorageAdapter(): void {
  _defaultAdapter = undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Canonical mapping from accepted slide-asset MIME types to their storage
 * file extension.
 *
 * Extension is derived from the **validated MIME type**, not the
 * user-supplied filename. This prevents extension spoofing: a request with
 * `type=image/png` and `name=evil.html` must produce a `.png` key, never
 * `.html`, so the file cannot be served as HTML from the public assets
 * directory.
 */
export const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/**
 * Derives the canonical storage key for an asset:
 * `${documentId}/${checksum}.${ext}`
 *
 * The extension is resolved from `mimeType` via {@link MIME_TO_EXT} — never
 * from the user-supplied filename — to prevent extension-spoofing attacks.
 * Using `documentId` as a path segment partitions assets per document and
 * ensures `storageKey` uniqueness across documents that may share identical
 * file bytes.
 *
 * @param documentId - Owning document id (becomes the first path segment).
 * @param checksum   - SHA-256 hex digest of the file bytes.
 * @param mimeType   - Validated MIME type (drives the file extension).
 */
export function deriveStorageKey(
  documentId: string,
  checksum: string,
  mimeType: string,
): string {
  const ext = MIME_TO_EXT[mimeType] ?? "bin";
  return `${documentId}/${checksum}.${ext}`;
}
