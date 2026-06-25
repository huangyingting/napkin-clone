import assert from "node:assert/strict";
import { test } from "node:test";

import { createAutosaveController, type SaveStatus } from "./use-autosave";

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
  let resolveSave: (value: { ok: true }) => void = () => {
    assert.fail("save promise was not created");
  };
  const controller = createAutosaveController({
    save: () =>
      new Promise<{ ok: true }>((resolve) => {
        resolveSave = resolve;
      }),
    debounceMs: 10,
    onStatus: (status) => statuses.push(status),
    onError: (error) => {
      throw error;
    },
  });

  controller.queue("first");
  const saving = controller.flush();
  controller.queue("second");
  resolveSave({ ok: true });
  await saving;

  assert.deepEqual(statuses, ["pending", "saving", "pending"]);
  assert.equal(controller.latestJson(), "second");
  controller.dispose();
});
