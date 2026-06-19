/**
 * GET /api/brand — list the current user's saved brand styles.
 *
 * Used by the visual context popover to fetch brands without a full page
 * reload. Returns `{ brands: BrandStyle[] }`.
 */

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import type { BrandStyle } from "@/lib/brand/schema";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const rows = await prisma.brand.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      ownerId: true,
      palette: true,
      background: true,
      nodeFill: true,
      nodeStroke: true,
      nodeText: true,
      edgeColor: true,
      fontFamily: true,
      logoUrl: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const brands: BrandStyle[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    ownerId: row.ownerId,
    palette: Array.isArray(row.palette) ? (row.palette as string[]) : null,
    background: row.background,
    nodeFill: row.nodeFill,
    nodeStroke: row.nodeStroke,
    nodeText: row.nodeText,
    edgeColor: row.edgeColor,
    fontFamily: row.fontFamily,
    logoUrl: row.logoUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));

  return NextResponse.json({ brands });
}
