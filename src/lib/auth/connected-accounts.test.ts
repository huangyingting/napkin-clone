import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveConnectedAccounts,
  isGoogleLinkedImage,
} from "@/lib/auth/connected-accounts";

test("isGoogleLinkedImage recognises Google-hosted avatar URLs", () => {
  assert.equal(
    isGoogleLinkedImage("https://lh3.googleusercontent.com/a/abc123"),
    true,
  );
  assert.equal(
    isGoogleLinkedImage("https://lh5.googleusercontent.com/-xyz/photo.jpg"),
    true,
  );
});

test("isGoogleLinkedImage rejects non-Google, empty, and malformed values", () => {
  assert.equal(isGoogleLinkedImage(null), false);
  assert.equal(isGoogleLinkedImage(undefined), false);
  assert.equal(isGoogleLinkedImage(""), false);
  assert.equal(isGoogleLinkedImage("not-a-url"), false);
  assert.equal(
    isGoogleLinkedImage("https://www.gravatar.com/avatar/abc"),
    false,
  );
  // Must not be fooled by a lookalike host that only contains the substring.
  assert.equal(
    isGoogleLinkedImage("https://googleusercontent.com.evil.example/a"),
    false,
  );
});

test("derives password connected from hasPassword", () => {
  const accounts = deriveConnectedAccounts({
    hasPassword: true,
    image: null,
    googleConfigured: false,
  });
  const password = accounts.find((a) => a.provider === "password");
  assert.deepEqual(password, {
    provider: "password",
    label: "Email & password",
    connected: true,
    available: true,
  });
});

test("derives google connected from a Google-hosted avatar", () => {
  const accounts = deriveConnectedAccounts({
    hasPassword: false,
    image: "https://lh3.googleusercontent.com/a/abc123",
    googleConfigured: true,
  });
  const google = accounts.find((a) => a.provider === "google");
  assert.equal(google?.connected, true);
  assert.equal(google?.available, true);
});

test("google is unavailable when not configured and not connected", () => {
  const accounts = deriveConnectedAccounts({
    hasPassword: true,
    image: null,
    googleConfigured: false,
  });
  const google = accounts.find((a) => a.provider === "google");
  assert.equal(google?.connected, false);
  assert.equal(google?.available, false);
});

test("a linked Google account stays available even if OAuth is later disabled", () => {
  const accounts = deriveConnectedAccounts({
    hasPassword: false,
    image: "https://lh3.googleusercontent.com/a/abc123",
    googleConfigured: false,
  });
  const google = accounts.find((a) => a.provider === "google");
  assert.equal(google?.connected, true);
  assert.equal(google?.available, true);
});

test("returns password first then google in a stable order", () => {
  const accounts = deriveConnectedAccounts({
    hasPassword: true,
    image: "https://lh3.googleusercontent.com/a/abc123",
    googleConfigured: true,
  });
  assert.deepEqual(
    accounts.map((a) => a.provider),
    ["password", "google"],
  );
});
