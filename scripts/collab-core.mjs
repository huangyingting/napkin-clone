/**
 * Core Yjs websocket sync logic for TextIQ real-time collaboration
 * (US-019), factored out of the standalone server so it can be hosted either as
 * its own process (`scripts/collab-server.mjs`) or mounted on the Next.js HTTP
 * server (`server.mjs`) at a path. Mounting it on the app server lets a single
 * forwarded port (e.g. VS Code port forwarding) carry both the app and the
 * collaboration socket, so the browser can derive the websocket URL from the
 * page origin and collaboration "just works" through forwarding.
 *
 * Implements the y-websocket wire protocol (messageSync / messageAwareness)
 * against the *same* yjs / y-protocols / lib0 versions the browser client uses,
 * so there is no version skew. One in-memory Y.Doc ("room") per document id.
 */
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as map from "lib0/map";
import { WebSocketServer } from "ws";

const PING_TIMEOUT = 30000;

/**
 * How long (ms) an empty room stays in memory after the last connection closes
 * before being evicted. A reconnecting client within this window reuses the
 * live Y.Doc; after eviction the DB is re-read on the next connection.
 */
export const ROOM_IDLE_TTL_MS = 60_000;

/** @type {Map<string, ReturnType<typeof setTimeout>>} room name → pending eviction timer */
const evictTimers = new Map();

const wsReadyStateConnecting = 0;
const wsReadyStateOpen = 1;

const messageSync = 0;
const messageAwareness = 1;
const messageQueryAwareness = 3;

/** @type {Map<string, WSSharedDoc>} */
const docs = new Map();

/**
 * A shared Y.Doc for one room, tracking the connections subscribed to it and the
 * awareness (presence) state of their clients.
 */
class WSSharedDoc extends Y.Doc {
  constructor(name) {
    super({ gc: true });
    this.name = name;
    /** @type {Map<object, Set<number>>} conn -> set of controlled awareness client ids */
    this.conns = new Map();
    this.awareness = new awarenessProtocol.Awareness(this);
    this.awareness.setLocalState(null);

    const awarenessChangeHandler = ({ added, updated, removed }, conn) => {
      const changedClients = added.concat(updated, removed);
      if (conn !== null) {
        const controlledIds = this.conns.get(conn);
        if (controlledIds !== undefined) {
          added.forEach((clientId) => controlledIds.add(clientId));
          removed.forEach((clientId) => controlledIds.delete(clientId));
        }
      }
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients),
      );
      const message = encoding.toUint8Array(encoder);
      this.conns.forEach((_, c) => send(this, c, message));
    };
    this.awareness.on("update", awarenessChangeHandler);
    this.on("update", updateHandler);
  }
}

/** Broadcast a document update to every connection in the room. */
const updateHandler = (update, _origin, doc) => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeUpdate(encoder, update);
  const message = encoding.toUint8Array(encoder);
  doc.conns.forEach((_, conn) => send(doc, conn, message));
};

/** Returns true when a room with the given active-connection count should be evicted. */
export const shouldEvict = (connCount) => connCount === 0;

/**
 * Returns true when the current document state has diverged from the last
 * durably-saved state, i.e., there are pending updates that have not been
 * persisted yet.
 *
 * @param {Y.Doc} doc - The in-memory Yjs document for the room.
 * @param {Uint8Array | null} lastSavedStateVector - The Y.js state vector
 *   (from `Y.encodeStateVector(doc)`) recorded at the last confirmed durable
 *   save, or `null` if no save has been recorded for this room.
 * @returns {boolean} `true` when the room has unsaved changes.
 *
 * This is a pure function with no side effects — safe to test without any
 * network or DB dependencies.
 */
export function hasPendingUpdates(doc, lastSavedStateVector) {
  if (!lastSavedStateVector) {
    // No confirmed save for this room — treat all content as pending.
    // An empty document (no clock entries) is trivially "no pending updates".
    const currentVector = Y.encodeStateVector(doc);
    // An all-zero vector means the document is empty (no updates applied).
    return currentVector.some((byte) => byte !== 0);
  }
  // Compute the diff: if there is any update newer than lastSavedStateVector,
  // there are pending changes.
  const diff = Y.encodeStateAsUpdate(doc, lastSavedStateVector);
  // A Yjs update with no changes is just a 2-byte varint header (value 0).
  // Any payload longer than 2 bytes contains at least one pending operation.
  return diff.length > 2;
}

/**
 * Tracks the last durably-saved Yjs state vector per room. Set by the
 * persistence hook after a successful DB write via `setRoomSavedStateVector`.
 * @type {Map<string, Uint8Array>}
 */
const savedStateVectors = new Map();

/**
 * Records that the room's current state has been durably saved. The caller
 * supplies the state vector captured **at the time of the save** (via
 * `Y.encodeStateVector(doc)`) so future `hasPendingUpdates` calls can detect
 * whether additional changes have arrived since the save completed.
 *
 * @param {string} roomName
 * @param {Uint8Array} stateVector
 */
export function setRoomSavedStateVector(roomName, stateVector) {
  savedStateVectors.set(roomName, stateVector);
}

/**
 * Returns the last durably-saved state vector recorded for a room, or `null`
 * if none has been recorded (room never saved, or already evicted).
 *
 * Pure read — safe to call from tests and health checks.
 *
 * @param {string} roomName
 * @returns {Uint8Array | null}
 */
export function getRoomSavedStateVector(roomName) {
  return savedStateVectors.get(roomName) ?? null;
}

/**
 * Records that a room has been **durably saved** by capturing the document's
 * current state vector. Call this ONLY after a confirmed durable write (e.g. a
 * successful Lexical autosave that committed `contentJson`), never after a
 * best-effort eviction flush.
 *
 * Saved-vector lifecycle (the vector tracks the last *confirmed durable* write):
 *  - A save with an active in-memory room advances the vector here.
 *  - Eviction does NOT advance the vector: the eviction snapshot flush is
 *    best-effort recovery, not the source of truth, so advancing on evict would
 *    falsely mark unsaved edits as durable. `evictRoom` instead clears the entry.
 *  - A save that arrives with no active room is a no-op (nothing to advance);
 *    the room reseeds from the DB on the next connection.
 *
 * In inline mode (collab socket and Next in the same process) this can be
 * invoked after a confirmed save; the standalone process runs separately and
 * relies on DB reseed on reconnect rather than cross-process vector advancement.
 *
 * @param {string} roomName
 * @param {Y.Doc} doc - The in-memory room document at save time.
 */
export function markRoomSaved(roomName, doc) {
  savedStateVectors.set(roomName, Y.encodeStateVector(doc));
}

// ---------------------------------------------------------------------------
// Flush observability (#499)
// ---------------------------------------------------------------------------

/** Max number of recent flush failures retained in memory. */
const FLUSH_FAILURE_RING_CAP = 20;

/**
 * In-memory ring buffer of recent eviction-flush failures, capped at
 * {@link FLUSH_FAILURE_RING_CAP}. Holds only safe ids — never document content.
 * @type {Array<{ room: string, docId: string, reason: string, at: string }>}
 */
const flushFailureRing = [];

/** Monotonic counters for eviction-flush activity. */
const flushCounters = { flushAttempts: 0, flushFailures: 0 };

/**
 * Record that an eviction flush was attempted. Increments the attempt counter.
 * Safe to call from the flush helper before issuing the network request.
 */
export function recordFlushAttempt() {
  flushCounters.flushAttempts += 1;
}

/**
 * Record an eviction-flush failure into the observability ring and increment
 * the failure counter. Only safe identifiers and a short reason are stored.
 *
 * @param {{ room: string, docId?: string, reason: string }} failure
 */
export function recordFlushFailure(failure) {
  flushCounters.flushFailures += 1;
  flushFailureRing.push({
    room: failure.room,
    docId: failure.docId ?? failure.room,
    reason: failure.reason,
    at: new Date().toISOString(),
  });
  while (flushFailureRing.length > FLUSH_FAILURE_RING_CAP) {
    flushFailureRing.shift();
  }
}

/**
 * Returns a copy of the recent flush failures (safe ids only), oldest first.
 * @returns {Array<{ room: string, docId: string, reason: string, at: string }>}
 */
export function recentFlushFailures() {
  return flushFailureRing.map((entry) => ({ ...entry }));
}

/**
 * Returns the current flush counters for health surfaces.
 * @returns {{ flushAttempts: number, flushFailures: number }}
 */
export function flushStats() {
  return { ...flushCounters };
}

/** Tear down a room's awareness + doc and remove it from the in-memory map. */
const evictRoom = (doc, roomName, onBeforeEvict) => {
  if (
    onBeforeEvict &&
    hasPendingUpdates(doc, savedStateVectors.get(roomName) ?? null)
  ) {
    // Fire-and-forget: errors must not block eviction. The callback receives
    // the room name and the full document update so the caller can persist it
    // via the normal save path (e.g. POST to an internal flush endpoint).
    try {
      const update = Y.encodeStateAsUpdate(doc);
      Promise.resolve(onBeforeEvict(roomName, update)).catch((err) => {
        console.error("[collab] onBeforeEvict error", roomName, err);
      });
    } catch (err) {
      console.error("[collab] onBeforeEvict sync error", roomName, err);
    }
  }
  savedStateVectors.delete(roomName);
  doc.awareness.destroy();
  doc.off("update", updateHandler);
  doc.destroy();
  docs.delete(roomName);
};

/**
 * Schedule eviction of an empty room after `ttlMs` milliseconds.
 * Re-calling before the timer fires resets it (safe to call multiple times).
 * `onBeforeEvict` is called (if provided) with `(roomName, update)` before the
 * room is destroyed so callers can flush unsaved state to durable storage.
 */
const scheduleEviction = (
  roomName,
  ttlMs = ROOM_IDLE_TTL_MS,
  onBeforeEvict = null,
) => {
  cancelEviction(roomName);
  const timer = setTimeout(() => {
    evictTimers.delete(roomName);
    const doc = docs.get(roomName);
    if (doc && doc.conns.size === 0) {
      evictRoom(doc, roomName, onBeforeEvict);
    }
  }, ttlMs);
  evictTimers.set(roomName, timer);
};

/** Cancel a pending eviction timer (called when a new connection arrives). */
const cancelEviction = (roomName) => {
  const timer = evictTimers.get(roomName);
  if (timer !== undefined) {
    clearTimeout(timer);
    evictTimers.delete(roomName);
  }
};

const getYDoc = (docName) =>
  map.setIfUndefined(docs, docName, () => {
    const doc = new WSSharedDoc(docName);
    docs.set(docName, doc);
    return doc;
  });

const messageListener = (
  conn,
  doc,
  message,
  readOnly,
  onBeforeEvict = null,
) => {
  try {
    const encoder = encoding.createEncoder();
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);
    switch (messageType) {
      case messageSync: {
        encoding.writeVarUint(encoder, messageSync);
        // For read-only (viewer) connections we still answer sync-step-1 (the
        // client asking for the current state) so viewers receive the document
        // and all subsequent updates, but we drop sync-step-2 / update messages
        // so they can never mutate the shared doc (issue #88 AC #3).
        const syncMessageType = decoding.readVarUint(decoder);
        if (syncMessageType === syncProtocol.messageYjsSyncStep1) {
          syncProtocol.readSyncStep1(decoder, encoder, doc);
        } else if (!readOnly) {
          if (syncMessageType === syncProtocol.messageYjsSyncStep2) {
            syncProtocol.readSyncStep2(decoder, doc, conn);
          } else if (syncMessageType === syncProtocol.messageYjsUpdate) {
            syncProtocol.readUpdate(decoder, doc, conn);
          }
        }
        // If the reply has more than just the message-type header, send it.
        if (encoding.length(encoder) > 1) {
          send(doc, conn, encoding.toUint8Array(encoder), onBeforeEvict);
        }
        break;
      }
      case messageAwareness:
        awarenessProtocol.applyAwarenessUpdate(
          doc.awareness,
          decoding.readVarUint8Array(decoder),
          conn,
        );
        break;
      case messageQueryAwareness:
        encoding.writeVarUint(encoder, messageAwareness);
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(
            doc.awareness,
            Array.from(doc.awareness.getStates().keys()),
          ),
        );
        if (encoding.length(encoder) > 1) {
          send(doc, conn, encoding.toUint8Array(encoder), onBeforeEvict);
        }
        break;
      default:
        break;
    }
  } catch (err) {
    console.error("[collab] message error", err);
  }
};

const closeConn = (doc, conn, onBeforeEvict = null) => {
  if (doc.conns.has(conn)) {
    const controlledIds = doc.conns.get(conn);
    doc.conns.delete(conn);
    awarenessProtocol.removeAwarenessStates(
      doc.awareness,
      Array.from(controlledIds ?? []),
      null,
    );
    if (doc.conns.size === 0) {
      // Room is empty — schedule eviction after the idle grace period.
      // The DB is the durable source of truth, so eviction is safe.
      scheduleEviction(doc.name, ROOM_IDLE_TTL_MS, onBeforeEvict);
    }
  }
  try {
    conn.close();
  } catch {
    // ignore
  }
};

const send = (doc, conn, message, onBeforeEvict = null) => {
  if (
    conn.readyState !== wsReadyStateConnecting &&
    conn.readyState !== wsReadyStateOpen
  ) {
    closeConn(doc, conn, onBeforeEvict);
    return;
  }
  try {
    conn.send(message, (err) => {
      if (err != null) {
        closeConn(doc, conn, onBeforeEvict);
      }
    });
  } catch {
    closeConn(doc, conn, onBeforeEvict);
  }
};

/**
 * Wires up a freshly upgraded websocket connection to its room. `roomName` is
 * derived by the caller from the request URL, which lets the same logic serve
 * both `ws://host:port/<room>` (standalone) and `wss://host/<prefix>/<room>`
 * (mounted on the app server) shapes.
 *
 * `onBeforeEvict` is an optional async callback invoked when the room is about
 * to be evicted (all connections closed, idle TTL expired) and there are
 * pending updates. Signature: `(roomName: string, update: Uint8Array) => Promise<void>`.
 * Errors from the callback are logged but never re-thrown so eviction always
 * completes.
 */
const setupConnection = (
  conn,
  roomName,
  readOnly = false,
  onBeforeEvict = null,
) => {
  conn.binaryType = "arraybuffer";
  const doc = getYDoc(roomName || "default");
  // Cancel any pending eviction — this connection revives the room.
  cancelEviction(roomName || "default");
  doc.conns.set(conn, new Set());

  conn.on("message", (message) =>
    messageListener(
      conn,
      doc,
      new Uint8Array(message),
      readOnly,
      onBeforeEvict,
    ),
  );

  let pongReceived = true;
  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      if (doc.conns.has(conn)) {
        closeConn(doc, conn, onBeforeEvict);
      }
      clearInterval(pingInterval);
    } else if (doc.conns.has(conn)) {
      pongReceived = false;
      try {
        conn.ping();
      } catch {
        closeConn(doc, conn, onBeforeEvict);
        clearInterval(pingInterval);
      }
    }
  }, PING_TIMEOUT);

  conn.on("close", () => {
    closeConn(doc, conn, onBeforeEvict);
    clearInterval(pingInterval);
  });
  conn.on("pong", () => {
    pongReceived = true;
  });

  // Sync step 1: ask the client for anything we don't have / offer what we have.
  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, doc);
    send(doc, conn, encoding.toUint8Array(encoder), onBeforeEvict);
  }
  // Send current presence so the newcomer immediately sees who's here.
  const states = doc.awareness.getStates();
  if (states.size > 0) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageAwareness);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(
        doc.awareness,
        Array.from(states.keys()),
      ),
    );
    send(doc, conn, encoding.toUint8Array(encoder), onBeforeEvict);
  }
};

/** Number of in-memory rooms, exposed for health checks. */
export const roomCount = () => docs.size;

/** Total number of active WebSocket connections across all rooms. */
export const connCount = () => {
  let total = 0;
  for (const doc of docs.values()) {
    total += doc.conns.size;
  }
  return total;
};

/**
 * Test-only helpers — not part of the public API.
 * Allows unit tests to inspect eviction state and trigger eviction with a
 * custom TTL without needing real WebSocket connections.
 */
export const _testOnly = {
  docs,
  evictTimers,
  savedStateVectors,
  scheduleEviction,
  cancelEviction,
  evictRoom,
  flushFailureRing,
  flushCounters,
};

/**
 * Writes a minimal HTTP error response to a raw upgrade socket and destroys it,
 * so an unauthorized/forbidden upgrade is refused with a real status code
 * (issue #88 AC #1 / #4) instead of completing the WebSocket handshake.
 */
const refuseUpgrade = (socket, status) => {
  const reason =
    { 401: "Unauthorized", 403: "Forbidden", 500: "Internal Server Error" }[
      status
    ] || "Bad Request";
  try {
    socket.write(
      `HTTP/1.1 ${status} ${reason}\r\n` +
        "Connection: close\r\n" +
        "Content-Length: 0\r\n" +
        "\r\n",
    );
  } catch {
    // ignore — socket may already be gone
  }
  try {
    socket.destroy();
  } catch {
    // ignore
  }
};

/**
 * Creates a `noServer` WebSocketServer and a `handleUpgrade` you can attach to
 * any Node HTTP server's `upgrade` event. `roomFromUrl` maps a request URL to a
 * room name so the same core works at the host root (standalone) or under a
 * path prefix (mounted on the app server).
 *
 * `options.authorize(req, room)` authenticates and authorizes the upgrade before
 * the handshake completes (issue #88). It must resolve to
 * `{ ok, status, readOnly? }`: when `ok` is false the upgrade is refused with the
 * given status (401 unauthenticated / 403 no access); when `ok` is true the
 * connection is wired, read-only for viewers (`readOnly: true`).
 *
 * `options.onBeforeEvict(roomName, update)` is an optional async callback
 * invoked when a room is about to be evicted and has pending unsaved changes.
 * The callback receives the room name and the full Yjs update bytes so it can
 * flush them to durable storage. Errors are logged and never re-thrown.
 */
export function createCollabWss(roomFromUrl, options = {}) {
  const wss = new WebSocketServer({ noServer: true });
  const authorize = options.authorize;
  if (typeof authorize !== "function") {
    throw new Error("[collab] createCollabWss requires options.authorize");
  }
  const onBeforeEvict = options.onBeforeEvict ?? null;
  const toRoom =
    roomFromUrl ?? ((url) => (url || "/").slice(1).split("?")[0] || "default");

  wss.on("connection", (conn, req, decision) => {
    setupConnection(
      conn,
      toRoom(req.url || "/"),
      Boolean(decision?.readOnly),
      onBeforeEvict,
    );
  });

  const handleUpgrade = async (req, socket, head) => {
    let decision = { ok: true, readOnly: false };
    try {
      decision = await authorize(req, toRoom(req.url || "/"));
    } catch (err) {
      console.error("[collab] authorization error", err);
      decision = { ok: false, status: 500 };
    }
    if (!decision || !decision.ok) {
      refuseUpgrade(socket, decision?.status || 403);
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, decision);
    });
  };

  return { wss, handleUpgrade };
}
