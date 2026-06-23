/**
 * POST /api/collab/flush — internal best-effort recovery snapshot endpoint (#497).
 *
 * The collaboration server (`scripts/collab-core.mjs`) cannot import the
 * TypeScript Prisma stack, so when a dirty room is evicted it POSTs the room's
 * Yjs update (base64) here via `scripts/collab-flush.mjs`. This route persists
 * that update as a **best-effort recovery snapshot** on the `Document` so edits
 * that never reached the canonical `contentJson` autosave are not silently lost.
 *
 * IMPORTANT: this is NOT the source of truth. `Document.contentJson` remains
 * canonical (written by the editor's client autosave). The snapshot is a
 * recovery aid only — it is deliberately NOT converted to `contentJson` here
 * (server-side Yjs→Lexical conversion is a separate, risky concern and a
 * non-goal). Nothing reads the snapshot on the normal load path.
 *
 * Auth: an internal shared secret header (`x-collab-internal-secret`), compared
 * in constant time. When `COLLAB_INTERNAL_SECRET` is unset the endpoint is
 * disabled (503) so it can never be hit unauthenticated in a misconfigured
 * deploy. A missing/invalid secret is rejected 401.
 *
 * Responses:
 *   - 503 — feature disabled (no server secret configured).
 *   - 401 — missing/invalid internal secret.
 *   - 400 — malformed body (missing documentId/room or invalid base64 update).
 *   - 404 — the document does not exist (the route never creates rows).
 *   - 200 — `{ ok: true }` snapshot persisted.
 */

import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { logError, logInfo } from "@/lib/log";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const LOG_SCOPE = "api.collab.flush";
const SECRET_HEADER = "x-collab-internal-secret";

/** Constant-time string comparison that never throws on length mismatch. */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

/** Returns true when `value` is a non-empty, decodable base64 string. */
function isValidBase64(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
  const buf = Buffer.from(value, "base64");
  // Re-encoding must round-trip; a non-empty input that decodes to 0 bytes is
  // not a valid Yjs update.
  return buf.length > 0 && buf.toString("base64") === value;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const expectedSecret = process.env.COLLAB_INTERNAL_SECRET?.trim();
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "Collaboration flush is disabled." },
      { status: 503 },
    );
  }

  const provided = request.headers.get(SECRET_HEADER);
  if (!provided || !secretsMatch(provided, expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const payload = body as {
    documentId?: unknown;
    room?: unknown;
    update?: unknown;
  };
  const documentId =
    typeof payload.documentId === "string" && payload.documentId.trim()
      ? payload.documentId.trim()
      : typeof payload.room === "string" && payload.room.trim()
        ? payload.room.trim()
        : null;

  if (!documentId) {
    return NextResponse.json({ error: "Missing documentId." }, { status: 400 });
  }

  if (!isValidBase64(payload.update)) {
    return NextResponse.json(
      { error: "Missing or invalid update." },
      { status: 400 },
    );
  }

  // Never create rows — only snapshot onto an existing document.
  const existing = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true },
  });

  if (!existing) {
    logInfo(LOG_SCOPE, "flush rejected: document not found", { documentId });
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    await prisma.document.update({
      where: { id: documentId },
      data: {
        collabRecoverySnapshot: payload.update,
        collabRecoverySavedAt: new Date(),
      },
    });
  } catch (error) {
    logError(LOG_SCOPE, error, { documentId });
    return NextResponse.json(
      { error: "Failed to persist snapshot." },
      { status: 500 },
    );
  }

  logInfo(LOG_SCOPE, "recovery snapshot persisted", {
    documentId,
    bytes: Buffer.from(payload.update, "base64").length,
  });

  return NextResponse.json({ ok: true });
}
