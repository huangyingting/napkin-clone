import type { WorkspaceRole } from "./roles";

/**
 * Returns true when the role allows creating documents in a workspace.
 * Owners and editors may mutate; viewers and unknown values are denied.
 */
export function canCreateInWorkspace(
  role: WorkspaceRole | null | undefined,
): boolean {
  return role === "OWNER" || role === "EDITOR";
}

/**
 * Returns true when the role allows importing documents into a workspace.
 * Owners and editors may mutate; viewers and unknown values are denied.
 */
export function canImportInWorkspace(
  role: WorkspaceRole | null | undefined,
): boolean {
  return role === "OWNER" || role === "EDITOR";
}

/**
 * Returns true when the role allows renaming a workspace. Owner-only: editors,
 * viewers, non-members, and unknown values are denied.
 */
export function canRenameWorkspace(
  role: WorkspaceRole | null | undefined,
): boolean {
  return role === "OWNER";
}

/**
 * Returns true when the role allows deleting a workspace. Owner-only: editors,
 * viewers, non-members, and unknown values are denied.
 */
export function canDeleteWorkspace(
  role: WorkspaceRole | null | undefined,
): boolean {
  return role === "OWNER";
}

/**
 * Returns true when the caller may leave a workspace. Any non-owner member
 * (editor or viewer) may leave by deleting their own membership. The owner may
 * NOT leave — they must transfer ownership first — so this returns false when
 * `isOwner` is true regardless of role. Non-members (null/unknown) are denied.
 *
 * `isOwner` is derived server-side from `Workspace.ownerId`; the `role` guard
 * additionally rejects a stale `OWNER` membership row that no longer matches.
 */
export function canLeaveWorkspace(
  role: WorkspaceRole | null | undefined,
  isOwner: boolean,
): boolean {
  if (isOwner) return false;
  return role === "EDITOR" || role === "VIEWER";
}

/**
 * Returns true when the role allows transferring workspace ownership to another
 * member. Owner-only: editors, viewers, non-members, and unknown values are
 * denied.
 */
export function canTransferOwnership(
  role: WorkspaceRole | null | undefined,
): boolean {
  return role === "OWNER";
}
