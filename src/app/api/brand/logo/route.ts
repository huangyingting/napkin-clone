/**
 * POST /api/brand/logo — upload a brand logo image as a protected asset.
 *
 * The image is validated (type + size ≤ 2 MB) then stored as a durable `Asset`
 * row whose bytes live in the NON-public `storage/brand-assets/` directory and
 * are served only through the authorised `/api/brand-assets/…` route (Epic
 * #496). The route returns `{ url, assetId, mime }` — a protected URL and the
 * asset id to persist on the brand (`logoAssetId`) — instead of a base64 data
 * URL.
 *
 * Palette extraction stays client-side (canvas) when the image loads in the UI;
 * the response carries an empty `palette` for backward compatibility.
 */

import { NextResponse, type NextRequest } from "next/server";

import { forbidden, unauthorized } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/session";
import { validateLogoUpload, formatUploadError } from "@/lib/brand/upload";
import { storeBrandAsset } from "@/lib/brand/asset-store";
import {
  resolveBrandEntitlements,
  BRAND_STYLES_UPGRADE_MESSAGE,
} from "@/lib/billing/brand-entitlements";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return unauthorized();
  }

  const entitlements = await resolveBrandEntitlements(user.id);
  if (!entitlements.canBrand) {
    return forbidden(BRAND_STYLES_UPGRADE_MESSAGE);
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

  const file = formData.get("logo");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing `logo` field in form data." },
      { status: 400 },
    );
  }

  const validation = validateLogoUpload(file.type, file.name, file.size);
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

  return NextResponse.json({
    url: stored.url,
    assetId: stored.assetId,
    mime: validation.mime,
    palette: [],
  });
}
