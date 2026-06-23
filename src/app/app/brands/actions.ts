"use server";

import { revalidatePath } from "next/cache";

import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { validateBrandInput, type BrandStyle } from "@/lib/brand/schema";
import {
  BRAND_SELECT,
  serializeBrands,
  type BrandRow,
} from "@/lib/brand/serialize";
import { reconcileBrandAssets } from "@/lib/brand/asset-orphan";
import {
  resolveBrandEntitlements,
  isCustomFontFamily,
  BRAND_STYLES_UPGRADE_MESSAGE,
  FONT_UPLOAD_UPGRADE_MESSAGE,
} from "@/lib/billing/brand-entitlements";

/** Serializes one brand row to a `BrandStyle`, resolving asset URLs. */
async function serializeOne(row: BrandRow): Promise<BrandStyle> {
  const [style] = await serializeBrands([row]);
  return style;
}

/**
 * Links the brand's logo/font assets to the brand (`Asset.brandId`) so the
 * orphan/cleanup pass treats them as live, then reconciles any assets that are
 * no longer referenced by the brand (e.g. a replaced logo) into orphans.
 */
async function linkBrandAssets(
  brandId: string,
  logoAssetId: string | null,
  fontAssetId: string | null,
): Promise<void> {
  const referenced = [logoAssetId, fontAssetId].filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  if (referenced.length > 0) {
    await prisma.asset.updateMany({
      where: { id: { in: referenced }, deletedAt: null },
      data: { brandId },
    });
  }
  await reconcileBrandAssets(brandId, prisma, new Date());
}

/** Lists all brands owned by the current user. */
export async function listBrands(): Promise<BrandStyle[]> {
  const user = await requireUser();
  const rows = await prisma.brand.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    select: BRAND_SELECT,
  });
  return serializeBrands(rows);
}

/** Creates a new brand for the current user. Returns the created brand. */
export async function createBrand(
  raw: unknown,
): Promise<ActionResult<BrandStyle>> {
  const user = await requireUser();
  const entitlements = await resolveBrandEntitlements(user.id);
  if (!entitlements.canBrand) {
    return actionError(BRAND_STYLES_UPGRADE_MESSAGE);
  }
  const validation = validateBrandInput(raw);
  if (!validation.ok) {
    return actionError(validation.error);
  }
  const { data } = validation;

  if (isCustomFontFamily(data.fontFamily) && !entitlements.canFontUpload) {
    return actionError(FONT_UPLOAD_UPGRADE_MESSAGE);
  }

  const row = await prisma.brand.create({
    data: {
      name: data.name,
      ownerId: user.id,
      palette: data.palette ?? undefined,
      background: data.background ?? undefined,
      nodeFill: data.nodeFill ?? undefined,
      nodeStroke: data.nodeStroke ?? undefined,
      nodeText: data.nodeText ?? undefined,
      edgeColor: data.edgeColor ?? undefined,
      fontFamily: data.fontFamily ?? undefined,
      logoAssetId: data.logoAssetId ?? undefined,
      fontAssetId: data.fontAssetId ?? undefined,
    },
    select: BRAND_SELECT,
  });

  await linkBrandAssets(
    row.id,
    data.logoAssetId ?? null,
    data.fontAssetId ?? null,
  );

  revalidatePath("/app/brands");
  return actionOk(await serializeOne(row));
}

/** Updates a brand owned by the current user. */
export async function updateBrand(
  id: string,
  raw: unknown,
): Promise<ActionResult<BrandStyle>> {
  const user = await requireUser();
  const entitlements = await resolveBrandEntitlements(user.id);
  if (!entitlements.canBrand) {
    return actionError(BRAND_STYLES_UPGRADE_MESSAGE);
  }

  const existing = await prisma.brand.findUnique({
    where: { id },
    select: { ownerId: true },
  });
  if (!existing) return actionError("Brand not found.");
  if (existing.ownerId !== user.id) return actionError("Not authorized.");

  const validation = validateBrandInput(raw);
  if (!validation.ok) return actionError(validation.error);
  const { data } = validation;

  if (isCustomFontFamily(data.fontFamily) && !entitlements.canFontUpload) {
    return actionError(FONT_UPLOAD_UPGRADE_MESSAGE);
  }

  const row = await prisma.brand.update({
    where: { id },
    data: {
      name: data.name,
      palette: data.palette ?? undefined,
      background: data.background,
      nodeFill: data.nodeFill,
      nodeStroke: data.nodeStroke,
      nodeText: data.nodeText,
      edgeColor: data.edgeColor,
      fontFamily: data.fontFamily,
      logoAssetId: data.logoAssetId ?? null,
      fontAssetId: data.fontAssetId ?? null,
    },
    select: BRAND_SELECT,
  });

  await linkBrandAssets(
    row.id,
    data.logoAssetId ?? null,
    data.fontAssetId ?? null,
  );

  revalidatePath("/app/brands");
  return actionOk(await serializeOne(row));
}

/** Deletes a brand owned by the current user. */
export async function deleteBrand(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const entitlements = await resolveBrandEntitlements(user.id);
  if (!entitlements.canBrand) {
    return actionError(BRAND_STYLES_UPGRADE_MESSAGE);
  }

  const existing = await prisma.brand.findUnique({
    where: { id },
    select: { ownerId: true },
  });
  if (!existing) return actionError("Brand not found.");
  if (existing.ownerId !== user.id) return actionError("Not authorized.");

  // Capture the brand's assets before delete so the SetNull cascade does not
  // leave them as permanent orphans; mark them orphaned afterward.
  const brandAssets = await prisma.asset.findMany({
    where: { brandId: id, deletedAt: null },
    select: { id: true },
  });

  await prisma.brand.delete({ where: { id } });

  if (brandAssets.length > 0) {
    await prisma.asset.updateMany({
      where: { id: { in: brandAssets.map((a) => a.id) }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  revalidatePath("/app/brands");
  return actionOk();
}
