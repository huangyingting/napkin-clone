import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ABUSE_BUDGET_NAMESPACES,
  InMemoryAbuseBudgetStore,
  abuseBudgetSubject,
  assertUniqueAbuseBudgetNamespaces,
  checkAbuseBudget,
} from "@/lib/abuse-budget";

const SECRET = "abuse-budget-test-secret";

test("abuse-budget registry namespaces are unique and documented", () => {
  assert.doesNotThrow(() => assertUniqueAbuseBudgetNamespaces());
  for (const entry of ABUSE_BUDGET_NAMESPACES) {
    assert.match(entry.namespace, /^[a-z0-9.-]+$/);
    assert.ok(entry.owner);
    assert.ok(entry.rationale);
    assert.ok(entry.limitEnv);
    assert.ok(entry.windowEnv);
    assert.ok(entry.defaultLimit > 0);
    assert.ok(entry.defaultWindowMs > 0);
  }
});

test("assertUniqueAbuseBudgetNamespaces rejects drift duplicates", () => {
  assert.throws(
    () =>
      assertUniqueAbuseBudgetNamespaces([
        { namespace: "auth.login.email" },
        { namespace: "auth.login.email" },
      ]),
    /Duplicate abuse-budget namespace: auth\.login\.email/,
  );
});

test("abuseBudgetSubject hashes raw subjects and namespaces keys", () => {
  const subject = abuseBudgetSubject(
    "auth.login.email",
    "person@example.com",
    SECRET,
  );

  assert.equal(subject.subjectHash.length, 32);
  assert.ok(!subject.key.includes("person@example.com"));
  assert.equal(subject.key, `auth.login.email:${subject.subjectHash}`);
});

test("checkAbuseBudget works with deterministic in-memory store", async () => {
  process.env.AUTH_LOGIN_RATE_LIMIT = "2";
  process.env.AUTH_LOGIN_RATE_WINDOW_MS = "1000";
  try {
    const store = new InMemoryAbuseBudgetStore();
    const base = {
      namespace: "auth.login.email" as const,
      subject: "person@example.com",
      secret: SECRET,
      store,
    };

    assert.equal((await checkAbuseBudget({ ...base, now: 0 })).allowed, true);
    assert.equal((await checkAbuseBudget({ ...base, now: 10 })).allowed, true);
    const blocked = await checkAbuseBudget({ ...base, now: 20 });
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.retryAfterSeconds, 1);
  } finally {
    delete process.env.AUTH_LOGIN_RATE_LIMIT;
    delete process.env.AUTH_LOGIN_RATE_WINDOW_MS;
  }
});
