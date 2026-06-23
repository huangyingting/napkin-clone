/**
 * Unit tests for the slide comment unread/read helpers.
 * DOM-free, runnable under `node --test`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { isCommentUnread } from "./slide-comment-unread";

// ---------------------------------------------------------------------------
// isCommentUnread
// ---------------------------------------------------------------------------

const USER_A = "user-a";
const USER_B = "user-b";

function makeComment(
  authorId: string,
  createdAt: Date,
): { authorId: string; createdAt: Date } {
  return { authorId, createdAt };
}

const T0 = new Date("2024-01-01T00:00:00Z");
const T1 = new Date("2024-01-01T01:00:00Z");
const T2 = new Date("2024-01-01T02:00:00Z");

// ---------------------------------------------------------------------------
// Own-comment rules
// ---------------------------------------------------------------------------

test("isCommentUnread: own comment is never unread (lastReadAt null)", () => {
  const comment = makeComment(USER_A, T1);
  assert.equal(isCommentUnread(comment, USER_A, null), false);
});

test("isCommentUnread: own comment is never unread (lastReadAt before comment)", () => {
  const comment = makeComment(USER_A, T2);
  assert.equal(isCommentUnread(comment, USER_A, T0), false);
});

test("isCommentUnread: own comment is never unread (lastReadAt after comment)", () => {
  const comment = makeComment(USER_A, T1);
  assert.equal(isCommentUnread(comment, USER_A, T2), false);
});

// ---------------------------------------------------------------------------
// Never-read rules (lastReadAt = null)
// ---------------------------------------------------------------------------

test("isCommentUnread: null lastReadAt → other user's comment is unread", () => {
  const comment = makeComment(USER_B, T1);
  assert.equal(isCommentUnread(comment, USER_A, null), true);
});

// ---------------------------------------------------------------------------
// Timestamp comparison
// ---------------------------------------------------------------------------

test("isCommentUnread: comment before lastReadAt → not unread", () => {
  const comment = makeComment(USER_B, T0);
  assert.equal(isCommentUnread(comment, USER_A, T1), false);
});

test("isCommentUnread: comment exactly at lastReadAt → not unread (equal)", () => {
  const comment = makeComment(USER_B, T1);
  assert.equal(isCommentUnread(comment, USER_A, T1), false);
});

test("isCommentUnread: comment after lastReadAt → unread", () => {
  const comment = makeComment(USER_B, T2);
  assert.equal(isCommentUnread(comment, USER_A, T1), true);
});

test("isCommentUnread: one ms after lastReadAt → unread", () => {
  const lastRead = new Date("2024-01-01T00:00:00.000Z");
  const createdAt = new Date("2024-01-01T00:00:00.001Z");
  const comment = makeComment(USER_B, createdAt);
  assert.equal(isCommentUnread(comment, USER_A, lastRead), true);
});

test("isCommentUnread: one ms before lastReadAt → not unread", () => {
  const lastRead = new Date("2024-01-01T00:00:01.000Z");
  const createdAt = new Date("2024-01-01T00:00:00.999Z");
  const comment = makeComment(USER_B, createdAt);
  assert.equal(isCommentUnread(comment, USER_A, lastRead), false);
});

// ---------------------------------------------------------------------------
// Slide-anchored comments follow the same semantics
// ---------------------------------------------------------------------------

test("isCommentUnread: slide-anchored comment from other user after lastReadAt → unread", () => {
  // Slide comments are just Comment rows — the same isCommentUnread logic applies.
  // We verify this via the same pure helper (no slideId in the record — the
  // filtering happens upstream; here we confirm the unread logic is identical).
  const comment = makeComment(USER_B, T2);
  assert.equal(isCommentUnread(comment, USER_A, T1), true);
});

test("isCommentUnread: slide-anchored comment from own user → never unread", () => {
  const comment = makeComment(USER_A, T2);
  assert.equal(isCommentUnread(comment, USER_A, T1), false);
});
