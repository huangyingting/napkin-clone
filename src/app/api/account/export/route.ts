/**
 * GET /api/account/export — "Download my data" (#162, #484).
 *
 * Returns a JSON snapshot of the authenticated user's account, documents,
 * workspaces, memberships, comments, tags, brands, assets, and subscription
 * as a downloadable attachment. Every read is scoped to the session `user.id`
 * (never a client-supplied id), so a caller can only ever export their own
 * data. The Prisma read graph lives in a server-only loader; the final shaping
 * remains delegated to the pure `buildAccountExport` helper.
 *
 * See `src/lib/account/export.ts` for the full compliance boundary.
 */

import { NextResponse } from "next/server";

import { unauthorized } from "@/lib/api/errors";
import { loadAccountExport } from "@/lib/account/export-loader";
import { logError } from "@/lib/log";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return unauthorized();
  }

  try {
    const payload = await loadAccountExport(sessionUser.id);
    if (!payload) {
      return unauthorized();
    }

    const filename = `textiq-data-export-${new Date().toISOString().slice(0, 10)}.json`;
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logError("account-export", error);
    return NextResponse.json(
      { error: "Could not export your data. Please try again." },
      { status: 500 },
    );
  }
}
