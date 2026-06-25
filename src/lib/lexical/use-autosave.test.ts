import assert from "node:assert/strict";
import { test } from "node:test";

import { createAutosaveController, type SaveStatus } from "./use-autosave";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("autosave controller debounces queued JSON and reports status", async () => {
  const statuses: SaveStatus[] = [];
  const saved: string[] = [];
  const timers = new Map<number, () => void>();
  let nextTimer = 1;

  const controller = createAutosaveController({
    save: async (json) => {
      saved.push(json);
      return { ok: true };
    },
    debounceMs: 10,
    onStatus: (status) => statuses.push(status),
    onError: (error) => {
      throw error;
    },
    setTimer: ((callback: () => void) => {
      const id = nextTimer++;
      timers.set(id, callback);
      return id;
    }) as typeof setTimeout,
    clearTimer: ((id: number) => {
      timers.delete(id);
    }) as typeof clearTimeout,
  });

  controller.queue("first");
  controller.queue("second");

  assert.equal(timers.size, 1);
  const callback = timers.values().next().value;
  assert.ok(callback, "expected one pending debounce callback");
  callback();
  await Promise.resolve();

  assert.deepEqual(saved, ["second"]);
  assert.deepEqual(statuses, ["pending", "pending", "saving", "saved"]);
  controller.dispose();
});

test("autosave controller keeps pending status when newer JSON arrives mid-save", async () => {
  const statuses: SaveStatus[] = [];
  const saves = [deferred<{ ok: true }>(), deferred<{ ok: true }>()];
  let saveIndex = 0;
  const controller = createAutosaveController({
    save: () => saves[saveIndex++].promise,
    debounceMs: 10,
    onStatus: (status) => statuses.push(status),
    onError: (error) => {
      throw error;
    },
  });

  test("autosave controller ignores stale failed completion after newer JSON", async () => {
    const statuses: SaveStatus[] = [];
    const errors: unknown[] = [];
    const first = deferred<{ ok: boolean; error?: string }>();
    const second = deferred<{ ok: boolean }>();
    const saved: string[] = [];

    const controller = createAutosaveController({
      save: (json) => {
        saved.push(json);
        return saved.length === 1 ? first.promise : second.promise;
      },
      debounceMs: 10,
      onStatus: (status) => statuses.push(status),
      onError: (error) => errors.push(error),
    });

    controller.queue("first");
    const firstFlush = controller.flush();
    controller.queue("second");
    first.resolve({ ok: false, error: "stale failure" });
    await Promise.resolve();

    assert.deepEqual(errors, []);
    assert.deepEqual(statuses, ["pending", "saving", "pending", "saving"]);
    second.resolve({ ok: true });
    await firstFlush;

    assert.deepEqual(saved, ["first", "second"]);
    assert.deepEqual(statuses, [
      "pending",
      "saving",
      "pending",
      "saving",
      "saved",
    ]);
    controller.dispose();
  });

  test("autosave controller suppresses callbacks after dispose", async () => {
    const statuses: SaveStatus[] = [];
    const errors: unknown[] = [];
    const save = deferred<{ ok: false; error: string }>();
    const controller = createAutosaveController({
      save: () => save.promise,
      debounceMs: 10,
      onStatus: (status) => statuses.push(status),
      onError: (error) => errors.push(error),
    });

    controller.queue("first");
    const flushing = controller.flush();
    controller.dispose();
    save.resolve({ ok: false, error: "late failure" });
    await flushing;

    assert.deepEqual(statuses, ["pending", "saving"]);
    assert.deepEqual(errors, []);
  });

  controller.queue("first");
  const saving = controller.flush();
  controller.queue("second");
  saves[0].resolve({ ok: true });
  await Promise.resolve();
  saves[1].resolve({ ok: true });
  await saving;

  assert.deepEqual(statuses, [
    "pending",
    "saving",
    "pending",
    "saving",
    "saved",
  ]);
  assert.equal(controller.latestJson(), "second");
  controller.dispose();
});
