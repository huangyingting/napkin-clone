import { createHash } from "node:crypto";

import { withP2002Fallback } from "@/lib/db/p2002-fallback";

import { deriveAssetStorageKey, type AssetStorageAdapter } from "./storage";

export interface StoredAssetResult {
  assetId: string;
  url: string;
  checksum: string;
  storageKey: string;
}

export interface ExistingStoredAsset {
  id: string;
  storageKey: string;
}

export interface AssetCreateInput {
  mimeType: string;
  byteSize: number;
  checksum: string;
  storageKey: string;
  originalName?: string;
}

export function calculateAssetChecksum(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function storeAssetWithUpsert<
  TExisting extends ExistingStoredAsset,
>(opts: {
  scopeId: string;
  buffer: Buffer;
  mimeType: string;
  originalName?: string;
  mimeToExt: Readonly<Record<string, string>>;
  storage: AssetStorageAdapter;
  storeBeforeFind?: boolean;
  findExisting(input: {
    checksum: string;
    storageKey: string;
  }): Promise<TExisting | null>;
  updateExisting?(existing: TExisting, input: AssetCreateInput): Promise<void>;
  createAsset(input: AssetCreateInput): Promise<{ id: string }>;
  findAfterConflict(input: {
    checksum: string;
    storageKey: string;
  }): Promise<{ id: string } | null>;
}): Promise<StoredAssetResult> {
  const checksum = calculateAssetChecksum(opts.buffer);
  const storageKey = deriveAssetStorageKey(
    opts.scopeId,
    checksum,
    opts.mimeType,
    opts.mimeToExt,
  );
  const input: AssetCreateInput = {
    mimeType: opts.mimeType,
    byteSize: opts.buffer.byteLength,
    checksum,
    storageKey,
    ...(opts.originalName ? { originalName: opts.originalName } : {}),
  };

  let url: string | undefined;
  if (opts.storeBeforeFind) {
    url = await opts.storage.store(storageKey, opts.buffer, opts.mimeType);
  }

  const existing = await opts.findExisting({ checksum, storageKey });
  if (existing) {
    await opts.updateExisting?.(existing, input);
    return {
      assetId: existing.id,
      url: url ?? opts.storage.urlFor(existing.storageKey),
      checksum,
      storageKey: existing.storageKey,
    };
  }

  url ??= await opts.storage.store(storageKey, opts.buffer, opts.mimeType);

  const asset = await withP2002Fallback<{ id: string }>(
    () => opts.createAsset(input),
    () => opts.findAfterConflict({ checksum, storageKey }),
  );

  return { assetId: asset.id, url, checksum, storageKey };
}
