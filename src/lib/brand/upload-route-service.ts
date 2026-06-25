import "server-only";

import { uploadValidationStatus } from "@/lib/api/errors";

import { storeBrandAsset } from "./asset-store";
import {
  formatUploadError,
  validateFontUpload,
  validateLogoUpload,
  type UploadValidation,
} from "./upload";

type BrandUploadStatus = 400 | 413 | 415;

export type BrandLogoUploadBody = {
  url: string;
  assetId: string;
  mime: string;
};

export type BrandFontUploadBody = {
  url: string;
  assetId: string;
  familyName: string;
  mime: string;
};

export type BrandUploadResult<TBody> =
  | { ok: true; body: TBody }
  | { ok: false; status: BrandUploadStatus; error: string };

type BrandUploadKind = "logo" | "font";

type BrandUploadConfig<TBody> = {
  kind: BrandUploadKind;
  validate(type: string, name: string, size: number): UploadValidation;
  buildBody(input: {
    url: string;
    assetId: string;
    mime: string;
    fileName: string;
  }): TBody;
};

function brandIdFromFormData(formData: FormData): string | null {
  const brandIdRaw = formData.get("brandId");
  return typeof brandIdRaw === "string" && brandIdRaw ? brandIdRaw : null;
}

function familyNameFromFileName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .slice(0, 64);
}

async function uploadBrandAsset<TBody>(
  request: Request,
  ownerId: string,
  config: BrandUploadConfig<TBody>,
): Promise<BrandUploadResult<TBody>> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return {
      ok: false,
      error: "Request must be multipart/form-data.",
      status: 400,
    };
  }

  const file = formData.get(config.kind);
  if (!(file instanceof File)) {
    return {
      ok: false,
      error: `Missing \`${config.kind}\` field in form data.`,
      status: 400,
    };
  }

  const validation = config.validate(file.type, file.name, file.size);
  if (!validation.ok) {
    return {
      ok: false,
      error: formatUploadError(validation.error),
      status: uploadValidationStatus(validation.error),
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await storeBrandAsset({
    ownerId,
    buffer,
    mimeType: validation.mime,
    originalName: file.name || undefined,
    brandId: brandIdFromFormData(formData),
  });

  return {
    ok: true,
    body: config.buildBody({
      url: stored.url,
      assetId: stored.assetId,
      mime: validation.mime,
      fileName: file.name,
    }),
  };
}

export function uploadBrandLogo(
  request: Request,
  ownerId: string,
): Promise<BrandUploadResult<BrandLogoUploadBody>> {
  return uploadBrandAsset(request, ownerId, {
    kind: "logo",
    validate: validateLogoUpload,
    buildBody: ({ url, assetId, mime }) => ({
      url,
      assetId,
      mime,
    }),
  });
}

export function uploadBrandFont(
  request: Request,
  ownerId: string,
): Promise<BrandUploadResult<BrandFontUploadBody>> {
  return uploadBrandAsset(request, ownerId, {
    kind: "font",
    validate: validateFontUpload,
    buildBody: ({ url, assetId, mime, fileName }) => ({
      url,
      assetId,
      familyName: familyNameFromFileName(fileName),
      mime,
    }),
  });
}
