"use client";

export type BrandAssetUploadResult = {
  url: string;
  assetId: string;
  familyName?: string;
};

export type BrandUploadPort = {
  uploadLogo: (formData: FormData) => Promise<BrandAssetUploadResult>;
  uploadFont: (formData: FormData) => Promise<BrandAssetUploadResult>;
};

async function uploadBrandAsset(
  path: "/api/brand/logo" | "/api/brand/font",
  formData: FormData,
  fallback: string,
): Promise<BrandAssetUploadResult> {
  const res = await fetch(path, { method: "POST", body: formData });
  const json = (await res.json()) as {
    url?: string;
    assetId?: string;
    familyName?: string;
    error?: string;
  };
  if (!res.ok || !json.url || !json.assetId) {
    throw new Error(json.error ?? fallback);
  }
  return {
    url: json.url,
    assetId: json.assetId,
    familyName: json.familyName,
  };
}

export const routeBrandUploadPort: BrandUploadPort = {
  uploadLogo: (formData) =>
    uploadBrandAsset("/api/brand/logo", formData, "Logo upload failed."),
  uploadFont: (formData) =>
    uploadBrandAsset("/api/brand/font", formData, "Font upload failed."),
};
