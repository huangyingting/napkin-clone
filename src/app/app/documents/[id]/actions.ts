"use server";

import { customAlphabet } from "nanoid";
import { revalidatePath } from "next/cache";

import { Prisma } from "@/generated/prisma/client";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { requireDocumentCapability } from "@/lib/auth/document-permissions";
import { stampBlockIds } from "@/lib/lexical/block-id";
import { prisma } from "@/lib/prisma";
import { app as appEnv } from "@/lib/env";
import { requireUser } from "@/lib/session";
import { buildShareSegment, buildSlugCandidate } from "@/lib/slug";
import { logInfo, logError } from "@/lib/log";
import {
  atomicSaveDocumentLexical,
  rebuildMirror,
  persistDeck,
  patchDeck,
  restoreVersion,
  type VisualMirrorOutcome,
} from "@/lib/document/persistence-service";
import type {
  DocumentVersionSummary,
  RestoredDocumentVersion,
  SaveDeckPatchResult,
  SaveDeckResult,
  ShareSettings,
} from "@/lib/document/persistence-types";
import type { DeckPatch } from "@/lib/presentation/slide-commands";

// URL-safe share ID generator (no ambiguous chars: 0/O, 1/l/I)
const generateShareId = customAlphabet(
  "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ",
  12,
);

// Short random suffix appended to slug candidates to make same-title
// collisions vanishingly unlikely (4 lowercase alphanumeric chars).
const generateSlugSuffix = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 4);

const MAX_LEXICAL_STATE_LENGTH = 2_000_000;

/**
 * Saves the serialized Lexical editor state for a document.
 *
 * Permission-checked (edit access required). Delegates all persistence
 * orchestration — atomic contentJson write + visual mirror rebuild — to
 * {@link atomicSaveDocumentLexical} in the persistence service (#474, #470).
 */
export async function saveDocumentLexical(
  id: string,
  stateJson: string,
): Promise<ActionResult<VisualMirrorOutcome>> {
  const user = await requireUser();

  if (stateJson.length > MAX_LEXICAL_STATE_LENGTH) {
    return actionError("Document is too large to save.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stateJson);
  } catch {
    return actionError("Invalid editor state.");
  }

  parsed = stampBlockIds(parsed);

  await requireDocumentCapability(user.id, id, "edit");

  const outcome = await atomicSaveDocumentLexical(id, parsed, user.id);

  revalidatePath("/app");
  return actionOk(outcome);
}

/**
 * Idempotent server action that rebuilds all `Visual` rows for a document
 * purely from its current `contentJson` (issue #451).
 *
 * Delegates to {@link rebuildMirror} in the persistence service after
 * permission checks. Does NOT snapshot, update `contentJson`, or touch any
 * other document fields. Running it twice without intermediate edits is a
 * no-op. Permission-checked: requires edit access to the document.
 */
export async function rebuildVisualMirror(
  documentId: string,
): Promise<ActionResult<VisualMirrorOutcome>> {
  const user = await requireUser();
  await requireDocumentCapability(user.id, documentId, "edit");

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { contentJson: true },
  });

  if (!doc) {
    return actionError("Document not found.");
  }

  if (doc.contentJson == null) {
    const empty: VisualMirrorOutcome = {
      created: 0,
      updated: 0,
      deleted: 0,
      skipped: 0,
      invalid: 0,
    };
    logInfo("visual.rebuild", "rebuild skipped: no contentJson", {
      documentId,
    });
    return actionOk(empty);
  }

  try {
    const outcome = await rebuildMirror(documentId, doc.contentJson);
    revalidatePath("/app");
    return actionOk(outcome);
  } catch (err) {
    logError(
      "visual.rebuild",
      err instanceof Error ? err : new Error(String(err)),
      { documentId },
    );
    return actionError("Failed to rebuild visual mirror.");
  }
}

// Furthest-out expiry a caller may set, guarding against absurd dates.
const MAX_SHARE_EXPIRY_MS = 5 * 365 * 24 * 60 * 60 * 1000; // ~5 years

/** Builds the canonical public share URL (or `null` when not shared). */
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

/**
 * Assembles the {@link ShareSettings} payload from the persisted document row,
 * keeping the URL/expiry serialization in one place so all sharing actions
 * return an identically-shaped result.
 */
function toShareSettings(row: {
  isShared: boolean;
  shareId: string | null;
  slug: string | null;
  shareExpiresAt: Date | null;
  shareEmbedEnabled: boolean;
  sharePresentEnabled: boolean;
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
  };
}

/**
 * Toggles sharing for a document owned by the current user.
 *
 * - When enabling sharing (isShared: true), generates a unique shareId and a
 *   decorative slug.
 * - When disabling sharing (isShared: false), clears the shareId, slug, and any
 *   expiry so a re-enable starts from a clean policy.
 * - Returns the full {@link ShareSettings} (link + lifecycle policy).
 *
 * Requires manage access (owner-level); a viewer, editor, or unrelated user is
 * rejected with a clear error via `requireDocumentCapability` (issue #89) so it
 * never modifies a document the user may not manage.
 */
export async function toggleDocumentSharing(
  id: string,
  isShared: boolean,
): Promise<ActionResult<ShareSettings>> {
  const user = await requireUser();

  await requireDocumentCapability(user.id, id, "manage");

  // Generate a new shareId when enabling, clear it when disabling. When
  // enabling, also derive a readable (decorative) slug from the document title
  // for the share URL; clear it when disabling.
  const shareId = isShared ? generateShareId() : null;

  let docTitle: string | null = null;
  if (isShared) {
    const doc = await prisma.document.findFirst({
      where: { id },
      select: { title: true },
    });
    if (doc) docTitle = doc.title;
  }

  const updated = await writeShareData(id, isShared, shareId, docTitle);

  revalidatePath(`/app/documents/${id}`);
  revalidatePath("/app");

  return actionOk(toShareSettings(updated));
}

/**
 * Rotates the share link: generates a brand-new `shareId` (and refreshes the
 * decorative slug) so the OLD link immediately stops resolving on every public
 * route (issue #101 AC #1). Sharing must already be enabled; the lifecycle
 * policy (expiry, embed/present flags) is preserved.
 *
 * Requires manage access (owner-level) via `requireDocumentCapability`.
 */
export async function regenerateShareLink(
  id: string,
): Promise<ActionResult<ShareSettings>> {
  const user = await requireUser();

  await requireDocumentCapability(user.id, id, "manage");

  const doc = await prisma.document.findFirst({
    where: { id },
    select: { title: true, isShared: true },
  });

  if (!doc || !doc.isShared) {
    return actionError("Enable sharing before regenerating the link.");
  }

  const shareId = generateShareId();
  const updated = await writeShareData(id, true, shareId, doc.title);

  revalidatePath(`/app/documents/${id}`);
  revalidatePath("/app");

  return actionOk(toShareSettings(updated));
}

/**
 * Updates the share-link lifecycle/access policy (issue #101 AC #2 & #3):
 * link expiry, and whether the embed and presentation modes are reachable for
 * the shared document. Each field is optional — omitted fields are left
 * unchanged; passing `expiresAt: null` clears the expiry.
 *
 * `expiresAt` is accepted as an ISO-8601 string (or `null`) and validated: it
 * must parse to a real date and may not be set absurdly far in the future.
 *
 * Requires manage access (owner-level) via `requireDocumentCapability`.
 */
export async function updateSharePolicy(
  id: string,
  policy: {
    expiresAt?: string | null;
    embedEnabled?: boolean;
    presentEnabled?: boolean;
  },
): Promise<ActionResult<ShareSettings>> {
  const user = await requireUser();

  await requireDocumentCapability(user.id, id, "manage");

  const data: {
    shareExpiresAt?: Date | null;
    shareEmbedEnabled?: boolean;
    sharePresentEnabled?: boolean;
  } = {};

  if ("expiresAt" in policy) {
    if (policy.expiresAt === null || policy.expiresAt === "") {
      data.shareExpiresAt = null;
    } else {
      const parsed = new Date(policy.expiresAt as string);
      if (Number.isNaN(parsed.getTime())) {
        return actionError("Invalid expiry date.");
      }
      if (parsed.getTime() - Date.now() > MAX_SHARE_EXPIRY_MS) {
        return actionError("Expiry date is too far in the future.");
      }
      data.shareExpiresAt = parsed;
    }
  }

  if (typeof policy.embedEnabled === "boolean") {
    data.shareEmbedEnabled = policy.embedEnabled;
  }
  if (typeof policy.presentEnabled === "boolean") {
    data.sharePresentEnabled = policy.presentEnabled;
  }

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
    },
  });

  revalidatePath(`/app/documents/${id}`);
  revalidatePath("/app");

  return actionOk(toShareSettings(updated));
}

/**
 * Generates a slug candidate from `title` by slugifying it and appending a
 * short random suffix (4 chars). The suffix makes same-titled concurrent
 * shares vanishingly unlikely to collide without sacrificing readability.
 * Returns `null` when the title has no usable slug characters and the suffix
 * alone would not form a meaningful slug.
 *
 * Note: uniqueness is enforced at write-time via P2002 retry in callers rather
 * than by the check-then-write pattern, which has an inherent race window.
 */
function generateSlugCandidate(title: string): string | null {
  const suffix = generateSlugSuffix();
  const candidate = buildSlugCandidate(title, suffix);
  return candidate || null;
}

const MAX_SLUG_WRITE_ATTEMPTS = 5;

/**
 * Writes share enable/disable data for a document, retrying on slug unique
 * constraint violations (Prisma P2002). Each retry generates a fresh random
 * slug candidate so the window for a second collision shrinks rapidly.
 *
 * When `isShared` is false the slug is cleared and no retry is needed.
 */
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
}> {
  if (!isShared) {
    // Disabling share: clear slug/shareId/expiry — no uniqueness concern.
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
      },
    });
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_SLUG_WRITE_ATTEMPTS; attempt++) {
    const slug = title ? generateSlugCandidate(title) : null;
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
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        // Slug collision (unique constraint): regenerate and retry.
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

/**
 * Returns `{ deckJson, revisionToken }` for a document so the slide editor can
 * seed itself from the freshest server state rather than the stale page-load
 * prop (issue #155). `deckJson` is `null` when no deck has been saved yet;
 * `revisionToken` is `null` for documents that have not yet received a token
 * (first save). Requires at least view access.
 */
export async function fetchDeckJson(
  id: string,
): Promise<{ deckJson: unknown; revisionToken: string | null }> {
  const user = await requireUser();
  await requireDocumentCapability(user.id, id, "view");

  const document = await prisma.document.findUniqueOrThrow({
    where: { id },
    select: { deckJson: true, deckRevisionToken: true },
  });

  const raw = document.deckJson;
  // Normalise: some DB providers serialise JSON columns as strings.
  const deckJson = typeof raw === "string" ? JSON.parse(raw) : raw;
  return { deckJson, revisionToken: document.deckRevisionToken };
}

/**
 * Persists an edited Deck for a document. Requires edit access (owner or
 * workspace editor), authorized via `requireDocumentCapability` so a viewer or
 * unrelated user is rejected with a clear error (issue #89).
 *
 * Delegates persistence orchestration to {@link persistDeck} in the persistence
 * service (#474).
 *
 * @param clientToken - The revision token last received from `fetchDeckJson` or
 *   a prior successful save. When supplied the write uses an atomic CAS.
 */
export async function saveDeckJson(
  id: string,
  deckJson: unknown,
  clientToken?: string | null,
): Promise<SaveDeckResult> {
  const user = await requireUser();
  await requireDocumentCapability(user.id, id, "edit");

  const result = await persistDeck(id, deckJson, clientToken);

  if (result.ok === true) {
    revalidatePath(`/app/documents/${id}`);
  }
  return result;
}

/**
 * Applies a list of {@link DeckPatch} records to the stored deck, guarded by
 * the optimistic revision token. Delegates to {@link patchDeck} in the
 * persistence service (#474).
 */
export async function saveDeckPatch(
  id: string,
  patches: DeckPatch[],
  clientToken: string | null | undefined,
): Promise<SaveDeckPatchResult> {
  const user = await requireUser();
  await requireDocumentCapability(user.id, id, "edit");

  const result = await patchDeck(id, patches, clientToken);

  if (result.ok === true) {
    revalidatePath(`/app/documents/${id}`);
  }
  return result;
}

/**
 * Lists a document's version-history snapshots, newest first. Requires view
 * access (owner, workspace member, or otherwise permitted), authorized via
 * `requireDocumentCapability` so an unrelated user is rejected (issue #158).
 */
export async function listDocumentVersions(
  documentId: string,
): Promise<DocumentVersionSummary[]> {
  const user = await requireUser();
  await requireDocumentCapability(user.id, documentId, "view");

  const versions = await prisma.documentVersion.findMany({
    where: { documentId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      createdAt: true,
      label: true,
      deckJson: true,
      createdBy: { select: { name: true, email: true } },
    },
  });

  return versions.map((version) => ({
    id: version.id,
    createdAt: version.createdAt.toISOString(),
    label: version.label,
    authorName: version.createdBy
      ? (version.createdBy.name ?? version.createdBy.email ?? null)
      : null,
    hasDeck: version.deckJson != null,
  }));
}

/**
 * Restores a document to an earlier snapshot. Requires edit access.
 *
 * Delegates persistence orchestration (pre-restore checkpoint, atomic
 * contentJson+mirror write, deck sanitize+reconcile, cache revalidation) to
 * {@link restoreVersion} in the persistence service (#474).
 */
export async function restoreDocumentVersion(
  versionId: string,
): Promise<ActionResult<RestoredDocumentVersion>> {
  const user = await requireUser();

  const version = await prisma.documentVersion.findUnique({
    where: { id: versionId },
    select: { documentId: true },
  });
  if (!version) {
    return actionError("Version not found.");
  }

  const { documentId } = version;
  await requireDocumentCapability(user.id, documentId, "edit");

  try {
    const restored = await restoreVersion(documentId, versionId, user.id);
    revalidatePath(`/app/documents/${documentId}`);
    revalidatePath("/app");
    return actionOk(restored);
  } catch (err) {
    logError(
      "document.restore",
      err instanceof Error ? err : new Error(String(err)),
      { documentId, versionId },
    );
    return actionError("Failed to restore document version.");
  }
}
