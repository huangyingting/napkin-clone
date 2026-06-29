/**
 * Pure decision logic for the per-element Visual panel (#644).
 *
 * The inspector renders a status label + a set of command-backed actions
 * (update / unlink / relink) for the selected element's document link. Keeping
 * the decision here — separate from the React component — makes the behaviour
 * unit-testable without a DOM and keeps the panel a thin view.
 */

import type { StaleReason } from "./source-link-staleness";

/** Coarse provenance state surfaced in the Visual panel. */
export type VisualPanelStatus =
  /** No `sourceRef` at all — the element was never linked. */
  | "standalone"
  /** Had a link that was intentionally unlinked (`sourceRef.unlinked`). */
  | "unlinked"
  /** Linked, but the source block can no longer be found. */
  | "visual_missing"
  /** Linked, but the source block content changed since last sync. */
  | "stale"
  /** Linked and matching the source block. */
  | "linked";

/** Inputs describing the selected element's document link. */
export interface VisualLinkState {
  /** Whether the element carries a `sourceRef` at all. */
  hasSourceRef: boolean;
  /** Whether that ref is marked `unlinked`. */
  unlinked: boolean;
  /** Stale reason for the element, when the link is stale; else undefined. */
  staleReason?: StaleReason;
}

/** Resolves the coarse {@link VisualPanelStatus} from a link state. */
export function resolveVisualPanelStatus(
  state: VisualLinkState,
): VisualPanelStatus {
  if (!state.hasSourceRef) return "standalone";
  if (state.unlinked) return "unlinked";
  if (state.staleReason === "block_missing") return "visual_missing";
  if (state.staleReason === "content_changed") return "stale";
  return "linked";
}

/** Which Visual-panel actions are valid for a given status. */
export interface VisualPanelActions {
  /** Pull fresh content from the linked block (only when content drifted). */
  canUpdate: boolean;
  /** Detach a live link, keeping the element as standalone content. */
  canUnlink: boolean;
  /** Re-establish a previously unlinked ref. */
  canRelink: boolean;
}

/**
 * Maps a status to its allowed actions. A "visual_missing" (orphaned) link
 * deliberately offers unlink rather than a dead "update" action; an unlinked
 * ref offers relink rather than unlink.
 */
export function resolveVisualPanelActions(
  status: VisualPanelStatus,
): VisualPanelActions {
  switch (status) {
    case "standalone":
      return { canUpdate: false, canUnlink: false, canRelink: false };
    case "unlinked":
      return { canUpdate: false, canUnlink: false, canRelink: true };
    case "visual_missing":
      return { canUpdate: false, canUnlink: true, canRelink: false };
    case "stale":
      return { canUpdate: true, canUnlink: true, canRelink: false };
    case "linked":
      return { canUpdate: false, canUnlink: true, canRelink: false };
  }
}
