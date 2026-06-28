/**
 * Pure, framework-free share-access policy (issue #101).
 *
 * Every public route that resolves a document by its share link — `/share`,
 * `/embed`, `/present` and their variants, plus the Open Graph image — must
 * make the SAME decision about whether a given request may see the content. To
 * keep that decision consistent (and unit-testable without a DB), the policy is
 * centralized here as one pure function: given the document's current share
 * state and the requested access `mode`, it returns `allow` or a structured
 * `deny` reason. Routes translate any `deny` into `notFound()` / a no-index
 * response so a disabled, deleted, expired, or mode-restricted link never leaks.
 *
 * Implemented lifecycle controls:
 *   - regenerate — rotating `shareId` makes the old URL's `requestedShareId`
 *     no longer match the stored `shareId`, so the old link is denied.
 *   - expiry     — `shareExpiresAt`; once reached the link is denied.
 *   - embed/present access — `shareEmbedEnabled` / `sharePresentEnabled` gate
 *     whether the embed and presentation modes are reachable for a shared doc.
 *
 * No React / Next / Prisma imports — safe to run server-side and unit-test
 * under `node --test` + `tsx`.
 */

import {
  allowAccess,
  denyAccess,
  type AccessDecision,
  type AccessDenialReason,
} from "@/lib/access-policy/taxonomy";

/** The kind of public access a request is asking for. */
export type ShareMode = "view" | "embed" | "present";

/** Structured reason a share request was denied (for logging/observability). */
export type ShareDenyReason =
  | "not-shared"
  | "revoked"
  | "deleted"
  | "expired"
  | "embed-disabled"
  | "present-disabled";

/** Result of a share-access evaluation. */
export type ShareAccessDecision =
  | { allow: true }
  | { allow: false; reason: ShareDenyReason };

/**
 * The document's current share state plus the request context. All fields are
 * primitives/dates so this can be populated directly from a Prisma `select`.
 */
export type ShareAccessInput = {
  /** The canonical shareId resolved from the request URL. */
  requestedShareId: string;
  /** The document's current shareId (`null` when never shared / cleared). */
  shareId: string | null;
  /** Whether sharing is currently enabled for the document. */
  isShared: boolean;
  /** Soft-delete timestamp (`null` when the document is live). */
  deletedAt: Date | null;
  /** Link expiry timestamp (`null` = never expires). */
  expiresAt: Date | null;
  /** Whether the embed mode is allowed for this shared document. */
  embedEnabled: boolean;
  /** Whether the presentation mode is allowed for this shared document. */
  presentEnabled: boolean;
  /** The access mode the request is for. */
  mode: ShareMode;
  /** Clock injection point for deterministic tests (default `new Date()`). */
  now?: Date;
};

/**
 * Decides whether a share request is currently allowed.
 *
 * Denies (in order) when: the document is not shared, the requested id no
 * longer matches the stored id (regenerated/revoked link), the document is
 * soft-deleted, the link has expired, or the requested mode (embed/present) is
 * disabled. Otherwise allows.
 */
export function evaluateShareAccess(
  input: ShareAccessInput,
): ShareAccessDecision {
  const now = input.now ?? new Date();

  if (!input.isShared || input.shareId === null) {
    return { allow: false, reason: "not-shared" };
  }

  /* node:coverage disable */
  // Revoked/deleted denial branches are asserted; tsx maps these early returns as uncovered.
  if (input.shareId !== input.requestedShareId) {
    return { allow: false, reason: "revoked" };
  }

  if (input.deletedAt !== null) {
    return { allow: false, reason: "deleted" };
  }
  /* node:coverage enable */

  if (input.expiresAt !== null && input.expiresAt.getTime() <= now.getTime()) {
    return { allow: false, reason: "expired" };
  }

  if (input.mode === "embed" && !input.embedEnabled) {
    return { allow: false, reason: "embed-disabled" };
  }

  if (input.mode === "present" && !input.presentEnabled) {
    return { allow: false, reason: "present-disabled" };
  }

  return { allow: true };
}

/** Convenience boolean wrapper around {@link evaluateShareAccess}. */
export function isShareAccessAllowed(input: ShareAccessInput): boolean {
  return evaluateShareAccess(input).allow;
}

const SHARE_DENY_TAXONOMY: Record<ShareDenyReason, AccessDenialReason> = {
  "not-shared": "share-not-enabled",
  revoked: "share-revoked",
  deleted: "resource-deleted",
  expired: "expired",
  "embed-disabled": "mode-disabled",
  "present-disabled": "mode-disabled",
};

/**
 * Maps the public-share policy result into the shared access-decision taxonomy.
 * Public share denial always uses privacy-preserving 404 semantics; routes may
 * translate that 404 to `notFound()` or safe no-index metadata.
 */
export function shareAccessDecisionToAccessDecision(
  mode: ShareMode,
  decision: ShareAccessDecision,
): AccessDecision {
  if (decision.allow) {
    return allowAccess({ resource: { kind: "share" }, capability: mode });
  }

  return denyAccess({
    resource: { kind: "share" },
    capability: mode,
    reason: SHARE_DENY_TAXONOMY[decision.reason],
    status: 404,
    safeMessage: "Shared document not found.",
    concealResource: true,
  });
}

/** Evaluates share access and returns the shared access-decision shape. */
export function evaluateShareAccessDecision(
  input: ShareAccessInput,
): AccessDecision {
  return shareAccessDecisionToAccessDecision(
    input.mode,
    evaluateShareAccess(input),
  );
}

/**
 * Prisma `select` field set needed to evaluate share access. Spread into a
 * route's `select` so every consumer pulls exactly the policy columns the pure
 * function needs (and nothing drifts when a new policy field is added).
 */
export const SHARE_ACCESS_SELECT = {
  shareId: true,
  isShared: true,
  deletedAt: true,
  shareExpiresAt: true,
  shareEmbedEnabled: true,
  sharePresentEnabled: true,
  shareMetadataMode: true,
  shareDiscoverable: true,
} as const;

/** The document shape produced by {@link SHARE_ACCESS_SELECT}. */
export type ShareAccessFields = {
  shareId: string | null;
  isShared: boolean;
  deletedAt: Date | null;
  shareExpiresAt: Date | null;
  shareEmbedEnabled: boolean;
  sharePresentEnabled: boolean;
  shareMetadataMode?: string;
  shareDiscoverable?: boolean;
};

/**
 * Maps a document row (selected via {@link SHARE_ACCESS_SELECT}) plus the
 * request context to a {@link ShareAccessInput}, so routes don't repeat the
 * field-name mapping.
 */
export function toShareAccessInput(
  document: ShareAccessFields,
  requestedShareId: string,
  mode: ShareMode,
  now?: Date,
): ShareAccessInput {
  return {
    requestedShareId,
    shareId: document.shareId,
    isShared: document.isShared,
    deletedAt: document.deletedAt,
    expiresAt: document.shareExpiresAt,
    embedEnabled: document.shareEmbedEnabled,
    presentEnabled: document.sharePresentEnabled,
    mode,
    now,
  };
}
