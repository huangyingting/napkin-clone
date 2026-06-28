/**
 * Tests for the shared API error-response helpers.
 *
 * These assert the canonical `{ error, code }` body shape and status codes so a
 * future drift (e.g. dropping `code`, re-introducing the `"Unauthorized"` vs
 * `"Unauthorized."` inconsistency) fails CI.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  API_ERROR_CODES,
  featureDisabled,
  forbidden,
  notFound,
  serverError,
  tooManyRequests,
  unauthorized,
  uploadValidationStatus,
  validationError,
  paymentRequired,
  codeForStatus,
  rawErrorResponse,
} from "./errors";

test("unauthorized: 401 with canonical body and trailing period", async () => {
  const res = unauthorized();
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), {
    error: "Unauthorized.",
    code: API_ERROR_CODES.UNAUTHORIZED,
  });
});

test("unauthorized: custom message preserved, code unchanged", async () => {
  const res = unauthorized("Sign in to continue.");
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), {
    error: "Sign in to continue.",
    code: API_ERROR_CODES.UNAUTHORIZED,
  });
});

test("forbidden: 403 with canonical body", async () => {
  const res = forbidden();
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), {
    error: "Forbidden.",
    code: API_ERROR_CODES.FORBIDDEN,
  });
});

test("notFound: 404 with canonical body (privacy-preserving denial)", async () => {
  const res = notFound();
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), {
    error: "Not found.",
    code: API_ERROR_CODES.NOT_FOUND,
  });
});

test("featureDisabled: 503 with canonical body", async () => {
  const res = featureDisabled("Collaboration flush is disabled.");
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), {
    error: "Collaboration flush is disabled.",
    code: API_ERROR_CODES.FEATURE_DISABLED,
  });
});

test("validationError: 400 with the provided message", async () => {
  const res = validationError("`text` is required.");
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), {
    error: "`text` is required.",
    code: API_ERROR_CODES.VALIDATION_ERROR,
  });
});

test("validationError: preserves validation code for non-400 validation statuses", async () => {
  const res = validationError("Unsupported file type.", 415);
  assert.equal(res.status, 415);
  assert.deepEqual(await res.json(), {
    error: "Unsupported file type.",
    code: API_ERROR_CODES.VALIDATION_ERROR,
  });
});

test("serverError: 500 with canonical body", async () => {
  const res = serverError("Server is misconfigured.");
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), {
    error: "Server is misconfigured.",
    code: API_ERROR_CODES.SERVER_ERROR,
  });
});

test("tooManyRequests: 429 with Retry-After header when positive", async () => {
  const res = tooManyRequests(12);
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("Retry-After"), "12");
  assert.deepEqual(await res.json(), {
    error: "Too many requests. Please wait a moment and try again.",
    code: API_ERROR_CODES.RATE_LIMITED,
  });
});

test("tooManyRequests: rounds fractional seconds up", () => {
  const res = tooManyRequests(0.4);
  assert.equal(res.headers.get("Retry-After"), "1");
});

test("tooManyRequests: stringifies positive integer retry seconds", () => {
  const res = tooManyRequests(2);
  assert.equal(res.headers.get("Retry-After"), "2");
});

test("tooManyRequests: preserves a custom message", async () => {
  const res = tooManyRequests(undefined, "Slow down.");
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), {
    error: "Slow down.",
    code: API_ERROR_CODES.RATE_LIMITED,
  });
});

test("tooManyRequests: omits Retry-After when not provided or non-positive", () => {
  assert.equal(tooManyRequests().headers.get("Retry-After"), null);
  assert.equal(tooManyRequests(0).headers.get("Retry-After"), null);
  assert.equal(tooManyRequests(-5).headers.get("Retry-After"), null);
  assert.equal(tooManyRequests(Number.NaN).headers.get("Retry-After"), null);
});

test("uploadValidationStatus: maps size failures to 413 and type failures to 415", () => {
  assert.equal(uploadValidationStatus({ code: "file_too_large" }), 413);
  assert.equal(uploadValidationStatus({ code: "unsupported_type" }), 415);
  assert.equal(uploadValidationStatus({ code: "type_rejected" }), 415);
});

test("paymentRequired: 402 with canonical body", async () => {
  const res = paymentRequired();
  assert.equal(res.status, 402);
  assert.deepEqual(await res.json(), {
    error: "Insufficient credits.",
    code: API_ERROR_CODES.PAYMENT_REQUIRED,
  });
});

test("rawErrorResponse: supports custom status and headers", async () => {
  const res = rawErrorResponse(418, API_ERROR_CODES.SERVER_ERROR, "Teapot.", {
    "X-Test": "yes",
  });
  assert.equal(res.status, 418);
  assert.equal(res.headers.get("X-Test"), "yes");
  assert.deepEqual(await res.json(), {
    error: "Teapot.",
    code: API_ERROR_CODES.SERVER_ERROR,
  });
});

test("codeForStatus: maps HTTP statuses to canonical codes", () => {
  assert.equal(codeForStatus(401), API_ERROR_CODES.UNAUTHORIZED);
  assert.equal(codeForStatus(402), API_ERROR_CODES.PAYMENT_REQUIRED);
  assert.equal(codeForStatus(403), API_ERROR_CODES.FORBIDDEN);
  assert.equal(codeForStatus(404), API_ERROR_CODES.NOT_FOUND);
  assert.equal(codeForStatus(429), API_ERROR_CODES.RATE_LIMITED);
  assert.equal(codeForStatus(418), API_ERROR_CODES.VALIDATION_ERROR);
  assert.equal(codeForStatus(500), API_ERROR_CODES.SERVER_ERROR);
});
