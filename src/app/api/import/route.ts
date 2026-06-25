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

import {
  jsonError,
  multipartFormDataError,
  rateLimitedJsonError,
} from "@/lib/api/errors";
import { logError } from "@/lib/log";
import { ABUSE_CATEGORIES, logRouteDenial } from "@/lib/diagnostics/api-abuse";
import { processImportUpload } from "@/lib/import/upload-service";
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
import { auth as authEnv } from "@/lib/env";

// Node.js runtime: the parsers (mammoth, jszip, pdfjs) require it.
export const runtime = "nodejs";

const LOG_SCOPE = "api.import";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Abuse control (#96): the import route is public and runs heavy parsers, so
  // throttle by client IP. A missing/forged secret is a server misconfig, and a
  // missing client IP is treated as a single shared bucket so the limit can
  // never be bypassed by stripping the forwarding header.
  const secret = authEnv.secret();
  if (!secret) {
    logError(LOG_SCOPE, new Error("Missing AUTH_SECRET"), {
      reason: "missing-auth-secret",
      status: 500,
    });
    return jsonError("Server is misconfigured (missing AUTH_SECRET).", 500);
  }

  const clientIp = getClientIp(request.headers) ?? "unknown";
  const clientHash = hashIdentifier(clientIp, secret);
  const rateKey = rateLimitSubject("import", clientHash);
  const now = Date.now();
  const limit = await checkRateLimitWithStore(prismaRateLimitStore, rateKey, {
    limit: importRateLimit(),
    windowMs: importRateWindowMs(),
    now,
  });
  if (!limit.allowed) {
    const retryAfter = retryAfterSeconds(limit.resetAt, now);
    logRouteDenial({
      route: LOG_SCOPE,
      reason: ABUSE_CATEGORIES.RATE_LIMIT_HIT,
      status: 429,
      subjectHash: clientHash,
      retryAfterSeconds: retryAfter,
    });
    return rateLimitedJsonError(
      retryAfter,
      "Too many imports. Please wait a moment and try again.",
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return multipartFormDataError();
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return jsonError("Missing `file` field in form data.", 400);
  }

  const result = await processImportUpload(file, { subjectHash: clientHash });
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return NextResponse.json({ markdown: result.markdown });
}
