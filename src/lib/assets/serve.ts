import { NextResponse } from "next/server";

import { privateImmutableCacheHeaders } from "@/lib/api/route-adapters";
import type { AssetStorageAdapter } from "@/lib/assets/storage";

type AssetMetadata = { size: number; mtime: Date };

function encodeEtagPart(value: string): string {
  return Buffer.from(value).toString("base64url");
}

export function assetEntityTag(
  storageKey: string,
  metadata: AssetMetadata,
): string {
  return `"${encodeEtagPart(storageKey)}-${metadata.size}-${metadata.mtime.getTime()}"`;
}

export function requestMatchesEntityTag(
  ifNoneMatch: string | null,
  etag: string,
): boolean {
  if (!ifNoneMatch) return false;
  return ifNoneMatch
    .split(",")
    .map((part) => part.trim())
    .some((part) => part === "*" || part === etag);
}

function assetHeaders(
  mimeType: string,
  metadata: AssetMetadata | null,
  storageKey: string,
): Record<string, string> {
  const headers = {
    ...privateImmutableCacheHeaders(mimeType),
    "Accept-Ranges": "none",
  };
  if (!metadata) return headers;
  return {
    ...headers,
    "Content-Length": String(metadata.size),
    "Last-Modified": metadata.mtime.toUTCString(),
    ETag: assetEntityTag(storageKey, metadata),
  };
}

export async function serveStoredAsset({
  adapter,
  storageKey,
  mimeType,
  request,
}: {
  adapter: AssetStorageAdapter;
  storageKey: string;
  mimeType: string;
  request: Request;
}): Promise<NextResponse> {
  const metadata = adapter.stat ? await adapter.stat(storageKey) : null;
  const headers = assetHeaders(mimeType, metadata, storageKey);

  if (
    metadata &&
    requestMatchesEntityTag(request.headers.get("if-none-match"), headers.ETag)
  ) {
    return new NextResponse(null, { status: 304, headers });
  }

  if (adapter.stream && metadata) {
    return new NextResponse(await adapter.stream(storageKey), {
      status: 200,
      headers,
    });
  }

  const data = await adapter.read(storageKey);
  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers,
  });
}
