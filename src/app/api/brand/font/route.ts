/**
 * POST /api/brand/font — upload a custom font as a protected asset.
 *
 * The font is validated (type/extension fallback + size ≤ 2 MB) then stored as
 * a durable `Asset` row whose bytes live in the NON-public
 * `storage/brand-assets/` directory and are served only through the authorised
 * `/api/brand-assets/…` route (Epic #496). The route returns
 * `{ url, assetId, familyName, mime }` — a protected URL and the asset id to
 * persist on the brand (`fontAssetId`) — instead of a base64 data URL.
 *
 * Rehydration injects a `@font-face` rule whose `src` is the protected URL.
 * Same-origin browser fetches carry the session cookie, so the owner's font
 * loads in-browser wherever the brand is rendered.
 *
 * Export notes:
 * - SVG/PNG/PDF: the browser has the font loaded (via the @font-face protected
 *   URL), so canvas rasterization renders correctly at export time.
 * - PPTX: native shapes reference the fontFamily string only; custom fonts are
 *   NOT embedded in the .pptx file. Viewers without the font fall back to
 *   system defaults. Font embedding in PPTX is out of scope.
 */

import { NextResponse, type NextRequest } from "next/server";

import { forbidden, unauthorized } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/session";
import { validateFontUpload, formatUploadError } from "@/lib/brand/upload";
import { storeBrandAsset } from "@/lib/brand/asset-store";
import {
  resolveBrandEntitlements,
  FONT_UPLOAD_UPGRADE_MESSAGE,
} from "@/lib/billing/brand-entitlements";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return unauthorized();
  }

  const entitlements = await resolveBrandEntitlements(user.id);
  if (!entitlements.canFontUpload) {
    return forbidden(FONT_UPLOAD_UPGRADE_MESSAGE);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Request must be multipart/form-data." },
      { status: 400 },
    );
  }

  const file = formData.get("font");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing `font` field in form data." },
      { status: 400 },
    );
  }

  const validation = validateFontUpload(file.type, file.name, file.size);
  if (!validation.ok) {
    return NextResponse.json(
      { error: formatUploadError(validation.error) },
      { status: validation.error.code === "file_too_large" ? 413 : 415 },
    );
  }

  // Optional brand scope: present when editing an existing brand.
  const brandIdRaw = formData.get("brandId");
  const brandId =
    typeof brandIdRaw === "string" && brandIdRaw ? brandIdRaw : null;

  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await storeBrandAsset({
    ownerId: user.id,
    buffer,
    mimeType: validation.mime,
    originalName: file.name || undefined,
    brandId,
  });

  // Derive a CSS-safe family name from the filename (strip extension, spaces → hyphens)
  const familyName = file.name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .slice(0, 64);

  return NextResponse.json({
    url: stored.url,
    assetId: stored.assetId,
    familyName,
    mime: validation.mime,
  });
}
