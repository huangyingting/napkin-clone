"use server";

import { customAlphabet } from "nanoid";
import { revalidatePath } from "next/cache";

import { Prisma } from "@/generated/prisma/client";
import { getAccessibleDocument } from "@/lib/documents";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  VISUAL_KIND_TO_PRISMA,
  safeParseVisual,
  validateVisual,
  type Visual,
} from "@/lib/visual/schema";

// URL-safe share ID generator (no ambiguous chars: 0/O, 1/l/I)
const generateShareId = customAlphabet(
  "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ",
  12,
);

const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_LENGTH = 100_000;
const MAX_ANCHOR_BLOCK_ID_LENGTH = 200;

// How many historical snapshots to retain per visual. Older ones are pruned in
// the same save so the history table can't grow without bound.
const MAX_VISUAL_REVISIONS = 10;

/**
 * Records a snapshot of a visual's current persisted state into the
 * `VisualRevision` history, then prunes that visual's history to the most recent
 * `MAX_VISUAL_REVISIONS` entries. Called with the *previous* row before it is
 * overwritten, so each edit/regeneration is restorable (US-016).
 */
async function snapshotVisualRevision(previous: {
  id: string;
  data: Prisma.JsonValue;
  type: string;
  title: string | null;
}): Promise<void> {
  await prisma.visualRevision.create({
    data: {
      visualId: previous.id,
      data: previous.data as unknown as Prisma.InputJsonValue,
      type: previous.type,
      title: previous.title,
    },
  });

  // Keep only the newest snapshots; delete anything beyond the retention limit.
  const stale = await prisma.visualRevision.findMany({
    where: { visualId: previous.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: MAX_VISUAL_REVISIONS,
    select: { id: true },
  });

  if (stale.length > 0) {
    await prisma.visualRevision.deleteMany({
      where: { id: { in: stale.map((revision) => revision.id) } },
    });
  }
}

/**
 * Normalizes a caller-supplied anchor block id. A non-empty trimmed string
 * (clamped to a sane length) anchors the visual to that Markdown block; any
 * empty/whitespace value or non-string collapses to `null`, which targets the
 * legacy document-level visual row (backward compatible).
 */
function normalizeAnchorBlockId(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, MAX_ANCHOR_BLOCK_ID_LENGTH);
}

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
 * Attaches a generated visual to a document, keyed by anchor block.
 *
 * The selected candidate is re-validated server-side (never trust the client)
 * and the document is owner/member access-scoped before any write. The visual
 * is upserted by `(documentId, anchorBlockId)` so multiple visuals can coexist
 * in one document: each Markdown block keeps its own visual, and a `null`
 * `anchorBlockId` targets the legacy document-level visual row (backward
 * compatible). The full validated `Visual` JSON is stored in `Visual.data`; its
 * kind maps to the Prisma `VisualType` for queryability. When an existing visual
 * is overwritten, its previous state is first snapshotted into the
 * `VisualRevision` history (newest 10 retained) so the edit is restorable;
 * creating a brand-new visual records no snapshot (no prior data).
 *
 * Returns the persisted visual id. Throws when the visual is invalid or the
 * document isn't accessible to the current user (the caller surfaces a
 * transient, retryable message).
 */
export async function attachVisual(
  id: string,
  input: unknown,
  anchorBlockId: string | null = null,
): Promise<{ visualId: string }> {
  const user = await requireUser();

  // Re-validate so a tampered/garbled payload can never be persisted.
  const visual = validateVisual(input);

  // Access-scope first (owner or workspace member) so a foreign/forbidden
  // document id can't be written to or probed.
  const document = await getAccessibleDocument(user.id, id);
  if (!document) {
    throw new Error("Document not found.");
  }

  const anchor = normalizeAnchorBlockId(anchorBlockId);
  const type = VISUAL_KIND_TO_PRISMA[visual.type];
  const title = visual.title ?? null;
  const data = visual as unknown as Prisma.InputJsonValue;

  // One visual per (document, anchor block): update the existing row for this
  // anchor, else create it. A null anchor maps to the document-level visual.
  const existing = await prisma.visual.findFirst({
    where: { documentId: id, anchorBlockId: anchor },
    orderBy: { createdAt: "asc" },
    select: { id: true, data: true, type: true, title: true },
  });

  let saved: { id: string };
  if (existing) {
    // Snapshot the previous state before overwriting it (skipped on create — a
    // brand-new visual has no prior data to record).
    await snapshotVisualRevision(existing);
    saved = await prisma.visual.update({
      where: { id: existing.id },
      data: { type, title, data },
      select: { id: true },
    });
  } else {
    saved = await prisma.visual.create({
      data: { documentId: id, anchorBlockId: anchor, type, title, data },
      select: { id: true },
    });
  }

  revalidatePath(`/app/documents/${id}`);
  return { visualId: saved.id };
}

/** A previous version of a visual, ready to render as a history thumbnail. */
export type VisualRevisionSummary = {
  id: string;
  createdAt: string;
  visual: Visual;
};

/**
 * Lists the recent revision history for the visual at `(documentId,
 * anchorBlockId)`, newest first, for any user who can access the document
 * (owner or workspace member). Each revision's stored JSON is re-parsed with
 * `safeParseVisual` so only renderable snapshots are returned (garbled rows are
 * skipped); the `createdAt` is serialized to an ISO string for the client.
 * Returns an empty list when the visual has no history yet. Throws when the
 * document isn't accessible.
 */
export async function listVisualRevisions(
  documentId: string,
  anchorBlockId: string | null = null,
): Promise<VisualRevisionSummary[]> {
  const user = await requireUser();

  const document = await getAccessibleDocument(user.id, documentId);
  if (!document) {
    throw new Error("Document not found.");
  }

  const anchor = normalizeAnchorBlockId(anchorBlockId);

  // Resolve the visual row for this (document, anchor) — its id keys the history.
  const visual = await prisma.visual.findFirst({
    where: { documentId, anchorBlockId: anchor },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!visual) {
    return [];
  }

  const revisions = await prisma.visualRevision.findMany({
    where: { visualId: visual.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, data: true, createdAt: true },
  });

  const summaries: VisualRevisionSummary[] = [];
  for (const revision of revisions) {
    const parsed = safeParseVisual(revision.data);
    if (parsed.success) {
      summaries.push({
        id: revision.id,
        createdAt: revision.createdAt.toISOString(),
        visual: parsed.data,
      });
    }
  }
  return summaries;
}

/**
 * Restores a previous visual version.
 *
 * The revision is resolved to its parent visual and document, the document is
 * access-scoped (owner or workspace member), and the snapshot is re-validated
 * with `validateVisual` before being written back through `attachVisual`. Going
 * through `attachVisual` means the *current* state is itself snapshotted into
 * history first, so a restore is recorded and therefore undoable. Returns the
 * restored visual so the caller can update the canvas live.
 */
export async function restoreVisualRevision(
  revisionId: string,
): Promise<{ visual: Visual }> {
  const user = await requireUser();

  const revision = await prisma.visualRevision.findUnique({
    where: { id: revisionId },
    select: {
      data: true,
      visual: { select: { documentId: true, anchorBlockId: true } },
    },
  });
  if (!revision) {
    throw new Error("Revision not found.");
  }

  // Access-scope the parent document so a foreign revision id can't be probed
  // or restored by a user without access.
  const document = await getAccessibleDocument(
    user.id,
    revision.visual.documentId,
  );
  if (!document) {
    throw new Error("Document not found.");
  }

  // Re-validate the stored snapshot before writing it back.
  const visual = validateVisual(revision.data);

  await attachVisual(
    revision.visual.documentId,
    visual,
    revision.visual.anchorBlockId,
  );

  return { visual };
}

/**
 * Removes a single anchored visual from a document.
 *
 * Deletes the `Visual` row keyed by `(documentId, anchorBlockId)` so removing
 * one block's visual never touches the others (or the legacy document-level
 * visual unless `anchorBlockId` is `null`). The document is owner/member
 * access-scoped first, then `deleteMany` is used so a foreign/forbidden id or a
 * block with no visual is a harmless no-op rather than a throw or cross-user
 * delete.
 */
export async function detachVisual(
  id: string,
  anchorBlockId: string | null = null,
): Promise<void> {
  const user = await requireUser();

  const document = await getAccessibleDocument(user.id, id);
  if (!document) {
    throw new Error("Document not found.");
  }

  const anchor = normalizeAnchorBlockId(anchorBlockId);

  await prisma.visual.deleteMany({
    where: { documentId: id, anchorBlockId: anchor },
  });

  revalidatePath(`/app/documents/${id}`);
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
