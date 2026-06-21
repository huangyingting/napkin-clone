/**
 * Pure, headless helpers for the slide editor's save-status feedback (issue
 * #208).
 *
 * These mirror the document editor's autosave model (`SaveStatus` /
 * `STATUS_LABEL` in `lexical-editor.tsx`): a debounced autosave persists deck
 * edits a short while after the user stops editing, an explicit Save button
 * flushes immediately, and a status badge reflects the current persistence
 * state. The logic that maps the editor's `dirty` / `saving` / `error` booleans
 * to a single {@link SaveStatus}, and the decision of whether a given deck
 * change should schedule an autosave, are factored out here so they can be
 * unit-tested with no DOM, React or browser dependencies.
 */

import type { Deck } from "./deck";

/** The four save states surfaced to the user, mirroring the document editor. */
export type SaveStatus = "saved" | "pending" | "saving" | "error";

/**
 * User-facing labels for each {@link SaveStatus}. Mirrors the document editor's
 * `STATUS_LABEL`; the error label doubles as the affordance for the Retry
 * action, which re-runs the same save path.
 */
export const SAVE_STATUS_LABEL: Record<SaveStatus, string> = {
  saved: "All changes saved",
  pending: "Unsaved changes…",
  saving: "Saving…",
  error: "Couldn't save — Retry",
};

/** How long to wait after the last deck edit before autosaving. */
export const SLIDE_SAVE_DEBOUNCE_MS = 1500;

/** The editor flags the status badge is derived from. */
export interface SaveStatusInputs {
  /** True once a real user edit has happened and is not yet persisted. */
  isDirty: boolean;
  /** True while a save (autosave or manual flush) is in flight. */
  isSaving: boolean;
  /** True when the last save attempt failed. */
  hasError: boolean;
}

/**
 * Resolves the editor flags into a single {@link SaveStatus}.
 *
 * Precedence mirrors the document editor: a failed save wins (so the Retry
 * affordance stays visible), then an in-flight save, then unsaved edits, and
 * finally the resting "all saved" state.
 */
export function resolveSaveStatus({
  isDirty,
  isSaving,
  hasError,
}: SaveStatusInputs): SaveStatus {
  if (hasError) {
    return "error";
  }
  if (isSaving) {
    return "saving";
  }
  if (isDirty) {
    return "pending";
  }
  return "saved";
}

/** Inputs to the autosave scheduling decision. */
export interface AutosaveDecisionInputs {
  /** The deck the editor is currently showing. */
  current: Deck;
  /**
   * The last deck the editor observed, or `null` before any has been seen.
   * `null` means this is the initial load / first render.
   */
  lastSeen: Deck | null;
}

/**
 * Decides whether a deck change should schedule an autosave.
 *
 * The slide editor's deck only changes reference on a genuine user action
 * (mutation, undo, redo or an applied document sync) — the initial load,
 * legacy-slide materialization and the non-blocking staleness banner never
 * produce a new reference here. So a `null` `lastSeen` (initial render) is never
 * autosaved, and an unchanged reference is a no-op; only a new reference is a
 * real edit worth persisting.
 */
export function shouldScheduleAutosave({
  current,
  lastSeen,
}: AutosaveDecisionInputs): boolean {
  if (lastSeen === null) {
    return false;
  }
  return current !== lastSeen;
}
