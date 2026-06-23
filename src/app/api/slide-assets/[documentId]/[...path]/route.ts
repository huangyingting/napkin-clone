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

import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  documentCapabilities,
  type DocumentRoleInput,
} from "@/lib/auth/document-permissions";
import {
  evaluateShareAccess,
  toShareAccessInput,
  SHARE_ACCESS_SELECT,
} from "@/lib/share-access";
import { logError } from "@/lib/log";
import { getDefaultStorageAdapter } from "@/lib/slides/asset-storage";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string; path: string[] }> },
): Promise<NextResponse> {
  const { documentId, path: pathSegments } = await params;
  const filenamePart = Array.isArray(pathSegments)
    ? pathSegments.join("/")
    : pathSegments;

  // Reconstruct the storage key: `${documentId}/${filename}`.
  const storageKey = `${documentId}/${filenamePart}`;

  // -------------------------------------------------------------------
  // 1. Look up the asset and verify it belongs to this document.
  // -------------------------------------------------------------------
  const asset = await prisma.asset.findFirst({
    where: { storageKey, documentId, deletedAt: null },
    select: { id: true, mimeType: true, storageKey: true },
  });

  if (!asset) {
    return new NextResponse("Not found", { status: 404 });
  }

  // -------------------------------------------------------------------
  // 2. Access control.
  // -------------------------------------------------------------------

  // Fetch document share state and membership for permission evaluation.
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      ownerId: true,
      workspaceId: true,
      ...SHARE_ACCESS_SELECT,
      workspace: {
        select: {
          ownerId: true,
          members: { select: { userId: true, role: true } },
        },
      },
    },
  });

  if (!doc || doc.deletedAt) {
    return new NextResponse("Not found", { status: 404 });
  }

  const user = await getCurrentUser();

  // Authenticated user: check document view capability.
  if (user?.id) {
    const roleInput: DocumentRoleInput = {
      ownerId: doc.ownerId,
      workspaceId: doc.workspaceId,
      workspace: doc.workspace,
    };
    const caps = documentCapabilities(roleInput, user.id);
    if (caps.canView) {
      return serveAsset(asset.storageKey, asset.mimeType);
    }
  }

  // Unauthenticated (or no-capability): allow if the document is publicly
  // shared with a valid present or embed link (covers /present and embed viewers).
  const shareDecision = evaluateShareAccess(
    toShareAccessInput(doc, doc.shareId ?? "", "present"),
  );
  if (shareDecision.allow) {
    return serveAsset(asset.storageKey, asset.mimeType);
  }

  const embedDecision = evaluateShareAccess(
    toShareAccessInput(doc, doc.shareId ?? "", "embed"),
  );
  if (embedDecision.allow) {
    return serveAsset(asset.storageKey, asset.mimeType);
  }

  return new NextResponse("Forbidden", { status: 403 });
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
  storageKey: string,
  mimeType: string,
): Promise<NextResponse> {
  try {
    const data = await getDefaultStorageAdapter().read(storageKey);
    // BodyInit expects a Uint8Array here.
    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    logError("slide-asset-serve", err, { storageKey });
    return new NextResponse("Not found", { status: 404 });
  }
}
