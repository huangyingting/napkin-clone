"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { Prisma } from "@/generated/prisma/client";
import {
  documentCapabilities,
  requireDocumentCapability,
} from "@/lib/auth/document-permissions";
import { excerpt, readingTimeMinutes } from "@/lib/document-stats";
import { capList, documentAccessOr } from "@/lib/documents";
import { prisma } from "@/lib/prisma";
import {
  buildDocumentSearchWhere,
  normalizeSearchQuery,
  SEARCH_RESULT_LIMIT,
} from "@/lib/search";
import { requireUser } from "@/lib/session";
import { BLANK_TEMPLATE_ID, getTemplateOrBlank } from "@/lib/templates/catalog";
import { acquirePurgeLock, INVITE_LINK_RETENTION_MS } from "@/lib/maintenance";
import { SOFT_DELETE_RETENTION_MS } from "@/lib/trash";
import { safeParseVisual, type Visual } from "@/lib/visual/schema";

/** Maximum stored document title length. */
const MAX_TITLE_LENGTH = 200;

/** Maximum stored document content length. */
const MAX_CONTENT_LENGTH = 100_000;

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
 * Creates a document from pre-extracted import text and redirects to its editor.
 *
 * The `content` is the normalized Markdown returned by `POST /api/import`. The
 * caller is responsible for ensuring it has already been validated/normalized.
 * Content is clamped server-side to `MAX_CONTENT_LENGTH` as a final safety net.
 *
 * `redirect` throws `NEXT_REDIRECT`, so it must stay outside any try/catch and
 * run after the document is created.
 */
export async function createDocumentFromImport(
  content: string,
  rawTitle: string,
): Promise<void> {
  const user = await requireUser();

  const title =
    rawTitle.trim().slice(0, MAX_TITLE_LENGTH) || "Imported document";
  const safeContent = content.slice(0, MAX_CONTENT_LENGTH);

  const document = await prisma.document.create({
    data: { ownerId: user.id, title, content: safeContent },
    select: { id: true },
  });

  revalidatePath("/app");
  redirect(`/app/documents/${document.id}`);
}

/**
 * Renames a document. Requires edit access (owner or workspace editor); a
 * viewer or unrelated user is rejected with a clear error via
 * `requireDocumentCapability` (issue #89). The write uses `updateMany` so a
 * concurrent change is a harmless no-op rather than a throw. The title is
 * trimmed and length-clamped, falling back to "Untitled" when empty. Returns
 * the normalized title so the caller can reflect any trimming/fallback.
 */
export async function renameDocument(
  id: string,
  rawTitle: string,
): Promise<{ title: string }> {
  const user = await requireUser();

  const title = rawTitle.trim().slice(0, MAX_TITLE_LENGTH) || "Untitled";

  await requireDocumentCapability(user.id, id, "edit");

  await prisma.document.updateMany({
    where: { id },
    data: { title },
  });

  revalidatePath("/app");
  return { title };
}

/**
 * Duplicates a document the current user may view (owner or any workspace
 * member) into a fresh personal document owned by the current user.
 *
 * View access is authorized via `requireDocumentCapability` (a non-accessible
 * id throws a clear "Document not found." error). The copy reuses the source
 * title (suffixed " (copy)") and content and deep-copies every `Visual` row
 * (anchorBlockId, orderIndex, type, title, data) via a nested create in a
 * single statement.
 *
 * Comments and share state are intentionally NOT copied: the new document is
 * private (`isShared` defaults to false, `shareId` stays null) and starts with
 * no comments. The copy is created fresh, so its `createdAt`/`updatedAt` are
 * "now" and it sorts to the top of the dashboard's most-recent ordering.
 */
export async function duplicateDocument(id: string): Promise<void> {
  const user = await requireUser();

  await requireDocumentCapability(user.id, id, "view");

  const source = await prisma.document.findFirst({
    where: {
      id,
      deletedAt: null,
    },
    select: {
      title: true,
      content: true,
      contentJson: true,
      deckJson: true,
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
      ...(source.contentJson != null && {
        contentJson: source.contentJson as Prisma.InputJsonValue,
      }),
      ...(source.deckJson != null && {
        deckJson: source.deckJson as Prisma.InputJsonValue,
      }),
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
 * Toggles the `favorite` flag on a document the current user may edit (owner or
 * workspace editor).
 *
 * Edit access is authorized via `requireDocumentCapability`; a viewer or
 * unrelated user is rejected with a clear error (issue #89). The current value
 * is read by id and the write uses `updateMany` keyed by id (per the house
 * mutation rule) so a concurrent change is a harmless no-op rather than a throw.
 * Returns the new flag so the caller can reconcile its optimistic state.
 */
export async function toggleFavorite(
  id: string,
): Promise<{ favorite: boolean }> {
  const user = await requireUser();

  await requireDocumentCapability(user.id, id, "edit");

  const document = await prisma.document.findFirst({
    where: { id, deletedAt: null },
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
 * Soft-deletes a document by stamping `deletedAt`. Requires manage access
 * (owner-level); a viewer, editor, or unrelated user is rejected with a clear
 * error via `requireDocumentCapability` (issue #89). The row is retained so the
 * delete can be undone (see `restoreDocument`); every document
 * list/detail/share/embed query excludes `deletedAt != null`, so a soft-deleted
 * document is invisible.
 *
 * The capability check excludes already soft-deleted rows (a double-delete is a
 * clean "Document not found."), and the update uses `updateMany` so a concurrent
 * change is a harmless no-op rather than a throw. The document's
 * `Visual`/`Comment` rows are left intact and only removed by the maintenance
 * sweep once the recovery window has elapsed.
 */
export async function deleteDocument(id: string): Promise<void> {
  const user = await requireUser();

  await requireDocumentCapability(user.id, id, "manage");

  await prisma.document.updateMany({
    where: { id },
    data: { deletedAt: new Date() },
  });

  revalidatePath("/app");
}

/**
 * Restores a soft-deleted document by clearing `deletedAt`, reversing
 * `deleteDocument`. Requires manage access (owner-level), authorized via
 * `requireDocumentCapability` with `includeDeleted` so the soft-deleted row is
 * visible to the check; an unauthorized user is rejected with a clear error.
 * The write uses `updateMany` so a concurrent change is a harmless no-op.
 */
export async function restoreDocument(id: string): Promise<void> {
  const user = await requireUser();

  await requireDocumentCapability(user.id, id, "manage", {
    includeDeleted: true,
  });

  await prisma.document.updateMany({
    where: { id, deletedAt: { not: null } },
    data: { deletedAt: null },
  });

  revalidatePath("/app");
}

/**
 * Opportunistic maintenance sweep invoked on dashboard load.
 *
 * A module-level timestamp guard (acquirePurgeLock) ensures the global
 * deleteMany operations run at most once per PURGE_MIN_INTERVAL_MS (5 min)
 * across concurrent requests within the same process, avoiding redundant
 * contending writes on every page render.
 *
 * When the throttle allows a sweep the function:
 *   1. Permanently removes documents soft-deleted beyond the 30-day retention
 *      window (Visual/Comment rows cascade via onDelete: Cascade).
 *   2. Permanently removes InviteLink rows that are dead (revoked, expired, or
 *      exhausted) and older than the 7-day invite retention window.
 *      InviteLinkUse audit rows cascade via onDelete: Cascade.
 *
 * When the throttle suppresses the sweep the function returns immediately so
 * the dashboard load is not slowed.
 */
export async function runMaintenance(): Promise<void> {
  if (!acquirePurgeLock()) return;

  const now = new Date();
  const docCutoff = new Date(now.getTime() - SOFT_DELETE_RETENTION_MS);
  const inviteCutoff = new Date(now.getTime() - INVITE_LINK_RETENTION_MS);

  await Promise.all([
    // Purge hard-expired soft-deleted documents (all owners).
    prisma.document.deleteMany({
      where: { deletedAt: { lt: docCutoff } },
    }),

    // Purge dead InviteLink rows past the retention window.
    // "Dead" = revoked, OR expired (expiresAt ≤ now), OR exhausted
    // (useCount >= maxUses — a column comparison requiring raw SQL).
    // The createdAt anchor guards against purging recently-created dead links,
    // giving workspace owners a 7-day audit window.
    // InviteLinkUse rows cascade via onDelete: Cascade.
    prisma.$executeRaw`
      DELETE FROM "InviteLink"
      WHERE "createdAt" < ${inviteCutoff}
        AND (
          "isRevoked" = ${true}
          OR ("expiresAt" IS NOT NULL AND "expiresAt" < ${inviteCutoff})
          OR ("maxUses" IS NOT NULL AND "useCount" >= "maxUses")
        )
    `,
  ]);
}

/** Shape returned by `searchDocuments`, compatible with `DashboardDocument`. */
export type SearchResult = {
  id: string;
  title: string;
  favorite: boolean;
  editedLabel: string;
  workspaceName: string | null;
  thumbnail: Visual | null;
  excerpt: string;
  readingMinutes: number;
  createdAtMs: number;
  updatedAtMs: number;
  canEdit: boolean;
  canManage: boolean;
  tags: { slug: string; name: string }[];
};

/**
 * Result of a `searchDocuments` call: the (capped) matches plus `hasMore`,
 * which is `true` when the query hit {@link SEARCH_RESULT_LIMIT} and additional
 * matches were dropped. Callers surface `hasMore` as a "narrow your search" hint.
 */
export type SearchResults = {
  results: SearchResult[];
  hasMore: boolean;
};

const searchDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/**
 * Server-side full-text search across the current user's accessible documents
 * covering **title** and **content** fields. Returns documents matching the
 * query, each shaped identically to `DashboardDocument` so the dashboard can
 * display them directly.
 *
 * The query is trimmed and length-clamped before being used in a DB query.
 * An empty (or whitespace-only) query returns an empty result — the caller
 * should fall back to the full document list in that case.
 *
 * Results are capped at {@link SEARCH_RESULT_LIMIT} (a one-character query can
 * otherwise match the entire corpus on every debounce tick). One extra row is
 * requested so `hasMore` can flag when matches were dropped, and the UI shows a
 * "narrow your search" hint.
 *
 * Provider behaviour is handled by {@link buildDocumentSearchWhere}: SQLite
 * uses LIKE (case-insensitive for ASCII); Postgres uses ILIKE.
 *
 * Access is scoped to the current user via `documentAccessOr` — the same gate
 * used by every other document action.
 */
export async function searchDocuments(
  rawQuery: string,
): Promise<SearchResults> {
  const user = await requireUser();

  const q = normalizeSearchQuery(rawQuery);
  if (!q) return { results: [], hasMore: false };

  const rows = await prisma.document.findMany({
    where: buildDocumentSearchWhere(q, documentAccessOr(user.id)),
    orderBy: { updatedAt: "desc" },
    take: SEARCH_RESULT_LIMIT + 1,
    select: {
      id: true,
      title: true,
      favorite: true,
      content: true,
      createdAt: true,
      updatedAt: true,
      ownerId: true,
      workspaceId: true,
      visuals: {
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        take: 1,
        select: { data: true },
      },
      tags: {
        orderBy: { name: "asc" },
        select: { slug: true, name: true },
      },
      workspace: {
        select: {
          name: true,
          ownerId: true,
          members: {
            where: { userId: user.id },
            select: { userId: true, role: true },
          },
        },
      },
    },
  });

  const { items, hasMore } = capList(rows, SEARCH_RESULT_LIMIT);

  const results = items.map((doc) => {
    const firstVisual = doc.visuals[0];
    let thumbnail: Visual | null = null;
    if (firstVisual) {
      const parsed = safeParseVisual(firstVisual.data);
      if (parsed.success) thumbnail = parsed.data;
    }
    const content = doc.content ?? "";
    const { canEdit, canManage } = documentCapabilities(doc, user.id);
    return {
      id: doc.id,
      title: doc.title,
      favorite: doc.favorite,
      editedLabel: searchDateFormatter.format(doc.updatedAt),
      workspaceName: doc.workspace?.name ?? null,
      thumbnail,
      excerpt: excerpt(content),
      readingMinutes: readingTimeMinutes(content),
      createdAtMs: doc.createdAt.getTime(),
      updatedAtMs: doc.updatedAt.getTime(),
      canEdit,
      canManage,
      tags: doc.tags,
    };
  });

  return { results, hasMore };
}

/**
 * Permanently dismisses first-run onboarding for the current user.
 *
 * Sets `onboardingDismissed = true` on the User row so the checklist is never
 * shown again, regardless of device or session. This is a write-once action:
 * calling it again on an already-dismissed user is a harmless no-op.
 */
export async function dismissOnboarding(): Promise<void> {
  const user = await requireUser();

  await prisma.user.updateMany({
    where: { id: user.id },
    data: { onboardingDismissed: true },
  });

  revalidatePath("/app");
}
