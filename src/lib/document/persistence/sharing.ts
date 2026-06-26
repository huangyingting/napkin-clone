/**
 * Sharing persistence operations.
 *
 * Owns share enable/disable, share-link regeneration, share policy updates,
 * slug generation, and share-path cache revalidation.
 */

import { revalidatePath } from "next/cache";
import { customAlphabet } from "nanoid";

import { Prisma } from "@/generated/prisma/client";
import { app as appEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { buildShareSegment, buildSlugCandidate } from "@/lib/slug";
import type { ShareSettings } from "@/lib/document/persistence-types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SLUG_WRITE_ATTEMPTS = 5;

const generateShareId = customAlphabet(
  "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ",
  12,
);
const generateSlugSuffix = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 4);

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function buildShareUrl(
  slug: string | null,
  shareId: string | null,
): string | null {
  if (!slug || !shareId) {
    return null;
  }
  const base = appEnv.url();
  return `${base}/share/${buildShareSegment(slug, shareId)}`;
}

function toShareSettings(row: {
  isShared: boolean;
  shareId: string | null;
  slug: string | null;
  shareExpiresAt: Date | null;
  shareEmbedEnabled: boolean;
  sharePresentEnabled: boolean;
  shareMetadataMode?: string;
  shareDiscoverable?: boolean;
}): ShareSettings {
  const shared = row.isShared && row.shareId !== null && row.slug !== null;
  return {
    isShared: row.isShared,
    shareId: row.shareId,
    slug: row.slug,
    shareUrl: shared ? buildShareUrl(row.slug, row.shareId) : null,
    expiresAt: row.shareExpiresAt ? row.shareExpiresAt.toISOString() : null,
    embedEnabled: row.shareEmbedEnabled,
    presentEnabled: row.sharePresentEnabled,
    metadataMode:
      row.shareMetadataMode === "title" ||
      row.shareMetadataMode === "title-excerpt"
        ? row.shareMetadataMode
        : "generic",
    discoverable: row.shareDiscoverable ?? false,
  };
}

function generateShareSlugCandidate(title: string): string | null {
  const suffix = generateSlugSuffix();
  const candidate = buildSlugCandidate(title, suffix);
  return candidate || null;
}

async function writeShareData(
  id: string,
  isShared: boolean,
  shareId: string | null,
  title: string | null,
): Promise<{
  isShared: boolean;
  shareId: string | null;
  slug: string | null;
  shareExpiresAt: Date | null;
  shareEmbedEnabled: boolean;
  sharePresentEnabled: boolean;
  shareMetadataMode?: string;
  shareDiscoverable?: boolean;
}> {
  if (!isShared) {
    return prisma.document.update({
      where: { id },
      data: { isShared, shareId: null, slug: null, shareExpiresAt: null },
      select: {
        isShared: true,
        shareId: true,
        slug: true,
        shareExpiresAt: true,
        shareEmbedEnabled: true,
        sharePresentEnabled: true,
        shareMetadataMode: true,
        shareDiscoverable: true,
      },
    } as never);
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_SLUG_WRITE_ATTEMPTS; attempt++) {
    const slug = title ? generateShareSlugCandidate(title) : null;
    try {
      return await prisma.document.update({
        where: { id },
        data: { isShared, shareId, slug },
        select: {
          isShared: true,
          shareId: true,
          slug: true,
          shareExpiresAt: true,
          shareEmbedEnabled: true,
          sharePresentEnabled: true,
          shareMetadataMode: true,
          shareDiscoverable: true,
        },
      } as never);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw new Error(
    `Failed to generate a unique share slug after ${MAX_SLUG_WRITE_ATTEMPTS} attempts. Please try again.`,
    { cause: lastError },
  );
}

// ---------------------------------------------------------------------------
// Exported service operations
// ---------------------------------------------------------------------------

export async function setDocumentSharing(
  id: string,
  isShared: boolean,
): Promise<ShareSettings> {
  const shareId = isShared ? generateShareId() : null;

  let docTitle: string | null = null;
  if (isShared) {
    const doc = await prisma.document.findFirst({
      where: { id },
      select: { title: true },
    });
    if (doc) docTitle = doc.title;
  }

  return toShareSettings(await writeShareData(id, isShared, shareId, docTitle));
}

export async function regenerateDocumentShareLink(
  id: string,
): Promise<ShareSettings | null> {
  const doc = await prisma.document.findFirst({
    where: { id },
    select: { title: true, isShared: true },
  });

  if (!doc || !doc.isShared) {
    return null;
  }

  const shareId = generateShareId();
  return toShareSettings(await writeShareData(id, true, shareId, doc.title));
}

export async function updateDocumentSharePolicyData(
  id: string,
  data: {
    shareExpiresAt?: Date | null;
    shareEmbedEnabled?: boolean;
    sharePresentEnabled?: boolean;
    shareMetadataMode?: string;
    shareDiscoverable?: boolean;
  },
): Promise<ShareSettings> {
  const updated = await prisma.document.update({
    where: { id },
    data,
    select: {
      isShared: true,
      shareId: true,
      slug: true,
      shareExpiresAt: true,
      shareEmbedEnabled: true,
      sharePresentEnabled: true,
      shareMetadataMode: true,
      shareDiscoverable: true,
    },
  } as never);

  return toShareSettings(updated);
}

/**
 * Revalidates the Next.js cache for all public share/embed/present paths
 * associated with a document. Called after restore so cached public pages
 * reflect the restored content.
 */
export async function revalidateSharePaths(documentId: string): Promise<void> {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { shareId: true, slug: true, isShared: true },
    });
    if (!doc?.isShared || !doc.shareId) return;

    const segment = buildShareSegment(doc.slug, doc.shareId);
    revalidatePath(`/share/${segment}`);
    revalidatePath(`/embed/${segment}`);
    revalidatePath(`/present/${segment}`);
  } catch {
    // Cache revalidation failures must never surface to the caller.
  }
}
