import assert from "node:assert/strict";
import { test } from "node:test";

import {
  acquirePurgeLock,
  INVITE_LINK_RETENTION_MS,
  isInviteLinkPurgeEligible,
  PURGE_MIN_INTERVAL_MS,
  resetPurgeLockForTesting,
  shouldRunPurge,
} from "./maintenance";

// ---------------------------------------------------------------------------
// shouldRunPurge
// ---------------------------------------------------------------------------

test("shouldRunPurge: never run before → should run", () => {
  assert.equal(shouldRunPurge(null, Date.now(), PURGE_MIN_INTERVAL_MS), true);
});

test("shouldRunPurge: just ran (0ms ago) → should not run", () => {
  const now = Date.now();
  assert.equal(shouldRunPurge(now, now, PURGE_MIN_INTERVAL_MS), false);
});

test("shouldRunPurge: ran just under interval ago → should not run", () => {
  const now = Date.now();
  const lastRun = now - PURGE_MIN_INTERVAL_MS + 1;
  assert.equal(shouldRunPurge(lastRun, now, PURGE_MIN_INTERVAL_MS), false);
});

test("shouldRunPurge: ran exactly interval ago → should run", () => {
  const now = Date.now();
  const lastRun = now - PURGE_MIN_INTERVAL_MS;
  assert.equal(shouldRunPurge(lastRun, now, PURGE_MIN_INTERVAL_MS), true);
});

test("shouldRunPurge: ran well past interval ago → should run", () => {
  const now = Date.now();
  const lastRun = now - PURGE_MIN_INTERVAL_MS * 3;
  assert.equal(shouldRunPurge(lastRun, now, PURGE_MIN_INTERVAL_MS), true);
});

test("shouldRunPurge: custom interval respected", () => {
  const now = 10_000;
  assert.equal(shouldRunPurge(9_500, now, 600), false); // 500ms < 600ms
  assert.equal(shouldRunPurge(9_400, now, 600), true); // 600ms >= 600ms
});

// ---------------------------------------------------------------------------
// acquirePurgeLock
// ---------------------------------------------------------------------------

test("acquirePurgeLock: first call acquires lock", () => {
  resetPurgeLockForTesting();
  assert.equal(acquirePurgeLock(1000), true);
});

test("acquirePurgeLock: second call within interval is blocked", () => {
  resetPurgeLockForTesting();
  assert.equal(acquirePurgeLock(1000), true);
  assert.equal(acquirePurgeLock(1000 + PURGE_MIN_INTERVAL_MS - 1), false);
});

test("acquirePurgeLock: call after interval elapses acquires again", () => {
  resetPurgeLockForTesting();
  assert.equal(acquirePurgeLock(1000), true);
  assert.equal(acquirePurgeLock(1000 + PURGE_MIN_INTERVAL_MS), true);
});

test("acquirePurgeLock: reset restores first-call behaviour", () => {
  resetPurgeLockForTesting();
  acquirePurgeLock(1000);
  resetPurgeLockForTesting();
  assert.equal(acquirePurgeLock(1001), true);
});

// ---------------------------------------------------------------------------
// isInviteLinkPurgeEligible
// ---------------------------------------------------------------------------

const BASE = new Date("2026-01-01T00:00:00Z");

/** Builds a fully-live invite link; override per case. */
function link(
  overrides: Partial<{
    isRevoked: boolean;
    expiresAt: Date | null;
    maxUses: number | null;
    useCount: number;
    createdAt: Date;
  }> = {},
) {
  return {
    isRevoked: false,
    expiresAt: null,
    maxUses: null,
    useCount: 0,
    createdAt: BASE,
    ...overrides,
  };
}

// Active links

test("isInviteLinkPurgeEligible: active link (no limits) → not eligible", () => {
  const now = new Date(BASE.getTime() + INVITE_LINK_RETENTION_MS * 10);
  assert.equal(isInviteLinkPurgeEligible(link(), now), false);
});

test("isInviteLinkPurgeEligible: active link within usage cap → not eligible", () => {
  const now = new Date(BASE.getTime() + INVITE_LINK_RETENTION_MS * 10);
  assert.equal(
    isInviteLinkPurgeEligible(link({ maxUses: 5, useCount: 3 }), now),
    false,
  );
});

// Revoked links

test("isInviteLinkPurgeEligible: revoked link, still within retention → not eligible", () => {
  const now = new Date(BASE.getTime() + INVITE_LINK_RETENTION_MS - 1);
  assert.equal(
    isInviteLinkPurgeEligible(link({ isRevoked: true }), now),
    false,
  );
});

test("isInviteLinkPurgeEligible: revoked link, past retention window → eligible", () => {
  const now = new Date(BASE.getTime() + INVITE_LINK_RETENTION_MS);
  assert.equal(isInviteLinkPurgeEligible(link({ isRevoked: true }), now), true);
});

// Expired links

test("isInviteLinkPurgeEligible: expired link, expiresAt anchor past retention → eligible", () => {
  const expiresAt = new Date(BASE.getTime() + 1_000); // expires 1 s after creation
  const now = new Date(expiresAt.getTime() + INVITE_LINK_RETENTION_MS);
  assert.equal(isInviteLinkPurgeEligible(link({ expiresAt }), now), true);
});

test("isInviteLinkPurgeEligible: link that expired but anchor still within retention → not eligible", () => {
  const expiresAt = new Date(BASE.getTime() + 1_000);
  const now = new Date(expiresAt.getTime() + INVITE_LINK_RETENTION_MS - 1);
  assert.equal(isInviteLinkPurgeEligible(link({ expiresAt }), now), false);
});

test("isInviteLinkPurgeEligible: not yet expired → not eligible", () => {
  const expiresAt = new Date(BASE.getTime() + 10 * 24 * 60 * 60 * 1000);
  // Use a 'now' that is 1 second before the expiry — link is still live
  const nowBefore = new Date(expiresAt.getTime() - 1000);
  assert.equal(
    isInviteLinkPurgeEligible(link({ expiresAt }), nowBefore),
    false,
  );
});

// Exhausted links

test("isInviteLinkPurgeEligible: exhausted (useCount === maxUses) past retention → eligible", () => {
  const now = new Date(BASE.getTime() + INVITE_LINK_RETENTION_MS);
  assert.equal(
    isInviteLinkPurgeEligible(link({ maxUses: 10, useCount: 10 }), now),
    true,
  );
});

test("isInviteLinkPurgeEligible: exhausted but still within retention → not eligible", () => {
  const now = new Date(BASE.getTime() + INVITE_LINK_RETENTION_MS - 1);
  assert.equal(
    isInviteLinkPurgeEligible(link({ maxUses: 10, useCount: 10 }), now),
    false,
  );
});

test("isInviteLinkPurgeEligible: useCount exceeds maxUses past retention → eligible", () => {
  const now = new Date(BASE.getTime() + INVITE_LINK_RETENTION_MS * 2);
  assert.equal(
    isInviteLinkPurgeEligible(link({ maxUses: 5, useCount: 99 }), now),
    true,
  );
});

// Edge: unlimited maxUses link that happens to be revoked

test("isInviteLinkPurgeEligible: revoked unlimited link past retention → eligible", () => {
  const now = new Date(BASE.getTime() + INVITE_LINK_RETENTION_MS + 1);
  assert.equal(
    isInviteLinkPurgeEligible(link({ isRevoked: true, maxUses: null }), now),
    true,
  );
});

// Custom retention window

test("isInviteLinkPurgeEligible: custom retention window respected", () => {
  const oneMinute = 60_000;
  const now = new Date(BASE.getTime() + oneMinute);
  assert.equal(
    isInviteLinkPurgeEligible(link({ isRevoked: true }), now, oneMinute),
    true,
  );
  assert.equal(
    isInviteLinkPurgeEligible(
      link({ isRevoked: true }),
      new Date(BASE.getTime() + oneMinute - 1),
      oneMinute,
    ),
    false,
  );
});
