/**
 * Route-level tests for POST /api/billing/webhook (#1119).
 *
 * Canonical-shape coverage for the two app-level error responses:
 *   400 — missing stripe-signature header
 *   500 — handler threw
 *
 * The 200-when-disabled path is fully exercisable here because it fires before
 * any Stripe dependency is loaded. The 400 path requires Stripe to appear
 * "configured" (STRIPE_SECRET_KEY present) so that the guard is reached; the
 * env var is set and cleaned up within the test. The 500 path is not reachable
 * without mocking the dynamic `stripe-provider` import, so its canonical shape
 * is verified against the `serverError` helper directly.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { NextRequest } from "next/server";

import { serverError } from "@/lib/api/errors";

import { POST } from "./route";

function makeRequest(body = "{}"): NextRequest {
  return new NextRequest("http://localhost/api/billing/webhook", {
    method: "POST",
    body,
  });
}

test("billing-webhook: 200 {message:'ok'} when Stripe is not configured", async () => {
  const saved = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  try {
    const response = await POST(makeRequest());
    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, { message: "ok" });
  } finally {
    if (saved !== undefined) process.env.STRIPE_SECRET_KEY = saved;
  }
});

test("billing-webhook: 400 canonical envelope when signature header is missing", async () => {
  const saved = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_ci_placeholder";
  try {
    const response = await POST(makeRequest());
    assert.strictEqual(response.status, 400);
    const body = await response.json();
    assert.deepEqual(body, {
      error: "Missing stripe-signature header",
      code: "VALIDATION_ERROR",
    });
  } finally {
    if (saved === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = saved;
    }
  }
});

test("billing-webhook: 500 canonical envelope from serverError helper", async () => {
  // The handler uses `serverError(message)` in its catch block. Verify the
  // canonical shape directly since the dynamic stripe-provider import cannot
  // be mocked in this harness.
  const resp = serverError("Webhook handler failed");
  assert.strictEqual(resp.status, 500);
  const body = await resp.json();
  assert.deepEqual(body, {
    error: "Webhook handler failed",
    code: "SERVER_ERROR",
  });
});
