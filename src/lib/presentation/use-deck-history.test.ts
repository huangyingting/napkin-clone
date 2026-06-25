import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck } from "./deck";
import {
  DECK_HISTORY_LIMIT,
  canRedo,
  canUndo,
  deckHistoryReducer,
  initDeckHistory,
  pushDeckHistory,
  redoDeckHistory,
  replaceDeckHistory,
  undoDeckHistory,
} from "./use-deck-history";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Builds a distinguishable deck whose single slide title encodes `n`. */
function deck(n: number): Deck {
  return {
    themeId: "default",
    slides: [
      {
        id: "test-id",
        index: 0,
        title: `slide-${n}`,
        bullets: [],
        visualIds: [],
        notes: "",
        layout: "content",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

test("initDeckHistory starts with empty stacks", () => {
  const state = initDeckHistory(deck(0));
  assert.equal(state.past.length, 0);
  assert.equal(state.future.length, 0);
  assert.equal(state.present.slides[0].title, "slide-0");
  assert.equal(canUndo(state), false);
  assert.equal(canRedo(state), false);
});

// ---------------------------------------------------------------------------
// push (commit)
// ---------------------------------------------------------------------------

test("pushDeckHistory moves present to past and sets new present", () => {
  const state = pushDeckHistory(initDeckHistory(deck(0)), deck(1));
  assert.equal(state.past.length, 1);
  assert.equal(state.past[0].slides[0].title, "slide-0");
  assert.equal(state.present.slides[0].title, "slide-1");
  assert.equal(state.future.length, 0);
  assert.equal(canUndo(state), true);
});

test("committing the same reference is a no-op", () => {
  const initial = initDeckHistory(deck(0));
  const same = pushDeckHistory(initial, initial.present);
  assert.equal(same, initial);
  assert.equal(same.past.length, 0);
});

test("commit action routes through the reducer", () => {
  let state = initDeckHistory(deck(0));
  state = deckHistoryReducer(state, { type: "commit", deck: deck(1) });
  assert.equal(state.present.slides[0].title, "slide-1");
  assert.equal(state.past.length, 1);
});

test("replaceDeckHistory replaces present without adding an undo entry", () => {
  const initial = initDeckHistory(deck(0));
  const replaced = replaceDeckHistory(initial, deck(1));
  assert.equal(replaced.present.slides[0].title, "slide-1");
  assert.equal(replaced.past.length, 0);
  assert.equal(replaced.future.length, 0);
  assert.equal(canUndo(replaced), false);
});

test("replace action routes through the reducer and resets coalescing", () => {
  let state = pushDeckHistory(initDeckHistory(deck(0)), deck(1), "move:el#1");
  state = deckHistoryReducer(state, { type: "replace", deck: deck(2) });
  assert.equal(state.present.slides[0].title, "slide-2");
  assert.equal(state.past.length, 1);
  assert.equal(state.lastCoalesceKey, undefined);
});

// ---------------------------------------------------------------------------
// undo / redo
// ---------------------------------------------------------------------------

test("undo restores the previous present and banks the present onto future", () => {
  let state = pushDeckHistory(initDeckHistory(deck(0)), deck(1));
  state = undoDeckHistory(state);
  assert.equal(state.present.slides[0].title, "slide-0");
  assert.equal(state.past.length, 0);
  assert.equal(state.future.length, 1);
  assert.equal(state.future[0].slides[0].title, "slide-1");
  assert.equal(canUndo(state), false);
  assert.equal(canRedo(state), true);
});

test("redo re-applies the next future snapshot", () => {
  let state = pushDeckHistory(initDeckHistory(deck(0)), deck(1));
  state = undoDeckHistory(state);
  state = redoDeckHistory(state);
  assert.equal(state.present.slides[0].title, "slide-1");
  assert.equal(state.past.length, 1);
  assert.equal(state.future.length, 0);
});

test("undo / redo are no-ops on empty stacks", () => {
  const state = initDeckHistory(deck(0));
  assert.equal(undoDeckHistory(state), state);
  assert.equal(redoDeckHistory(state), state);
});

test("undo / redo round-trips multiple steps in LIFO order", () => {
  let state = initDeckHistory(deck(0));
  state = pushDeckHistory(state, deck(1));
  state = pushDeckHistory(state, deck(2));
  state = undoDeckHistory(state);
  assert.equal(state.present.slides[0].title, "slide-1");
  state = undoDeckHistory(state);
  assert.equal(state.present.slides[0].title, "slide-0");
  state = redoDeckHistory(state);
  assert.equal(state.present.slides[0].title, "slide-1");
  state = redoDeckHistory(state);
  assert.equal(state.present.slides[0].title, "slide-2");
});

// ---------------------------------------------------------------------------
// redo cleared after a new mutation
// ---------------------------------------------------------------------------

test("a new commit after undo clears the redo branch", () => {
  let state = pushDeckHistory(initDeckHistory(deck(0)), deck(1));
  state = undoDeckHistory(state);
  assert.equal(canRedo(state), true);
  state = pushDeckHistory(state, deck(99));
  assert.equal(state.present.slides[0].title, "slide-99");
  assert.equal(state.future.length, 0);
  assert.equal(canRedo(state), false);
});

// ---------------------------------------------------------------------------
// cap eviction
// ---------------------------------------------------------------------------

test("past is capped at DECK_HISTORY_LIMIT, evicting the oldest", () => {
  let state = initDeckHistory(deck(0));
  for (let n = 1; n <= DECK_HISTORY_LIMIT + 10; n += 1) {
    state = pushDeckHistory(state, deck(n));
  }
  assert.equal(state.past.length, DECK_HISTORY_LIMIT);
  // Oldest surviving snapshot: the present we committed off of when the cap
  // was first exceeded. With cap entries retained, slide-0..slide-10 evicted.
  assert.equal(state.past[0].slides[0].title, "slide-10");
  assert.equal(
    state.past[state.past.length - 1].slides[0].title,
    `slide-${DECK_HISTORY_LIMIT + 9}`,
  );
  assert.equal(
    state.present.slides[0].title,
    `slide-${DECK_HISTORY_LIMIT + 10}`,
  );
});

test("redo eviction also respects the cap", () => {
  let state = initDeckHistory(deck(0));
  for (let n = 1; n <= DECK_HISTORY_LIMIT; n += 1) {
    state = pushDeckHistory(state, deck(n));
  }
  assert.equal(state.past.length, DECK_HISTORY_LIMIT);
  state = undoDeckHistory(state);
  state = redoDeckHistory(state);
  assert.equal(state.past.length, DECK_HISTORY_LIMIT);
  assert.equal(state.present.slides[0].title, `slide-${DECK_HISTORY_LIMIT}`);
});

// ---------------------------------------------------------------------------
// Immutability — the history stack must only ever touch the Deck object it is
// handed; it must never mutate a committed deck in place. (The editor's
// contentJson / Yjs document live outside this reducer; pushing onto the undo
// stack is a pure Deck-snapshot operation, so a committed deck stays frozen.)
// ---------------------------------------------------------------------------

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

test("push / undo / redo never mutate committed decks in place", () => {
  const d0 = deepFreeze(deck(0));
  const d1 = deepFreeze(deck(1));
  const d2 = deepFreeze(deck(2));

  // None of these operations are allowed to write back into a frozen deck;
  // if they tried, the strict-mode assignment would throw here.
  let state = initDeckHistory(d0);
  state = pushDeckHistory(state, d1);
  state = pushDeckHistory(state, d2);
  state = undoDeckHistory(state);
  state = undoDeckHistory(state);
  state = redoDeckHistory(state);

  // The reducer preserves snapshot references verbatim (structural sharing),
  // proving it banks the very deck it was given rather than a mutated copy.
  assert.equal(state.present, d1);
  assert.equal(state.past[0], d0);
  assert.equal(state.future[0], d2);
  assert.equal(state.present.slides[0].title, "slide-1");
});

test("history snapshots stay isolated as the working deck moves on", () => {
  // Simulate the editor mutating a *new* deck object on each edit (the real
  // flow always replaces the deck reference) and committing it.
  const committed = deck(0);
  let state = initDeckHistory(committed);
  const edited = deck(1);
  state = pushDeckHistory(state, edited);

  // The banked snapshot is the original object, untouched by the later commit.
  assert.equal(state.past[0], committed);
  assert.equal(state.past[0].slides[0].title, "slide-0");
  assert.equal(state.present.slides[0].title, "slide-1");
});

// ---------------------------------------------------------------------------
// Gesture coalescing (issue #242)
// ---------------------------------------------------------------------------

test("commits sharing a coalesceKey produce ONE past entry and one undo step", () => {
  let state = initDeckHistory(deck(0));
  // A drag emitting many pointermove commits, all under the same gesture key.
  for (let n = 1; n <= 30; n += 1) {
    state = pushDeckHistory(state, deck(n), "move:el1#1");
  }
  // Only the pre-gesture snapshot is retained; the gesture is one step.
  assert.equal(state.past.length, 1);
  assert.equal(state.past[0].slides[0].title, "slide-0");
  assert.equal(state.present.slides[0].title, "slide-30");

  state = undoDeckHistory(state);
  assert.equal(state.present.slides[0].title, "slide-0");
  assert.equal(canUndo(state), false);
});

test("a coalesced commit replaces the present without touching past", () => {
  const start = initDeckHistory(deck(0));
  const afterFirst = pushDeckHistory(start, deck(1), "move:el1#1");
  const afterSecond = pushDeckHistory(afterFirst, deck(2), "move:el1#1");
  // The `past` array reference is preserved across the in-place replace.
  assert.equal(afterSecond.past, afterFirst.past);
  assert.equal(afterSecond.present.slides[0].title, "slide-2");
});

test("the coalesce action routes through the reducer", () => {
  let state = initDeckHistory(deck(0));
  state = deckHistoryReducer(state, {
    type: "commit",
    deck: deck(1),
    coalesceKey: "move:el1#1",
  });
  state = deckHistoryReducer(state, {
    type: "commit",
    deck: deck(2),
    coalesceKey: "move:el1#1",
  });
  assert.equal(state.past.length, 1);
  assert.equal(state.present.slides[0].title, "slide-2");
});

test("commits with different keys push separately (each its own step)", () => {
  let state = initDeckHistory(deck(0));
  state = pushDeckHistory(state, deck(1), "move:el1#1");
  state = pushDeckHistory(state, deck(2), "move:el1#2"); // new gesture instance
  state = pushDeckHistory(state, deck(3), "resize:el1#3"); // different gesture
  assert.equal(state.past.length, 3);
  state = undoDeckHistory(state);
  assert.equal(state.present.slides[0].title, "slide-2");
  state = undoDeckHistory(state);
  assert.equal(state.present.slides[0].title, "slide-1");
  state = undoDeckHistory(state);
  assert.equal(state.present.slides[0].title, "slide-0");
});

test("keyless commits push separately, exactly as before", () => {
  let state = initDeckHistory(deck(0));
  state = pushDeckHistory(state, deck(1));
  state = pushDeckHistory(state, deck(2));
  assert.equal(state.past.length, 2);
  assert.equal(state.lastCoalesceKey, undefined);
});

test("a keyed gesture then a plain commit is two undo steps", () => {
  let state = initDeckHistory(deck(0));
  // Gesture: many commits collapse to one entry ending at slide-2.
  state = pushDeckHistory(state, deck(1), "edit-text:el1#1");
  state = pushDeckHistory(state, deck(2), "edit-text:el1#1");
  // Discrete keyless edit afterwards.
  state = pushDeckHistory(state, deck(3));
  assert.equal(state.past.length, 2);

  state = undoDeckHistory(state);
  assert.equal(state.present.slides[0].title, "slide-2"); // gesture result
  state = undoDeckHistory(state);
  assert.equal(state.present.slides[0].title, "slide-0"); // pre-gesture
  assert.equal(canUndo(state), false);
});

test("undo resets the coalesce key so the next matching commit pushes fresh", () => {
  let state = initDeckHistory(deck(0));
  state = pushDeckHistory(state, deck(1), "move:el1#1");
  state = undoDeckHistory(state);
  assert.equal(state.lastCoalesceKey, undefined);
  // Same string key after an undo must not coalesce into the prior entry.
  state = pushDeckHistory(state, deck(2), "move:el1#1");
  assert.equal(state.past.length, 1);
  assert.equal(state.past[0].slides[0].title, "slide-0");
});

test("a keyed gesture clears any pending redo branch on its first commit", () => {
  let state = initDeckHistory(deck(0));
  state = pushDeckHistory(state, deck(1));
  state = undoDeckHistory(state);
  assert.equal(canRedo(state), true);
  // Starting a gesture is still a mutation: it discards the redo branch.
  state = pushDeckHistory(state, deck(5), "move:el1#1");
  state = pushDeckHistory(state, deck(6), "move:el1#1");
  assert.equal(canRedo(state), false);
  assert.equal(state.future.length, 0);
});

test("coalesced gestures still respect the cap", () => {
  let state = initDeckHistory(deck(0));
  // DECK_HISTORY_LIMIT + 5 distinct gestures, each emitting two commits. Only
  // the first (pre-gesture) commit of each gesture pushes a snapshot.
  let n = 0;
  for (let g = 1; g <= DECK_HISTORY_LIMIT + 5; g += 1) {
    n += 1;
    state = pushDeckHistory(state, deck(n), `move:el1#${g}`);
    n += 1;
    state = pushDeckHistory(state, deck(n), `move:el1#${g}`);
  }
  assert.equal(state.past.length, DECK_HISTORY_LIMIT);
});
