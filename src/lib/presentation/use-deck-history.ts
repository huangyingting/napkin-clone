/**
 * Snapshot-based undo/redo history for the slide editor's plain {@link Deck}.
 *
 * Design goals:
 *  - Pure and headless core — {@link deckHistoryReducer} and its helpers have no
 *    DOM, React or browser dependencies, so they are fully testable under
 *    `node --test`.
 *  - Operates purely on the plain `Deck` object. It MUST NOT touch
 *    `contentJson` / Lexical / Yjs state — that history is owned separately by
 *    the document editor's `UndoManager`.
 *  - Bounded: the `past` stack is capped at {@link DECK_HISTORY_LIMIT} entries;
 *    the oldest snapshots are evicted once the cap is exceeded.
 *
 * A new mutation (`commit`) pushes the previous present onto `past` and clears
 * `future`, so any pending redo branch is discarded the moment the user edits.
 *
 * Gesture coalescing (issue #242): a commit may carry an optional
 * `coalesceKey`. When a commit arrives with the SAME key as the immediately
 * preceding commit, the present is REPLACED in place rather than pushing a new
 * `past` snapshot. This collapses a continuous gesture — a pointer drag/resize
 * (dozens of `pointermove` commits) or an inline typing session (one commit per
 * keystroke) — into a single undo step, with the pre-gesture snapshot retained
 * as the single undo target. A commit with no key (or a different key) pushes
 * normally, so discrete operations (add slide, theme change, align, delete) are
 * unchanged. Each gesture must use a key unique to that gesture instance so two
 * back-to-back gestures of the same kind do not merge; undo/redo reset the
 * tracked key so the next commit always starts a fresh entry.
 */

import { useCallback, useEffect, useReducer, useRef } from "react";

import type { Deck } from "./deck-core";

/** Maximum number of `past` snapshots retained before the oldest is evicted. */
export const DECK_HISTORY_LIMIT = 50;

/** Snapshot stacks surrounding the current deck. */
export interface DeckHistory {
  /** Older snapshots, oldest first; the last entry is restored by undo. */
  past: Deck[];
  /** The deck currently shown in the editor. */
  present: Deck;
  /** Undone snapshots, next-to-redo last; the last entry is restored by redo. */
  future: Deck[];
  /**
   * Coalesce key of the commit that produced the current `present`, if any
   * (issue #242). The next commit carrying this same key replaces the present
   * in place instead of pushing a new `past` snapshot. `undefined` after a
   * keyless commit, an undo, or a redo.
   */
  lastCoalesceKey?: string;
}

/** Actions accepted by {@link deckHistoryReducer}. */
export type DeckHistoryAction =
  | { type: "commit"; deck: Deck; coalesceKey?: string }
  | { type: "replace"; deck: Deck }
  | { type: "undo" }
  | { type: "redo" };

/** Builds the initial history for a freshly-opened deck. */
export function initDeckHistory(present: Deck): DeckHistory {
  return { past: [], present, future: [], lastCoalesceKey: undefined };
}

/** True when there is at least one snapshot to undo to. */
export function canUndo(state: DeckHistory): boolean {
  return state.past.length > 0;
}

/** True when there is at least one snapshot to redo to. */
export function canRedo(state: DeckHistory): boolean {
  return state.future.length > 0;
}

/**
 * Records a new present. With no `coalesceKey` (or a key differing from the
 * previous commit's), pushes the previous present onto `past` (evicting the
 * oldest entry beyond the cap) and clears `future`. When `coalesceKey` matches
 * the key of the commit that produced the current present, the present is
 * REPLACED in place — `past` is untouched — so a continuous gesture collapses
 * to a single undo step (issue #242). Committing a deck identical (by
 * reference) to the current present is a no-op.
 */
export function pushDeckHistory(
  state: DeckHistory,
  deck: Deck,
  coalesceKey?: string,
): DeckHistory {
  if (deck === state.present) {
    return state;
  }
  if (coalesceKey !== undefined && coalesceKey === state.lastCoalesceKey) {
    return {
      past: state.past,
      present: deck,
      future: [],
      lastCoalesceKey: coalesceKey,
    };
  }
  const past = [...state.past, state.present];
  if (past.length > DECK_HISTORY_LIMIT) {
    past.splice(0, past.length - DECK_HISTORY_LIMIT);
  }
  return { past, present: deck, future: [], lastCoalesceKey: coalesceKey };
}

/**
 * Replaces the visible deck without creating an undo entry. Used for internal
 * normalization that should become the editor baseline rather than a user step.
 */
export function replaceDeckHistory(
  state: DeckHistory,
  deck: Deck,
): DeckHistory {
  if (deck === state.present) {
    return state;
  }
  return {
    past: state.past,
    present: deck,
    future: state.future,
    lastCoalesceKey: undefined,
  };
}

/** Restores the most recent `past` snapshot, banking the present onto `future`. */
export function undoDeckHistory(state: DeckHistory): DeckHistory {
  if (state.past.length === 0) {
    return state;
  }
  const previous = state.past[state.past.length - 1];
  return {
    past: state.past.slice(0, -1),
    present: previous,
    future: [state.present, ...state.future],
    lastCoalesceKey: undefined,
  };
}

/** Restores the next `future` snapshot, banking the present onto `past`. */
export function redoDeckHistory(state: DeckHistory): DeckHistory {
  if (state.future.length === 0) {
    return state;
  }
  const [next, ...rest] = state.future;
  const past = [...state.past, state.present];
  if (past.length > DECK_HISTORY_LIMIT) {
    past.splice(0, past.length - DECK_HISTORY_LIMIT);
  }
  return { past, present: next, future: rest, lastCoalesceKey: undefined };
}

/** Pure reducer combining the snapshot helpers above. */
export function deckHistoryReducer(
  state: DeckHistory,
  action: DeckHistoryAction,
): DeckHistory {
  switch (action.type) {
    case "commit":
      return pushDeckHistory(state, action.deck, action.coalesceKey);
    case "replace":
      return replaceDeckHistory(state, action.deck);
    case "undo":
      return undoDeckHistory(state);
    case "redo":
      return redoDeckHistory(state);
  }
}

/** Imperative API returned by {@link useDeckHistory}. */
export interface UseDeckHistory {
  /** The deck currently shown in the editor. */
  present: Deck;
  /** Whether an undo is available. */
  canUndo: boolean;
  /** Whether a redo is available. */
  canRedo: boolean;
  /**
   * Records a new deck, clearing any pending redo branch. Pass
   * `{ coalesceKey }` to merge a continuous gesture (drag / resize / typing)
   * into a single undo step: consecutive commits sharing the same key replace
   * the present in place rather than pushing new snapshots (issue #242).
   */
  commit: (deck: Deck, opts?: { coalesceKey?: string }) => void;
  /** Replaces the present deck without adding an undo step. */
  replace: (deck: Deck) => void;
  /** Reverts to the previous snapshot, if any. */
  undo: () => void;
  /** Re-applies the next undone snapshot, if any. */
  redo: () => void;
}

/**
 * React hook wrapping {@link deckHistoryReducer}. `onChange` is invoked with the
 * new present whenever it changes (commit / undo / redo) so an external owner of
 * the deck (e.g. the editor's parent) stays in sync.
 */
export function useDeckHistory(
  initialDeck: Deck,
  onChange?: (deck: Deck) => void,
): UseDeckHistory {
  const [state, dispatch] = useReducer(
    deckHistoryReducer,
    initialDeck,
    initDeckHistory,
  );

  // Notify the external owner whenever the present changes (commit / undo /
  // redo) — exactly once per change and never on mount. Driven off `present`
  // rather than the imperative callbacks so it is immune to event batching.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  const lastNotified = useRef(state.present);
  useEffect(() => {
    if (state.present !== lastNotified.current) {
      lastNotified.current = state.present;
      onChangeRef.current?.(state.present);
    }
  }, [state.present]);

  const commit = useCallback((deck: Deck, opts?: { coalesceKey?: string }) => {
    dispatch({ type: "commit", deck, coalesceKey: opts?.coalesceKey });
  }, []);

  const replace = useCallback((deck: Deck) => {
    dispatch({ type: "replace", deck });
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: "undo" });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: "redo" });
  }, []);

  return {
    present: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    commit,
    replace,
    undo,
    redo,
  };
}
