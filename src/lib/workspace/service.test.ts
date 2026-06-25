import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_INVITE_EXPIRY_DAYS,
  MAX_INVITE_USES_LIMIT,
  MAX_WORKSPACE_NAME_LENGTH,
  assertInvitableWorkspaceRole,
  normalizeInviteExpiry,
  normalizeInviteMaxUses,
  normalizeWorkspaceName,
} from "./service";

const NOW = new Date("2026-06-25T00:00:00Z");

test("normalizeInviteExpiry returns null for omitted/null expiry", () => {
  assert.equal(normalizeInviteExpiry(undefined, NOW), null);
  assert.equal(normalizeInviteExpiry(null, NOW), null);
});

test("normalizeInviteExpiry computes expiry from the server clock", () => {
  assert.equal(
    normalizeInviteExpiry(2, NOW)?.toISOString(),
    "2026-06-27T00:00:00.000Z",
  );
});

test("normalizeInviteExpiry rejects invalid windows", () => {
  for (const value of [0, -1, Number.NaN, MAX_INVITE_EXPIRY_DAYS + 1]) {
    assert.throws(() => normalizeInviteExpiry(value, NOW), /Invalid invite/);
  }
});

test("normalizeInviteMaxUses returns null for omitted/null caps", () => {
  assert.equal(normalizeInviteMaxUses(undefined), null);
  assert.equal(normalizeInviteMaxUses(null), null);
});

test("normalizeInviteMaxUses validates integer usage caps", () => {
  assert.equal(normalizeInviteMaxUses(1), 1);
  assert.equal(normalizeInviteMaxUses(MAX_INVITE_USES_LIMIT), 10_000);

  for (const value of [0, -1, 1.5, MAX_INVITE_USES_LIMIT + 1]) {
    assert.throws(() => normalizeInviteMaxUses(value), /Invalid invite/);
  }
});

test("normalizeWorkspaceName trims, caps, and rejects empty names", () => {
  assert.equal(normalizeWorkspaceName("  Team  "), "Team");
  assert.equal(
    normalizeWorkspaceName("x".repeat(MAX_WORKSPACE_NAME_LENGTH + 1)).length,
    MAX_WORKSPACE_NAME_LENGTH,
  );
  assert.throws(() => normalizeWorkspaceName("   "), /Workspace name/);
});

test("assertInvitableWorkspaceRole accepts only invite-grantable roles", () => {
  assert.doesNotThrow(() => assertInvitableWorkspaceRole("EDITOR"));
  assert.doesNotThrow(() => assertInvitableWorkspaceRole("VIEWER"));
  assert.throws(() => assertInvitableWorkspaceRole("OWNER"), /Invalid invite/);
});
