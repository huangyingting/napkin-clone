/**
 * GET /api/collab/authorize — authorize a collaboration WebSocket room join.
 *
 * The collaboration socket lives on the Node HTTP server (`server.mjs` /
 * `scripts/collab-core.mjs`), which cannot import the TypeScript Auth.js / Prisma
 * stack directly. Instead the upgrade handler forwards the original request
 * cookies to this route, which authenticates the session and authorizes access
 * to the document (room) using the same role-aware permission helper every other
 * mutation uses (issue #88). This keeps all auth/authorization logic in one
 * place rather than duplicating it in the `.mjs` server.
 *
 * Responses:
 *   - 401 — no valid session (unauthenticated).
 *   - 403 — authenticated but no view access to the document (unrelated user),
 *     or the document does not exist / was deleted (never leaks existence).
 *   - 200 — `{ ok, role, readOnly }`; `readOnly` is true for viewers, who may
 *     observe live changes but whose document mutations are dropped server-side.
 */

import { NextResponse } from "next/server";

import { getDocumentCapabilities } from "@/lib/auth/document-permissions";
import { decideRoomAccess } from "@/lib/collab/room-access";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const room = new URL(request.url).searchParams.get("room")?.trim();
  if (!room) {
    return NextResponse.json({ error: "Missing room." }, { status: 403 });
  }

  const capabilities = await getDocumentCapabilities(user.id, room);
  const decision = decideRoomAccess(capabilities);

  if (!decision.ok) {
    return NextResponse.json(
      { error: "Forbidden." },
      { status: decision.status },
    );
  }

  return NextResponse.json({
    ok: true,
    role: decision.role,
    readOnly: decision.readOnly,
  });
}
