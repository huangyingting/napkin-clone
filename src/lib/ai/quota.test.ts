import assert from "node:assert/strict";
import test from "node:test";

import {
  checkRateLimit,
  newAnonState,
  parseAnonCookie,
  signAnonState,
  type RateLimitWindow,
} from "@/lib/ai/quota";

const SECRET = "test-secret-value-1234567890";

test("signAnonState / parseAnonCookie round-trips", () => {
  const state = { id: "anon-123", count: 2 };
  const cookie = signAnonState(state, SECRET);
  assert.deepEqual(parseAnonCookie(cookie, SECRET), state);
});

test("parseAnonCookie rejects a tampered payload", () => {
  const cookie = signAnonState({ id: "anon-123", count: 0 }, SECRET);
  const signature = cookie.slice(cookie.lastIndexOf(".") + 1);
  const forgedPayload = Buffer.from(
    JSON.stringify({ id: "anon-123", count: 99 }),
  ).toString("base64url");
  const tampered = `${forgedPayload}.${signature}`;
  assert.equal(parseAnonCookie(tampered, SECRET), null);
});

test("parseAnonCookie rejects a cookie signed with a different secret", () => {
  const cookie = signAnonState({ id: "anon-123", count: 1 }, SECRET);
  assert.equal(parseAnonCookie(cookie, "a-different-secret"), null);
});

test("parseAnonCookie rejects malformed or missing values", () => {
  assert.equal(parseAnonCookie(undefined, SECRET), null);
  assert.equal(parseAnonCookie(null, SECRET), null);
  assert.equal(parseAnonCookie("", SECRET), null);
  assert.equal(parseAnonCookie("no-separator", SECRET), null);
  assert.equal(parseAnonCookie("not.base64", SECRET), null);
});

test("newAnonState starts at zero with a unique non-empty id", () => {
  const a = newAnonState();
  const b = newAnonState();
  assert.equal(a.count, 0);
  assert.ok(a.id.length > 0);
  assert.notEqual(a.id, b.id);
});

test("checkRateLimit allows up to the limit then blocks within the window", () => {
  const store = new Map<string, RateLimitWindow>();
  const base = { limit: 2, windowMs: 1000 };

  const first = checkRateLimit(store, "user-1", { ...base, now: 0 });
  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 1);

  const second = checkRateLimit(store, "user-1", { ...base, now: 100 });
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 0);

  const third = checkRateLimit(store, "user-1", { ...base, now: 200 });
  assert.equal(third.allowed, false);
  assert.equal(third.remaining, 0);
});

test("checkRateLimit resets after the window elapses", () => {
  const store = new Map<string, RateLimitWindow>();
  const base = { limit: 1, windowMs: 1000 };

  assert.equal(
    checkRateLimit(store, "user-1", { ...base, now: 0 }).allowed,
    true,
  );
  assert.equal(
    checkRateLimit(store, "user-1", { ...base, now: 500 }).allowed,
    false,
  );
  assert.equal(
    checkRateLimit(store, "user-1", { ...base, now: 1000 }).allowed,
    true,
  );
});

test("checkRateLimit isolates different keys", () => {
  const store = new Map<string, RateLimitWindow>();
  const base = { limit: 1, windowMs: 1000, now: 0 };
  assert.equal(checkRateLimit(store, "user-a", base).allowed, true);
  assert.equal(checkRateLimit(store, "user-b", base).allowed, true);
  assert.equal(checkRateLimit(store, "user-a", base).allowed, false);
});
