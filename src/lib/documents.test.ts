import assert from "node:assert/strict";
import { test } from "node:test";

import { capList, DOCUMENT_LIST_LIMIT } from "./documents";

test("capList: returns all rows unchanged when under the limit", () => {
  const rows = [1, 2, 3];
  const { items, hasMore } = capList(rows, 5);
  assert.deepEqual(items, [1, 2, 3]);
  assert.equal(hasMore, false);
});

test("capList: at exactly the limit reports no more rows", () => {
  const rows = [1, 2, 3];
  const { items, hasMore } = capList(rows, 3);
  assert.deepEqual(items, [1, 2, 3]);
  assert.equal(hasMore, false);
});

test("capList: with the 'one extra' row trims to the limit and flags hasMore", () => {
  // Caller requested `take: limit + 1` and got the extra row back.
  const rows = [1, 2, 3, 4];
  const { items, hasMore } = capList(rows, 3);
  assert.deepEqual(items, [1, 2, 3]);
  assert.equal(hasMore, true);
});

test("capList: trims to the cap when far over the limit", () => {
  const rows = Array.from({ length: 10 }, (_, i) => i);
  const { items, hasMore } = capList(rows, 4);
  assert.deepEqual(items, [0, 1, 2, 3]);
  assert.equal(hasMore, true);
});

test("capList: clamps non-positive limits to zero", () => {
  assert.deepEqual(capList([1, 2], 0), { items: [], hasMore: true });
  assert.deepEqual(capList([1, 2], -5), { items: [], hasMore: true });
  assert.deepEqual(capList([], 0), { items: [], hasMore: false });
});

test("capList: clamps non-finite limits to zero", () => {
  assert.deepEqual(capList([1], Number.NaN), { items: [], hasMore: true });
  assert.deepEqual(capList([1], Number.POSITIVE_INFINITY), {
    items: [],
    hasMore: true,
  });
});

test("capList: floors fractional limits", () => {
  const { items, hasMore } = capList([1, 2, 3, 4], 2.9);
  assert.deepEqual(items, [1, 2]);
  assert.equal(hasMore, true);
});

test("DOCUMENT_LIST_LIMIT is a sane positive cap", () => {
  assert.ok(Number.isInteger(DOCUMENT_LIST_LIMIT));
  assert.ok(DOCUMENT_LIST_LIMIT > 0);
});
