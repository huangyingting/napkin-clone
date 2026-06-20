"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { validateBrandInput, type BrandStyle } from "@/lib/brand/schema";
import {
  resolveBrandEntitlements,
  isCustomFontFamily,
  BRAND_STYLES_UPGRADE_MESSAGE,
  FONT_UPLOAD_UPGRADE_MESSAGE,
} from "@/lib/billing/brand-entitlements";

/** Serializes a Prisma Brand row to the client-safe `BrandStyle` shape. */
function toBrandStyle(row: {
  id: string;
  name: string;
  ownerId: string;
  palette: unknown;
  background: string | null;
  nodeFill: string | null;
  nodeStroke: string | null;
  nodeText: string | null;
  edgeColor: string | null;
  fontFamily: string | null;
  fontDataUrl: string | null;
  logoUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}): BrandStyle {
  let palette: string[] | null = null;
  if (Array.isArray(row.palette)) {
    palette = row.palette as string[];
  }
  return {
    id: row.id,
    name: row.name,
    ownerId: row.ownerId,
    palette,
    background: row.background,
    nodeFill: row.nodeFill,
    nodeStroke: row.nodeStroke,
    nodeText: row.nodeText,
    edgeColor: row.edgeColor,
    fontFamily: row.fontFamily,
    fontDataUrl: row.fontDataUrl,
    logoUrl: row.logoUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const BRAND_SELECT = {
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
  fontDataUrl: true,
  logoUrl: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Lists all brands owned by the current user. */
export async function listBrands(): Promise<BrandStyle[]> {
  const user = await requireUser();
  const rows = await prisma.brand.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    select: BRAND_SELECT,
  });
  return rows.map(toBrandStyle);
}

/** Creates a new brand for the current user. Returns the created brand. */
export async function createBrand(
  raw: unknown,
): Promise<{ ok: true; data: BrandStyle } | { ok: false; error: string }> {
  const user = await requireUser();
  const entitlements = await resolveBrandEntitlements(user.id);
  if (!entitlements.canBrand) {
    return { ok: false, error: BRAND_STYLES_UPGRADE_MESSAGE };
  }
  const validation = validateBrandInput(raw);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }
  const { data } = validation;

  if (isCustomFontFamily(data.fontFamily) && !entitlements.canFontUpload) {
    return { ok: false, error: FONT_UPLOAD_UPGRADE_MESSAGE };
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
      fontDataUrl: data.fontDataUrl ?? undefined,
      logoUrl: data.logoUrl ?? undefined,
    },
    select: BRAND_SELECT,
  });

  revalidatePath("/app/brands");
  return { ok: true, data: toBrandStyle(row) };
}

/** Updates a brand owned by the current user. */
export async function updateBrand(
  id: string,
  raw: unknown,
): Promise<{ ok: true; data: BrandStyle } | { ok: false; error: string }> {
  const user = await requireUser();
  const entitlements = await resolveBrandEntitlements(user.id);
  if (!entitlements.canBrand) {
    return { ok: false, error: BRAND_STYLES_UPGRADE_MESSAGE };
  }

  const existing = await prisma.brand.findUnique({
    where: { id },
    select: { ownerId: true },
  });
  if (!existing) return { ok: false, error: "Brand not found." };
  if (existing.ownerId !== user.id)
    return { ok: false, error: "Not authorized." };

  const validation = validateBrandInput(raw);
  if (!validation.ok) return { ok: false, error: validation.error };
  const { data } = validation;

  if (isCustomFontFamily(data.fontFamily) && !entitlements.canFontUpload) {
    return { ok: false, error: FONT_UPLOAD_UPGRADE_MESSAGE };
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
      fontDataUrl: data.fontDataUrl,
      logoUrl: data.logoUrl,
    },
    select: BRAND_SELECT,
  });

  revalidatePath("/app/brands");
  return { ok: true, data: toBrandStyle(row) };
}

/** Deletes a brand owned by the current user. */
export async function deleteBrand(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const entitlements = await resolveBrandEntitlements(user.id);
  if (!entitlements.canBrand) {
    return { ok: false, error: BRAND_STYLES_UPGRADE_MESSAGE };
  }

  const existing = await prisma.brand.findUnique({
    where: { id },
    select: { ownerId: true },
  });
  if (!existing) return { ok: false, error: "Brand not found." };
  if (existing.ownerId !== user.id)
    return { ok: false, error: "Not authorized." };

  await prisma.brand.delete({ where: { id } });
  revalidatePath("/app/brands");
  return { ok: true };
}
