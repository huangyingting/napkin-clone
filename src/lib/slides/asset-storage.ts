/**
 * Storage adapter abstraction for slide assets (Epic #374, #479, #480).
 *
 * Provides a testable interface for persisting, reading, and deleting uploaded
 * asset bytes and returning a protected delivery URL. The default adapter
 * writes files to `storage/slide-assets/` (non-public) and returns a
 * root-relative URL under `/api/slide-assets/`, which enforces document-scoped
 * auth before serving the bytes.
 *
 * Legacy assets stored in `public/slide-assets/` continue to be served by
 * Next.js's static file server under `/slide-assets/…` — no migration of
 * existing files is required.
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
 * Contract for a slide-asset storage backend.
 *
 * @param key      - Opaque storage key (e.g. `${documentId}/${checksum}.png`).
 * @param buffer   - Raw file bytes to persist.
 * @param mimeType - MIME type of the stored file.
 * @returns A URL through which the stored asset can be retrieved.
 */
export interface AssetStorageAdapter {
  store(key: string, buffer: Buffer, mimeType: string): Promise<string>;
  /** Returns the URL for an existing storage key without writing. */
  urlFor(key: string): string;
  /**
   * Reads the raw bytes for the given storage key.
   * Throws (ENOENT-like) when the file does not exist.
   */
  read(key: string): Promise<Buffer>;
  /**
   * Deletes the file for the given storage key.
   * Must be idempotent: no-op if the file is already absent.
   */
  delete(key: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Local adapter (default)
// ---------------------------------------------------------------------------

/**
 * Writes assets to `{rootDir}/{key}` and serves them via `{baseUrl}/{key}`.
 *
 * The default instance uses `<cwd>/storage/slide-assets` (a NON-public
 * directory) so assets are not reachable via Next.js's static file server.
 * All reads must go through the authorised `/api/slide-assets/…` route.
 * Intermediate directories are created automatically on first write.
 *
 * Legacy assets stored in the old `public/slide-assets/` directory continue
 * to be served by Next.js's built-in static file server under `/slide-assets/…`
 * — no migration is required for existing decks.
 */
export class LocalAssetStorageAdapter implements AssetStorageAdapter {
  constructor(
    /** Absolute directory where assets are written. */
    readonly rootDir: string,
    /** Base URL prefix prepended to the key in the returned URL. */
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

  async read(key: string): Promise<Buffer> {
    return fs.readFile(path.join(this.rootDir, key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(path.join(this.rootDir, key), { force: true });
  }
}

// ---------------------------------------------------------------------------
// Default adapter singleton
// ---------------------------------------------------------------------------

let _defaultAdapter: AssetStorageAdapter | undefined;

/**
 * Returns the process-wide default storage adapter, creating a
 * {@link LocalAssetStorageAdapter} targeting `storage/slide-assets/` (a
 * non-public directory) on first call. Assets are served through the
 * authorised `/api/slide-assets/…` route rather than the static file server.
 *
 * Override before the first upload by calling {@link setDefaultStorageAdapter}.
 */
export function getDefaultStorageAdapter(): AssetStorageAdapter {
  if (!_defaultAdapter) {
    _defaultAdapter = new LocalAssetStorageAdapter(
      path.join(process.cwd(), "storage", "slide-assets"),
      "/api/slide-assets",
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
