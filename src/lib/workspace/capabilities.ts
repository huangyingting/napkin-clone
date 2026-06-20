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
