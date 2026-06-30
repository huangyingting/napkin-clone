import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  createSlideAutosaveScheduler,
  type AutosaveTimer,
  type AutosaveTimerHandle,
} from "./slide-autosave-scheduler";

function createManualTimer() {
  let nextHandle = 1;
  const callbacks = new Map<number, () => void>();
  const cleared: number[] = [];
  const timer: AutosaveTimer = {
    set(callback: () => void): AutosaveTimerHandle {
      const handle = nextHandle++;
      callbacks.set(handle, callback);
      return handle as unknown as AutosaveTimerHandle;
    },
    clear(handle: AutosaveTimerHandle): void {
      const manualHandle = handle as unknown as number;
      cleared.push(manualHandle);
      callbacks.delete(manualHandle);
    },
  };
  return {
    timer,
    cleared,
    fire(handle: number): void {
      callbacks.get(handle)?.();
      callbacks.delete(handle);
    },
    pendingHandles(): number[] {
      return [...callbacks.keys()];
    },
  };
}

describe("createSlideAutosaveScheduler", () => {
  test("debounces to the latest scheduled deck", () => {
    const manual = createManualTimer();
    const saved: string[] = [];
    const scheduler = createSlideAutosaveScheduler<string>({
      onDue: (deck) => saved.push(deck),
      timer: manual.timer,
    });

    scheduler.schedule("first");
    scheduler.schedule("second");
    assert.deepEqual(manual.cleared, [1]);

    manual.fire(1);
    assert.deepEqual(saved, []);
    manual.fire(2);
    assert.deepEqual(saved, ["second"]);
    assert.equal(scheduler.hasPending(), false);
  });

  test("flush runs pending work immediately and clears the timer", () => {
    const manual = createManualTimer();
    const saved: string[] = [];
    const scheduler = createSlideAutosaveScheduler<string>({
      onDue: (deck) => saved.push(deck),
      timer: manual.timer,
    });

    scheduler.schedule("latest");
    assert.equal(scheduler.flush(), "latest");
    assert.deepEqual(saved, ["latest"]);
    assert.deepEqual(manual.cleared, [1]);
    assert.equal(scheduler.hasPending(), false);

    manual.fire(1);
    assert.deepEqual(saved, ["latest"]);
  });

  test("cancel drops queued work without saving", () => {
    const manual = createManualTimer();
    const saved: string[] = [];
    const scheduler = createSlideAutosaveScheduler<string>({
      onDue: (deck) => saved.push(deck),
      timer: manual.timer,
    });

    scheduler.schedule("draft");
    scheduler.cancel();
    manual.fire(1);

    assert.deepEqual(saved, []);
    assert.equal(scheduler.hasPending(), false);
  });
});
