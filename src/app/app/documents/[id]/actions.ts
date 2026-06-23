"use server";

import { customAlphabet } from "nanoid";
import { revalidatePath } from "next/cache";

import { Prisma } from "@/generated/prisma/client";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { requireDocumentCapability } from "@/lib/auth/document-permissions";
import { collectVisualNodes } from "@/lib/lexical/visual-nodes";
import { lexicalStateToPlainText } from "@/lib/lexical/plain-text";
import {
  MAX_DOCUMENT_VERSIONS,
  SNAPSHOT_MIN_INTERVAL_MS,
  shouldSnapshot,
  staleVersionIds,
} from "@/lib/document-versions";
import { prisma } from "@/lib/prisma";
import { app as appEnv } from "@/lib/env";
import { requireUser } from "@/lib/session";
import { buildShareSegment, buildSlugCandidate } from "@/lib/slug";
import { safeParseDeck } from "@/lib/presentation/deck-schema";
import { normalizeDeckRaw } from "@/lib/presentation/fresh-deck";
import { stripOrphanedVisuals } from "@/lib/presentation/strip-orphans";
import { MAX_DECK_JSON_BYTES } from "@/lib/presentation/deck-limits";
import {
  generateRevisionToken,
  isRevisionConflict,
} from "@/lib/presentation/deck-revision-token";
import { VISUAL_KIND_TO_PRISMA, safeParseVisual } from "@/lib/visual/schema";
import {
  diffVisualMirror,
  type LiveVisualNode,
} from "@/lib/visual/mirror-diff";

// URL-safe share ID generator (no ambiguous chars: 0/O, 1/l/I)
const generateShareId = customAlphabet(
  "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ",
  12,
);

// Short random suffix appended to slug candidates to make same-title
// collisions vanishingly unlikely (4 lowercase alphanumeric chars).
const generateSlugSuffix = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 4);

const MAX_CONTENT_LENGTH = 100_000;
const MAX_LEXICAL_STATE_LENGTH = 2_000_000;
const MAX_ANCHOR_BLOCK_ID_LENGTH = 200;

// How many historical snapshots to retain per visual. Older ones are pruned in
// the same save so the history table can't grow without bound.
const MAX_VISUAL_REVISIONS = 10;

function stableJsonString(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJsonString).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJsonString(record[key])}`)
    .join(",")}}`;
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return stableJsonString(a) === stableJsonString(b);
}

/**
 * Records a snapshot of a visual's current persisted state into the
 * `VisualRevision` history, then prunes that visual's history to the most recent
 * `MAX_VISUAL_REVISIONS` entries. Called with the *previous* row before it is
 * overwritten, so each edit/regeneration is restorable (US-016).
 */
async function snapshotVisualRevision(
  tx: Prisma.TransactionClient,
  previous: {
    id: string;
    data: Prisma.JsonValue;
    type: string;
    title: string | null;
  },
): Promise<void> {
  await tx.visualRevision.create({
    data: {
      visualId: previous.id,
      data: previous.data as unknown as Prisma.InputJsonValue,
      type: previous.type,
      title: previous.title,
    },
  });

  // Keep only the newest snapshots; delete anything beyond the retention limit.
  const stale = await tx.visualRevision.findMany({
    where: { visualId: previous.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: MAX_VISUAL_REVISIONS,
    select: { id: true },
  });

  if (stale.length > 0) {
    await tx.visualRevision.deleteMany({
      where: { id: { in: stale.map((revision) => revision.id) } },
    });
  }
}

/**
 * Records a point-in-time snapshot of a document's current persisted editable
 * state into `DocumentVersion`, then prunes that document's history to the most
 * recent {@link MAX_DOCUMENT_VERSIONS} entries (issue #158).
 *
 * Snapshots are throttled by {@link shouldSnapshot}: a new version is only
 * created when the document's most recent snapshot is older than
 * {@link SNAPSHOT_MIN_INTERVAL_MS}, unless `force` is set for a meaningful event
 * (e.g. a pre-restore checkpoint) that must always be captured. Callers invoke
 * this only after passing the edit-permission check, so authorization is
 * inherited from the save path. Failures are intentionally swallowed: a missed
 * snapshot must never break the user's save.
 */
async function snapshotDocumentVersion(
  documentId: string,
  options: {
    userId?: string | null;
    force?: boolean;
    label?: string | null;
  } = {},
): Promise<void> {
  try {
    const now = new Date();

    const last = await prisma.documentVersion.findFirst({
      where: { documentId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, contentJson: true, deckJson: true },
    });

    if (
      !shouldSnapshot(
        last?.createdAt ?? null,
        now,
        SNAPSHOT_MIN_INTERVAL_MS,
        options.force ?? false,
      )
    ) {
      return;
    }

    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { contentJson: true, deckJson: true },
    });
    if (!doc || doc.contentJson == null) {
      return;
    }

    if (
      !(options.force ?? false) &&
      last &&
      jsonEqual(doc.contentJson, last.contentJson) &&
      jsonEqual(doc.deckJson, last.deckJson)
    ) {
      return;
    }

    await prisma.documentVersion.create({
      data: {
        documentId,
        contentJson: (doc.contentJson ??
          Prisma.JsonNull) as Prisma.InputJsonValue,
        deckJson:
          doc.deckJson == null
            ? Prisma.DbNull
            : (doc.deckJson as Prisma.InputJsonValue),
        label: options.label ?? null,
        createdById: options.userId ?? null,
      },
    });

    // Prune anything beyond the retention window so history can't grow unbounded.
    const existing = await prisma.documentVersion.findMany({
      where: { documentId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    const stale = staleVersionIds(
      existing.map((version) => version.id),
      MAX_DOCUMENT_VERSIONS,
    );
    if (stale.length > 0) {
      await prisma.documentVersion.deleteMany({
        where: { id: { in: stale } },
      });
    }
  } catch {
    // A failed snapshot should never surface to the caller's save.
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

  // Track every anchor present in the editor — including nodes whose payload
  // fails validation, so an unparseable card keeps its row alive (it just isn't
  // re-persisted) rather than being pruned (US-013).
  const liveAnchors = new Set<string>();
  const liveNodes: Array<LiveVisualNode<Prisma.InputJsonValue>> = [];

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
    liveNodes.push({
      anchorBlockId: anchor,
      orderIndex: index,
      type: VISUAL_KIND_TO_PRISMA[visual.type],
      title: visual.title ?? null,
      data: visual as unknown as Prisma.InputJsonValue,
      // Compare against the row's normalized payload so key-order differences
      // don't count as a change.
      dataKey: JSON.stringify(visual),
    });
  }

  // One batched read replaces the previous per-node findFirst (N+1). The diff,
  // upserts, and prune all run inside a single transaction so two concurrent
  // saves can't both miss-and-create — and the unique (documentId, anchorBlockId)
  // constraint is the hard guarantee against duplicates.
  await prisma.$transaction(async (tx) => {
    const existingRows = await tx.visual.findMany({
      where: { documentId },
      select: {
        id: true,
        anchorBlockId: true,
        orderIndex: true,
        data: true,
        type: true,
        title: true,
        createdAt: true,
      },
    });

    const existingById = new Map(existingRows.map((row) => [row.id, row]));

    const { toCreate, toUpdate, toDelete } =
      diffVisualMirror<Prisma.InputJsonValue>({
        existingRows: existingRows.map((row) => {
          const parsed = safeParseVisual(row.data);
          return {
            id: row.id,
            anchorBlockId: row.anchorBlockId,
            orderIndex: row.orderIndex,
            dataKey: parsed.success ? JSON.stringify(parsed.data) : null,
            createdAt: row.createdAt.getTime(),
          };
        }),
        liveNodes,
        liveAnchors,
      });

    // Upsert on the unique key so a row created by a racing transaction is
    // updated in place instead of triggering a duplicate insert.
    for (const create of toCreate) {
      await tx.visual.upsert({
        where: {
          documentId_anchorBlockId: {
            documentId,
            anchorBlockId: create.anchorBlockId,
          },
        },
        create: {
          documentId,
          anchorBlockId: create.anchorBlockId,
          orderIndex: create.orderIndex,
          type: create.type,
          title: create.title,
          data: create.data,
        },
        update: {
          orderIndex: create.orderIndex,
          type: create.type,
          title: create.title,
          data: create.data,
        },
      });
    }

    for (const update of toUpdate) {
      if (update.payloadChanged) {
        const previous = existingById.get(update.id);
        if (previous) {
          await snapshotVisualRevision(tx, previous);
        }
        await tx.visual.update({
          where: { id: update.id },
          data: {
            type: update.type,
            title: update.title,
            data: update.data,
            orderIndex: update.orderIndex,
          },
        });
      } else {
        await tx.visual.update({
          where: { id: update.id },
          data: { orderIndex: update.orderIndex },
        });
      }
    }

    if (toDelete.length > 0) {
      await tx.visual.deleteMany({ where: { id: { in: toDelete } } });
    }
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
): Promise<ActionResult> {
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

  await requireDocumentCapability(user.id, id, "edit");

  const content = lexicalStateToPlainText(parsed).slice(0, MAX_CONTENT_LENGTH);

  // Snapshot the state that is about to be overwritten. Capturing after the
  // write would make history restore the current save, which feels broken.
  await snapshotDocumentVersion(id, { userId: user.id });

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
  return actionOk();
}

// Furthest-out expiry a caller may set, guarding against absurd dates.
const MAX_SHARE_EXPIRY_MS = 5 * 365 * 24 * 60 * 60 * 1000; // ~5 years

/**
 * The full share-link state returned to the client by the sharing actions.
 * Carries the lifecycle/access policy (issue #101) alongside the link itself so
 * the share UI can render and mutate every control from a single payload.
 */
export type ShareSettings = {
  isShared: boolean;
  shareId: string | null;
  slug: string | null;
  shareUrl: string | null;
  /** ISO-8601 expiry, or `null` when the link never expires. */
  expiresAt: string | null;
  embedEnabled: boolean;
  presentEnabled: boolean;
};

/** Builds the canonical public share URL (or `null` when not shared). */
function buildShareUrl(slug: string | null, shareId: string | null): string {
  const base = appEnv.url();
  return `${base}/share/${buildShareSegment(slug, shareId ?? "")}`;
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
  const shared = row.isShared && row.shareId !== null;
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
 * Discriminated result for {@link saveDeckJson}. Distinct from {@link ActionResult}
 * so callers can pattern-match on the three outcomes without ambiguity.
 * - `ok: true`        — write accepted; `revisionToken` is the new token the
 *                       client should store for the next save.
 * - `ok: "conflict"`  — optimistic-lock mismatch; another session saved first.
 *                       `serverRevisionToken` is the current server token.
 * - `ok: false`       — validation or server error (uses existing ActionResult path).
 */
export type SaveDeckResult =
  | { ok: true; revisionToken: string }
  | { ok: "conflict"; serverRevisionToken: string | null }
  | { ok: false; error: string };

/**
 * Persists an edited Deck for a document. Requires edit access (owner or
 * workspace editor), authorized via `requireDocumentCapability` so a viewer or
 * unrelated user is rejected with a clear error (issue #89). The deck JSON is
 * validated with `safeParseDeck` before storing, and rejected when it exceeds a
 * sane serialized size. Stored in `Document.deckJson`, separate from the
 * Lexical `contentJson` so deck edits never touch collaborative editing state.
 *
 * @param clientToken - The revision token last received from `fetchDeckJson` or
 *   a prior successful save. When supplied, the save is rejected with
 *   `{ ok: "conflict" }` if another session advanced the token since the client
 *   last fetched, preventing silent lost-update overwrites. Pass `null` or omit
 *   for legacy/initial saves (token check is skipped).
 * @returns `SaveDeckResult`:
 *   - `{ ok: true, revisionToken }` — write accepted; store `revisionToken` for
 *     the next save.
 *   - `{ ok: "conflict", serverRevisionToken }` — optimistic-lock mismatch;
 *     another session saved first.
 *   - `{ ok: false, error }` — validation or server error.
 */
export async function saveDeckJson(
  id: string,
  deckJson: unknown,
  clientToken?: string | null,
): Promise<SaveDeckResult> {
  const user = await requireUser();

  const result = safeParseDeck(deckJson);
  if (!result.success) {
    return { ok: false, error: `Invalid deck: ${result.error}` };
  }

  // Serialize and check size
  const serialized = JSON.stringify(result.data);
  if (serialized.length > MAX_DECK_JSON_BYTES) {
    return { ok: false, error: "Deck is too large to save." };
  }

  await requireDocumentCapability(user.id, id, "edit");

  // Read current token before writing so isRevisionConflict can decide whether
  // this save should proceed.
  const current = await prisma.document.findUnique({
    where: { id },
    select: { deckRevisionToken: true },
  });
  if (!current) {
    return { ok: false, error: "Document not found." };
  }

  if (isRevisionConflict(clientToken, current.deckRevisionToken)) {
    return {
      ok: "conflict",
      serverRevisionToken: current.deckRevisionToken,
    };
  }

  const newToken = generateRevisionToken();
  const { count } = await prisma.document.updateMany({
    where: { id },
    data: {
      deckJson: result.data as unknown as Prisma.InputJsonValue,
      deckRevisionToken: newToken,
    },
  });
  if (count === 0) {
    return { ok: false, error: "Document not found." };
  }

  // Snapshot only after a confirmed write so conflicted saves never create
  // version-history entries.
  await snapshotDocumentVersion(id, { userId: user.id });

  revalidatePath(`/app/documents/${id}`);
  return { ok: true, revisionToken: newToken };
}

/** A version-history entry surfaced to the editor's Version History panel. */
export type DocumentVersionSummary = {
  id: string;
  createdAt: string;
  label: string | null;
  /** Display name of the user who triggered the snapshot, when known. */
  authorName: string | null;
  /** Whether this snapshot carries a presentation deck alongside the document. */
  hasDeck: boolean;
};

export type RestoredDocumentVersion = {
  documentId: string;
  contentJson: unknown;
};

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
 * Sanitizes a restored snapshot's `deckJson` against its restored content,
 * returning a Prisma-writable value. Orphaned visual references (ids the
 * restored content no longer provides) are stripped so a restore can never
 * re-introduce silently blank slides. Returns `Prisma.DbNull` when there is no
 * deck, and falls back to the raw value when it cannot be parsed/normalized.
 */
function sanitizeRestoredDeck(
  rawDeckJson: Prisma.JsonValue | null,
  restoredContent: unknown,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (rawDeckJson == null) {
    return Prisma.DbNull;
  }

  const parsed = safeParseDeck(normalizeDeckRaw(rawDeckJson));
  if (!parsed.success) {
    return rawDeckJson as Prisma.InputJsonValue;
  }

  const knownVisualIds = new Set(
    collectVisualNodes(restoredContent).map((node) => node.visualId),
  );
  const sanitized = stripOrphanedVisuals(parsed.data, knownVisualIds);
  return sanitized as unknown as Prisma.InputJsonValue;
}

/**
 * Restores a document to an earlier snapshot, writing that version's
 * `contentJson`/`deckJson` (and derived plain-text `content`) back as the
 * current document state. Requires edit access (issue #158).
 *
 * Before overwriting, a forced snapshot of the *pre-restore* state is captured
 * (labelled so it's recognizable in the history), so a restore is itself
 * reversible. The mirrored Visual rows are rebuilt from the restored content so
 * share/embed and dashboard thumbnails stay consistent.
 */
export async function restoreDocumentVersion(
  versionId: string,
): Promise<ActionResult<RestoredDocumentVersion>> {
  const user = await requireUser();

  const version = await prisma.documentVersion.findUnique({
    where: { id: versionId },
    select: {
      documentId: true,
      contentJson: true,
      deckJson: true,
      createdAt: true,
    },
  });
  if (!version) {
    return actionError("Version not found.");
  }

  const { documentId } = version;
  await requireDocumentCapability(user.id, documentId, "edit");

  // Checkpoint the current state first so the restore can itself be undone.
  await snapshotDocumentVersion(documentId, {
    userId: user.id,
    force: true,
    label: "Before restore",
  });

  const restoredContent = version.contentJson;
  const content = lexicalStateToPlainText(restoredContent).slice(
    0,
    MAX_CONTENT_LENGTH,
  );

  // Sanitize the restored deck against the restored content: a snapshot can
  // pair a deck with content whose visuals have since changed, which would
  // re-introduce orphaned visual references (silent blank slides). Strip any
  // visualId the restored content no longer provides before persisting.
  const restoredDeck = sanitizeRestoredDeck(version.deckJson, restoredContent);

  await prisma.document.updateMany({
    where: { id: documentId },
    data: {
      contentJson: restoredContent as Prisma.InputJsonValue,
      content,
      deckJson: restoredDeck,
    },
  });

  // Rebuild mirrored Visual rows from the restored content so embeds/thumbnails
  // reflect the restored version (mirrors the saveDocumentLexical save path).
  await mirrorVisualNodes(documentId, restoredContent);

  revalidatePath(`/app/documents/${documentId}`);
  revalidatePath("/app");
  return actionOk({ documentId, contentJson: restoredContent });
}
