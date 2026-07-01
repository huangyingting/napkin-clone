import assert from "node:assert/strict";
import test from "node:test";

import type { ActionResult } from "@/lib/action-result";
import { createBlankDeckV7 } from "@/lib/presentation-vnext/empty-deck";

import {
  createDeckAutosaveOnDue,
  persistDeckV7WithRecovery,
} from "./use-slide-editor-open";

function waitForAsyncDrain(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
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
