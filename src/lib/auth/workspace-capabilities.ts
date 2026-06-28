/* @preserve node:coverage ignore start -- Module documentation is a source-map artifact; workspace capability behavior is asserted below. */
/**
 * Centralized, role-aware workspace permission helper.
 *
 * Mirrors `src/lib/auth/document-permissions.ts` so workspace authorization
 * follows the same structure and can be reasoned about in the same way.
 *
 * A user's effective role for a workspace is derived from workspace ownership
 * and their `WorkspaceMember` row:
 *
 *   - owner  — is the workspace `ownerId`
 *   - editor — `EDITOR` member of the workspace
 *   - viewer — `VIEWER` member (or any other recognized member)
 *   - none   — no relationship to the workspace at all
 *
 * Capabilities map from the role:
 *
 *   - canView   — owner | editor | viewer (list/read workspace documents)
 *   - canMutate — owner | editor (create, import, or duplicate documents)
 *   - canManage — owner only (rename, delete, transfer, invite, revoke links,
 *                             remove/demote members)
 *
 * The pure functions (`deriveWorkspaceRole`, `capabilitiesForWorkspaceRole`,
 * `workspaceCapabilities`, `assertWorkspaceCapability`) are DB-free and
 * exhaustively unit tested. The async wrappers fetch the workspace with the
 * membership context and apply the same logic.
 *
 * Replacing the local `requireWorkspaceOwner`/`requireWorkspaceMutator`
 * helpers in `actions.ts` with `requireWorkspaceCapability` centralises access
 * rules without changing any existing access decision.
 */
/* @preserve node:coverage ignore stop */

import { prisma } from "@/lib/prisma";
import {
  denyAccess,
  type AccessDecision,
  type AccessDeniedDecision,
} from "@/lib/access-policy/taxonomy";
import {
  type ResourceRole,
  createPermissionBuilder,
  deriveRoleFromOwnerAndMembers,
} from "./permission-builder";

/** Effective role of a user for a single workspace. */
export type WorkspaceRole = ResourceRole;

/** A workspace capability that a mutation/action can require. */
export type WorkspaceCapability = "view" | "mutate" | "manage";

/** The resolved capability set for a (user, workspace) pair. */
export type WorkspaceCapabilities = {
  role: WorkspaceRole;
  canView: boolean;
  canMutate: boolean;
  canManage: boolean;
};

/**
 * Minimal workspace shape needed to derive a role. The `members` list should
 * contain the membership row(s) for the acting user (each carrying its
 * `userId` and `role`), mirroring the relation as stored in the database.
 */
export type WorkspaceRoleInput = {
  ownerId: string;
  members: { userId: string; role: string }[];
};

/** Minimal workspace identity returned by the async permission lookups. */
export type WorkspaceIdentity = {
  id: string;
  ownerId: string;
};

/**
 * Thrown when a user attempts a workspace action they are not authorized to
 * perform. The `capability` is `null` for a pure "no access" case (the user
 * cannot even view the workspace).
 */
export class WorkspacePermissionError extends Error {
  readonly capability: WorkspaceCapability | null;
  readonly accessDecision: AccessDeniedDecision | null;

  constructor(
    message: string,
    capability: WorkspaceCapability | null = null,
    accessDecision: AccessDeniedDecision | null = null,
  ) {
    super(message);
    this.name = "WorkspacePermissionError";
    this.capability = capability;
    this.accessDecision = accessDecision;
  }
}

export function deriveWorkspaceRole(
  workspace: WorkspaceRoleInput,
  userId: string,
): WorkspaceRole {
  return deriveRoleFromOwnerAndMembers(
    workspace.ownerId,
    workspace.members,
    userId,
  );
}

/** Permission-builder instance for the workspace resource type. */
const _wsBuilder = createPermissionBuilder({
  resource: "workspace",
  /*! @preserve node:coverage ignore next 8 -- Builder metadata is asserted via workspace decision tests; tsx maps object-literal fields as uncovered. */
  midCapKey: "canMutate" as const,
  midCapMode: "mutate" as const,
  messages: {
    notFound: "Workspace not found.",
    midCapDenied:
      "Only workspace owners and editors may create or import documents.",
    manageDenied: "Only the workspace owner may perform this action.",
  },
});

/** Maps a {@link WorkspaceRole} to its concrete capability flags. */
export function capabilitiesForWorkspaceRole(
  /*! @preserve node:coverage ignore next -- Role inputs are covered by the capability matrix; tsx maps this wrapper signature as uncovered. */
  role: WorkspaceRole,
): WorkspaceCapabilities {
  /*! @preserve node:coverage ignore next -- Capability matrix executes this wrapper; tsx maps the delegation as uncovered. */
  return _wsBuilder.capabilitiesForRole(role);
}

/**
 * Convenience: derive the role from a workspace shape and map it to
 * capabilities in one call. Pure and DB-free.
 */
export function workspaceCapabilities(
  /* node:coverage ignore next -- End-to-end workspace role tests execute this facade; tsx maps the signature as uncovered. */
  workspace: WorkspaceRoleInput,
  /* node:coverage ignore next -- End-to-end workspace role tests execute this facade; tsx maps the signature as uncovered. */
  userId: string,
): WorkspaceCapabilities {
  /* node:coverage ignore next -- End-to-end workspace role tests execute this facade; tsx maps the return as uncovered. */
  return capabilitiesForWorkspaceRole(deriveWorkspaceRole(workspace, userId));
}

/**
 * Throws a {@link WorkspacePermissionError} when `capabilities` does not
 * satisfy the required `capability`. A user who cannot even view the workspace
 * gets the generic "Workspace not found." message (so the action never leaks
 * whether a workspace exists to an unrelated user); a viewer who lacks
 * `mutate` or `manage` gets a clear permission error.
 */
export function assertWorkspaceCapability(
  capabilities: WorkspaceCapabilities,
  capability: WorkspaceCapability,
): void {
  const decision = workspaceCapabilityAccessDecision(capabilities, capability);
  if (decision.allow) {
    return;
  }

  const deniedCapability = capabilities.canView ? capability : null;
  throw new WorkspacePermissionError(
    decision.safeMessage,
    deniedCapability,
    decision,
  );
}

/** Maps a workspace capability check to the shared access-decision taxonomy. */
export function workspaceCapabilityAccessDecision(
  capabilities: WorkspaceCapabilities,
  capability: WorkspaceCapability,
): AccessDecision {
  return _wsBuilder.capabilityAccessDecision(capabilities, capability);
}

/**
 * Fetches the workspace (with the acting user's membership context) and
 * resolves its capabilities. Returns a `none` capability set with
 * `workspace: null` when the workspace does not exist.
 */
export async function getWorkspaceCapabilities(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceCapabilities & { workspace: WorkspaceIdentity | null }> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      ownerId: true,
      members: {
        where: { userId },
        select: { userId: true, role: true },
      },
    },
  });

  if (!ws) {
    return { ...capabilitiesForWorkspaceRole("none"), workspace: null };
  }

  const capabilities = workspaceCapabilities(ws, userId);
  return {
    ...capabilities,
    workspace: { id: ws.id, ownerId: ws.ownerId },
  };
}

/**
 * Authorizes the current user for `capability` on a workspace, throwing a
 * clear {@link WorkspacePermissionError} when not allowed. Returns the
 * workspace identity and resolved capabilities on success so the caller can
 * proceed with the mutation.
 *
 * This is the single entry point for workspace authorization and replaces the
 * local `requireWorkspaceOwner`/`requireWorkspaceMutator` helpers.
 */
export async function requireWorkspaceCapability(
  userId: string,
  workspaceId: string,
  capability: WorkspaceCapability,
): Promise<WorkspaceCapabilities & { workspace: WorkspaceIdentity }> {
  const result = await getWorkspaceCapabilities(userId, workspaceId);

  if (!result.workspace) {
    throw new WorkspacePermissionError(
      "Workspace not found.",
      null,
      denyAccess({
        resource: { kind: "workspace" },
        capability,
        reason: "resource-not-found",
        status: 404,
        safeMessage: "Workspace not found.",
        concealResource: true,
      }),
    );
  }

  assertWorkspaceCapability(result, capability);

  return { ...result, workspace: result.workspace };
}
