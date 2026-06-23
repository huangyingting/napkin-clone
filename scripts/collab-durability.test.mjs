/**
 * Unit tests for collab-core.mjs durability helpers (#469).
 *
 * Covers:
 *  - `hasPendingUpdates`: pure helper detecting unsaved in-memory state.
 *  - `setRoomSavedStateVector` / `savedStateVectors` map.
 *  - `onBeforeEvict` callback fires when a room with pending updates is evicted.
 *  - `onBeforeEvict` is NOT fired when the room is clean (nothing pending).
 *  - Degraded/offline: eviction still completes (callback errors are swallowed).
 *
 * No real WebSocket connections are used — tests manipulate the _testOnly
 * escape-hatch to seed rooms and trigger eviction directly.
 *
 * Run with: node --test scripts/collab-durability.test.mjs
 */
import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";

import {
  hasPendingUpdates,
  setRoomSavedStateVector,
  _testOnly,
} from "./collab-core.mjs";

const { docs, scheduleEviction, cancelEviction, savedStateVectors } = _testOnly;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Inserts a real Y.Doc (with WSSharedDoc-like properties patched on) into
 * the shared docs map. Since WSSharedDoc extends Y.Doc, calling
 * Y.encodeStateVector/encodeStateAsUpdate on the room doc requires it to
 * be a genuine Y.Doc. We patch name/conns/awareness/off onto the real Y.Doc
 * instance so `evictRoom` can use it exactly as it uses WSSharedDoc.
 */
function seedRealDoc(roomName) {
  const ydoc = new Y.Doc();
  // Patch the WSSharedDoc-like fields directly onto the Y.Doc instance.
  ydoc.name = roomName;
  ydoc.conns = new Map();
  ydoc.awareness = { destroy: () => {} };
  const origOff = ydoc.off.bind(ydoc);
  ydoc.off = (event, handler) => {
    try {
      origOff(event, handler);
    } catch {
      /**/
    }
  };
  const origDestroy = ydoc.destroy.bind(ydoc);
  ydoc.destroy = () => {
    try {
      origDestroy();
    } catch {
      /**/
    }
  };
  docs.set(roomName, ydoc);
  return ydoc;
}

function cleanupRoom(name) {
  cancelEviction(name);
  savedStateVectors.delete(name);
  docs.delete(name);
}

// ---------------------------------------------------------------------------
// hasPendingUpdates — pure helper
// ---------------------------------------------------------------------------

describe("hasPendingUpdates", () => {
  it("returns false for an empty Y.Doc with no saved vector", () => {
    const doc = new Y.Doc();
    // Empty doc: all clocks are 0, no pending updates.
    assert.equal(hasPendingUpdates(doc, null), false);
    doc.destroy();
  });

  it("returns true for a non-empty Y.Doc with no saved vector", () => {
    const doc = new Y.Doc();
    doc.getText("body").insert(0, "hello");
    assert.equal(hasPendingUpdates(doc, null), true);
    doc.destroy();
  });

  it("returns false when doc matches the saved state vector exactly", () => {
    const doc = new Y.Doc();
    doc.getText("body").insert(0, "hello");
    // Record the vector after writing.
    const sv = Y.encodeStateVector(doc);
    assert.equal(hasPendingUpdates(doc, sv), false);
    doc.destroy();
  });

  it("returns true when doc has additional updates beyond the saved state vector", () => {
    const doc = new Y.Doc();
    doc.getText("body").insert(0, "hello");
    const sv = Y.encodeStateVector(doc); // saved after first write
    // More updates arrive after the save.
    doc.getText("body").insert(5, " world");
    assert.equal(hasPendingUpdates(doc, sv), true);
    doc.destroy();
  });

  it("returns false for an empty doc with a fresh empty state vector", () => {
    const doc = new Y.Doc();
    const sv = Y.encodeStateVector(doc);
    assert.equal(hasPendingUpdates(doc, sv), false);
    doc.destroy();
  });
});

// ---------------------------------------------------------------------------
// setRoomSavedStateVector
// ---------------------------------------------------------------------------

describe("setRoomSavedStateVector", () => {
  const ROOM = "sv-test-room";

  after(() => cleanupRoom(ROOM));

  it("stores the provided state vector for the room", () => {
    const doc = new Y.Doc();
    doc.getText("body").insert(0, "data");
    const sv = Y.encodeStateVector(doc);
    setRoomSavedStateVector(ROOM, sv);
    assert.deepEqual(savedStateVectors.get(ROOM), sv);
    doc.destroy();
  });

  it("overwrites a previously stored vector", () => {
    const doc = new Y.Doc();
    doc.getText("body").insert(0, "v1");
    const sv1 = Y.encodeStateVector(doc);
    setRoomSavedStateVector(ROOM, sv1);

    doc.getText("body").insert(2, " v2");
    const sv2 = Y.encodeStateVector(doc);
    setRoomSavedStateVector(ROOM, sv2);

    assert.deepEqual(savedStateVectors.get(ROOM), sv2);
    doc.destroy();
  });
});

// ---------------------------------------------------------------------------
// onBeforeEvict callback fires on eviction with pending updates
// ---------------------------------------------------------------------------

describe("onBeforeEvict: callback fires when room has pending updates", () => {
  const ROOM = "durability-pending";

  beforeEach(() => cleanupRoom(ROOM));
  after(() => cleanupRoom(ROOM));

  it("calls onBeforeEvict with roomName and a non-empty update when doc has content", async () => {
    const stub = seedRealDoc(ROOM);
    // Write content into the real Y.Doc.
    stub.getText("body").insert(0, "unsaved content");
    // No savedStateVector → hasPendingUpdates returns true.

    let callArgs = null;
    const onBeforeEvict = async (roomName, update) => {
      callArgs = { roomName, update };
    };

    scheduleEviction(ROOM, 20, onBeforeEvict);
    await new Promise((resolve) => setTimeout(resolve, 60));

    assert.ok(callArgs !== null, "onBeforeEvict should have been called");
    assert.equal(callArgs.roomName, ROOM);
    assert.ok(
      callArgs.update instanceof Uint8Array,
      "update should be Uint8Array",
    );
    assert.ok(callArgs.update.length > 2, "update should be non-trivial");
  });
});

describe("onBeforeEvict: callback NOT called when room is clean", () => {
  const ROOM = "durability-clean";

  beforeEach(() => cleanupRoom(ROOM));
  after(() => cleanupRoom(ROOM));

  it("does NOT call onBeforeEvict when the saved vector matches the doc", async () => {
    const stub = seedRealDoc(ROOM);
    stub.getText("body").insert(0, "saved content");
    // Mark as saved.
    setRoomSavedStateVector(ROOM, Y.encodeStateVector(stub));

    let called = false;
    const onBeforeEvict = async () => {
      called = true;
    };

    scheduleEviction(ROOM, 20, onBeforeEvict);
    await new Promise((resolve) => setTimeout(resolve, 60));

    assert.equal(
      called,
      false,
      "onBeforeEvict must not fire when doc is clean",
    );
  });
});

// ---------------------------------------------------------------------------
// Degraded: callback errors do not block eviction
// ---------------------------------------------------------------------------

describe("onBeforeEvict: errors are swallowed, eviction still completes", () => {
  const ROOM = "durability-error";

  beforeEach(() => cleanupRoom(ROOM));
  after(() => cleanupRoom(ROOM));

  it("evicts the room even when onBeforeEvict throws", async () => {
    const stub = seedRealDoc(ROOM);
    stub.getText("body").insert(0, "content");

    const onBeforeEvict = async () => {
      throw new Error("Simulated DB failure");
    };

    scheduleEviction(ROOM, 20, onBeforeEvict);
    await new Promise((resolve) => setTimeout(resolve, 80));

    assert.equal(
      docs.has(ROOM),
      false,
      "room should be evicted despite callback error",
    );
  });
});

// ---------------------------------------------------------------------------
// savedStateVectors is cleared on eviction
// ---------------------------------------------------------------------------

describe("savedStateVectors is cleared when room is evicted", () => {
  const ROOM = "sv-cleared-on-evict";

  beforeEach(() => cleanupRoom(ROOM));
  after(() => cleanupRoom(ROOM));

  it("removes the state vector entry when the room is evicted", async () => {
    const stub = seedRealDoc(ROOM);
    stub.getText("body").insert(0, "data");
    setRoomSavedStateVector(ROOM, Y.encodeStateVector(stub));
    assert.ok(savedStateVectors.has(ROOM), "pre-condition: sv should be set");

    scheduleEviction(ROOM, 20, null);
    await new Promise((resolve) => setTimeout(resolve, 60));

    assert.equal(
      savedStateVectors.has(ROOM),
      false,
      "state vector should be cleaned up on eviction",
    );
  });
});
