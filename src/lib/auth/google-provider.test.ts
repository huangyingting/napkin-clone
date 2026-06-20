import assert from "node:assert/strict";
import { after, test } from "node:test";

import { isGoogleAuthConfigured } from "@/lib/auth/google-provider";

// isGoogleAuthConfigured reads process.env at call time, so mutating the env
// between calls exercises all branches without needing to re-import the module.

const originalClientId = process.env.GOOGLE_CLIENT_ID;
const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;

after(() => {
  // Restore original env state so other tests are unaffected.
  if (originalClientId === undefined) {
    delete process.env.GOOGLE_CLIENT_ID;
  } else {
    process.env.GOOGLE_CLIENT_ID = originalClientId;
  }
  if (originalClientSecret === undefined) {
    delete process.env.GOOGLE_CLIENT_SECRET;
  } else {
    process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
  }
});

test("returns true when both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set", () => {
  process.env.GOOGLE_CLIENT_ID = "fake-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "fake-client-secret";
  assert.equal(isGoogleAuthConfigured(), true);
});

test("returns false when GOOGLE_CLIENT_ID is missing", () => {
  delete process.env.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_SECRET = "fake-client-secret";
  assert.equal(isGoogleAuthConfigured(), false);
});

test("returns false when GOOGLE_CLIENT_SECRET is missing", () => {
  process.env.GOOGLE_CLIENT_ID = "fake-client-id";
  delete process.env.GOOGLE_CLIENT_SECRET;
  assert.equal(isGoogleAuthConfigured(), false);
});

test("returns false when both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are missing", () => {
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  assert.equal(isGoogleAuthConfigured(), false);
});

test("returns false when env vars are set to empty strings", () => {
  process.env.GOOGLE_CLIENT_ID = "";
  process.env.GOOGLE_CLIENT_SECRET = "";
  assert.equal(isGoogleAuthConfigured(), false);
});
