import assert from "node:assert/strict";
import { test } from "node:test";

import { canCreateInWorkspace, canImportInWorkspace } from "./capabilities";

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
