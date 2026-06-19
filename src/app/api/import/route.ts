/**
 * POST /api/import — parse an uploaded document and return its text content.
 *
 * Accepts a `multipart/form-data` request with a `file` field containing one
 * of: .md, .html, .docx, .pptx, .pdf (up to 20 MB). Returns the extracted
 * text as `{ markdown: string }` — a Markdown-compatible string ready for
 * `markdownToLexicalState`. Heavy parsers (mammoth, jszip, pdf-parse) run
 * server-side only; they never touch the client bundle.
 *
 * Validation errors are returned as `{ error: string }` with an appropriate
 * HTTP status so the client can surface a friendly, retryable message.
 */

import { NextResponse, type NextRequest } from "next/server";

import { logError } from "@/lib/log";
import {
  formatValidationError,
  parseImportedFile,
  validateImportFile,
} from "@/lib/import";

// Node.js runtime: the parsers (mammoth, jszip, pdfjs) require it.
export const runtime = "nodejs";

const LOG_SCOPE = "api.import";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Request must be multipart/form-data." },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing `file` field in form data." },
      { status: 400 },
    );
  }

  const validation = validateImportFile(file.type, file.name, file.size);
  if (!validation.ok) {
    return NextResponse.json(
      { error: formatValidationError(validation.error) },
      { status: validation.error.code === "file_too_large" ? 413 : 415 },
    );
  }

  let buffer: Buffer;
  try {
    const arrayBuffer = await file.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } catch (error) {
    logError(LOG_SCOPE, error, { reason: "read-file", status: 400 });
    return NextResponse.json(
      { error: "Failed to read the uploaded file." },
      { status: 400 },
    );
  }

  try {
    const markdown = await parseImportedFile(
      validation.mime,
      buffer,
      file.name,
    );

    if (!markdown.trim()) {
      return NextResponse.json(
        { error: "No readable text was found in the uploaded file." },
        { status: 422 },
      );
    }

    return NextResponse.json({ markdown });
  } catch (error) {
    logError(LOG_SCOPE, error, { reason: "parse-failed", status: 422 });
    return NextResponse.json(
      {
        error:
          "Could not parse the file. Make sure it is a valid, uncorrupted document.",
      },
      { status: 422 },
    );
  }
}
