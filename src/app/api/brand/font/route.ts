/**
 * POST /api/brand/font — upload a custom font file and get back a data-URL.
 *
 * The font is validated (type + size), base64-encoded, and returned as a
 * `data:` URL that callers can inject as a `@font-face src` in the browser.
 * We do NOT persist fonts server-side in this slice — they live in the
 * brand.fontFamily field as a CSS font-family string, with the data-URL
 * optionally stored in brand.logoUrl (see notes in the PR).
 *
 * Limitation: data-URLs are not portable to PDF/PPTX export from a server
 * context (no DOM canvas). SVG export embeds the @font-face so it renders
 * in browsers. PNG export works at rasterization time (canvas has the font
 * if it was loaded via the injected <link>). See PR for full export notes.
 */

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/session";
import { validateFontUpload, formatUploadError } from "@/lib/brand/upload";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
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
