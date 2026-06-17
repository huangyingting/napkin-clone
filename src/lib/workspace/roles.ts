/**
 * App-level workspace role types.
 *
 * These replace the generated Prisma `WorkspaceRole` enum so the schema stays
 * portable across Postgres and SQLite (the column is a plain `String`). Because
 * the database no longer enforces the allowed set, reads should be funneled
 * through `asWorkspaceRole` at the boundary to coerce unexpected values back to
 * a known role (least-privilege fallback: `VIEWER`).
 */

export const WORKSPACE_ROLES = ["OWNER", "EDITOR", "VIEWER"] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const DEFAULT_WORKSPACE_ROLE: WorkspaceRole = "VIEWER";

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
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
