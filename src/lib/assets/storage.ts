import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

/**
 * Contract for an asset storage backend.
 *
 * @param key      - Opaque storage key (for example, `scope/checksum.png`).
 * @param buffer   - Raw file bytes to persist.
 * @param mimeType - MIME type of the stored file.
 * @returns A protected URL through which the stored asset can be retrieved.
 */
export interface AssetStorageAdapter {
  store(key: string, buffer: Buffer, mimeType: string): Promise<string>;
  /** Returns the URL for an existing storage key without writing. */
  urlFor(key: string): string;
  /**
   * Reads the raw bytes for the given storage key.
   * Throws (ENOENT-like) when the file does not exist.
   */
  read(key: string): Promise<Buffer>;
  /**
   * Returns local metadata when the backend can serve bytes without buffering.
   */
  stat?(key: string): Promise<{ size: number; mtime: Date }>;
  /**
   * Streams raw bytes for the given storage key when supported by the backend.
   */
  stream?(key: string): Promise<ReadableStream<Uint8Array>>;
  /**
   * Deletes the file for the given storage key.
   * Must be idempotent: no-op if the file is already absent.
   */
  delete(key: string): Promise<void>;
}

/**
 * Writes assets to `{rootDir}/{key}` and serves them via `{baseUrl}/{key}`.
 *
 * Intermediate directories are created automatically on first write. The root
 * should be a non-public directory when protected route authorization is needed.
 */
export class LocalAssetStorageAdapter implements AssetStorageAdapter {
  constructor(
    /** Absolute directory where assets are written. */
    readonly rootDir: string,
    /** Base URL prefix prepended to the key in the returned URL. */
    readonly baseUrl: string,
  ) {}

  async store(
    key: string,
    buffer: Buffer,
    _mimeType?: string,
  ): Promise<string> {
    const dest = path.join(this.rootDir, key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, buffer);
    return this.urlFor(key);
  }

  urlFor(key: string): string {
    return `${this.baseUrl}/${key}`;
  }

  async read(key: string): Promise<Buffer> {
    return fs.readFile(path.join(this.rootDir, key));
  }

  async stat(key: string): Promise<{ size: number; mtime: Date }> {
    const stats = await fs.stat(path.join(this.rootDir, key));
    return { size: stats.size, mtime: stats.mtime };
  }

  async stream(key: string): Promise<ReadableStream<Uint8Array>> {
    return Readable.toWeb(
      fsSync.createReadStream(path.join(this.rootDir, key)),
    ) as ReadableStream<Uint8Array>;
  }

  async delete(key: string): Promise<void> {
    await fs.rm(path.join(this.rootDir, key), { force: true });
  }
}

export function deriveAssetStorageKey(
  scopeId: string,
  checksum: string,
  mimeType: string,
  mimeToExt: Readonly<Record<string, string>>,
): string {
  const ext = mimeToExt[mimeType] ?? "bin";
  return `${scopeId}/${checksum}.${ext}`;
}
