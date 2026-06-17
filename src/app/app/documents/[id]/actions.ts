"use server";

import { customAlphabet } from "nanoid";
import { revalidatePath } from "next/cache";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { VISUAL_KIND_TO_PRISMA, validateVisual } from "@/lib/visual/schema";

// URL-safe share ID generator (no ambiguous chars: 0/O, 1/l/I)
const generateShareId = customAlphabet(
  "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ",
  12,
);

const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_LENGTH = 100_000;

/**
 * Saves a document title for the current user. Owner-scoped via `updateMany`
 * (`where: { id, ownerId }`) so a foreign id is a no-op rather than a
 * cross-user write. Returns the normalized title so the client can reflect any
 * trimming/fallback. Empty titles fall back to "Untitled".
 */
export async function saveDocumentTitle(
  id: string,
  rawTitle: string,
): Promise<{ title: string }> {
  const user = await requireUser();
  const title = rawTitle.trim().slice(0, MAX_TITLE_LENGTH) || "Untitled";

  await prisma.document.updateMany({
    where: { id, ownerId: user.id },
    data: { title },
  });

  revalidatePath("/app");
  return { title };
}

/**
 * Saves document text content for the current user. Owner-scoped via
 * `updateMany` so it never writes to another user's document. Content is
 * clamped to a sane maximum length.
 */
export async function saveDocumentContent(
  id: string,
  content: string,
): Promise<void> {
  const user = await requireUser();
  const safeContent = content.slice(0, MAX_CONTENT_LENGTH);

  await prisma.document.updateMany({
    where: { id, ownerId: user.id },
    data: { content: safeContent },
  });

  revalidatePath("/app");
}

/**
 * Attaches a generated visual to a document as its single active visual.
 *
 * The selected candidate is re-validated server-side (never trust the client),
 * owner-scoped to the current user, then persisted into the document's `Visual`
 * row (create-or-update). The full validated `Visual` JSON is stored in
 * `Visual.data`; its kind maps to the Prisma `VisualType` for queryability.
 *
 * Returns the persisted visual id. Throws when the visual is invalid or the
 * document isn't owned by the current user (the caller surfaces a transient,
 * retryable message).
 */
export async function attachVisual(
  id: string,
  input: unknown,
): Promise<{ visualId: string }> {
  const user = await requireUser();

  // Re-validate so a tampered/garbled payload can never be persisted.
  const visual = validateVisual(input);

  // Owner-scope first so a foreign document id can't be written to or probed.
  const document = await prisma.document.findFirst({
    where: { id, ownerId: user.id },
    select: { id: true },
  });
  if (!document) {
    throw new Error("Document not found.");
  }

  const type = VISUAL_KIND_TO_PRISMA[visual.type];
  const title = visual.title ?? null;
  const data = visual as unknown as Prisma.InputJsonValue;

  // One active visual per document: update the existing row, else create it.
  const existing = await prisma.visual.findFirst({
    where: { documentId: id },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  const saved = existing
    ? await prisma.visual.update({
        where: { id: existing.id },
        data: { type, title, data },
        select: { id: true },
      })
    : await prisma.visual.create({
        data: { documentId: id, type, title, data },
        select: { id: true },
      });

  revalidatePath(`/app/documents/${id}`);
  return { visualId: saved.id };
}

/**
 * Toggles sharing for a document owned by the current user.
 *
 * - When enabling sharing (isShared: true), generates a unique shareId.
 * - When disabling sharing (isShared: false), clears the shareId.
 * - Returns the current share state: { isShared, shareId?, shareUrl? }.
 *
 * Owner-scoped so it never modifies another user's document.
 */
export async function toggleDocumentSharing(
  id: string,
  isShared: boolean,
): Promise<{
  isShared: boolean;
  shareId: string | null;
  shareUrl: string | null;
}> {
  const user = await requireUser();

  // Generate a new shareId when enabling, clear it when disabling.
  const shareId = isShared ? generateShareId() : null;

  await prisma.document.updateMany({
    where: { id, ownerId: user.id },
    data: { isShared, shareId },
  });

  // Build the public URL when shared; null otherwise.
  const shareUrl =
    isShared && shareId
      ? `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/share/${shareId}`
      : null;

  revalidatePath(`/app/documents/${id}`);
  revalidatePath("/app");

  return { isShared, shareId, shareUrl };
}
