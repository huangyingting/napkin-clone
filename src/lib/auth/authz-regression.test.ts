/**
 * Cross-surface authorization regression tests (issue #458).
 *
 * These tests assert that permission checks behave correctly across all
 * document-visual surfaces: document edit/manage, deck save/patch,
 * visual mirror projection repair, version restore, share/embed/present,
 * and asset read/write.
 *
 * Tests use pure permission helpers (no DB) so they run under node:test.
 * Each test covers one denial surface to give precise regression coverage.
 */
import assert from "node:assert/strict";
import { test, describe } from "node:test";

import {
  assertCapability,
  capabilitiesForRole,
  deriveDocumentRole,
  documentCapabilities,
  DocumentPermissionError,
  type Capability,
  type DocumentRoleInput,
} from "@/lib/auth/document-permissions";

import {
  evaluateShareAccess,
  isShareAccessAllowed,
  type ShareAccessInput,
} from "@/lib/share-access";

import {
  authDiagnosticDenied,
  ERROR_CODES,
} from "@/lib/diagnostics/error-codes";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OWNER_ID = "user-owner";
const WS_OWNER_ID = "user-ws-owner";
const EDITOR_ID = "user-editor";
const VIEWER_ID = "user-viewer";
const STRANGER_ID = "user-stranger";
const DOC_ID = "doc-regression-1";

function workspaceDoc(): DocumentRoleInput {
  return {
    ownerId: OWNER_ID,
    workspaceId: "ws-regression",
    workspace: {
      ownerId: WS_OWNER_ID,
      members: [
        { userId: EDITOR_ID, role: "EDITOR" },
        { userId: VIEWER_ID, role: "VIEWER" },
      ],
    },
  };
}

function personalDoc(): DocumentRoleInput {
  return { ownerId: OWNER_ID, workspaceId: null, workspace: null };
}

function shareInput(
  overrides: Partial<ShareAccessInput> = {},
): ShareAccessInput {
  return {
    requestedShareId: "share-abc",
    shareId: "share-abc",
    isShared: true,
    deletedAt: null,
    expiresAt: null,
    embedEnabled: true,
    presentEnabled: true,
    mode: "view",
    now: new Date("2025-01-15T12:00:00Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// #458-01: Document view/edit/manage role matrix
// ---------------------------------------------------------------------------

describe("authz: document role matrix (#458)", () => {
  test("owner can view, edit, and manage", () => {
    const caps = documentCapabilities(workspaceDoc(), OWNER_ID);
    assert.equal(caps.canView, true);
    assert.equal(caps.canEdit, true);
    assert.equal(caps.canManage, true);
  });

  test("workspace owner can view, edit, and manage", () => {
    const caps = documentCapabilities(workspaceDoc(), WS_OWNER_ID);
    assert.equal(caps.canView, true);
    assert.equal(caps.canEdit, true);
    assert.equal(caps.canManage, true);
  });

  test("editor can view and edit but NOT manage", () => {
    const caps = documentCapabilities(workspaceDoc(), EDITOR_ID);
    assert.equal(caps.canView, true);
    assert.equal(caps.canEdit, true);
    assert.equal(caps.canManage, false);
  });

  test("viewer can view but NOT edit or manage", () => {
    const caps = documentCapabilities(workspaceDoc(), VIEWER_ID);
    assert.equal(caps.canView, true);
    assert.equal(caps.canEdit, false);
    assert.equal(caps.canManage, false);
  });

  test("stranger has no access to workspace document", () => {
    const caps = documentCapabilities(workspaceDoc(), STRANGER_ID);
    assert.equal(caps.canView, false);
    assert.equal(caps.canEdit, false);
    assert.equal(caps.canManage, false);
  });

  test("stranger has no access to personal document", () => {
    const caps = documentCapabilities(personalDoc(), STRANGER_ID);
    assert.equal(caps.canView, false);
    assert.equal(caps.canEdit, false);
    assert.equal(caps.canManage, false);
  });
});

// ---------------------------------------------------------------------------
// #458-02: Deck save/patch denial
// ---------------------------------------------------------------------------

describe("authz: deck save and patch denial (#458)", () => {
  test("viewer cannot edit (deck save is an edit operation)", () => {
    const caps = documentCapabilities(workspaceDoc(), VIEWER_ID);
    assert.equal(
      caps.canEdit,
      false,
      "viewer must not be able to trigger deck save",
    );
  });

  test("stranger cannot edit (deck patch denial)", () => {
    const caps = documentCapabilities(workspaceDoc(), STRANGER_ID);
    assert.equal(caps.canEdit, false);
  });

  test("assertCapability: edit throws for viewer", () => {
    const caps = documentCapabilities(workspaceDoc(), VIEWER_ID);
    assert.throws(
      () => assertCapability(caps, "edit"),
      (err: unknown) => {
        assert.ok(err instanceof DocumentPermissionError);
        assert.equal(err.capability, "edit");
        return true;
      },
    );
  });

  test("assertCapability: manage throws for editor", () => {
    const caps = documentCapabilities(workspaceDoc(), EDITOR_ID);
    assert.throws(
      () => assertCapability(caps, "manage"),
      (err: unknown) => {
        assert.ok(err instanceof DocumentPermissionError);
        assert.equal(err.capability, "manage");
        return true;
      },
    );
  });

  test("assertCapability: any capability throws for stranger (no access)", () => {
    const caps = documentCapabilities(workspaceDoc(), STRANGER_ID);
    const capabilities: Capability[] = ["view", "edit", "manage"];
    for (const cap of capabilities) {
      assert.throws(
        () => assertCapability(caps, cap),
        DocumentPermissionError,
        `stranger must be denied '${cap}'`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// #458-03: Visual mirror / projection repair denial
// ---------------------------------------------------------------------------

describe("authz: visual mirror and projection repair denial (#458)", () => {
  test("viewer cannot trigger visual mirror update (requires edit)", () => {
    const caps = documentCapabilities(workspaceDoc(), VIEWER_ID);
    // rebuildVisualMirror requires 'edit' capability
    assert.equal(caps.canEdit, false);
    assert.throws(
      () => assertCapability(caps, "edit"),
      DocumentPermissionError,
    );
  });

  test("stranger cannot trigger projection repair", () => {
    const caps = documentCapabilities(workspaceDoc(), STRANGER_ID);
    assert.throws(
      () => assertCapability(caps, "edit"),
      DocumentPermissionError,
    );
  });

  test("editor CAN trigger projection repair (requires edit)", () => {
    const caps = documentCapabilities(workspaceDoc(), EDITOR_ID);
    assert.equal(caps.canEdit, true);
    assert.doesNotThrow(() => assertCapability(caps, "edit"));
  });
});

// ---------------------------------------------------------------------------
// #458-04: Version restore denial
// ---------------------------------------------------------------------------

describe("authz: version restore denial (#458)", () => {
  test("viewer cannot restore a version (requires edit)", () => {
    const caps = documentCapabilities(workspaceDoc(), VIEWER_ID);
    assert.equal(caps.canEdit, false);
  });

  test("stranger cannot restore a version", () => {
    const caps = documentCapabilities(workspaceDoc(), STRANGER_ID);
    assert.throws(
      () => assertCapability(caps, "edit"),
      DocumentPermissionError,
    );
  });

  test("owner can restore a version", () => {
    const caps = documentCapabilities(workspaceDoc(), OWNER_ID);
    assert.doesNotThrow(() => assertCapability(caps, "edit"));
    assert.doesNotThrow(() => assertCapability(caps, "manage"));
  });
});

// ---------------------------------------------------------------------------
// #458-05: Share / embed / present access control
// ---------------------------------------------------------------------------

describe("authz: share/embed/present access rules (#458)", () => {
  test("valid shared link allows view access", () => {
    assert.equal(isShareAccessAllowed(shareInput({ mode: "view" })), true);
  });

  test("not-shared document denies all modes", () => {
    for (const mode of ["view", "embed", "present"] as const) {
      const decision = evaluateShareAccess(
        shareInput({ isShared: false, mode }),
      );
      assert.equal(decision.allow, false);
      if (!decision.allow) {
        assert.equal(decision.reason, "not-shared");
      }
    }
  });

  test("revoked share (rotated shareId) denies access", () => {
    const decision = evaluateShareAccess(
      shareInput({ requestedShareId: "old-share-id", shareId: "new-share-id" }),
    );
    assert.equal(decision.allow, false);
    if (!decision.allow) {
      assert.equal(decision.reason, "revoked");
    }
  });

  test("expired share link denies access", () => {
    const decision = evaluateShareAccess(
      shareInput({
        expiresAt: new Date("2024-01-01T00:00:00Z"),
        now: new Date("2025-01-15T12:00:00Z"),
      }),
    );
    assert.equal(decision.allow, false);
    if (!decision.allow) {
      assert.equal(decision.reason, "expired");
    }
  });

  test("embed mode denied when embedEnabled is false", () => {
    const decision = evaluateShareAccess(
      shareInput({ mode: "embed", embedEnabled: false }),
    );
    assert.equal(decision.allow, false);
    if (!decision.allow) {
      assert.equal(decision.reason, "embed-disabled");
    }
  });

  test("present mode denied when presentEnabled is false", () => {
    const decision = evaluateShareAccess(
      shareInput({ mode: "present", presentEnabled: false }),
    );
    assert.equal(decision.allow, false);
    if (!decision.allow) {
      assert.equal(decision.reason, "present-disabled");
    }
  });

  test("deleted document denies share access", () => {
    const decision = evaluateShareAccess(
      shareInput({ deletedAt: new Date("2024-06-01T00:00:00Z") }),
    );
    assert.equal(decision.allow, false);
    if (!decision.allow) {
      assert.equal(decision.reason, "deleted");
    }
  });

  test("link expiring exactly now is treated as expired (boundary inclusive)", () => {
    const now = new Date("2025-01-15T12:00:00Z");
    const decision = evaluateShareAccess(shareInput({ expiresAt: now, now }));
    // share-access uses expiresAt.getTime() <= now.getTime() → expired at boundary
    assert.equal(decision.allow, false);
    if (!decision.allow) {
      assert.equal(decision.reason, "expired");
    }
  });
});

// ---------------------------------------------------------------------------
// #458-06: Cross-document / cross-workspace isolation
// ---------------------------------------------------------------------------

describe("authz: cross-document and cross-workspace isolation (#458)", () => {
  const DOC_A_OWNER = "user-a";
  const DOC_B_OWNER = "user-b";

  function docA(): DocumentRoleInput {
    return {
      ownerId: DOC_A_OWNER,
      workspaceId: "ws-a",
      workspace: { ownerId: DOC_A_OWNER, members: [] },
    };
  }

  function docB(): DocumentRoleInput {
    return {
      ownerId: DOC_B_OWNER,
      workspaceId: "ws-b",
      workspace: { ownerId: DOC_B_OWNER, members: [] },
    };
  }

  test("owner of doc-A has no role in doc-B", () => {
    const role = deriveDocumentRole(docB(), DOC_A_OWNER);
    assert.equal(role, "none");
  });

  test("owner of doc-B cannot edit doc-A", () => {
    const caps = documentCapabilities(docA(), DOC_B_OWNER);
    assert.equal(caps.canEdit, false);
  });

  test("workspace member from ws-a has no access to ws-b document", () => {
    const wsAMember = "user-ws-a-member";
    const docInWsB: DocumentRoleInput = {
      ownerId: DOC_B_OWNER,
      workspaceId: "ws-b",
      workspace: {
        ownerId: DOC_B_OWNER,
        members: [{ userId: "user-ws-b-editor", role: "EDITOR" }],
      },
    };
    const caps = documentCapabilities(docInWsB, wsAMember);
    assert.equal(caps.canView, false);
    assert.equal(caps.canEdit, false);
  });
});

// ---------------------------------------------------------------------------
// #458-07: Diagnostics integration — PERMISSION_DENIED code
// ---------------------------------------------------------------------------

describe("authz: PERMISSION_DENIED diagnostic code (#458, #460)", () => {
  test("authDiagnosticDenied produces correct error code", () => {
    const d = authDiagnosticDenied(VIEWER_ID, DOC_ID, "edit");
    assert.equal(d.code, ERROR_CODES.PERMISSION_DENIED);
    assert.equal(d.severity, "error");
    assert.equal(d.meta.userId, VIEWER_ID);
    assert.equal(d.meta.documentId, DOC_ID);
    assert.equal(d.meta.capability, "edit");
  });

  test("PERMISSION_DENIED diagnostic has no PII fields", () => {
    const d = authDiagnosticDenied("u-1", "d-1", "manage");
    const piiKeys = new Set(["text", "content", "body", "title", "email"]);
    for (const key of Object.keys(d.meta)) {
      assert.ok(!piiKeys.has(key), `meta contains PII-risk key: ${key}`);
    }
  });

  test("DocumentPermissionError is thrown and catchable for unauthorized action", () => {
    const caps = capabilitiesForRole("none");
    let caught: unknown;
    try {
      assertCapability(caps, "view");
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof DocumentPermissionError);
    const err = caught as DocumentPermissionError;
    assert.equal(err.name, "DocumentPermissionError");
    // When canView === false, assertCapability throws with capability=null
    // (the "document not found" path hides existence from the caller)
    assert.equal(err.capability, null);
  });
});

// ---------------------------------------------------------------------------
// #458-08: Capability-role mapping completeness
// ---------------------------------------------------------------------------

describe("authz: capability–role mapping completeness (#458)", () => {
  const roles = ["owner", "editor", "viewer", "none"] as const;

  test("owner has all capabilities", () => {
    const c = capabilitiesForRole("owner");
    assert.equal(c.canView, true);
    assert.equal(c.canEdit, true);
    assert.equal(c.canManage, true);
  });

  test("editor has view + edit but not manage", () => {
    const c = capabilitiesForRole("editor");
    assert.equal(c.canView, true);
    assert.equal(c.canEdit, true);
    assert.equal(c.canManage, false);
  });

  test("viewer has view only", () => {
    const c = capabilitiesForRole("viewer");
    assert.equal(c.canView, true);
    assert.equal(c.canEdit, false);
    assert.equal(c.canManage, false);
  });

  test("none has no capabilities", () => {
    const c = capabilitiesForRole("none");
    assert.equal(c.canView, false);
    assert.equal(c.canEdit, false);
    assert.equal(c.canManage, false);
  });

  test("roles are exhaustive (all four roles covered)", () => {
    // Ensure none are missed in future refactors.
    assert.equal(roles.length, 4);
    for (const role of roles) {
      assert.doesNotThrow(() => capabilitiesForRole(role));
    }
  });
});
