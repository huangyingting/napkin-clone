import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canCreateInWorkspace,
  canDeleteWorkspace,
  canImportInWorkspace,
  canLeaveWorkspace,
  canRenameWorkspace,
  canTransferOwnership,
} from "./capabilities";

// ── canCreateInWorkspace ─────────────────────────────────────────────────────

test("canCreateInWorkspace: owner is allowed", () => {
  assert.equal(canCreateInWorkspace("OWNER"), true);
});

test("canCreateInWorkspace: editor is allowed", () => {
  assert.equal(canCreateInWorkspace("EDITOR"), true);
});

test("canCreateInWorkspace: viewer is denied", () => {
  assert.equal(canCreateInWorkspace("VIEWER"), false);
});

test("canCreateInWorkspace: null is denied", () => {
  assert.equal(canCreateInWorkspace(null), false);
});

test("canCreateInWorkspace: undefined is denied", () => {
  assert.equal(canCreateInWorkspace(undefined), false);
});

// ── canImportInWorkspace ─────────────────────────────────────────────────────

test("canImportInWorkspace: owner is allowed", () => {
  assert.equal(canImportInWorkspace("OWNER"), true);
});

test("canImportInWorkspace: editor is allowed", () => {
  assert.equal(canImportInWorkspace("EDITOR"), true);
});

test("canImportInWorkspace: viewer is denied", () => {
  assert.equal(canImportInWorkspace("VIEWER"), false);
});

test("canImportInWorkspace: null is denied", () => {
  assert.equal(canImportInWorkspace(null), false);
});

test("canImportInWorkspace: undefined is denied", () => {
  assert.equal(canImportInWorkspace(undefined), false);
});

// ── canRenameWorkspace (owner-only) ──────────────────────────────────────────

test("canRenameWorkspace: owner is allowed", () => {
  assert.equal(canRenameWorkspace("OWNER"), true);
});

test("canRenameWorkspace: editor is denied", () => {
  assert.equal(canRenameWorkspace("EDITOR"), false);
});

test("canRenameWorkspace: viewer is denied", () => {
  assert.equal(canRenameWorkspace("VIEWER"), false);
});

test("canRenameWorkspace: non-member (null) is denied", () => {
  assert.equal(canRenameWorkspace(null), false);
});

test("canRenameWorkspace: undefined is denied", () => {
  assert.equal(canRenameWorkspace(undefined), false);
});

// ── canDeleteWorkspace (owner-only) ──────────────────────────────────────────

test("canDeleteWorkspace: owner is allowed", () => {
  assert.equal(canDeleteWorkspace("OWNER"), true);
});

test("canDeleteWorkspace: editor is denied", () => {
  assert.equal(canDeleteWorkspace("EDITOR"), false);
});

test("canDeleteWorkspace: viewer is denied", () => {
  assert.equal(canDeleteWorkspace("VIEWER"), false);
});

test("canDeleteWorkspace: non-member (null) is denied", () => {
  assert.equal(canDeleteWorkspace(null), false);
});

test("canDeleteWorkspace: undefined is denied", () => {
  assert.equal(canDeleteWorkspace(undefined), false);
});

// ── canLeaveWorkspace (any non-owner member) ─────────────────────────────────

test("canLeaveWorkspace: owner cannot leave", () => {
  assert.equal(canLeaveWorkspace("OWNER", true), false);
});

test("canLeaveWorkspace: editor (non-owner) may leave", () => {
  assert.equal(canLeaveWorkspace("EDITOR", false), true);
});

test("canLeaveWorkspace: viewer (non-owner) may leave", () => {
  assert.equal(canLeaveWorkspace("VIEWER", false), true);
});

test("canLeaveWorkspace: non-member (null) cannot leave", () => {
  assert.equal(canLeaveWorkspace(null, false), false);
});

test("canLeaveWorkspace: undefined cannot leave", () => {
  assert.equal(canLeaveWorkspace(undefined, false), false);
});

test("canLeaveWorkspace: stale OWNER membership flagged owner cannot leave", () => {
  assert.equal(canLeaveWorkspace("OWNER", false), false);
});

test("canLeaveWorkspace: editor flagged owner cannot leave", () => {
  assert.equal(canLeaveWorkspace("EDITOR", true), false);
});

// ── canTransferOwnership (owner-only) ────────────────────────────────────────

test("canTransferOwnership: owner is allowed", () => {
  assert.equal(canTransferOwnership("OWNER"), true);
});

test("canTransferOwnership: editor is denied", () => {
  assert.equal(canTransferOwnership("EDITOR"), false);
});

test("canTransferOwnership: viewer is denied", () => {
  assert.equal(canTransferOwnership("VIEWER"), false);
});

test("canTransferOwnership: non-member (null) is denied", () => {
  assert.equal(canTransferOwnership(null), false);
});

test("canTransferOwnership: undefined is denied", () => {
  assert.equal(canTransferOwnership(undefined), false);
});
