/**
 * GET /api/account/export — "Download my data" (#162, #484).
 *
 * Returns a JSON snapshot of the authenticated user's account, documents,
 * workspaces, memberships, comments, tags, brands, assets, and subscription
 * as a downloadable attachment. Every read is scoped to the session `user.id`
 * (never a client-supplied id), so a caller can only ever export their own
 * data. The shaping is delegated to the pure `buildAccountExport` helper.
 *
 * See `src/lib/account/export.ts` for the full compliance boundary.
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

    // Fetch all data scoped to the authenticated user in parallel.
    const [
      documents,
      workspacesOwned,
      workspaceMemberships,
      comments,
      tags,
      brands,
      assets,
      subscription,
    ] = await Promise.all([
      // Owned, non-deleted documents with visuals and versions.
      prisma.document.findMany({
        where: { ownerId: sessionUser.id, deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          title: true,
          content: true,
          contentJson: true,
          deckJson: true,
          workspaceId: true,
          isShared: true,
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
          versions: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              label: true,
              createdAt: true,
            },
          },
        },
      }),
      // Workspaces owned by the user.
      prisma.workspace.findMany({
        where: { ownerId: sessionUser.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, createdAt: true, updatedAt: true },
      }),
      // Workspace memberships where the user is a non-owner member.
      prisma.workspaceMember.findMany({
        where: { userId: sessionUser.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, workspaceId: true, role: true, createdAt: true },
      }),
      // Comments authored by the user.
      prisma.comment.findMany({
        where: { authorId: sessionUser.id },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          documentId: true,
          body: true,
          resolved: true,
          parentId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      // Tags owned by the user.
      prisma.tag.findMany({
        where: { ownerId: sessionUser.id },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      // Brands owned by the user.
      prisma.brand.findMany({
        where: { ownerId: sessionUser.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, createdAt: true, updatedAt: true },
      }),
      // Assets owned through the user's documents or workspaces (metadata only — not raw bytes).
      prisma.asset.findMany({
        where: {
          OR: [
            { document: { ownerId: sessionUser.id } },
            { workspace: { ownerId: sessionUser.id } },
          ],
          deletedAt: null,
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          mimeType: true,
          byteSize: true,
          checksum: true,
          createdAt: true,
        },
      }),
      // Active subscription (null if none).
      prisma.subscription.findUnique({
        where: { userId: sessionUser.id },
        select: {
          id: true,
          plan: true,
          status: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const payload = buildAccountExport({
      user,
      documents,
      workspacesOwned,
      workspaceMemberships,
      comments,
      tags,
      brands,
      assets,
      subscription: subscription ?? null,
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
