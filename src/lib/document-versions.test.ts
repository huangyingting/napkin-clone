import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_DOCUMENT_VERSIONS,
  SNAPSHOT_MIN_INTERVAL_MS,
  shouldSnapshot,
  staleVersionIds,
} from "./document-versions";

const BASE = new Date("2026-06-21T09:00:00Z");

test("shouldSnapshot: no prior snapshot → true", () => {
  assert.equal(shouldSnapshot(null, BASE), true);
});

test("shouldSnapshot: within interval → false", () => {
  const now = new Date(BASE.getTime() + SNAPSHOT_MIN_INTERVAL_MS - 1);
  assert.equal(shouldSnapshot(BASE, now), false);
});

test("shouldSnapshot: exactly at interval → true", () => {
  const now = new Date(BASE.getTime() + SNAPSHOT_MIN_INTERVAL_MS);
  assert.equal(shouldSnapshot(BASE, now), true);
});

test("shouldSnapshot: past interval → true", () => {
  const now = new Date(BASE.getTime() + SNAPSHOT_MIN_INTERVAL_MS * 3);
  assert.equal(shouldSnapshot(BASE, now), true);
});

test("shouldSnapshot: force overrides throttle even within interval", () => {
  const now = new Date(BASE.getTime() + 1000);
  assert.equal(shouldSnapshot(BASE, now), false);
  assert.equal(shouldSnapshot(BASE, now, SNAPSHOT_MIN_INTERVAL_MS, true), true);
});

test("shouldSnapshot: custom interval respected", () => {
  const now = new Date(BASE.getTime() + 1000);
  assert.equal(shouldSnapshot(BASE, now, 500), true);
  assert.equal(shouldSnapshot(BASE, now, 2000), false);
});

test("staleVersionIds: fewer than keepN → none pruned", () => {
  const ids = ["c", "b", "a"];
  assert.deepEqual(staleVersionIds(ids, 30), []);
});

test("staleVersionIds: exactly keepN → none pruned", () => {
  const ids = ["c", "b", "a"];
  assert.deepEqual(staleVersionIds(ids, 3), []);
});

test("staleVersionIds: more than keepN → oldest pruned", () => {
  const ids = ["e", "d", "c", "b", "a"]; // newest-first
  assert.deepEqual(staleVersionIds(ids, 3), ["b", "a"]);
});

test("staleVersionIds: keepN <= 0 → prune all", () => {
  const ids = ["b", "a"];
  assert.deepEqual(staleVersionIds(ids, 0), ["b", "a"]);
});

test("staleVersionIds: default keep is MAX_DOCUMENT_VERSIONS", () => {
  const ids = Array.from({ length: MAX_DOCUMENT_VERSIONS + 2 }, (_, i) =>
    String(i),
  );
  const stale = staleVersionIds(ids);
  assert.equal(stale.length, 2);
  assert.deepEqual(stale, [
    String(MAX_DOCUMENT_VERSIONS),
    String(MAX_DOCUMENT_VERSIONS + 1),
  ]);
});
