/**
 * Shared API error-response helpers.
 *
 * These helpers give every app-gated route one canonical shape so clients and
 * logs can rely on it:
 *
 *   `NextResponse.json({ error, code }, { status })`
 *
 * The canonical helpers below include both fields: `error` is the
 * human-readable message (unchanged for callers that already read it); `code` is
 * a STABLE machine-readable identifier that UIs and log pipelines can branch on
 * without string-matching prose.
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
  SERVER_ERROR: "SERVER_ERROR",
  PAYMENT_REQUIRED: "PAYMENT_REQUIRED",
} as const;

export type ApiErrorCode =
  (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

/** The canonical JSON body every helper emits. */
export interface ApiErrorBody {
  error: string;
  code: ApiErrorCode;
}

function errorResponse(
  status: number,
  code: ApiErrorCode,
  message: string,
  headers?: Record<string, string>,
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: message, code }, { status, headers });
}

/**
 * Escape hatch for routes that need a status code not covered by the named
 * helpers below. Prefer a named helper when one exists.
 */
export { errorResponse as rawErrorResponse };

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

/** 500 — unexpected server-side failure or misconfiguration. */
export function serverError(message: string): NextResponse<ApiErrorBody> {
  return errorResponse(500, API_ERROR_CODES.SERVER_ERROR, message);
}

/** 400 — the request was malformed or failed validation. */
export function validationError(
  message: string,
  status = 400,
): NextResponse<ApiErrorBody> {
  return errorResponse(status, API_ERROR_CODES.VALIDATION_ERROR, message);
}

/** 429 — includes `Retry-After` when positive seconds are provided. */
export function tooManyRequests(
  retryAfterSeconds?: number,
  message?: string,
): NextResponse<ApiErrorBody> {
  /*! @preserve node:coverage ignore next 4 -- Retry-After branches are asserted directly; tsx maps this conditional initializer as uncovered. */
  const headers =
    typeof retryAfterSeconds === "number" && retryAfterSeconds > 0
      ? { "Retry-After": String(Math.ceil(retryAfterSeconds)) }
      : undefined;

  return errorResponse(
    429,
    API_ERROR_CODES.RATE_LIMITED,
    message ?? "Too many requests. Please wait a moment and try again.",
    headers,
  );
}

/** 402 — the caller lacks sufficient credits to perform the operation. */
export function paymentRequired(
  message = "Insufficient credits.",
): NextResponse<ApiErrorBody> {
  return errorResponse(402, API_ERROR_CODES.PAYMENT_REQUIRED, message);
}

/**
 * Maps an HTTP status code to the best-fit ApiErrorCode.
 * Use this when you have a dynamic status (e.g. from a user-supplied error
 * mapping) and no explicit code is provided.
 */
export function codeForStatus(status: number): ApiErrorCode {
  if (status === 401) return API_ERROR_CODES.UNAUTHORIZED;
  if (status === 402) return API_ERROR_CODES.PAYMENT_REQUIRED;
  if (status === 403) return API_ERROR_CODES.FORBIDDEN;
  if (status === 404) return API_ERROR_CODES.NOT_FOUND;
  if (status === 429) return API_ERROR_CODES.RATE_LIMITED;
  if (status >= 400 && status < 500) return API_ERROR_CODES.VALIDATION_ERROR;
  return API_ERROR_CODES.SERVER_ERROR;
}
