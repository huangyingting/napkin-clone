/**
 * Unit tests for the idle-room eviction logic in collab-core.mjs.
 * Runs with: node --test scripts/collab-eviction.test.mjs
 * No DOM, no WebSocket — uses the _testOnly escape-hatch exports.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  shouldEvict,
  roomCount,
  ROOM_IDLE_TTL_MS,
  _testOnly,
} from "./collab-core.mjs";

const { docs, evictTimers, scheduleEviction, cancelEviction } = _testOnly;

/** Insert a minimal stub doc into the shared map (no WebSocket needed). */
function seedRoom(name, connCount = 0) {
  const stub = {
    name,
    conns: new Map(
      Array.from({ length: connCount }, (_, i) => [`conn-${i}`, new Set()]),
    ),
    awareness: { destroy: () => {} },
    off: () => {},
    destroy: () => {},
  };
  docs.set(name, stub);
  return stub;
}

/** Remove a room from the shared map and cancel any timer (test teardown). */
function cleanupRoom(name) {
  cancelEviction(name);
  docs.delete(name);
}

// ── Pure helper ──────────────────────────────────────────────────────────────

describe("shouldEvict", () => {
  it("returns true when connCount is 0", () => {
    assert.equal(shouldEvict(0), true);
  });

  it("returns false when connCount is 1", () => {
    assert.equal(shouldEvict(1), false);
  });

  it("returns false when connCount is many", () => {
    assert.equal(shouldEvict(5), false);
  });
});

// ── ROOM_IDLE_TTL_MS constant ─────────────────────────────────────────────────

describe("ROOM_IDLE_TTL_MS", () => {
  it("is a positive integer (default 60 s)", () => {
    assert.equal(typeof ROOM_IDLE_TTL_MS, "number");
    assert.ok(ROOM_IDLE_TTL_MS > 0);
    assert.equal(ROOM_IDLE_TTL_MS, 60_000);
  });
});

// ── scheduleEviction / cancelEviction ────────────────────────────────────────

describe("scheduleEviction + cancelEviction", () => {
  const ROOM = "test-evict-basic";

  before(() => seedRoom(ROOM, 0));
  after(() => cleanupRoom(ROOM));

  it("registers a timer for the room", () => {
    scheduleEviction(ROOM, 5000);
    assert.ok(evictTimers.has(ROOM), "timer should be registered");
    cancelEviction(ROOM); // clean up
  });

  it("cancelEviction removes the timer", () => {
    scheduleEviction(ROOM, 5000);
    cancelEviction(ROOM);
    assert.ok(!evictTimers.has(ROOM), "timer should be removed after cancel");
  });

  it("re-scheduling replaces the previous timer", () => {
    scheduleEviction(ROOM, 5000);
    const t1 = evictTimers.get(ROOM);
    scheduleEviction(ROOM, 5000);
    const t2 = evictTimers.get(ROOM);
    assert.notEqual(t1, t2, "second schedule should produce a fresh timer");
    cancelEviction(ROOM);
  });
});

// ── Eviction fires after TTL (async with real timer at ~10 ms) ───────────────

describe("eviction fires after TTL", () => {
  const ROOM = "test-evict-fires";

  it("removes an empty room from docs after the TTL elapses", async () => {
    seedRoom(ROOM, 0);
    assert.equal(docs.has(ROOM), true);

    scheduleEviction(ROOM, 30 /* ms */);

    await new Promise((resolve) => setTimeout(resolve, 80));

    assert.equal(
      docs.has(ROOM),
      false,
      "room should be evicted after TTL with 0 connections",
    );
    assert.equal(
      evictTimers.has(ROOM),
      false,
      "timer entry should be removed after firing",
    );
  });
});

// ── Eviction is cancelled when a connection arrives before TTL ───────────────

describe("cancel-on-reconnect", () => {
  const ROOM = "test-evict-cancel";

  after(() => cleanupRoom(ROOM));

  it("keeps the room alive when a connection arrives before TTL fires", async () => {
    seedRoom(ROOM, 0);

    scheduleEviction(ROOM, 50 /* ms */);
    assert.ok(evictTimers.has(ROOM));

    // Simulate a new connection arriving before the timer fires.
    cancelEviction(ROOM);
    seedRoom(ROOM, 1); // overwrite stub with 1 connection

    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(
      docs.has(ROOM),
      true,
      "room must survive when eviction was cancelled",
    );
    assert.equal(
      evictTimers.has(ROOM),
      false,
      "no lingering timer after cancel",
    );
  });
});

// ── roomCount export ─────────────────────────────────────────────────────────

describe("roomCount health export", () => {
  const ROOM = "test-room-count";

  before(() => seedRoom(ROOM, 0));
  after(() => cleanupRoom(ROOM));

  it("reflects docs map size", () => {
    const before = roomCount();
    assert.ok(before >= 1, "at least our seeded room should be counted");
  });

  it("decreases after eviction", async () => {
    const before = roomCount();
    scheduleEviction(ROOM, 20 /* ms */);
    await new Promise((resolve) => setTimeout(resolve, 60));
    const after = roomCount();
    assert.ok(after < before, "roomCount should decrease after eviction");
  });
});
