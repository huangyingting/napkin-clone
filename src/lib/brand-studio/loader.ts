import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { resolveUserEntitlements } from "@/lib/billing/entitlement-facade";
import {
  BRAND_SELECT,
  serializeBrands,
  type BrandRow,
} from "@/lib/brand/serialize";
import { prisma } from "@/lib/prisma";

import {
  buildBrandStudioViewModel,
  type BrandStudioViewModel,
} from "./view-model";

const brandStudioSelect = BRAND_SELECT satisfies Prisma.BrandSelect;

export async function loadBrandStudioViewModel(
  userId: string,
): Promise<BrandStudioViewModel> {
  const [entitlements, rows] = await Promise.all([
    resolveUserEntitlements(userId),
    prisma.brand.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: "asc" },
      select: brandStudioSelect,
    }),
  ]);

  return buildBrandStudioViewModel({
    brands: await serializeBrands(rows as BrandRow[]),
    canUseBrandStyles: entitlements.can("brandStyles"),
    canUploadFont: entitlements.can("fontUpload"),
  });
}
