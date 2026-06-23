/**
 * Centralized, role-aware workspace permission helper (issue #483).
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
 * rules without changing any existing access decision (#483 AC: refactor only,
 * no policy change).
 */

import { prisma } from "@/lib/prisma";
import { asWorkspaceRole } from "@/lib/workspace/roles";

/** Effective role of a user for a single workspace. */
export type WorkspaceRole = "owner" | "editor" | "viewer" | "none";

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

  constructor(message: string, capability: WorkspaceCapability | null = null) {
    super(message);
    this.name = "WorkspacePermissionError";
    this.capability = capability;
  }
}

/**
 * Derives the acting user's effective {@link WorkspaceRole} from workspace
 * ownership and membership. Workspace ownership wins outright; failing that, an
 * `EDITOR` member gets `editor`, any other member (VIEWER, unknown) gets
 * `viewer`, and a user with no relationship gets `none`.
 *
 * Unknown/garbled membership role strings are coerced to the least-privilege
 * `VIEWER` via {@link asWorkspaceRole}.
 */
export function deriveWorkspaceRole(
  workspace: WorkspaceRoleInput,
  userId: string,
): WorkspaceRole {
  if (workspace.ownerId === userId) {
    return "owner";
  }

  const membership = workspace.members.find(
    (member) => member.userId === userId,
  );
  if (membership) {
    const role = asWorkspaceRole(membership.role);
    if (role === "OWNER") {
      // OWNER role in a member row is treated as workspace owner (same as
      // document-permissions.ts treats OWNER-role members).
      return "owner";
    }
    if (role === "EDITOR") {
      return "editor";
    }
    return "viewer";
  }

  return "none";
}

/** Maps a {@link WorkspaceRole} to its concrete capability flags. */
export function capabilitiesForWorkspaceRole(
  role: WorkspaceRole,
): WorkspaceCapabilities {
  switch (role) {
    case "owner":
      return { role, canView: true, canMutate: true, canManage: true };
    case "editor":
      return { role, canView: true, canMutate: true, canManage: false };
    case "viewer":
      return { role, canView: true, canMutate: false, canManage: false };
    default:
      return {
        role: "none",
        canView: false,
        canMutate: false,
        canManage: false,
      };
  }
}

/**
 * Convenience: derive the role from a workspace shape and map it to
 * capabilities in one call. Pure and DB-free.
 */
export function workspaceCapabilities(
  workspace: WorkspaceRoleInput,
  userId: string,
): WorkspaceCapabilities {
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
  if (!capabilities.canView) {
    throw new WorkspacePermissionError("Workspace not found.", null);
  }
  if (capability === "mutate" && !capabilities.canMutate) {
    throw new WorkspacePermissionError(
      "Only workspace owners and editors may create or import documents.",
      "mutate",
    );
  }
  if (capability === "manage" && !capabilities.canManage) {
    throw new WorkspacePermissionError(
      "Only the workspace owner may perform this action.",
      "manage",
    );
  }
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
 * local `requireWorkspaceOwner`/`requireWorkspaceMutator` helpers (issue #483).
 */
export async function requireWorkspaceCapability(
  userId: string,
  workspaceId: string,
  capability: WorkspaceCapability,
): Promise<WorkspaceCapabilities & { workspace: WorkspaceIdentity }> {
  const result = await getWorkspaceCapabilities(userId, workspaceId);

  if (!result.workspace) {
    throw new WorkspacePermissionError("Workspace not found.", null);
  }

  assertWorkspaceCapability(result, capability);

  return { ...result, workspace: result.workspace };
}
