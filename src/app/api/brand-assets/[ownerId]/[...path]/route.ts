/**
 * Protected brand-asset serving route (Epic #496).
 *
 * Serves brand logos and uploaded custom fonts with OWNER-scoped access control
 * so a brand's private media is never reachable through a predictable public
 * URL.  Brand assets are partitioned in storage by the owner's user id, which is
 * also the access boundary: only the authenticated owner may fetch the bytes.
 *
 * Access rules:
 *  1. The asset row must exist for the reconstructed storage key (else 404 —
 *     existence must not leak).
 *  2. The request must be authenticated (else 401).
 *  3. The session user id must equal the owner partition in the URL (else 403).
 *
 * URL pattern: GET /api/brand-assets/[ownerId]/[...path]
 *
 * The `path` segments reconstruct the asset's `storageKey` suffix
 * (e.g. `${checksum}.${ext}`). Same-origin browser fetches (`<img src>`,
 * `@font-face src: url(...)`) carry the session cookie, so protected brand URLs
 * load in-browser for the owner.
 */

import { type NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { decideBrandAssetAccess } from "@/lib/brand/asset-access";
import { getBrandStorageAdapter } from "@/lib/brand/asset-storage";
import { logError } from "@/lib/log";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ ownerId: string; path: string[] }> },
): Promise<NextResponse> {
  const { ownerId, path: pathSegments } = await params;
  const filenamePart = Array.isArray(pathSegments)
    ? pathSegments.join("/")
    : pathSegments;

  // Reconstruct the storage key: `${ownerId}/${filename}`.
  const storageKey = `${ownerId}/${filenamePart}`;

  const asset = await prisma.asset.findFirst({
    where: { storageKey, deletedAt: null },
    select: { id: true, mimeType: true, storageKey: true },
  });

  const user = await getCurrentUser();

  const decision = decideBrandAssetAccess({
    asset: asset ? { id: asset.id } : null,
    requestedOwnerId: ownerId,
    userId: user?.id ?? null,
  });

  if (!decision.allow) {
    // Privacy: missing assets and unauthorized requests both surface as plain
    // text; existence is never leaked (a 404 stays a 404).
    const body =
      decision.status === 404
        ? "Not found"
        : decision.status === 401
          ? "Unauthorized"
          : "Forbidden";
    return new NextResponse(body, { status: decision.status });
  }

  // `asset` is non-null here (a null asset would have denied with 404 above).
  return serveAsset(asset!.storageKey, asset!.mimeType);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Reads the asset via the brand storage adapter and streams the bytes.
 * Returns 404 if the file is not found on storage (inconsistency after a
 * cleanup run).
 */
async function serveAsset(
  storageKey: string,
  mimeType: string,
): Promise<NextResponse> {
  try {
    const data = await getBrandStorageAdapter().read(storageKey);
    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    logError("brand-asset-serve", err, { storageKey });
    return new NextResponse("Not found", { status: 404 });
  }
}
