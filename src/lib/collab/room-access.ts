/**
 * Authorization decision for collaboration WebSocket rooms (issue #88).
 *
 * Collaboration rooms are keyed by document id, so joining a room is equivalent
 * to opening the live Yjs document. This module turns a user's
 * {@link DocumentCapabilities} (derived from the shared, role-aware permission
 * helper in `@/lib/auth/document-permissions`) into a concrete connect/refuse
 * decision for the socket upgrade:
 *
 *   - no view access  → refuse the upgrade with `403` (the unrelated user / no
 *     membership case). A missing or soft-deleted document also resolves to a
 *     `none` capability set, so it is refused the same way and never leaks
 *     whether the document exists.
 *   - view but not edit → connect **read-only** (viewers): the socket receives
 *     live updates and presence but the server drops any document mutations it
 *     pushes (see `scripts/collab-core.mjs`). This mirrors the editor UI, which
 *     already renders viewers a non-editable document while still mounting the
 *     collaboration provider so they see live changes.
 *   - edit access → connect read-write (owners and editors).
 *
 * Unauthenticated requests are refused with `401` upstream (in the route /
 * upgrade handler) before this decision is reached.
 */

import type {
  DocumentCapabilities,
  DocumentRole,
} from "@/lib/auth/document-permissions";

/** The outcome of an authorization check for a collaboration room. */
export type CollabAccessDecision =
  | { ok: true; status: 101; role: DocumentRole; readOnly: boolean }
  | { ok: false; status: 401 | 403; reason: string };

/**
 * Maps a resolved {@link DocumentCapabilities} set to a room-access decision.
 * Pure and DB-free so it can be unit tested directly for every role, and reused
 * by the `/api/collab/authorize` route that the WebSocket upgrade handler calls.
 */
export function decideRoomAccess(
  capabilities: DocumentCapabilities,
): CollabAccessDecision {
  if (!capabilities.canView) {
    return { ok: false, status: 403, reason: "forbidden" };
  }

  return {
    ok: true,
    status: 101,
    role: capabilities.role,
    readOnly: !capabilities.canEdit,
  };
}
