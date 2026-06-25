import assert from "node:assert/strict";
import { test } from "node:test";

import {
  documentCapabilities,
  type DocumentRoleInput,
} from "@/lib/auth/document-permissions";

import {
  decideRoomAccess,
  roomAccessDecisionToAccessDecision,
} from "./room-access";
// The collab WebSocket server is plain `.mjs`; exercise its upgrade-decision
// translation here so the whole #88 path is covered without a test framework.
import { interpretAuthorizeResponse } from "../../../scripts/collab-auth.mjs";

// ---------------------------------------------------------------------------
// Fixtures: the four canonical actors against one workspace document, mirroring
// document-permissions.test.ts. Each actor's room-access decision is derived
// end-to-end through the real permission helper + the decision function.
// ---------------------------------------------------------------------------

const OWNER = "user-owner";
const WS_OWNER = "user-ws-owner";
const EDITOR = "user-editor";
const VIEWER = "user-viewer";
const STRANGER = "user-stranger";

function workspaceDoc(): DocumentRoleInput {
  return {
    ownerId: OWNER,
    workspaceId: "ws-1",
    workspace: {
      ownerId: WS_OWNER,
      members: [
        { userId: EDITOR, role: "EDITOR" },
        { userId: VIEWER, role: "VIEWER" },
      ],
    },
  };
}

/** Convenience: the room-access decision for `userId` on the workspace doc. */
function accessFor(userId: string) {
  return decideRoomAccess(documentCapabilities(workspaceDoc(), userId));
}

// ---------------------------------------------------------------------------
// decideRoomAccess — per-role access to a writable collaboration room.
// ---------------------------------------------------------------------------

test("decideRoomAccess: owner joins read-write", () => {
  const decision = accessFor(OWNER);
  assert.deepEqual(decision, {
    ok: true,
    status: 101,
    role: "owner",
    readOnly: false,
  });
});

test("decideRoomAccess: workspace owner joins read-write", () => {
  const decision = accessFor(WS_OWNER);
  assert.equal(decision.ok, true);
  assert.equal(decision.ok && decision.readOnly, false);
});

test("decideRoomAccess: editor joins read-write", () => {
  const decision = accessFor(EDITOR);
  assert.deepEqual(decision, {
    ok: true,
    status: 101,
    role: "editor",
    readOnly: false,
  });
});

test("decideRoomAccess: viewer joins read-only", () => {
  const decision = accessFor(VIEWER);
  assert.deepEqual(decision, {
    ok: true,
    status: 101,
    role: "viewer",
    readOnly: true,
  });
});

test("decideRoomAccess: unrelated user is refused with 403", () => {
  const decision = accessFor(STRANGER);
  assert.deepEqual(decision, { ok: false, status: 403, reason: "forbidden" });
  assert.deepEqual(roomAccessDecisionToAccessDecision(decision), {
    allow: false,
    resource: { kind: "collab-room" },
    capability: "connect",
    reason: "forbidden",
    status: 403,
    safeMessage: "Forbidden.",
    concealResource: true,
  });
});

test("decideRoomAccess: missing/deleted document (none) is refused with 403", () => {
  // getDocumentCapabilities resolves a missing or soft-deleted document to the
  // `none` capability set, which must be refused like any unrelated user.
  const decision = decideRoomAccess({
    role: "none",
    canView: false,
    canEdit: false,
    canManage: false,
  });
  assert.deepEqual(decision, { ok: false, status: 403, reason: "forbidden" });
});

// ---------------------------------------------------------------------------
// interpretAuthorizeResponse — HTTP response → WebSocket upgrade decision.
// ---------------------------------------------------------------------------

test("interpretAuthorizeResponse: 200 ok read-write connects", () => {
  assert.deepEqual(interpretAuthorizeResponse(200, { ok: true }), {
    ok: true,
    status: 101,
    readOnly: false,
  });
});

test("interpretAuthorizeResponse: 200 ok read-only connects read-only", () => {
  assert.deepEqual(
    interpretAuthorizeResponse(200, { ok: true, readOnly: true }),
    { ok: true, status: 101, readOnly: true },
  );
});

test("interpretAuthorizeResponse: 401 refuses the upgrade (unauthenticated)", () => {
  assert.deepEqual(
    interpretAuthorizeResponse(401, { error: "Unauthorized." }),
    {
      ok: false,
      status: 401,
    },
  );
});

test("interpretAuthorizeResponse: 403 refuses the upgrade (no access)", () => {
  assert.deepEqual(interpretAuthorizeResponse(403, { error: "Forbidden." }), {
    ok: false,
    status: 403,
  });
});

test("interpretAuthorizeResponse: fails closed on 5xx / malformed body", () => {
  assert.deepEqual(interpretAuthorizeResponse(500, null), {
    ok: false,
    status: 403,
  });
  // 200 without an `ok` flag is treated as a denial, never a silent grant.
  assert.deepEqual(interpretAuthorizeResponse(200, { ok: false }), {
    ok: false,
    status: 403,
  });
});
