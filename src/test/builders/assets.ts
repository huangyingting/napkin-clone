import { createHash } from "node:crypto";

import type { AssetPolicyMeta } from "@/lib/assets/upload-policy";
import { deriveStorageKey } from "@/lib/slides/asset-storage";

export const FIXTURE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

export function fixturePngBuffer(): Buffer {
  return Buffer.from(FIXTURE_PNG_BASE64, "base64");
}

export function fixtureAssetChecksum(
  bytes: Buffer = fixturePngBuffer(),
): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function buildAssetPolicyMeta(
  overrides: Partial<AssetPolicyMeta<"image/png">> = {},
): AssetPolicyMeta<"image/png"> {
  const bytes = fixturePngBuffer();
  return {
    mimeType: overrides.mimeType ?? "image/png",
    byteSize: overrides.byteSize ?? bytes.byteLength,
    checksum: overrides.checksum ?? fixtureAssetChecksum(bytes),
    widthPx: overrides.widthPx ?? 1,
    heightPx: overrides.heightPx ?? 1,
    originalName: overrides.originalName ?? "fixture.png",
  };
}

export function buildAssetRecord(
  overrides: Partial<{
    id: string;
    documentId: string | null;
    workspaceId: string | null;
    brandId: string | null;
    mimeType: string;
    byteSize: number;
    widthPx: number | null;
    heightPx: number | null;
    checksum: string;
    storageKey: string;
    originalName: string | null;
    createdAt: Date;
    deletedAt: Date | null;
  }> = {},
) {
  const meta = buildAssetPolicyMeta();
  const documentId = overrides.documentId ?? "doc-fixture";
  const checksum = overrides.checksum ?? meta.checksum;
  const mimeType = overrides.mimeType ?? meta.mimeType;
  return {
    id: overrides.id ?? "asset-fixture",
    documentId,
    workspaceId: overrides.workspaceId ?? null,
    brandId: overrides.brandId ?? null,
    mimeType,
    byteSize: overrides.byteSize ?? meta.byteSize,
    widthPx: overrides.widthPx ?? meta.widthPx ?? null,
    heightPx: overrides.heightPx ?? meta.heightPx ?? null,
    checksum,
    storageKey:
      overrides.storageKey ?? deriveStorageKey(documentId, checksum, mimeType),
    originalName: overrides.originalName ?? meta.originalName ?? null,
    createdAt: overrides.createdAt ?? new Date("2026-06-25T00:00:00.000Z"),
    deletedAt: overrides.deletedAt ?? null,
  };
}
