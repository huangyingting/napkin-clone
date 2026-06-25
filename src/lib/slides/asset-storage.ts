/**
 * Storage adapter abstraction for slide assets (Epic #374, #479, #480).
 *
 * Provides slide defaults over the neutral asset storage adapter. The default adapter
 * writes files to `storage/slide-assets/` (non-public) and returns a
 * root-relative URL under `/api/slide-assets/`, which enforces document-scoped
 * auth before serving the bytes.
 *
 * Swap the default by calling `setDefaultStorageAdapter` before the first
 * request — useful in tests and in future cloud deployments (S3, Azure Blob…).
 */

import path from "node:path";

import {
  deriveAssetStorageKey,
  LocalAssetStorageAdapter,
  type AssetStorageAdapter,
} from "@/lib/assets/storage";
import { SLIDE_MIME_TO_EXT } from "@/lib/slides/asset-policy";

export { LocalAssetStorageAdapter, type AssetStorageAdapter };

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
  ...SLIDE_MIME_TO_EXT,
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
  return deriveAssetStorageKey(documentId, checksum, mimeType, MIME_TO_EXT);
}
