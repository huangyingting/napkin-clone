"use server";

import { revalidatePath } from "next/cache";

import { requireDocumentCapability } from "@/lib/auth/document-permissions";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { slugify } from "@/lib/slug";

/** A tag chip shown on a document. */
export type DocumentTag = {
  id: string;
  name: string;
  slug: string;
};

// Maximum length of a tag name (in characters).
const MAX_TAG_NAME_LENGTH = 50;

/**
 * Normalizes a raw tag name: trims, collapses internal whitespace, and clamps
 * the length. Returns an empty string when there is nothing usable.
 */
function normalizeTagName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, MAX_TAG_NAME_LENGTH).trim();
}

/** Returns the document's tags (id/name/slug) ordered by name. */
async function getDocumentTags(documentId: string): Promise<DocumentTag[]> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      tags: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, slug: true },
      },
    },
  });
  return doc?.tags ?? [];
}

/**
 * Finds the acting user's tag by name, creating it if needed. Tags are
 * flat and owner-scoped (US-032); the slug derives from the name. A slug
 * collision with a differently-named tag (or an empty slug) is resolved by
 * appending a short discriminator.
 */
async function findOrCreateTag(
  ownerId: string,
  name: string,
): Promise<DocumentTag> {
  const existing = await prisma.tag.findFirst({
    where: { ownerId, name },
    select: { id: true, name: true, slug: true },
  });
  if (existing) {
    return existing;
  }

  const baseSlug = slugify(name) || "tag";
  try {
    return await prisma.tag.create({
      data: { ownerId, name, slug: baseSlug },
      select: { id: true, name: true, slug: true },
    });
  } catch {
    // Lost a race or hit the (ownerId, slug) unique constraint. Prefer an
    // existing same-named tag; otherwise create with a unique-ified slug.
    const byName = await prisma.tag.findFirst({
      where: { ownerId, name },
      select: { id: true, name: true, slug: true },
    });
    if (byName) {
      return byName;
    }
    return prisma.tag.create({
      data: {
        ownerId,
        name,
        slug: `${baseSlug}-${Date.now().toString(36)}`,
      },
      select: { id: true, name: true, slug: true },
    });
  }
}

/**
 * Adds a tag (creating it if new) to a document the user may edit, and returns
 * the document's updated tag list. Requires edit access (owner or workspace
 * editor) via `requireDocumentCapability` — a viewer or unrelated user is
 * rejected with a clear error (issue #89). A blank name is a no-op that returns
 * the current tags.
 */
export async function addTag(
  documentId: string,
  rawName: string,
): Promise<DocumentTag[]> {
  const user = await requireUser();
  await requireDocumentCapability(user.id, documentId, "edit");

  const name = normalizeTagName(rawName);
  if (!name) {
    return getDocumentTags(documentId);
  }

  const tag = await findOrCreateTag(user.id, name);
  await prisma.document.update({
    where: { id: documentId },
    data: { tags: { connect: { id: tag.id } } },
  });

  revalidatePath("/app");
  return getDocumentTags(documentId);
}

/**
 * Removes a tag from a document the user may edit (the tag itself is not
 * deleted) and returns the document's updated tag list. Requires edit access
 * (owner or workspace editor) via `requireDocumentCapability` — a viewer or
 * unrelated user is rejected with a clear error (issue #89).
 */
export async function removeTag(
  documentId: string,
  tagId: string,
): Promise<DocumentTag[]> {
  const user = await requireUser();
  await requireDocumentCapability(user.id, documentId, "edit");

  await prisma.document.update({
    where: { id: documentId },
    data: { tags: { disconnect: { id: tagId } } },
  });

  revalidatePath("/app");
  return getDocumentTags(documentId);
}
