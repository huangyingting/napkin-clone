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

import { forbidden, jsonError, unauthorized } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/session";
import { uploadBrandFont } from "@/lib/brand/upload-route-service";
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

  const result = await uploadBrandFont(request, user.id);
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return NextResponse.json(result.body);
}
