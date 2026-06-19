/**
 * Asset upload validation helpers for Brand Studio (US-007).
 *
 * Font and logo uploads are validated server-side before storage.
 * These pure helpers work identically on both client (pre-flight) and server.
 */

/** Accepted font MIME types. */
export const FONT_ACCEPTED_TYPES = [
  "font/ttf",
  "font/otf",
  "font/woff",
  "font/woff2",
  // Browsers often report these variants
  "application/font-woff",
  "application/font-woff2",
  "application/x-font-ttf",
  "application/x-font-otf",
  "application/octet-stream", // Firefox reports .woff2 as this
] as const;

/** Accepted image MIME types for logos. */
export const LOGO_ACCEPTED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "image/webp",
] as const;

export const FONT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
export const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export type UploadError =
  | { code: "type_rejected"; accepted: readonly string[] }
  | { code: "file_too_large"; maxBytes: number };

export type UploadValidation =
  | { ok: true; mime: string }
  | { ok: false; error: UploadError };

/** Derives a safe MIME type from type + filename extension. */
function resolveType(type: string, name: string): string {
  if (type && type !== "application/octet-stream") return type;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ttf: "font/ttf",
    otf: "font/otf",
    woff: "font/woff",
    woff2: "font/woff2",
  };
  return map[ext] ?? type;
}

export function validateFontUpload(
  type: string,
  name: string,
  size: number,
): UploadValidation {
  if (size > FONT_MAX_BYTES) {
    return {
      ok: false,
      error: { code: "file_too_large", maxBytes: FONT_MAX_BYTES },
    };
  }
  const resolved = resolveType(type, name);
  if (!(FONT_ACCEPTED_TYPES as readonly string[]).includes(resolved)) {
    return {
      ok: false,
      error: { code: "type_rejected", accepted: FONT_ACCEPTED_TYPES },
    };
  }
  return { ok: true, mime: resolved };
}

export function validateLogoUpload(
  type: string,
  name: string,
  size: number,
): UploadValidation {
  if (size > LOGO_MAX_BYTES) {
    return {
      ok: false,
      error: { code: "file_too_large", maxBytes: LOGO_MAX_BYTES },
    };
  }
  const resolved = resolveType(type, name);
  if (!(LOGO_ACCEPTED_TYPES as readonly string[]).includes(resolved)) {
    return {
      ok: false,
      error: { code: "type_rejected", accepted: LOGO_ACCEPTED_TYPES },
    };
  }
  return { ok: true, mime: resolved };
}

export function formatUploadError(error: UploadError): string {
  if (error.code === "file_too_large") {
    const mb = Math.round(error.maxBytes / 1024 / 1024);
    return `File exceeds the ${mb} MB limit.`;
  }
  return `Unsupported file type. Accepted: ${error.accepted.join(", ")}.`;
}

/**
 * Extracts a small color palette from an image element using an off-screen
 * canvas (browser-only). Returns up to `maxColors` hex strings sampled from a
 * down-scaled representation of the image.
 *
 * This is a best-effort extraction — the algorithm samples pixels on a grid
 * and de-duplicates close matches. It will not run in a server environment
 * (canvas not available); callers should guard with `typeof document !== 'undefined'`.
 */
export function extractPaletteFromImage(
  img: HTMLImageElement,
  maxColors = 6,
): string[] {
  const SIZE = 64; // down-scale for speed
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, SIZE, SIZE);

  const imageData = ctx.getImageData(0, 0, SIZE, SIZE);
  const { data } = imageData;

  // Sample every 8th pixel
  const buckets = new Map<string, number>();
  for (let i = 0; i < data.length; i += 4 * 8) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 128) continue; // skip transparent
    // Quantize to 4-bit per channel to merge close colors
    const qr = (r >> 4) << 4;
    const qg = (g >> 4) << 4;
    const qb = (b >> 4) << 4;
    const hex = `#${qr.toString(16).padStart(2, "0")}${qg.toString(16).padStart(2, "0")}${qb.toString(16).padStart(2, "0")}`;
    buckets.set(hex, (buckets.get(hex) ?? 0) + 1);
  }

  // Sort by frequency and take top N
  return Array.from(buckets.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxColors)
    .map(([hex]) => hex);
}
