"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { Prisma } from "@/generated/prisma/client";
import { documentAccessOr, getAccessibleDocument } from "@/lib/documents";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { BLANK_TEMPLATE_ID, getTemplateOrBlank } from "@/lib/templates/catalog";

/** Documents soft-deleted before this cutoff are eligible for permanent purge. */
const SOFT_DELETE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Maximum stored document title length (mirrors the editor's title save). */
const MAX_TITLE_LENGTH = 200;

/**
 * Creates a document for the current user seeded from a starter template, then
 * redirects to its editor.
 *
 * The id is resolved via `getTemplateOrBlank`, so an unknown or missing id
 * gracefully falls back to a blank document. The Blank template starts with
 * empty content (mirroring a from-scratch document); named templates seed their
 * Markdown `content`. No AI generation happens here.
 *
 * `redirect` throws `NEXT_REDIRECT`, so it must stay outside any try/catch and
 * run after the document is created.
 */
export async function createDocumentFromTemplate(
  templateId: string,
): Promise<void> {
  const user = await requireUser();

  const template = getTemplateOrBlank(templateId);
  const content = template.id === BLANK_TEMPLATE_ID ? "" : template.content;

  const document = await prisma.document.create({
    data: { ownerId: user.id, content },
    select: { id: true },
  });

  revalidatePath("/app");
  redirect(`/app/documents/${document.id}`);
}

/**
 * Renames a document the current user may access (owner or workspace member).
 *
 * Access is gated by `getAccessibleDocument` (a non-accessible id is a silent
 * no-op so the action never leaks whether a document exists), and the write uses
 * `updateMany` so a concurrent change is a harmless no-op rather than a throw.
 * The title is trimmed and length-clamped, falling back to "Untitled" when empty
 * (mirroring `saveDocumentTitle`). Returns the normalized title so the caller can
 * reflect any trimming/fallback.
 */
export async function renameDocument(
  id: string,
  rawTitle: string,
): Promise<{ title: string }> {
  const user = await requireUser();

  const title = rawTitle.trim().slice(0, MAX_TITLE_LENGTH) || "Untitled";

  const document = await getAccessibleDocument(user.id, id);
  if (!document) {
    return { title };
  }

  await prisma.document.updateMany({
    where: { id },
    data: { title },
  });

  revalidatePath("/app");
  return { title };
}

/**
 * Duplicates a document the current user may access (owner or workspace member)
 * into a fresh personal document owned by the current user.
 *
 * Access is scoped directly in the read's `where` via `documentAccessOr` (a
 * non-accessible or soft-deleted id simply matches nothing — a silent no-op that
 * never leaks existence). The copy reuses the source title (suffixed " (copy)")
 * and content and deep-copies every `Visual` row (anchorBlockId, orderIndex,
 * type, title, data) via a nested create in a single statement.
 *
 * Comments and share state are intentionally NOT copied: the new document is
 * private (`isShared` defaults to false, `shareId` stays null) and starts with
 * no comments. The copy is created fresh, so its `createdAt`/`updatedAt` are
 * "now" and it sorts to the top of the dashboard's most-recent ordering.
 */
export async function duplicateDocument(id: string): Promise<void> {
  const user = await requireUser();

  const source = await prisma.document.findFirst({
    where: {
      id,
      deletedAt: null,
      OR: documentAccessOr(user.id),
    },
    select: {
      title: true,
      content: true,
      visuals: {
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        select: {
          anchorBlockId: true,
          orderIndex: true,
          type: true,
          title: true,
          data: true,
        },
      },
    },
  });

  if (!source) {
    return;
  }

  await prisma.document.create({
    data: {
      ownerId: user.id,
      title: `${source.title} (copy)`,
      content: source.content,
      visuals: {
        create: source.visuals.map((visual) => ({
          anchorBlockId: visual.anchorBlockId,
          orderIndex: visual.orderIndex,
          type: visual.type,
          title: visual.title,
          data: visual.data as unknown as Prisma.InputJsonValue,
        })),
      },
    },
    select: { id: true },
  });

  revalidatePath("/app");
}

/**
 * Toggles the `favorite` flag on a document the current user may access (owner
 * or workspace member).
 *
 * The current value is read under the same access scope as the dashboard
 * (`documentAccessOr`, excluding soft-deleted rows) so a non-accessible id
 * simply matches nothing — a silent no-op that never leaks existence. The write
 * uses `updateMany` keyed by id (per the house mutation rule) so a concurrent
 * change is a harmless no-op rather than a throw. Returns the new flag so the
 * caller can reconcile its optimistic state.
 */
export async function toggleFavorite(
  id: string,
): Promise<{ favorite: boolean }> {
  const user = await requireUser();

  const document = await prisma.document.findFirst({
    where: {
      id,
      deletedAt: null,
      OR: documentAccessOr(user.id),
    },
    select: { favorite: true },
  });

  if (!document) {
    return { favorite: false };
  }

  const favorite = !document.favorite;

  await prisma.document.updateMany({
    where: { id },
    data: { favorite },
  });

  revalidatePath("/app");
  return { favorite };
}

/**
 * Soft-deletes a document the current user may access (owner or workspace
 * member) by stamping `deletedAt`. The row is retained so the delete can be
 * undone (see `restoreDocument`); every document list/detail/share/embed query
 * excludes `deletedAt != null`, so a soft-deleted document is invisible.
 *
 * Access is gated by `getAccessibleDocument` (which itself excludes already
 * soft-deleted rows, so a double-delete is a no-op); a non-accessible id is a
 * silent no-op so the action never leaks whether a document exists. The update
 * uses `updateMany` so a concurrent change is a harmless no-op rather than a
 * throw. The document's `Visual`/`Comment` rows are left intact and only
 * removed when the row is eventually purged (see `purgeDeletedDocuments`).
 */
export async function deleteDocument(id: string): Promise<void> {
  const user = await requireUser();

  const document = await getAccessibleDocument(user.id, id);
  if (!document) {
    return;
  }

  await prisma.document.updateMany({
    where: { id },
    data: { deletedAt: new Date() },
  });

  revalidatePath("/app");
}

/**
 * Restores a soft-deleted document by clearing `deletedAt`, reversing
 * `deleteDocument`. We can't reuse `getAccessibleDocument` here (it excludes
 * soft-deleted rows), so the authorization scope is applied directly in the
 * `updateMany` where-clause via `documentAccessOr`: a foreign/forbidden id
 * simply matches zero rows (a silent no-op that never leaks existence).
 */
export async function restoreDocument(id: string): Promise<void> {
  const user = await requireUser();

  await prisma.document.updateMany({
    where: {
      id,
      deletedAt: { not: null },
      OR: documentAccessOr(user.id),
    },
    data: { deletedAt: null },
  });

  revalidatePath("/app");
}

/**
 * Permanently removes documents soft-deleted longer than the retention window
 * (30 days). Their `Visual`/`Comment` rows cascade away via the existing
 * `onDelete: Cascade` relations.
 *
 * This is a lightweight, global maintenance task invoked opportunistically on
 * dashboard load (an indexed `deletedAt` filter keyed by an old cutoff matches
 * few rows). It is intentionally not user-scoped — expired soft-deletes are
 * purged regardless of owner — and never throws on an empty match.
 */
export async function purgeDeletedDocuments(): Promise<void> {
  const cutoff = new Date(Date.now() - SOFT_DELETE_RETENTION_MS);

  await prisma.document.deleteMany({
    where: { deletedAt: { lt: cutoff } },
  });
}
