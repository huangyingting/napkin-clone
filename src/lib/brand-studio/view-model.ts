import type { BrandStyle } from "@/lib/brand/schema";

export interface BrandStudioViewModel {
  brands: BrandStyle[];
  canUseBrandStyles: boolean;
  canUploadFont: boolean;
}

export function buildBrandStudioViewModel({
  brands,
  canUseBrandStyles,
  canUploadFont,
}: BrandStudioViewModel): BrandStudioViewModel {
  return {
    brands,
    canUseBrandStyles,
    canUploadFont,
  };
}
