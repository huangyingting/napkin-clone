/**
 * Centralized, role-aware document permission helper (issue #89).
 *
 * Every document mutation (and the editor UI) derives the acting user's
 * capabilities from a single place so authorization stays consistent. A user's
 * effective role for a document is derived from document ownership plus their
 * workspace membership role:
 *
 *   - owner  — owns the document, or owns/has the `OWNER` role in its workspace
 *   - editor — `EDITOR` member of the document's workspace
 *   - viewer — `VIEWER` member of the document's workspace
 *   - none   — no access at all
 *
 * Capabilities map from the role:
 *
 *   - canView   — owner | editor | viewer (read, comment, duplicate)
 *   - canEdit   — owner | editor (title, body, deck, tags, favorite)
 *   - canManage — owner only (share settings, delete, restore)
 *
 * The pure functions (`deriveDocumentRole`, `capabilitiesForRole`,
 * `documentCapabilities`, `assertCapability`) are DB-free and exhaustively unit
 * tested; the async wrappers fetch the document with the membership context and
 * apply the same logic.
 */

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

/** Effective role of a user for a single document. */
export type DocumentRole = ResourceRole;

/** A document capability that a mutation/action can require. */
export type Capability = "view" | "edit" | "manage";

/** The resolved capability set for a (user, document) pair. */
export type DocumentCapabilities = {
  role: DocumentRole;
  canView: boolean;
  canEdit: boolean;
  canManage: boolean;
};

/**
 * Minimal document shape needed to derive a role. The `workspace.members` list
 * should contain the membership row(s) for the acting user (each carrying its
 * `userId` and `role`), mirroring the relation as stored in the database.
 */
export type DocumentRoleInput = {
  ownerId: string;
  workspaceId: string | null;
  workspace: {
    ownerId: string;
    members: { userId: string; role: string }[];
  } | null;
};

/** Minimal document identity returned by the async permission lookups. */
export type DocumentIdentity = {
  id: string;
  ownerId: string;
  workspaceId: string | null;
};

/**
 * Thrown when a user attempts an action they are not authorized to perform.
 * Server actions surface this as a clear error (per issue #89 AC #4) rather than
 * a silent no-op. The `capability` is `null` for a pure "no access" (the user
 * cannot even view the document).
 */
export class DocumentPermissionError extends Error {
  readonly capability: Capability | null;
  readonly accessDecision: AccessDeniedDecision | null;

  constructor(
    message: string,
    capability: Capability | null = null,
    accessDecision: AccessDeniedDecision | null = null,
  ) {
    super(message);
    this.name = "DocumentPermissionError";
    this.capability = capability;
    this.accessDecision = accessDecision;
  }
}

/**
 * Derives the acting user's effective {@link DocumentRole} from document
 * ownership and workspace membership. Document ownership wins outright; failing
 * that, workspace ownership or an `OWNER` membership grants `owner`, an `EDITOR`
 * membership grants `editor`, and any other membership grants `viewer`. A user
 * with no relationship to the document gets `none`.
 *
 * Unknown/garbled membership role strings are coerced to the least-privilege
 * `VIEWER` via the shared {@link deriveRoleFromOwnerAndMembers} helper.
 */
export function deriveDocumentRole(
  document: DocumentRoleInput,
  userId: string,
): DocumentRole {
  if (document.ownerId === userId) {
    return "owner";
  }

  if (document.workspaceId && document.workspace) {
    return deriveRoleFromOwnerAndMembers(
      document.workspace.ownerId,
      document.workspace.members,
      userId,
    );
  }

  return "none";
}

/** Permission-builder instance for the document resource type. */
const _docBuilder = createPermissionBuilder({
  resource: "document",
  midCapKey: "canEdit" as const,
  midCapMode: "edit" as const,
  messages: {
    notFound: "Document not found.",
    midCapDenied: "You do not have permission to edit this document.",
    manageDenied: "You do not have permission to manage this document.",
  },
});

/** Maps a {@link DocumentRole} to its concrete capability flags. */
export function capabilitiesForRole(role: DocumentRole): DocumentCapabilities {
  return _docBuilder.capabilitiesForRole(role);
}

/**
 * Convenience: derive the role from a document shape and map it to capabilities
 * in one call. Pure and DB-free — used by both the editor page and the async
 * lookups.
 */
export function documentCapabilities(
  document: DocumentRoleInput,
  userId: string,
): DocumentCapabilities {
  return capabilitiesForRole(deriveDocumentRole(document, userId));
}

/**
 * Throws a {@link DocumentPermissionError} when `capabilities` does not satisfy
 * the required `capability`. A user who cannot even view the document gets the
 * generic "Document not found." message (so the action never leaks whether a
 * document exists to an unrelated user); a viewer/editor who lacks the specific
 * capability gets a clear permission error.
 */
export function assertCapability(
  capabilities: DocumentCapabilities,
  capability: Capability,
): void {
  const decision = documentCapabilityAccessDecision(capabilities, capability);
  if (decision.allow) {
    return;
  }

  const deniedCapability = capabilities.canView ? capability : null;
  throw new DocumentPermissionError(
    decision.safeMessage,
    deniedCapability,
    decision,
  );
}

/** Maps a document capability check to the shared access-decision taxonomy. */
export function documentCapabilityAccessDecision(
  capabilities: DocumentCapabilities,
  capability: Capability,
): AccessDecision {
  return _docBuilder.capabilityAccessDecision(capabilities, capability);
}

/**
 * Fetches the document (with the acting user's membership context) and resolves
 * its capabilities. Returns a `none` capability set with `document: null` when
 * the document does not exist, or when it is soft-deleted and `includeDeleted`
 * is not set. The optional `includeDeleted` flag is used by restore, which must
 * operate on soft-deleted rows.
 */
export async function getDocumentCapabilities(
  userId: string,
  documentId: string,
  options: { includeDeleted?: boolean } = {},
): Promise<DocumentCapabilities & { document: DocumentIdentity | null }> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      ownerId: true,
      workspaceId: true,
      deletedAt: true,
      workspace: {
        select: {
          ownerId: true,
          members: {
            where: { userId },
            select: { userId: true, role: true },
          },
        },
      },
    },
  });

  if (!document || (document.deletedAt && !options.includeDeleted)) {
    return { ...capabilitiesForRole("none"), document: null };
  }

  const capabilities = documentCapabilities(document, userId);
  return {
    ...capabilities,
    document: {
      id: document.id,
      ownerId: document.ownerId,
      workspaceId: document.workspaceId,
    },
  };
}

/**
 * Authorizes the current user for `capability` on a document, throwing a clear
 * {@link DocumentPermissionError} when not allowed (issue #89 AC #4). Returns
 * the document identity and resolved capabilities on success so the caller can
 * proceed with the mutation.
 */
export async function requireDocumentCapability(
  userId: string,
  documentId: string,
  capability: Capability,
  options: { includeDeleted?: boolean } = {},
): Promise<DocumentCapabilities & { document: DocumentIdentity }> {
  const result = await getDocumentCapabilities(userId, documentId, options);

  if (!result.document) {
    throw new DocumentPermissionError(
      "Document not found.",
      null,
      denyAccess({
        resource: { kind: "document" },
        capability,
        reason: "resource-not-found",
        status: 404,
        safeMessage: "Document not found.",
        concealResource: true,
      }),
    );
  }

  assertCapability(result, capability);

  return { ...result, document: result.document };
}
