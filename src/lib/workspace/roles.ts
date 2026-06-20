/**
 * App-level workspace role types.
 *
 * These replace the generated Prisma `WorkspaceRole` enum so the schema stays
 * portable across Postgres and SQLite (the column is a plain `String`). Because
 * the database no longer enforces the allowed set, reads should be funneled
 * through `asWorkspaceRole` at the boundary to coerce unexpected values back to
 * a known role (least-privilege fallback: `VIEWER`).
 */

const WORKSPACE_ROLES = ["OWNER", "EDITOR", "VIEWER"] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

const DEFAULT_WORKSPACE_ROLE: WorkspaceRole = "VIEWER";

/**
 * Roles that may legitimately be granted via a workspace invite link. `OWNER`
 * is intentionally excluded — ownership is established at creation and cannot be
 * handed out through an invite. Invite creation and acceptance both validate the
 * requested role against this allowlist server-side (issue #103).
 */
export const INVITABLE_WORKSPACE_ROLES = ["EDITOR", "VIEWER"] as const;

export type InvitableWorkspaceRole = (typeof INVITABLE_WORKSPACE_ROLES)[number];

/** Whether `value` is a role that an invite link is allowed to grant. */
export function isInvitableWorkspaceRole(
  value: unknown,
): value is InvitableWorkspaceRole {
  return (
    typeof value === "string" &&
    (INVITABLE_WORKSPACE_ROLES as readonly string[]).includes(value)
  );
}

function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return (
    typeof value === "string" &&
    (WORKSPACE_ROLES as readonly string[]).includes(value)
  );
}

/**
 * Coerces a raw value (e.g. a `String` role read from the database) into a known
 * `WorkspaceRole`, falling back to `DEFAULT_WORKSPACE_ROLE` for anything
 * unrecognized.
 */
export function asWorkspaceRole(value: unknown): WorkspaceRole {
  return isWorkspaceRole(value) ? value : DEFAULT_WORKSPACE_ROLE;
}
