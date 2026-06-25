import { formatAssetFileTooLargeError } from "@/lib/limits";

export interface AssetUploadPolicy<TMime extends string = string> {
  storageRoot: string;
  urlPrefix: string;
  scopeIdKind: "documentId" | "ownerId";
  acceptedMimeTypes: readonly TMime[];
  mimeToExt: Readonly<Record<string, string>>;
  maxBytes: number;
  dimensions?: {
    maxPx: number;
  };
  extensionMimeMap?: Readonly<Record<string, string>>;
}

export type AssetUploadPolicyError =
  | { code: "type_rejected"; accepted: readonly string[] }
  | { code: "file_too_large"; maxBytes: number }
  | { code: "dimension_exceeded"; maxPx: number }
  | { code: "checksum_missing" };

export type AssetUploadPolicyValidation<TMime extends string = string> =
  | { ok: true; mime: TMime; byteSize: number }
  | { ok: false; error: AssetUploadPolicyError };

export type AssetPolicyMetaResult<TMime extends string = string> =
  | { ok: true; meta: AssetPolicyMeta<TMime> }
  | { ok: false; error: AssetUploadPolicyError };

export interface AssetPolicyMeta<TMime extends string = string> {
  mimeType: TMime;
  byteSize: number;
  checksum: string;
  widthPx?: number;
  heightPx?: number;
  originalName?: string;
}

export function resolveUploadMime(
  policy: AssetUploadPolicy,
  type: string,
  name: string,
): string {
  if (type && type !== "application/octet-stream") return type;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return policy.extensionMimeMap?.[ext] ?? type;
}

export function isAcceptedAssetMime<TMime extends string>(
  policy: AssetUploadPolicy<TMime>,
  mime: string,
): mime is TMime {
  return (policy.acceptedMimeTypes as readonly string[]).includes(mime);
}

export function validateAssetUploadPolicy<TMime extends string>(
  policy: AssetUploadPolicy<TMime>,
  type: string,
  name: string,
  size: number,
): AssetUploadPolicyValidation<TMime> {
  if (size > policy.maxBytes) {
    return {
      ok: false,
      error: { code: "file_too_large", maxBytes: policy.maxBytes },
    };
  }
  const mime = resolveUploadMime(policy, type, name);
  if (!isAcceptedAssetMime(policy, mime)) {
    return {
      ok: false,
      error: { code: "type_rejected", accepted: policy.acceptedMimeTypes },
    };
  }
  return { ok: true, mime, byteSize: size };
}

export function validateAssetDimensionsPolicy(
  policy: AssetUploadPolicy,
  widthPx: number | undefined,
  heightPx: number | undefined,
): { ok: true } | { ok: false; error: AssetUploadPolicyError } {
  const maxAllowed = policy.dimensions?.maxPx;
  if (maxAllowed === undefined) return { ok: true };
  const maxActual = Math.max(widthPx ?? 0, heightPx ?? 0);
  if (maxActual > maxAllowed) {
    return {
      ok: false,
      error: { code: "dimension_exceeded", maxPx: maxAllowed },
    };
  }
  return { ok: true };
}

export function buildAssetPolicyMeta<TMime extends string>(opts: {
  policy: AssetUploadPolicy<TMime>;
  type: string;
  name: string;
  size: number;
  checksum: string;
  widthPx?: number;
  heightPx?: number;
}): AssetPolicyMetaResult<TMime> {
  if (!opts.checksum || !opts.checksum.trim()) {
    return { ok: false, error: { code: "checksum_missing" } };
  }
  const resolved = resolveUploadMime(opts.policy, opts.type, opts.name);
  if (!isAcceptedAssetMime(opts.policy, resolved)) {
    return {
      ok: false,
      error: {
        code: "type_rejected",
        accepted: opts.policy.acceptedMimeTypes,
      },
    };
  }
  return {
    ok: true,
    meta: {
      mimeType: resolved,
      byteSize: opts.size,
      checksum: opts.checksum,
      ...(opts.widthPx !== undefined ? { widthPx: opts.widthPx } : {}),
      ...(opts.heightPx !== undefined ? { heightPx: opts.heightPx } : {}),
      originalName: opts.name || undefined,
    },
  };
}

export function formatAssetUploadPolicyError(
  error: AssetUploadPolicyError,
): string {
  switch (error.code) {
    case "file_too_large":
      return formatAssetFileTooLargeError(error.maxBytes);
    case "type_rejected":
      return `Unsupported file type. Accepted: ${error.accepted.join(", ")}.`;
    case "dimension_exceeded":
      return `Image dimensions exceed the ${error.maxPx}px limit.`;
    case "checksum_missing":
      return "File integrity check failed — checksum is required.";
  }
}
