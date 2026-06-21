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
 */

import { useCallback, useEffect, useReducer, useRef } from "react";

import type { Deck } from "./deck";

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
}

/** Actions accepted by {@link deckHistoryReducer}. */
export type DeckHistoryAction =
  | { type: "commit"; deck: Deck }
  | { type: "undo" }
  | { type: "redo" };

/** Builds the initial history for a freshly-opened deck. */
export function initDeckHistory(present: Deck): DeckHistory {
  return { past: [], present, future: [] };
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
 * Records a new present: pushes the previous present onto `past` (evicting the
 * oldest entry beyond the cap) and clears `future`. Committing a deck identical
 * (by reference) to the current present is a no-op.
 */
export function pushDeckHistory(state: DeckHistory, deck: Deck): DeckHistory {
  if (deck === state.present) {
    return state;
  }
  const past = [...state.past, state.present];
  if (past.length > DECK_HISTORY_LIMIT) {
    past.splice(0, past.length - DECK_HISTORY_LIMIT);
  }
  return { past, present: deck, future: [] };
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
  return { past, present: next, future: rest };
}

/** Pure reducer combining the snapshot helpers above. */
export function deckHistoryReducer(
  state: DeckHistory,
  action: DeckHistoryAction,
): DeckHistory {
  switch (action.type) {
    case "commit":
      return pushDeckHistory(state, action.deck);
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
  /** Records a new deck, clearing any pending redo branch. */
  commit: (deck: Deck) => void;
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

  const commit = useCallback((deck: Deck) => {
    dispatch({ type: "commit", deck });
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
    undo,
    redo,
  };
}
