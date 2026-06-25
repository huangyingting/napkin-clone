"use client";

import { useEffect } from "react";

import { injectBrandFontFace } from "@/lib/brand/font-face";
import { BRAND_WEB_FONTS, type BrandStyle } from "@/lib/brand/schema";
import type { Visual } from "@/lib/visual/schema";

function ensureWebFont(fontFamily: string): boolean {
  const match = BRAND_WEB_FONTS.find((font) => font.cssFamily === fontFamily);
  if (!match) return false;
  const id = `gfont-brand-${match.id}`;
  if (document.getElementById(id)) return true;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = match.url;
  document.head.appendChild(link);
  return true;
}

export function hydrateBrandFont(
  id: string,
  fontFamily: string | null | undefined,
  fontAssetUrl?: string | null,
) {
  if (!fontFamily) return;
  if (ensureWebFont(fontFamily)) return;
  if (fontAssetUrl) {
    injectBrandFontFace(id, fontFamily, fontAssetUrl);
  }
}

export function useHydrateBrandFont(
  brand: Pick<BrandStyle, "id" | "fontFamily" | "fontAssetUrl">,
) {
  useEffect(() => {
    hydrateBrandFont(brand.id, brand.fontFamily, brand.fontAssetUrl);
  }, [brand.id, brand.fontFamily, brand.fontAssetUrl]);
}

export function useHydrateVisualNodeFonts(visual: Visual) {
  useEffect(() => {
    const seen = new Set<string>();
    for (const node of visual.nodes) {
      if (!node.fontFamily || seen.has(node.fontFamily)) continue;
      seen.add(node.fontFamily);
      hydrateBrandFont(`visual-node-${node.fontFamily}`, node.fontFamily);
    }
  }, [visual.nodes]);
}
