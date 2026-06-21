import assert from "node:assert/strict";
import { test } from "node:test";

import {
  hasUnreadComments,
  unreadCommentCount,
  type UnreadComment,
} from "./comment-unread";

const ME = "user-me";
const OTHER = "user-other";
const THIRD = "user-third";

function comment(authorId: string, createdAt: Date | string): UnreadComment {
  return { authorId, createdAt };
}

// ---------------------------------------------------------------------------
// unreadCommentCount
// ---------------------------------------------------------------------------

test("unreadCommentCount: no comments yields zero", () => {
  assert.equal(
    unreadCommentCount({ comments: [], lastReadAt: null, currentUserId: ME }),
    0,
  );
});

test("unreadCommentCount: null lastReadAt counts all others' comments", () => {
  const comments = [
    comment(OTHER, "2026-06-21T09:00:00.000Z"),
    comment(THIRD, "2026-06-21T09:05:00.000Z"),
  ];
  assert.equal(
    unreadCommentCount({ comments, lastReadAt: null, currentUserId: ME }),
    2,
  );
});

test("unreadCommentCount: excludes the current user's own comments", () => {
  const comments = [
    comment(ME, "2026-06-21T09:00:00.000Z"),
    comment(ME, "2026-06-21T09:05:00.000Z"),
    comment(OTHER, "2026-06-21T09:10:00.000Z"),
  ];
  assert.equal(
    unreadCommentCount({ comments, lastReadAt: null, currentUserId: ME }),
    1,
  );
});

test("unreadCommentCount: counts only comments strictly after lastReadAt", () => {
  const lastReadAt = "2026-06-21T09:00:00.000Z";
  const comments = [
    comment(OTHER, "2026-06-21T08:55:00.000Z"), // before -> read
    comment(OTHER, "2026-06-21T09:00:00.000Z"), // exactly at -> read
    comment(OTHER, "2026-06-21T09:01:00.000Z"), // after -> unread
    comment(THIRD, "2026-06-21T09:30:00.000Z"), // after -> unread
  ];
  assert.equal(
    unreadCommentCount({ comments, lastReadAt, currentUserId: ME }),
    2,
  );
});

test("unreadCommentCount: own comments after lastReadAt are still excluded", () => {
  const lastReadAt = "2026-06-21T09:00:00.000Z";
  const comments = [
    comment(ME, "2026-06-21T09:10:00.000Z"),
    comment(OTHER, "2026-06-21T09:15:00.000Z"),
  ];
  assert.equal(
    unreadCommentCount({ comments, lastReadAt, currentUserId: ME }),
    1,
  );
});

test("unreadCommentCount: accepts Date instances for createdAt and lastReadAt", () => {
  const comments = [
    comment(OTHER, new Date("2026-06-21T09:01:00.000Z")),
    comment(OTHER, new Date("2026-06-21T08:00:00.000Z")),
  ];
  assert.equal(
    unreadCommentCount({
      comments,
      lastReadAt: new Date("2026-06-21T09:00:00.000Z"),
      currentUserId: ME,
    }),
    1,
  );
});

test("unreadCommentCount: zero when all unread comments are the user's own", () => {
  const comments = [
    comment(ME, "2026-06-21T09:10:00.000Z"),
    comment(ME, "2026-06-21T09:20:00.000Z"),
  ];
  assert.equal(
    unreadCommentCount({ comments, lastReadAt: null, currentUserId: ME }),
    0,
  );
});

// ---------------------------------------------------------------------------
// hasUnreadComments
// ---------------------------------------------------------------------------

test("hasUnreadComments: true when there is at least one unread comment", () => {
  const comments = [comment(OTHER, "2026-06-21T09:01:00.000Z")];
  assert.equal(
    hasUnreadComments({
      comments,
      lastReadAt: "2026-06-21T09:00:00.000Z",
      currentUserId: ME,
    }),
    true,
  );
});

test("hasUnreadComments: false when everything is read or own", () => {
  const comments = [
    comment(ME, "2026-06-21T09:10:00.000Z"),
    comment(OTHER, "2026-06-21T08:00:00.000Z"),
  ];
  assert.equal(
    hasUnreadComments({
      comments,
      lastReadAt: "2026-06-21T09:00:00.000Z",
      currentUserId: ME,
    }),
    false,
  );
});
