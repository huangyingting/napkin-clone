/**
 * Shared asset resolver contract for slide rendering and export (Epic #374,
 * issue #394).
 *
 * Renderers (editor canvas, present viewer, PPTX/image export) all need to
 * turn an `assetId` into a displayable source.
 * Rather than forking this logic across surfaces we define a single resolver
 * interface and two concrete implementations:
 *
 *   - {@link ClientAssetResolver} — pure pass-through for the browser. Assets
 *     served by the local adapter are already public-URL strings, so the
 *     resolver is a thin wrapper that maps status codes to a placeholder.
 *
 *   - {@link ServerAssetResolver} — used by export paths (PPTX, SVG, image).
 *     Resolves `assetId` by looking up the `storageKey` in the database and
 *     returning either the public URL or raw bytes.
 *
 * Pure and headless (no React, no browser APIs) so this module is safe to
 * import from both client components and server actions/routes.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The resolution status for a single asset lookup. */
export type AssetStatus = "loaded" | "missing" | "denied" | "pending";

/** Result of resolving a single asset. */
export interface AssetResolution {
  /** Displayable URL (or data URL) when `status === "loaded"`. */
  url: string | undefined;
  status: AssetStatus;
  /** MIME type if available (populated by the server resolver). */
  mimeType?: string;
}

/**
 * Resolves slide asset references to displayable sources.
 *
 * Call {@link resolve} with an element's `assetId` and cached display URL.
 * The contract for each combination:
 *
 *  - `assetId` present → perform asset lookup; fall back to `fallbackUrl` on
 *    failure only if the failure is a network / infra error (not "missing").
 *  - Both absent → `status: "missing"`, `url: undefined`.
 */
export interface AssetResolver {
  resolve(opts: {
    assetId?: string;
    fallbackUrl?: string;
  }): Promise<AssetResolution>;
}

// ---------------------------------------------------------------------------
// Client resolver
// ---------------------------------------------------------------------------

/**
 * Browser-side resolver for slide rendering.
 *
 * Assets stored by {@link LocalAssetStorageAdapter} are already served as
 * public static files; the resolver simply returns the URL stored on the
 * element. The only lookup required is: if `assetId` is set, the `fallbackUrl`
 * (set during upload) is canonical and we return it directly.
 *
 * Missing-asset detection: if neither `assetId` nor `fallbackUrl` is set, or
 * if `fallbackUrl` is an empty string, the resolution is "missing".
 *
 * This implementation is intentionally stateless and synchronous-compatible
 * (it wraps in a resolved Promise) so it can be swapped in tests.
 */
export class ClientAssetResolver implements AssetResolver {
  async resolve({
    assetId,
    fallbackUrl,
  }: {
    assetId?: string;
    fallbackUrl?: string;
  }): Promise<AssetResolution> {
    if (!assetId) {
      return { url: undefined, status: "missing" };
    }

    // Asset-backed element: return the cached URL.
    if (fallbackUrl && fallbackUrl.trim() !== "") {
      return { url: fallbackUrl, status: "loaded" };
    }

    // assetId present but no cached URL — treat as missing in the browser
    // (the server resolver would do a DB lookup here).
    return { url: undefined, status: "missing" };
  }
}

// ---------------------------------------------------------------------------
// Server resolver (for export paths)
// ---------------------------------------------------------------------------

/**
 * Minimal DB interface required by the server resolver.
 * Matches the Prisma `asset.findUnique` signature subset we need.
 */
export interface AssetResolverDb {
  asset: {
    findUnique(args: {
      where: { id: string };
      select: { storageKey: true; mimeType: true; deletedAt: true };
    }): Promise<{
      storageKey: string;
      mimeType: string;
      deletedAt: Date | null;
    } | null>;
  };
}

/**
 * Minimal storage interface required by the server resolver.
 */
export interface AssetResolverStorage {
  urlFor(key: string): string;
}

/**
 * Server-side resolver used by PPTX/image export paths (issue #394).
 *
 * Resolves `assetId` via a database lookup to recover the `storageKey`, then
 * delegates URL construction to the storage adapter.  Falls back gracefully:
 *
 *  - If the asset row is soft-deleted → `status: "missing"`.
 *  - If the asset row is not found → `status: "missing"`.
 *  - If `fallbackUrl` is set and the DB lookup fails → honours the cached URL.
 */
export class ServerAssetResolver implements AssetResolver {
  constructor(
    private readonly db: AssetResolverDb,
    private readonly storage: AssetResolverStorage,
  ) {}

  async resolve({
    assetId,
    fallbackUrl,
  }: {
    assetId?: string;
    fallbackUrl?: string;
  }): Promise<AssetResolution> {
    if (!assetId) {
      return { url: undefined, status: "missing" };
    }

    try {
      const row = await this.db.asset.findUnique({
        where: { id: assetId },
        select: { storageKey: true, mimeType: true, deletedAt: true },
      });

      if (!row || row.deletedAt !== null) {
        return { url: undefined, status: "missing" };
      }

      const url = this.storage.urlFor(row.storageKey);
      return { url, status: "loaded", mimeType: row.mimeType };
    } catch {
      // DB/infra error — fall back to the cached URL if available.
      if (fallbackUrl && fallbackUrl.trim() !== "") {
        return { url: fallbackUrl, status: "loaded" };
      }
      return { url: undefined, status: "missing" };
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Placeholder data URL shown for missing/denied assets in the editor UI. */
export const MISSING_ASSET_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23f3f4f6'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%239ca3af' font-family='sans-serif' font-size='14'%3EMissing image%3C/text%3E%3C/svg%3E";

/**
 * Returns the effective display URL for an image element or slide background,
 * using {@link MISSING_ASSET_PLACEHOLDER} when the resolution is missing/denied.
 */
export function effectiveImageUrl(resolution: AssetResolution): string {
  if (resolution.status === "loaded" && resolution.url) {
    return resolution.url;
  }
  return MISSING_ASSET_PLACEHOLDER;
}

/**
 * Resolves an element's `assetId` and cached URL synchronously for contexts
 * where an async resolver is not yet available.
 *
 * Rules (matches {@link ClientAssetResolver} behaviour):
 *  - `assetId` set + non-empty `fallbackUrl` → loaded with the fallback URL.
 *  - `assetId` set, no `fallbackUrl` → missing.
 *  - neither → missing.
 */
export function resolveAssetSync(opts: {
  assetId?: string;
  fallbackUrl?: string;
}): AssetResolution {
  const { assetId, fallbackUrl } = opts;
  if (!assetId) {
    return { url: undefined, status: "missing" };
  }
  if (fallbackUrl && fallbackUrl.trim() !== "") {
    return { url: fallbackUrl, status: "loaded" };
  }
  return { url: undefined, status: "missing" };
}
