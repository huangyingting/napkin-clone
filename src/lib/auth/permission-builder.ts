/**
 * Shared permission-builder factory (issue #1133).
 *
 * Both `document-permissions` and `workspace-capabilities` share an identical
 * algorithm:
 *
 *   1. Derive a role from an owner-id + flat member list.
 *   2. Map that role to three capability flags (canView, a mid-tier capability,
 *      and canManage) where owner gets all three, editor gets the first two,
 *      viewer gets only canView, and none gets none.
 *   3. Produce an `AccessDecision` for a capability check.
 *
 * This module provides the shared primitives so both consumers produce
 * structurally identical results from one implementation.
 *
 * `DocumentRole` and `WorkspaceRole` are aliases of `ResourceRole`; the
 * four-member union is defined once here.
 */

import { asWorkspaceRole } from "@/lib/workspace/roles";
import {
  allowAccess,
  denyAccess,
  type AccessCapabilityMode,
  type AccessDecision,
  type AccessResourceKind,
} from "@/lib/access-policy/taxonomy";

/**
 * The four effective resource roles used across all permission modules.
 * `DocumentRole` and `WorkspaceRole` are re-exported aliases of this type.
 */
export type ResourceRole = "owner" | "editor" | "viewer" | "none";

/** Membership row shape shared by both resource types. */
export type MemberRow = { userId: string; role: string };

/**
 * Derives a `ResourceRole` from a flat owner-id and member list.
 *
 * Shared implementation used by both `deriveDocumentRole` (workspace
 * membership path) and `deriveWorkspaceRole`.
 *
 * Unknown or garbled membership role strings are coerced to the
 * least-privilege `VIEWER` via {@link asWorkspaceRole}.
 */
export function deriveRoleFromOwnerAndMembers(
  ownerId: string,
  members: MemberRow[],
  userId: string,
): ResourceRole {
  if (ownerId === userId) return "owner";
  const membership = members.find((m) => m.userId === userId);
  if (membership) {
    const role = asWorkspaceRole(membership.role);
    if (role === "OWNER") return "owner";
    if (role === "EDITOR") return "editor";
    return "viewer";
  }
  return "none";
}

/**
 * Generic capability set produced by {@link createPermissionBuilder}.
 * `TMidCapKey` is the property name of the mid-tier capability
 * (e.g. `"canEdit"` or `"canMutate"`).
 */
export type ResourceCapabilities<TMidCapKey extends string> = {
  role: ResourceRole;
  canView: boolean;
  canManage: boolean;
} & Record<TMidCapKey, boolean>;

/**
 * Builds the `capabilitiesForRole` and `capabilityAccessDecision` functions for
 * a resource type.
 *
 * Parameterized by:
 * - `resource`    — the `AccessResourceKind` ("document" | "workspace")
 * - `midCapKey`   — property name of the mid-tier capability flag
 *                   (e.g. `"canEdit"` or `"canMutate"`)
 * - `midCapMode`  — the `AccessCapabilityMode` that governs the mid-tier check
 *                   (e.g. `"edit"` or `"mutate"`)
 * - `messages`    — per-resource denial messages
 */
export function createPermissionBuilder<TMidCapKey extends string>(config: {
  resource: AccessResourceKind;
  midCapKey: TMidCapKey;
  midCapMode: AccessCapabilityMode;
  messages: {
    notFound: string;
    midCapDenied: string;
    manageDenied: string;
  };
}): {
  capabilitiesForRole: (role: ResourceRole) => ResourceCapabilities<TMidCapKey>;
  capabilityAccessDecision: (
    caps: ResourceCapabilities<TMidCapKey>,
    capability: AccessCapabilityMode,
  ) => AccessDecision;
} {
  const { resource, midCapKey, midCapMode, messages } = config;

  function capabilitiesForRole(
    role: ResourceRole,
  ): ResourceCapabilities<TMidCapKey> {
    const canMid = role === "owner" || role === "editor";
    return {
      role,
      canView: role !== "none",
      [midCapKey]: canMid,
      canManage: role === "owner",
    } as ResourceCapabilities<TMidCapKey>;
  }

  function capabilityAccessDecision(
    caps: ResourceCapabilities<TMidCapKey>,
    capability: AccessCapabilityMode,
  ): AccessDecision {
    if (!caps.canView) {
      return denyAccess({
        resource: { kind: resource },
        capability,
        reason: "resource-not-found",
        status: 404,
        safeMessage: messages.notFound,
        concealResource: true,
      });
    }
    const canMid = (caps as { [K in TMidCapKey]: boolean })[midCapKey];
    if (capability === midCapMode && !canMid) {
      return denyAccess({
        resource: { kind: resource },
        capability,
        reason: "insufficient-capability",
        status: 403,
        safeMessage: messages.midCapDenied,
        concealResource: false,
      });
    }
    if (capability === "manage" && !caps.canManage) {
      return denyAccess({
        resource: { kind: resource },
        capability,
        reason: "insufficient-capability",
        status: 403,
        safeMessage: messages.manageDenied,
        concealResource: false,
      });
    }
    return allowAccess({ resource: { kind: resource }, capability });
  }

  return { capabilitiesForRole, capabilityAccessDecision };
}
