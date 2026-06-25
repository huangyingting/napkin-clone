import assert from "node:assert/strict";
import { test } from "node:test";

import {
  evaluateInviteAccess,
  evaluateInviteAccessDecision,
  inviteAccessDecisionToAccessDecision,
  isInviteAccessAllowed,
  isUnderUseCap,
  toInviteAccessInput,
  type InviteAccessFields,
  type InviteAccessInput,
} from "./invite-access";

const NOW = new Date("2026-06-21T00:00:00Z");

/** Builds a fully-valid, allowed invite-access input; override per case. */
function input(overrides: Partial<InviteAccessInput> = {}): InviteAccessInput {
  return {
    isRevoked: false,
    role: "EDITOR",
    expiresAt: null,
    maxUses: null,
    useCount: 0,
    now: NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// allow
// ---------------------------------------------------------------------------

test("evaluateInviteAccess: active link → allow with validated role", () => {
  assert.deepEqual(evaluateInviteAccess(input()), {
    allow: true,
    role: "EDITOR",
  });
  assert.deepEqual(evaluateInviteAccess(input({ role: "VIEWER" })), {
    allow: true,
    role: "VIEWER",
  });
});

test("evaluateInviteAccess: maxUses null → unlimited uses allowed", () => {
  assert.equal(
    isInviteAccessAllowed(input({ maxUses: null, useCount: 9999 })),
    true,
  );
});

test("evaluateInviteAccess: under the usage cap → allow", () => {
  assert.equal(isInviteAccessAllowed(input({ maxUses: 3, useCount: 2 })), true);
});

// ---------------------------------------------------------------------------
// revoked
// ---------------------------------------------------------------------------

test("evaluateInviteAccess: revoked → deny", () => {
  assert.deepEqual(evaluateInviteAccess(input({ isRevoked: true })), {
    allow: false,
    reason: "revoked",
  });

  test("invite access taxonomy maps domain deny reasons", () => {
    assert.deepEqual(
      inviteAccessDecisionToAccessDecision({
        allow: false,
        reason: "exhausted",
      }),
      {
        allow: false,
        resource: { kind: "invite" },
        capability: "accept",
        reason: "invite-exhausted",
        status: 403,
        safeMessage: "This invite link has reached its maximum number of uses.",
        concealResource: false,
      },
    );
  });

  test("evaluateInviteAccessDecision returns shared allow/deny taxonomy", () => {
    assert.deepEqual(evaluateInviteAccessDecision(input()), {
      allow: true,
      resource: { kind: "invite" },
      capability: "accept",
    });
    assert.deepEqual(evaluateInviteAccessDecision(input({ isRevoked: true })), {
      allow: false,
      resource: { kind: "invite" },
      capability: "accept",
      reason: "invite-revoked",
      status: 403,
      safeMessage: "This invite link has been revoked by a workspace owner.",
      concealResource: false,
    });
  });
});

// ---------------------------------------------------------------------------
// expiry (including boundary)
// ---------------------------------------------------------------------------

test("evaluateInviteAccess: expired (past) → deny", () => {
  const expiresAt = new Date(NOW.getTime() - 1_000);
  assert.deepEqual(evaluateInviteAccess(input({ expiresAt })), {
    allow: false,
    reason: "expired",
  });
});

test("evaluateInviteAccess: expiry boundary (expiresAt === now) → deny", () => {
  assert.deepEqual(evaluateInviteAccess(input({ expiresAt: new Date(NOW) })), {
    allow: false,
    reason: "expired",
  });
});

test("evaluateInviteAccess: not yet expired (future) → allow", () => {
  const expiresAt = new Date(NOW.getTime() + 1_000);
  assert.equal(isInviteAccessAllowed(input({ expiresAt })), true);
});

// ---------------------------------------------------------------------------
// usage cap (exhausted)
// ---------------------------------------------------------------------------

test("evaluateInviteAccess: useCount === maxUses → deny (exhausted)", () => {
  assert.deepEqual(evaluateInviteAccess(input({ maxUses: 2, useCount: 2 })), {
    allow: false,
    reason: "exhausted",
  });
});

test("evaluateInviteAccess: useCount > maxUses → deny (exhausted)", () => {
  assert.deepEqual(evaluateInviteAccess(input({ maxUses: 1, useCount: 5 })), {
    allow: false,
    reason: "exhausted",
  });
});

// ---------------------------------------------------------------------------
// server-side role validation
// ---------------------------------------------------------------------------

test("evaluateInviteAccess: OWNER role is never granted via invite → deny", () => {
  assert.deepEqual(evaluateInviteAccess(input({ role: "OWNER" })), {
    allow: false,
    reason: "invalid-role",
  });
});

test("evaluateInviteAccess: unknown/tampered role → deny", () => {
  assert.deepEqual(evaluateInviteAccess(input({ role: "SUPERADMIN" })), {
    allow: false,
    reason: "invalid-role",
  });
  assert.deepEqual(evaluateInviteAccess(input({ role: "" })), {
    allow: false,
    reason: "invalid-role",
  });
});

// ---------------------------------------------------------------------------
// precedence — revocation wins over other deny reasons
// ---------------------------------------------------------------------------

test("evaluateInviteAccess: revoked takes precedence over expiry/exhaustion", () => {
  const decision = evaluateInviteAccess(
    input({
      isRevoked: true,
      expiresAt: new Date(NOW.getTime() - 1_000),
      maxUses: 1,
      useCount: 5,
    }),
  );
  assert.deepEqual(decision, { allow: false, reason: "revoked" });
});

// ---------------------------------------------------------------------------
// toInviteAccessInput mapping
// ---------------------------------------------------------------------------

test("toInviteAccessInput: maps a selected row and threads the clock", () => {
  const row: InviteAccessFields = {
    isRevoked: false,
    role: "VIEWER",
    expiresAt: null,
    maxUses: 5,
    useCount: 1,
  };
  assert.deepEqual(toInviteAccessInput(row, NOW), {
    isRevoked: false,
    role: "VIEWER",
    expiresAt: null,
    maxUses: 5,
    useCount: 1,
    now: NOW,
  });
});

// ---------------------------------------------------------------------------
// isUnderUseCap — atomic conditional-update predicate
// ---------------------------------------------------------------------------

test("isUnderUseCap: null maxUses → always under cap (unlimited)", () => {
  assert.equal(isUnderUseCap(null, 0), true);
  assert.equal(isUnderUseCap(null, 9999), true);
});

test("isUnderUseCap: useCount strictly below maxUses → under cap", () => {
  assert.equal(isUnderUseCap(1, 0), true);
  assert.equal(isUnderUseCap(5, 4), true);
});

test("isUnderUseCap: useCount === maxUses → at cap, not under", () => {
  assert.equal(isUnderUseCap(1, 1), false);
  assert.equal(isUnderUseCap(5, 5), false);
});

test("isUnderUseCap: useCount > maxUses → over cap, not under", () => {
  assert.equal(isUnderUseCap(1, 2), false);
  assert.equal(isUnderUseCap(3, 10), false);
});
