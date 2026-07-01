import assert from "node:assert/strict";
import test from "node:test";

import type { ActionResult } from "@/lib/action-result";
import { createBlankDeckV7 } from "@/lib/presentation-vnext/empty-deck";
import type { DeckV7 } from "@/lib/presentation-vnext/schema";

import {
  applyAiDeckProposalV7,
  createSerializedDeckPersistor,
  createDeckAutosaveOnDue,
  persistDeckV7WithRecovery,
} from "./use-slide-editor-open";

function waitForAsyncDrain(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function createDeferred<T>() {
  let resolve: ((value: T | PromiseLike<T>) => void) | null = null;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return {
    promise,
    resolve: (value: T) => resolve?.(value),
  };
}

test("persistDeckV7WithRecovery clears saving after rejected deck writes", async () => {
  const deck = createBlankDeckV7({ documentId: "doc-1413" });
  const savingStates: boolean[] = [];
  const dirtyStates: boolean[] = [];
  const saveErrors: Array<string | null> = [];
  const conflicts: unknown[] = [];
  const revisionTokenRef = { current: "rev-1" as string | null };
  const lastSavedRef = { current: { preserved: true } as unknown };

  const result = await persistDeckV7WithRecovery({
    updatedDeck: deck,
    documentId: "doc-1413",
    deckPort: {
      saveDeckJson: async () =>
        Promise.reject(new Error("network unavailable")),
    },
    revisionTokenRef,
    lastSavedRef,
    aiAppliedDeckRef: { current: null },
    setV7Dirty: (dirty) => dirtyStates.push(dirty),
    setV7Saving: (saving) => savingStates.push(saving),
    setV7SaveError: (error) => saveErrors.push(error),
    setConflictStateV7: (state) => conflicts.push(state),
    onAiDeckSaved: () => {
      throw new Error("unexpected telemetry call");
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /network unavailable/);
  }
  assert.deepEqual(savingStates, [true, false]);
  assert.deepEqual(dirtyStates, []);
  assert.deepEqual(conflicts, []);
  assert.equal(revisionTokenRef.current, "rev-1");
  assert.deepEqual(lastSavedRef.current, { preserved: true });
  assert.equal(saveErrors[0], null);
  assert.match(saveErrors.at(-1) ?? "", /network unavailable/);
});

test("persistDeckV7WithRecovery keeps conflict result semantics", async () => {
  const deck = createBlankDeckV7({ documentId: "doc-1413" });
  const conflicts: unknown[] = [];
  const saveErrors: Array<string | null> = [];

  const result = await persistDeckV7WithRecovery({
    updatedDeck: deck,
    documentId: "doc-1413",
    deckPort: {
      saveDeckJson: async () => ({
        ok: "conflict",
        serverRevisionToken: "server-rev-2",
      }),
    },
    revisionTokenRef: { current: "rev-1" },
    lastSavedRef: { current: null },
    aiAppliedDeckRef: { current: null },
    setV7Dirty: () => undefined,
    setV7Saving: () => undefined,
    setV7SaveError: (error) => saveErrors.push(error),
    setConflictStateV7: (state) => conflicts.push(state),
    onAiDeckSaved: () => undefined,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /Save conflict/);
  }
  assert.equal(saveErrors.at(-1), result.ok ? null : result.error);
  assert.deepEqual(conflicts, [
    {
      localDeck: deck,
      serverRevisionToken: "server-rev-2",
    },
  ]);
});

test("createDeckAutosaveOnDue catches rejected autosave saves and logs them", async () => {
  const deck = createBlankDeckV7({ documentId: "doc-1413" });
  const logs: Array<{ scope: string; message: string; context: unknown }> = [];
  const handler = createDeckAutosaveOnDue({
    persistDeckV7: async () =>
      Promise.reject(new Error("session expired")) as Promise<ActionResult>,
    log: (scope, message, context) => {
      logs.push({ scope, message, context });
    },
  });

  handler(deck);
  await waitForAsyncDrain();

  assert.equal(logs.length, 1);
  assert.deepEqual(logs[0].scope, "editor.slide-editor");
  assert.deepEqual(logs[0].message, "v7-autosave-error");
  assert.match(JSON.stringify(logs[0].context), /session expired/);
});

test("createSerializedDeckPersistor serializes overlapping saves and uses refreshed revision tokens", async () => {
  const firstDeck = createBlankDeckV7({ documentId: "doc-1408" });
  const secondDeck = createBlankDeckV7({ documentId: "doc-1408" });
  const revisionTokenRef = { current: "rev-1" as string | null };
  const latestRequestIdRef = { current: 0 };
  const gate = createDeferred<void>();
  const saveCalls: Array<{ token: string | null | undefined; deck: unknown }> =
    [];
  const dirtyStates: boolean[] = [];

  type QueuedDeckSave = { deck: DeckV7; requestId: number };

  const persistDeckV7 = createSerializedDeckPersistor<QueuedDeckSave>({
    persistDeck: ({ deck: updatedDeck, requestId }) =>
      persistDeckV7WithRecovery({
        updatedDeck,
        documentId: "doc-1408",
        deckPort: {
          saveDeckJson: async (_documentId, deckJson, revisionToken) => {
            saveCalls.push({ token: revisionToken, deck: deckJson });
            if (saveCalls.length === 1) {
              await gate.promise;
              return { ok: true, revisionToken: "rev-2" };
            }
            return { ok: true, revisionToken: "rev-3" };
          },
        },
        revisionTokenRef,
        lastSavedRef: { current: null },
        aiAppliedDeckRef: { current: null },
        setV7Dirty: (dirty) => dirtyStates.push(dirty),
        setV7Saving: () => undefined,
        setV7SaveError: () => undefined,
        setConflictStateV7: () => undefined,
        onAiDeckSaved: () => undefined,
        shouldApplyCompletionState: () =>
          latestRequestIdRef.current === requestId,
      }),
  });

  latestRequestIdRef.current += 1;
  const firstSave = persistDeckV7({
    deck: firstDeck,
    requestId: latestRequestIdRef.current,
  });
  latestRequestIdRef.current += 1;
  const secondSave = persistDeckV7({
    deck: secondDeck,
    requestId: latestRequestIdRef.current,
  });

  await waitForAsyncDrain();
  assert.equal(saveCalls.length, 1);
  assert.equal(saveCalls[0]?.token, "rev-1");

  gate.resolve(undefined);
  const [firstResult, secondResult] = await Promise.all([
    firstSave,
    secondSave,
  ]);

  assert.equal(firstResult.ok, true);
  assert.equal(secondResult.ok, true);
  assert.equal(saveCalls.length, 2);
  assert.equal(saveCalls[1]?.token, "rev-2");
  assert.equal(saveCalls[1]?.deck, secondDeck);
  assert.deepEqual(dirtyStates, [false]);
  assert.equal(revisionTokenRef.current, "rev-3");
});

test("createSerializedDeckPersistor ignores stale conflict outcomes once newer deck save is queued", async () => {
  const firstDeck = createBlankDeckV7({ documentId: "doc-1404" });
  const secondDeck = createBlankDeckV7({ documentId: "doc-1404" });
  const revisionTokenRef = { current: "rev-1" as string | null };
  const latestRequestIdRef = { current: 0 };
  const gate = createDeferred<void>();
  const saveErrors: Array<string | null> = [];
  const conflicts: unknown[] = [];

  type QueuedDeckSave = { deck: DeckV7; requestId: number };

  const persistDeckV7 = createSerializedDeckPersistor<QueuedDeckSave>({
    persistDeck: ({ deck: updatedDeck, requestId }) =>
      persistDeckV7WithRecovery({
        updatedDeck,
        documentId: "doc-1404",
        deckPort: {
          saveDeckJson: async (_documentId, _deckJson, revisionToken) => {
            if (revisionToken === "rev-1") {
              await gate.promise;
              return { ok: "conflict", serverRevisionToken: "server-rev-2" };
            }
            return { ok: true, revisionToken: "rev-3" };
          },
        },
        revisionTokenRef,
        lastSavedRef: { current: null },
        aiAppliedDeckRef: { current: null },
        setV7Dirty: () => undefined,
        setV7Saving: () => undefined,
        setV7SaveError: (error) => saveErrors.push(error),
        setConflictStateV7: (state) => conflicts.push(state),
        onAiDeckSaved: () => undefined,
        shouldApplyCompletionState: () =>
          latestRequestIdRef.current === requestId,
      }),
  });

  latestRequestIdRef.current += 1;
  const firstSave = persistDeckV7({
    deck: firstDeck,
    requestId: latestRequestIdRef.current,
  });
  latestRequestIdRef.current += 1;
  const secondSave = persistDeckV7({
    deck: secondDeck,
    requestId: latestRequestIdRef.current,
  });

  await waitForAsyncDrain();
  gate.resolve(undefined);
  const [firstResult, secondResult] = await Promise.all([
    firstSave,
    secondSave,
  ]);

  assert.equal(firstResult.ok, false);
  assert.equal(secondResult.ok, false);
  assert.equal(revisionTokenRef.current, "rev-1");
  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0], {
    localDeck: secondDeck,
    serverRevisionToken: "server-rev-2",
  });
  assert.match(saveErrors.at(-1) ?? "", /Save conflict/);
});

test("applyAiDeckProposalV7 opens AI deck as dirty and persists immediately", async () => {
  const aiDeck = createBlankDeckV7({ documentId: "doc-1341" });
  const aiAppliedDeckRef = { current: null as DeckV7 | null };
  const persistedDecks: DeckV7[] = [];
  const dirtyStates: boolean[] = [];
  const finished: Array<{ deck: DeckV7; diagnostics: unknown[] | undefined }> =
    [];
  let canceledAutosave = 0;

  applyAiDeckProposalV7({
    aiDeck,
    aiAppliedDeckRef,
    generationDiagnostics: [],
    enterRecoveryV7: () => {
      throw new Error("unexpected recovery path");
    },
    finishOpenV7: (deck, diagnostics) => {
      finished.push({ deck, diagnostics });
    },
    cancelAutosaveV7: () => {
      canceledAutosave += 1;
    },
    setV7Dirty: (dirty) => dirtyStates.push(dirty),
    persistDeckV7: async (deck) => {
      persistedDecks.push(deck);
      return { ok: true, data: undefined };
    },
  });

  await waitForAsyncDrain();

  assert.equal(canceledAutosave, 1);
  assert.deepEqual(dirtyStates, [true]);
  assert.equal(finished.length, 1);
  assert.equal(persistedDecks.length, 1);
  assert.equal(aiAppliedDeckRef.current, persistedDecks[0]);
  assert.equal(finished[0]?.deck, persistedDecks[0]);
});

test("applyAiDeckProposalV7 keeps malformed AI decks in recovery path", () => {
  let recoveryCalls = 0;
  let persistCalls = 0;
  let finishCalls = 0;
  let dirtyCalls = 0;
  let cancelCalls = 0;
  const aiAppliedDeckRef = { current: null as DeckV7 | null };

  applyAiDeckProposalV7({
    aiDeck: { invalid: true } as unknown as DeckV7,
    aiAppliedDeckRef,
    generationDiagnostics: [],
    enterRecoveryV7: () => {
      recoveryCalls += 1;
    },
    finishOpenV7: () => {
      finishCalls += 1;
    },
    cancelAutosaveV7: () => {
      cancelCalls += 1;
    },
    setV7Dirty: () => {
      dirtyCalls += 1;
    },
    persistDeckV7: async () => {
      persistCalls += 1;
      return { ok: true, data: undefined };
    },
  });

  assert.equal(recoveryCalls, 1);
  assert.equal(finishCalls, 0);
  assert.equal(cancelCalls, 0);
  assert.equal(dirtyCalls, 0);
  assert.equal(persistCalls, 0);
  assert.equal(aiAppliedDeckRef.current, null);
});
