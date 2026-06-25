/**
 * POST /api/brand/logo — upload a brand logo image as a protected asset.
 *
 * The image is validated (type + size ≤ 2 MB) then stored as a durable `Asset`
 * row whose bytes live in the NON-public `storage/brand-assets/` directory and
 * are served only through the authorised `/api/brand-assets/…` route (Epic
 * #496). The route returns `{ url, assetId, mime }` — a protected URL and the
 * asset id to persist on the brand (`logoAssetId`) — instead of a base64 data
 * URL.
 */

import { NextResponse, type NextRequest } from "next/server";

import { forbidden, unauthorized, validationError } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/session";
import { uploadBrandLogo } from "@/lib/brand/upload-route-service";
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

  const result = await uploadBrandLogo(request, user.id);
  if (!result.ok) {
    return validationError(result.error, result.status);
  }

  return NextResponse.json(result.body);
}
