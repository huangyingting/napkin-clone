/**
 * POST /api/brand/font — upload a custom font file and get back a data-URL.
 *
 * The font is validated (type + size ≤ 2 MB), base64-encoded, and returned
 * as a `data:` URL.  The caller stores this durable URL in `Brand.fontDataUrl`
 * so the font survives page reloads and other sessions.  Rehydration injects a
 * `@font-face` rule from the stored URL wherever the brand is rendered.
 *
 * Export notes:
 * - SVG/PNG: the browser has the font loaded (via @font-face data-URL), so
 *   canvas rasterization renders correctly at export time.
 * - PDF: same as PNG (goes through PNG rasterization).
 * - PPTX: native shapes reference the fontFamily string only; custom fonts are
 *   NOT embedded in the .pptx file.  Viewers without the font will fall back to
 *   system defaults.  Full font embedding in PPTX is out of scope for this PR.
 */

import { NextResponse, type NextRequest } from "next/server";

import { forbidden, unauthorized } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/session";
import { validateFontUpload, formatUploadError } from "@/lib/brand/upload";
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

  const buffer = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${validation.mime};base64,${buffer.toString("base64")}`;

  // Derive a CSS-safe family name from the filename (strip extension, spaces → hyphens)
  const familyName = file.name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .slice(0, 64);

  return NextResponse.json({ dataUrl, familyName });
}
