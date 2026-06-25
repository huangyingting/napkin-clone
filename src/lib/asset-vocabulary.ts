/**
 * Asset naming vocabulary.
 *
 * `AssetReference` is persisted identity (usually an Asset row id).
 * `ResolvedAssetUrl` is a derived display URL from a storage adapter or upload
 * response. Existing JSON field names stay unchanged; these aliases make new
 * mapper/resolver boundaries explicit without adding runtime code.
 */

export type AssetReference = string;
export type ResolvedAssetUrl = string;
