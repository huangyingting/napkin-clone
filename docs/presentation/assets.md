# Slide Assets

**Status:** Current  
**Last updated:** 2026-06-23

This document defines the slide image asset lifecycle: upload, storage, serving,
resolution, export behavior, and cleanup.

## Source Files

| Area                    | Source                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Upload server action    | [`src/app/app/documents/[id]/slide-asset-actions.ts`](../../src/app/app/documents/%5Bid%5D/slide-asset-actions.ts)                   |
| Protected serving route | [`src/app/api/slide-assets/[documentId]/[...path]/route.ts`](../../src/app/api/slide-assets/%5BdocumentId%5D/%5B...path%5D/route.ts) |
| Validation              | [`src/lib/slides/asset-upload.ts`](../../src/lib/slides/asset-upload.ts)                                                             |
| Storage adapter         | [`src/lib/slides/asset-storage.ts`](../../src/lib/slides/asset-storage.ts)                                                           |
| Resolver                | [`src/lib/slides/asset-resolver.ts`](../../src/lib/slides/asset-resolver.ts)                                                         |
| Orphan cleanup          | [`src/lib/slides/asset-orphan.ts`](../../src/lib/slides/asset-orphan.ts)                                                             |
| Inspector upload UI     | [`src/components/presentation/slide-inspector.tsx`](../../src/components/presentation/slide-inspector.tsx)                           |

## Data Flow

```text
SlideInspector file input
  -> uploadSlideAsset(documentId, FormData)
  -> validate MIME/size/checksum
  -> write bytes through AssetStorageAdapter
  -> create/deduplicate Asset row
  -> return { assetId, url }
  -> persist assetId on ImageElement or Slide.backgroundAssetId
```

Assets are document-scoped. The returned URL is a protected route under
`/api/slide-assets/...`, not a public static path.

Vocabulary:

- `AssetReference` means persisted identity, such as `ImageElement.assetId` or
  `Slide.backgroundAssetId`.
- `ResolvedAssetUrl` means a derived display URL, such as `ImageElement.src` or
  `Slide.backgroundImage`.

## Upload Validation

Accepted MIME types:

- `image/png`
- `image/jpeg`
- `image/gif`
- `image/webp`

SVG is not accepted. Uploads are capped by `ASSET_MAX_BYTES` and raster images
are dimension-limited by `ASSET_MAX_DIMENSION_PX`.

The storage key is derived from validated data:

```text
${documentId}/${sha256}.${extensionFromMime}
```

The extension is never taken from the user-provided filename.

## Storage

The default `LocalAssetStorageAdapter` writes bytes to:

```text
storage/slide-assets/<documentId>/<checksum>.<ext>
```

The directory is not public. Reads go through the protected API route, which
checks document ownership/share policy before streaming bytes.

The adapter interface supports future storage backends such as S3 or Azure Blob:

- `store(key, buffer, mimeType)`
- `urlFor(key)`
- `read(key)`
- `delete(key)`

## Access Rules

`GET /api/slide-assets/[documentId]/[...path]` serves an asset only when:

1. the asset exists, belongs to the requested document, and is not soft-deleted;
2. the authenticated user has `view` capability for that document; or
3. the document has a valid public present/embed share policy.

Other requests return 403 or 404. This prevents private decks from leaking image
bytes through predictable URLs.

## Runtime Resolution

Slide renderers and export paths use the asset resolver contract:

- browser rendering uses cached URLs returned by upload;
- server/export flows can resolve `assetId` through the database and storage
  adapter;
- missing assets produce a placeholder or preflight diagnostic depending on the
  surface.

`assetId` can appear in:

- `ImageElement.assetId`;
- `Slide.backgroundAssetId`.

`ImageElement.src` and `Slide.backgroundImage` are cached resolved URLs for
rendering. Server/export paths should resolve from asset ids when available
instead of treating cached URLs as authoritative.

## Cleanup

`collectDeckAssetRefs` scans current `deckJson` plus retained
`DocumentVersion.deckJson` snapshots for active asset references. Cleanup is
two-phase:

1. `markOrphanedAssets` soft-deletes unreferenced assets with `deletedAt`.
2. `purgeExpiredAssets` deletes storage bytes after `ASSET_RETENTION_MS` when
   the asset remains unreferenced.

Version snapshots count as active references so restores do not point at purged
files.

## Export And Preflight

Export preflight reports `missing-asset` when an image has no resolvable source.
The server resolver can recover URLs from `assetId` for export; if the row is
missing or soft-deleted, export surfaces a diagnostic instead of silently
producing a blank image.

## Invariants

1. Upload requires document `edit` capability.
2. Serving requires document `view` capability or valid public present/embed
   access.
3. Storage keys are derived from document id, checksum, and validated MIME type.
4. Asset bytes are not served from public static storage.
5. Version snapshots protect assets from immediate purge.

## Primary Tests

- [`src/lib/slides/asset-upload.test.ts`](../../src/lib/slides/asset-upload.test.ts)
- [`src/lib/slides/asset-storage.test.ts`](../../src/lib/slides/asset-storage.test.ts)
- [`src/lib/slides/asset-resolver.test.ts`](../../src/lib/slides/asset-resolver.test.ts)
- [`src/lib/slides/asset-orphan.test.ts`](../../src/lib/slides/asset-orphan.test.ts)
- [`src/lib/slides/upload-action.test.ts`](../../src/lib/slides/upload-action.test.ts)
- [`src/lib/slides/missing-asset-font.test.ts`](../../src/lib/slides/missing-asset-font.test.ts)
- [`src/lib/presentation/background-asset.test.ts`](../../src/lib/presentation/background-asset.test.ts)
