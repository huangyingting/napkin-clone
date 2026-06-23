/**
 * GET /api/brand — list the current user's saved brand styles.
 *
 * Used by the visual context popover to fetch brands without a full page
 * reload. Returns `{ brands: BrandStyle[] }` with asset-backed logo/font URLs
 * resolved via the shared serializer (Epic #496).
 */

import { NextResponse } from "next/server";

import { unauthorized } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { BRAND_SELECT, serializeBrands } from "@/lib/brand/serialize";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return unauthorized();
  }

  const rows = await prisma.brand.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    select: BRAND_SELECT,
  });

  const brands = await serializeBrands(rows);
  return NextResponse.json({ brands });
}
