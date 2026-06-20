import assert from "node:assert/strict";
import { test } from "node:test";

import { getTrashStatus, SOFT_DELETE_RETENTION_MS } from "./trash";

const BASE = new Date("2025-01-15T12:00:00Z");

test("getTrashStatus: returns null when deletedAt is null", () => {
  assert.equal(getTrashStatus(null), null);
  assert.equal(getTrashStatus(null, new Date()), null);
});

test("getTrashStatus: within window → positive remainingMs, not purgeEligible", () => {
  // 1 day after deletion → 29 days remain
  const now = new Date(BASE.getTime() + 1 * 24 * 60 * 60 * 1000);
  const status = getTrashStatus(BASE, now);
  assert.notEqual(status, null);
  assert.equal(status!.purgeEligible, false);
  const expected = SOFT_DELETE_RETENTION_MS - 1 * 24 * 60 * 60 * 1000;
  assert.equal(status!.remainingMs, expected);
});

test("getTrashStatus: exactly at window boundary → purgeEligible, zero remaining", () => {
  const now = new Date(BASE.getTime() + SOFT_DELETE_RETENTION_MS);
  const status = getTrashStatus(BASE, now);
  assert.notEqual(status, null);
  assert.equal(status!.purgeEligible, true);
  assert.equal(status!.remainingMs, 0);
});

test("getTrashStatus: past window → purgeEligible, zero remaining", () => {
  // 45 days after deletion — well beyond the 30-day window
  const now = new Date(BASE.getTime() + 45 * 24 * 60 * 60 * 1000);
  const status = getTrashStatus(BASE, now);
  assert.notEqual(status, null);
  assert.equal(status!.purgeEligible, true);
  assert.equal(status!.remainingMs, 0);
});

test("getTrashStatus: at deletion moment → full window remaining", () => {
  const status = getTrashStatus(BASE, BASE);
  assert.notEqual(status, null);
  assert.equal(status!.purgeEligible, false);
  assert.equal(status!.remainingMs, SOFT_DELETE_RETENTION_MS);
});
