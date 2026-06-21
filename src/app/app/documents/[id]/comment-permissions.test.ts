import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canDeleteComment,
  canEditComment,
  type CommentOwnership,
} from "./comment-permissions";

function comment(authorId: string): CommentOwnership {
  return { authorId };
}

// ---------------------------------------------------------------------------
// canEditComment
// ---------------------------------------------------------------------------

test("canEditComment: author can edit their own comment", () => {
  assert.equal(canEditComment("user-1", comment("user-1")), true);
});

test("canEditComment: non-author cannot edit", () => {
  assert.equal(canEditComment("user-2", comment("user-1")), false);
});

test("canEditComment: empty userId cannot edit", () => {
  assert.equal(canEditComment("", comment("user-1")), false);
});

test("canEditComment: different author IDs never match", () => {
  assert.equal(canEditComment("user-abc", comment("user-xyz")), false);
});

// ---------------------------------------------------------------------------
// canDeleteComment
// ---------------------------------------------------------------------------

test("canDeleteComment: author can delete their own comment", () => {
  assert.equal(canDeleteComment("user-1", comment("user-1")), true);
});

test("canDeleteComment: non-author cannot delete", () => {
  assert.equal(canDeleteComment("user-2", comment("user-1")), false);
});

test("canDeleteComment: empty userId cannot delete", () => {
  assert.equal(canDeleteComment("", comment("user-1")), false);
});

test("canDeleteComment: different author IDs never match", () => {
  assert.equal(canDeleteComment("user-abc", comment("user-xyz")), false);
});

test("canDeleteComment: same user can delete their own reply-style comment", () => {
  // authorId equality is the only check — no distinction between root/reply
  assert.equal(canDeleteComment("alice", comment("alice")), true);
});
