"use server";

import { customAlphabet } from "nanoid";
import { revalidatePath } from "next/cache";

import { Prisma } from "@/generated/prisma/client";
import { requireDocumentCapability } from "@/lib/auth/document-permissions";
import { collectVisualNodes } from "@/lib/lexical/visual-nodes";
import { lexicalStateToPlainText } from "@/lib/lexical/plain-text";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { buildShareSegment, slugify } from "@/lib/slug";
import { safeParseDeck } from "@/lib/presentation/deck-schema";
import { VISUAL_KIND_TO_PRISMA, safeParseVisual } from "@/lib/visual/schema";

// URL-safe share ID generator (no ambiguous chars: 0/O, 1/l/I)
const generateShareId = customAlphabet(
  "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ",
  12,
);

const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_LENGTH = 100_000;
const MAX_LEXICAL_STATE_LENGTH = 2_000_000;
const MAX_ANCHOR_BLOCK_ID_LENGTH = 200;
const MAX_DECK_JSON_LENGTH = 500_000;

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
 * Saves a document title. Requires edit access (owner or workspace editor),
 * authorized via `requireDocumentCapability` so a viewer or unrelated user is
 * rejected with a clear error (issue #89). The write uses `updateMany` keyed by
 * id so a concurrent change is a harmless no-op. Returns the normalized title so
 * the client can reflect any trimming/fallback. Empty titles fall back to
 * "Untitled".
 */
export async function saveDocumentTitle(
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

  // Revalidate both the dashboard list and this document's own route — without
  // the latter, reopening the same document serves a cached page that re-seeds
  // the stale title.
  revalidatePath("/app");
  revalidatePath(`/app/documents/${id}`);
  return { title };
}

/**
 * Mirrors every {@link VisualNode} in a serialized Lexical state to a `Visual`
 * database row so that share/embed pages, dashboard thumbnails, and version
 * history keep working — `contentJson` remains the editor's source of truth, and
 * these rows are a derived projection of it.
 *
 * Each node is keyed by its stable `visualId` (stored as the row's
 * `anchorBlockId`) and its document-order index is written to `orderIndex`. A
 * row is created when missing, and only updated when the validated payload (or
 * its order) actually changed — so a save that doesn't touch a visual records no
 * spurious `VisualRevision` snapshot. Invalid payloads are skipped (never
 * persisted). The document is assumed already access-scoped by the caller.
 */
async function mirrorVisualNodes(
  documentId: string,
  parsedState: unknown,
): Promise<void> {
  const nodes = collectVisualNodes(parsedState);

  // Track the anchors still present so orphaned rows (e.g. a VisualNode that was
  // removed from the editor, US-013) can be pruned after the upserts below.
  const liveAnchors = new Set<string>();

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];

    const anchor = normalizeAnchorBlockId(node.visualId);
    if (!anchor) {
      continue;
    }
    liveAnchors.add(anchor);

    // Re-validate so a tampered/garbled payload can never be persisted.
    const result = safeParseVisual(node.visual);
    if (!result.success) {
      continue;
    }
    const visual = result.data;
    const type = VISUAL_KIND_TO_PRISMA[visual.type];
    const title = visual.title ?? null;
    const data = visual as unknown as Prisma.InputJsonValue;

    const existing = await prisma.visual.findFirst({
      where: { documentId, anchorBlockId: anchor },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        data: true,
        type: true,
        title: true,
        orderIndex: true,
      },
    });

    if (!existing) {
      await prisma.visual.create({
        data: {
          documentId,
          anchorBlockId: anchor,
          orderIndex: index,
          type,
          title,
          data,
        },
      });
      continue;
    }

    // Only snapshot + rewrite the payload when it actually changed; compare via
    // the normalized (re-validated) form so key-order differences don't count.
    const previous = safeParseVisual(existing.data);
    const payloadChanged =
      !previous.success ||
      JSON.stringify(previous.data) !== JSON.stringify(visual);

    if (payloadChanged) {
      await snapshotVisualRevision(existing);
      await prisma.visual.update({
        where: { id: existing.id },
        data: { type, title, data, orderIndex: index },
      });
    } else if (existing.orderIndex !== index) {
      await prisma.visual.update({
        where: { id: existing.id },
        data: { orderIndex: index },
      });
    }
  }

  // Prune mirrored rows whose VisualNode no longer exists in the editor state
  // (US-013: removing a card deletes its mirrored Visual row). Only node-anchored
  // rows are pruned — the document-level visual (`anchorBlockId` null) is left
  // untouched, and `notIn` keeps any row whose anchor is still present.
  await prisma.visual.deleteMany({
    where: {
      documentId,
      anchorBlockId: { not: null, notIn: [...liveAnchors] },
    },
  });
}

/**
 * Saves the serialized Lexical editor state for a document.
 *
 * `stateJson` is the stringified `editorState.toJSON()` from the client. Edit
 * access (owner or workspace editor) is authorized via
 * `requireDocumentCapability` — a viewer or unrelated user is rejected with a
 * clear error (issue #89) — and the write uses `updateMany` keyed by id so a
 * concurrent change is a harmless no-op. The parsed state is stored in
 * `contentJson`, and a plain-text projection is written to `content` so AI block
 * text, search, and the read-only fallback keep working off the same source.
 *
 * Malformed JSON is rejected (the client always sends valid serialized state).
 */
export async function saveDocumentLexical(
  id: string,
  stateJson: string,
): Promise<void> {
  const user = await requireUser();

  if (stateJson.length > MAX_LEXICAL_STATE_LENGTH) {
    throw new Error("Document is too large to save.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stateJson);
  } catch {
    throw new Error("Invalid editor state.");
  }

  await requireDocumentCapability(user.id, id, "edit");

  const content = lexicalStateToPlainText(parsed).slice(0, MAX_CONTENT_LENGTH);

  await prisma.document.updateMany({
    where: { id },
    data: {
      contentJson: parsed as Prisma.InputJsonValue,
      content,
    },
  });

  // Mirror embedded visual blocks to Visual rows so share/embed, dashboard
  // thumbnails, and version history keep working off the editor's source of
  // truth (contentJson).
  await mirrorVisualNodes(id, parsed);

  revalidatePath("/app");
}

/**
 * Toggles sharing for a document owned by the current user.
 *
 * - When enabling sharing (isShared: true), generates a unique shareId.
 * - When disabling sharing (isShared: false), clears the shareId.
 * - Returns the current share state: { isShared, shareId?, shareUrl? }.
 *
 * Requires manage access (owner-level); a viewer, editor, or unrelated user is
 * rejected with a clear error via `requireDocumentCapability` (issue #89) so it
 * never modifies a document the user may not manage.
 */
export async function toggleDocumentSharing(
  id: string,
  isShared: boolean,
): Promise<{
  isShared: boolean;
  shareId: string | null;
  slug: string | null;
  shareUrl: string | null;
}> {
  const user = await requireUser();

  await requireDocumentCapability(user.id, id, "manage");

  // Generate a new shareId when enabling, clear it when disabling. When
  // enabling, also derive a readable (decorative) slug from the document title
  // for the share URL; clear it when disabling.
  const shareId = isShared ? generateShareId() : null;

  let slug: string | null = null;
  if (isShared) {
    const doc = await prisma.document.findFirst({
      where: { id },
      select: { title: true },
    });
    if (doc) {
      slug = await generateUniqueSlug(doc.title, id);
    }
  }

  await prisma.document.updateMany({
    where: { id },
    data: { isShared, shareId, slug },
  });

  // Build the public URL when shared; null otherwise. The slug is decorative;
  // the canonical shareId is always the part after the last hyphen.
  const shareUrl =
    isShared && shareId
      ? `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:4000"}/share/${buildShareSegment(slug, shareId)}`
      : null;

  revalidatePath(`/app/documents/${id}`);
  revalidatePath("/app");

  return { isShared, shareId, slug, shareUrl };
}

/**
 * Generates a slug from `title` that is unique across documents (the
 * `Document.slug` column is `@unique`). Tries the bare slugify result first,
 * then appends `-2`, `-3`, … until free. Excludes the current document so
 * re-sharing keeps a stable slug. Returns `null` when the title has no usable
 * slug characters.
 */
async function generateUniqueSlug(
  title: string,
  currentDocId: string,
): Promise<string | null> {
  const base = slugify(title);
  if (!base) {
    return null;
  }

  let candidate = base;
  for (let n = 2; n < 1000; n++) {
    const existing = await prisma.document.findFirst({
      where: { slug: candidate, NOT: { id: currentDocId } },
      select: { id: true },
    });
    if (!existing) {
      return candidate;
    }
    candidate = `${base}-${n}`;
  }
  // Extremely unlikely fallback: leave slug unset rather than loop forever.
  return null;
}

/**
 * Persists an edited Deck for a document. Requires edit access (owner or
 * workspace editor), authorized via `requireDocumentCapability` so a viewer or
 * unrelated user is rejected with a clear error (issue #89). The deck JSON is
 * validated with `safeParseDeck` before storing, and rejected when it exceeds a
 * sane serialized size. Stored in `Document.deckJson`, separate from the
 * Lexical `contentJson` so deck edits never touch collaborative editing state.
 */
export async function saveDeckJson(
  id: string,
  deckJson: unknown,
): Promise<void> {
  const user = await requireUser();

  const result = safeParseDeck(deckJson);
  if (!result.success) {
    throw new Error(`Invalid deck: ${result.error}`);
  }

  // Serialize and check size
  const serialized = JSON.stringify(result.data);
  if (serialized.length > MAX_DECK_JSON_LENGTH) {
    throw new Error("Deck is too large to save.");
  }

  await requireDocumentCapability(user.id, id, "edit");

  await prisma.document.updateMany({
    where: { id },
    data: { deckJson: result.data as unknown as Prisma.InputJsonValue },
  });

  revalidatePath(`/app/documents/${id}`);
}
