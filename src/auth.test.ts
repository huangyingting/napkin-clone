import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

test("auth config includes Google provider when OAuth env is complete", async () => {
  process.env.AUTH_SECRET = "auth-test-secret";
  process.env.GOOGLE_CLIENT_ID = "google-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";

  const authModule = await import("@/auth");

  assert.equal(typeof authModule.auth, "function");
  assert.equal(typeof authModule.handlers.GET, "function");
  assert.equal(typeof authModule.signIn, "function");
  assert.equal(typeof authModule.signOut, "function");
});
