import assert from "node:assert/strict";
import test from "node:test";

import {
  type RateLimitStore,
  type RateLimitWindow,
  checkRateLimitWithStore,
} from "@/lib/ai/quota";
import {
  getClientIp,
  hashIdentifier,
  rateLimitSubject,
  retryAfterSeconds,
} from "@/lib/rate-limit";

const SECRET = "rate-limit-test-secret-0987654321";

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

// ── getClientIp ─────────────────────────────────────────────────────────────

test("getClientIp returns the first x-forwarded-for entry, trimmed", () => {
  assert.equal(
    getClientIp(headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })),
    "203.0.113.7",
  );
  assert.equal(
    getClientIp(headers({ "x-forwarded-for": "  198.51.100.2  " })),
    "198.51.100.2",
  );
});

test("getClientIp falls back to x-real-ip", () => {
  assert.equal(
    getClientIp(headers({ "x-real-ip": "192.0.2.44" })),
    "192.0.2.44",
  );
});

test("getClientIp prefers x-forwarded-for over x-real-ip", () => {
  assert.equal(
    getClientIp(
      headers({ "x-forwarded-for": "203.0.113.9", "x-real-ip": "192.0.2.1" }),
    ),
    "203.0.113.9",
  );
});

test("getClientIp returns null when no forwarding headers are present", () => {
  assert.equal(getClientIp(headers({})), null);
  assert.equal(getClientIp(headers({ "x-forwarded-for": "" })), null);
});

// ── hashIdentifier ──────────────────────────────────────────────────────────

test("hashIdentifier is deterministic and fixed-length hex", () => {
  const a = hashIdentifier("203.0.113.7", SECRET);
  const b = hashIdentifier("203.0.113.7", SECRET);
  assert.equal(a, b);
  assert.equal(a.length, 32);
  assert.match(a, /^[0-9a-f]{32}$/);
});

test("hashIdentifier never echoes the raw identifier", () => {
  const ip = "203.0.113.7";
  assert.ok(!hashIdentifier(ip, SECRET).includes(ip));
});

test("hashIdentifier differs by input and by secret", () => {
  assert.notEqual(
    hashIdentifier("203.0.113.7", SECRET),
    hashIdentifier("203.0.113.8", SECRET),
  );
  assert.notEqual(
    hashIdentifier("203.0.113.7", SECRET),
    hashIdentifier("203.0.113.7", "a-different-secret"),
  );
});

// ── rateLimitSubject ────────────────────────────────────────────────────────

test("rateLimitSubject namespaces keys so limiters never collide", () => {
  const id = hashIdentifier("203.0.113.7", SECRET);
  assert.equal(rateLimitSubject("import", id), `import:${id}`);
  assert.notEqual(
    rateLimitSubject("import", id),
    rateLimitSubject("gen-anon-ip", id),
  );
});

// ── retryAfterSeconds ───────────────────────────────────────────────────────

test("retryAfterSeconds rounds up and is at least 1", () => {
  assert.equal(retryAfterSeconds(10_000, 8_500), 2);
  assert.equal(retryAfterSeconds(10_000, 9_999), 1);
  // Never returns 0 or negative even when the window has already elapsed.
  assert.equal(retryAfterSeconds(10_000, 10_000), 1);
  assert.equal(retryAfterSeconds(10_000, 20_000), 1);
});

// ── unauthenticated / limited decision logic ────────────────────────────────

function createFakeStore(): RateLimitStore & {
  readonly map: Map<string, RateLimitWindow>;
} {
  const map = new Map<string, RateLimitWindow>();
  return {
    map,
    async get(key) {
      const window = map.get(key);
      return window ? { ...window } : undefined;
    },
    async set(key, window) {
      map.set(key, { ...window });
    },
  };
}

test("anonymous per-IP throttle allows up to the limit then returns a retry-after", async () => {
  const store = createFakeStore();
  const ip = "203.0.113.7";
  const key = rateLimitSubject("gen-anon-ip", hashIdentifier(ip, SECRET));
  const opts = { limit: 2, windowMs: 1000 };

  const first = await checkRateLimitWithStore(store, key, { ...opts, now: 0 });
  assert.equal(first.allowed, true);

  const second = await checkRateLimitWithStore(store, key, {
    ...opts,
    now: 10,
  });
  assert.equal(second.allowed, true);

  const blocked = await checkRateLimitWithStore(store, key, {
    ...opts,
    now: 20,
  });
  assert.equal(blocked.allowed, false);
  assert.equal(retryAfterSeconds(blocked.resetAt, 20), 1);
});

test("per-IP throttle is not reset by minting a fresh anonymous identity", async () => {
  // Simulates clearing the signed cookie: a new anon id arrives but the server
  // window is keyed by hashed IP, so the count persists and the limit holds.
  const store = createFakeStore();
  const ip = "203.0.113.7";
  const key = rateLimitSubject("gen-anon-ip", hashIdentifier(ip, SECRET));
  const opts = { limit: 1, windowMs: 1000 };

  assert.equal(
    (await checkRateLimitWithStore(store, key, { ...opts, now: 0 })).allowed,
    true,
  );
  // "Cookie cleared" — same IP, request still blocked within the window.
  assert.equal(
    (await checkRateLimitWithStore(store, key, { ...opts, now: 100 })).allowed,
    false,
  );
});

test("different client IPs get independent windows", async () => {
  const store = createFakeStore();
  const opts = { limit: 1, windowMs: 1000, now: 0 };
  const keyA = rateLimitSubject(
    "gen-anon-ip",
    hashIdentifier("203.0.113.7", SECRET),
  );
  const keyB = rateLimitSubject(
    "gen-anon-ip",
    hashIdentifier("203.0.113.8", SECRET),
  );

  assert.equal(
    (await checkRateLimitWithStore(store, keyA, opts)).allowed,
    true,
  );
  assert.equal(
    (await checkRateLimitWithStore(store, keyB, opts)).allowed,
    true,
  );
  assert.equal(
    (await checkRateLimitWithStore(store, keyA, opts)).allowed,
    false,
  );
});
