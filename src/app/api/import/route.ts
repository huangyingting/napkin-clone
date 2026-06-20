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
 * HTTP status so the client can surface a friendly, retryable message. The
 * route is public, so it is throttled per client IP (429 + `Retry-After` on
 * exceed) and each parse runs under a timeout to bound abuse (#96).
 */

import { NextResponse, type NextRequest } from "next/server";

import { logError } from "@/lib/log";
import {
  formatValidationError,
  parseImportedFile,
  validateImportFile,
} from "@/lib/import";
import { ParseTimeoutError, withTimeout } from "@/lib/import/timeout";
import { checkRateLimitWithStore } from "@/lib/ai/quota";
import {
  getClientIp,
  hashIdentifier,
  importRateLimit,
  importRateWindowMs,
  prismaRateLimitStore,
  rateLimitSubject,
  retryAfterSeconds,
} from "@/lib/rate-limit";

// Node.js runtime: the parsers (mammoth, jszip, pdfjs) require it.
export const runtime = "nodejs";

const LOG_SCOPE = "api.import";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Abuse control (#96): the import route is public and runs heavy parsers, so
  // throttle by client IP. A missing/forged secret is a server misconfig, and a
  // missing client IP is treated as a single shared bucket so the limit can
  // never be bypassed by stripping the forwarding header.
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    logError(LOG_SCOPE, new Error("Missing AUTH_SECRET"), {
      reason: "missing-auth-secret",
      status: 500,
    });
    return NextResponse.json(
      { error: "Server is misconfigured (missing AUTH_SECRET)." },
      { status: 500 },
    );
  }

  const clientIp = getClientIp(request.headers) ?? "unknown";
  const rateKey = rateLimitSubject("import", hashIdentifier(clientIp, secret));
  const now = Date.now();
  const limit = await checkRateLimitWithStore(prismaRateLimitStore, rateKey, {
    limit: importRateLimit(),
    windowMs: importRateWindowMs(),
    now,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many imports. Please wait a moment and try again." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSeconds(limit.resetAt, now)),
        },
      },
    );
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
    const markdown = await withTimeout(() =>
      parseImportedFile(validation.mime, buffer, file.name),
    );

    if (!markdown.trim()) {
      return NextResponse.json(
        { error: "No readable text was found in the uploaded file." },
        { status: 422 },
      );
    }

    return NextResponse.json({ markdown });
  } catch (error) {
    if (error instanceof ParseTimeoutError) {
      logError(LOG_SCOPE, error, { reason: "parse-timeout", status: 422 });
      return NextResponse.json(
        {
          error:
            "The file took too long to parse. Try a smaller or simpler document.",
        },
        { status: 422 },
      );
    }
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
