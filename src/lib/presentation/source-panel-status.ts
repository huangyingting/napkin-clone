/**
 * Pure decision logic for the per-element Source panel (#644).
 *
 * The inspector renders a status label + a set of command-backed actions
 * (update / unlink / relink) for the selected element's source link. Keeping
 * the decision here — separate from the React component — makes the behaviour
 * unit-testable without a DOM and keeps the panel a thin view.
 */

import type { StaleReason } from "./source-link-staleness";

/** Coarse provenance state surfaced in the Source panel. */
export type SourcePanelStatus =
  /** No `sourceRef` at all — the element was never linked. */
  | "standalone"
  /** Had a link that was intentionally unlinked (`sourceRef.unlinked`). */
  | "unlinked"
  /** Linked, but the source block can no longer be found. */
  | "source_missing"
  /** Linked, but the source block content changed since last sync. */
  | "stale"
  /** Linked and matching the source block. */
  | "linked";

/** Inputs describing the selected element's source link. */
export interface SourceLinkState {
  /** Whether the element carries a `sourceRef` at all. */
  hasSourceRef: boolean;
  /** Whether that ref is marked `unlinked`. */
  unlinked: boolean;
  /** Stale reason for the element, when the link is stale; else undefined. */
  staleReason?: StaleReason;
}

/** Resolves the coarse {@link SourcePanelStatus} from a link state. */
export function resolveSourcePanelStatus(
  state: SourceLinkState,
): SourcePanelStatus {
  if (!state.hasSourceRef) return "standalone";
  if (state.unlinked) return "unlinked";
  if (state.staleReason === "block_missing") return "source_missing";
  if (state.staleReason === "content_changed") return "stale";
  return "linked";
}

/** Which Source-panel actions are valid for a given status. */
export interface SourcePanelActions {
  /** Pull fresh content from the source block (only when content drifted). */
  canUpdate: boolean;
  /** Detach a live link, keeping the element as standalone content. */
  canUnlink: boolean;
  /** Re-establish a previously unlinked ref. */
  canRelink: boolean;
}

/**
 * Maps a status to its allowed actions. A "source_missing" (orphaned) link
 * deliberately offers unlink rather than a dead "update" action; an unlinked
 * ref offers relink rather than unlink.
 */
export function resolveSourcePanelActions(
  status: SourcePanelStatus,
): SourcePanelActions {
  switch (status) {
    case "standalone":
      return { canUpdate: false, canUnlink: false, canRelink: false };
    case "unlinked":
      return { canUpdate: false, canUnlink: false, canRelink: true };
    case "source_missing":
      return { canUpdate: false, canUnlink: true, canRelink: false };
    case "stale":
      return { canUpdate: true, canUnlink: true, canRelink: false };
    case "linked":
      return { canUpdate: false, canUnlink: true, canRelink: false };
  }
}
