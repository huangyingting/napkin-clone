/**
 * Protected slide asset serving route (Epic #374, issue #395).
 *
 * Serves slide assets with document-scoped access control so private
 * documents do not leak assets through predictable public-file URLs.
 *
 * Access rules:
 *  1. Authenticated users with at least `view` capability on the document
 *     can fetch any asset scoped to that document.
 *  2. Assets belonging to a document that is publicly shared (isShared=true
 *     and not deleted/expired) are accessible without authentication — this
 *     covers `/present/[shareId]` and embed viewers.
 *  3. All other requests receive 403.
 *
 * URL pattern: GET /api/slide-assets/[documentId]/[...path]
 *
 * The `path` segments reconstruct the asset's `storageKey` suffix
 * (e.g. `${checksum}.${ext}`).  The route reads the asset row, confirms
 * ownership, and streams the file from the local storage root.
 */

import { type NextRequest, NextResponse } from "next/server";

import {
  checkAbuseBudget,
  getClientSubject,
  requireAbuseBudgetSecret,
} from "@/lib/abuse-budget";
import { accessDecisionToPlainTextApiResponse } from "@/lib/access-policy/adapters";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { resolvePublicRender } from "@/lib/public-render/resolver";
import {
  decideSlideAssetAccess,
  slideAssetAccessDecisionToAccessDecision,
} from "@/lib/slides/asset-access";
import { logError } from "@/lib/log";
import { getDefaultStorageAdapter } from "@/lib/slides/asset-storage";
import { plainTextResponse } from "@/lib/api/route-adapters";
import { serveStoredAsset } from "@/lib/assets/serve";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string; path: string[] }> },
): Promise<Response> {
  const secret = requireAbuseBudgetSecret();
  if (secret) {
    const budget = await checkAbuseBudget({
      namespace: "public.asset.ip",
      subject: getClientSubject(request.headers),
      secret,
    });
    if (!budget.allowed) {
      return new NextResponse("Too many requests", {
        status: 429,
        headers: budget.retryAfterSeconds
          ? { "Retry-After": String(budget.retryAfterSeconds) }
          : undefined,
      });
    }
  }

  const { documentId, path: pathSegments } = await params;
  const filenamePart = Array.isArray(pathSegments)
    ? pathSegments.join("/")
    : pathSegments;

  // Reconstruct the storage key: `${documentId}/${filename}`.
  const storageKey = `${documentId}/${filenamePart}`;

  // -------------------------------------------------------------------
  // 1. Look up the asset and the owning document (no access decision yet).
  // -------------------------------------------------------------------
  const asset = await prisma.asset.findFirst({
    where: { storageKey, documentId, deletedAt: null },
    select: { id: true, mimeType: true, storageKey: true },
  });

  const publicAssetResolution = await resolvePublicRender({
    params: { documentId },
    mode: "asset",
    projection: "assetAccess",
  });
  if (publicAssetResolution.projection !== "assetAccess") {
    throw new Error("Unexpected public asset resolver projection.");
  }

  const user = await getCurrentUser();

  // -------------------------------------------------------------------
  // 2. Access control — single composed, route-shared decision.
  // -------------------------------------------------------------------
  const decision = decideSlideAssetAccess({
    asset: asset ? { id: asset.id } : null,
    document: publicAssetResolution.document,
    userId: user?.id ?? null,
    publicAssetAccess: publicAssetResolution.publicAccess,
  });

  if (!decision.allow) {
    // Privacy: missing asset/document and unauthorized requests both surface as
    // plain-text bodies; existence is never leaked (404 stays a 404).
    return accessDecisionToPlainTextApiResponse(
      slideAssetAccessDecisionToAccessDecision(decision),
    )!;
  }

  // `asset` is non-null here (a null asset would have denied with 404 above).
  return serveAsset(request, asset!.storageKey, asset!.mimeType);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Reads the asset via the default storage adapter and streams the bytes.
 *
 * The adapter reads from the non-public `storage/slide-assets/` directory.
 *
 * Returns 404 if the file is not found on any storage layer (storage
 * inconsistency after a cleanup run).
 */
async function serveAsset(
  request: Request,
  storageKey: string,
  mimeType: string,
): Promise<NextResponse> {
  try {
    return await serveStoredAsset({
      adapter: getDefaultStorageAdapter(),
      storageKey,
      mimeType,
      request,
    });
  } catch (err) {
    logError("slide-asset-serve", err, { storageKey });
    return plainTextResponse("Not found", 404);
  }
}
