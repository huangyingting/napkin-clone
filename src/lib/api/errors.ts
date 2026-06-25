/**
 * Shared API error-response helpers (Epic #495, issue #511).
 *
 * Before this module each route hand-rolled its own denial responses, which
 * drifted apart over time: `{"error":"Unauthorized."}` vs
 * `{"error":"Unauthorized"}` (no trailing period), JSON vs plain-text 403/404
 * bodies, and so on. These helpers give every app-gated route ONE canonical
 * shape so clients and logs can rely on it:
 *
 *   `NextResponse.json({ error, code }, { status })`
 *
 * The canonical helpers below include both fields: `error` is the
 * human-readable message (unchanged for callers that already read it); `code` is
 * a STABLE machine-readable identifier that UIs and log pipelines can branch on
 * without string-matching prose. A few legacy upload routes still contractually
 * return only `{ error }`; keep those opt-in helpers small and status-focused.
 *
 * IMPORTANT — privacy: these helpers do NOT encode any product policy about
 * WHICH status a route should return. Routes that must not leak the existence
 * of a private resource (e.g. `slide-assets`, document-scoped routes) must keep
 * choosing `notFound()` themselves where existence must stay hidden — never
 * "upgrade" a privacy 404 into a 403 just because this helper exists.
 */

import { NextResponse } from "next/server";

/** STABLE machine-readable denial codes — do NOT rename or remove. */
export const API_ERROR_CODES = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  FEATURE_DISABLED: "FEATURE_DISABLED",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  RATE_LIMITED: "RATE_LIMITED",
} as const;

export type ApiErrorCode =
  (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

/** The canonical JSON body every helper emits. */
export interface ApiErrorBody {
  error: string;
  code: ApiErrorCode;
}

export interface PlainApiErrorBody {
  error: string;
}

function errorResponse(
  status: number,
  code: ApiErrorCode,
  message: string,
  headers?: Record<string, string>,
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: message, code }, { status, headers });
}

/** JSON `{ error }` for routes whose public contract predates canonical codes. */
export function jsonError(
  message: string,
  status: number,
  headers?: Record<string, string>,
): NextResponse<PlainApiErrorBody> {
  return NextResponse.json({ error: message }, { status, headers });
}

/** 400 — the request body could not be parsed as multipart form data. */
export function multipartFormDataError(): NextResponse<PlainApiErrorBody> {
  return jsonError("Request must be multipart/form-data.", 400);
}

/** 429 — `{ error }` response with a positive `Retry-After` header. */
export function rateLimitedJsonError(
  retryAfterSeconds: number,
  message: string,
): NextResponse<PlainApiErrorBody> {
  return jsonError(message, 429, {
    "Retry-After": String(Math.ceil(retryAfterSeconds)),
  });
}

/** Maps upload validation failures to their shared HTTP status. */
export function uploadValidationStatus(error: { code: string }): 413 | 415 {
  return error.code === "file_too_large" ? 413 : 415;
}

/** 401 — caller is not authenticated. */
export function unauthorized(
  message = "Unauthorized.",
): NextResponse<ApiErrorBody> {
  return errorResponse(401, API_ERROR_CODES.UNAUTHORIZED, message);
}

/** 403 — caller is authenticated but not permitted. */
export function forbidden(message = "Forbidden."): NextResponse<ApiErrorBody> {
  return errorResponse(403, API_ERROR_CODES.FORBIDDEN, message);
}

/**
 * 404 — resource not found. Also the correct choice when a route must NOT
 * reveal that a private resource exists (privacy-preserving denial).
 */
export function notFound(message = "Not found."): NextResponse<ApiErrorBody> {
  return errorResponse(404, API_ERROR_CODES.NOT_FOUND, message);
}

/** 503 — the feature is disabled by configuration (e.g. missing secret). */
export function featureDisabled(
  message = "This feature is disabled.",
): NextResponse<ApiErrorBody> {
  return errorResponse(503, API_ERROR_CODES.FEATURE_DISABLED, message);
}

/** 400 — the request was malformed or failed validation. */
export function validationError(message: string): NextResponse<ApiErrorBody> {
  return errorResponse(400, API_ERROR_CODES.VALIDATION_ERROR, message);
}

/**
 * 429 — the caller exceeded a rate limit. Emits a `Retry-After` header (in
 * whole seconds) when a positive `retryAfterSeconds` is provided.
 */
export function tooManyRequests(
  retryAfterSeconds?: number,
  message = "Too many requests. Please wait a moment and try again.",
): NextResponse<ApiErrorBody> {
  const headers =
    typeof retryAfterSeconds === "number" && retryAfterSeconds > 0
      ? { "Retry-After": String(Math.ceil(retryAfterSeconds)) }
      : undefined;
  return errorResponse(429, API_ERROR_CODES.RATE_LIMITED, message, headers);
}
