/**
 * GET /api/account/export — "Download my data" (#162).
 *
 * Returns a JSON snapshot of the authenticated user's account profile and all of
 * their documents (with each document's visuals) as a downloadable attachment.
 * Every read is scoped to the session `user.id` (never a client-supplied id), so
 * a caller can only ever export their own data. The shaping is delegated to the
 * pure `buildAccountExport` helper.
 */

import { NextResponse } from "next/server";

import { buildAccountExport } from "@/lib/account/export";
import { logError } from "@/lib/log";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        emailVerified: true,
        plan: true,
        createdAt: true,
      },
    });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const documents = await prisma.document.findMany({
      where: { ownerId: sessionUser.id, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        content: true,
        contentJson: true,
        deckJson: true,
        createdAt: true,
        updatedAt: true,
        visuals: {
          orderBy: { orderIndex: "asc" },
          select: {
            id: true,
            type: true,
            title: true,
            anchorBlockId: true,
            orderIndex: true,
            data: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    const payload = buildAccountExport({
      user,
      documents,
      now: new Date(),
    });

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
