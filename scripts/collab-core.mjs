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

const getYDoc = (docName) =>
  map.setIfUndefined(docs, docName, () => {
    const doc = new WSSharedDoc(docName);
    docs.set(docName, doc);
    return doc;
  });

const messageListener = (conn, doc, message, readOnly) => {
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
          send(doc, conn, encoding.toUint8Array(encoder));
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
          send(doc, conn, encoding.toUint8Array(encoder));
        }
        break;
      default:
        break;
    }
  } catch (err) {
    console.error("[collab] message error", err);
  }
};

const closeConn = (doc, conn) => {
  if (doc.conns.has(conn)) {
    const controlledIds = doc.conns.get(conn);
    doc.conns.delete(conn);
    awarenessProtocol.removeAwarenessStates(
      doc.awareness,
      Array.from(controlledIds ?? []),
      null,
    );
    if (doc.conns.size === 0) {
      // Keep the doc in memory so a reconnecting client re-syncs without data
      // loss; the DB remains the durable source of truth via app autosave.
    }
  }
  try {
    conn.close();
  } catch {
    // ignore
  }
};

const send = (doc, conn, message) => {
  if (
    conn.readyState !== wsReadyStateConnecting &&
    conn.readyState !== wsReadyStateOpen
  ) {
    closeConn(doc, conn);
    return;
  }
  try {
    conn.send(message, (err) => {
      if (err != null) {
        closeConn(doc, conn);
      }
    });
  } catch {
    closeConn(doc, conn);
  }
};

/**
 * Wires up a freshly upgraded websocket connection to its room. `roomName` is
 * derived by the caller from the request URL, which lets the same logic serve
 * both `ws://host:port/<room>` (standalone) and `wss://host/<prefix>/<room>`
 * (mounted on the app server) shapes.
 */
const setupConnection = (conn, roomName, readOnly = false) => {
  conn.binaryType = "arraybuffer";
  const doc = getYDoc(roomName || "default");
  doc.conns.set(conn, new Set());

  conn.on("message", (message) =>
    messageListener(conn, doc, new Uint8Array(message), readOnly),
  );

  let pongReceived = true;
  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      if (doc.conns.has(conn)) {
        closeConn(doc, conn);
      }
      clearInterval(pingInterval);
    } else if (doc.conns.has(conn)) {
      pongReceived = false;
      try {
        conn.ping();
      } catch {
        closeConn(doc, conn);
        clearInterval(pingInterval);
      }
    }
  }, PING_TIMEOUT);

  conn.on("close", () => {
    closeConn(doc, conn);
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
    send(doc, conn, encoding.toUint8Array(encoder));
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
    send(doc, conn, encoding.toUint8Array(encoder));
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
 * connection is wired, read-only for viewers (`readOnly: true`). When no
 * authorizer is supplied every upgrade is allowed (legacy/un-secured mode).
 */
export function createCollabWss(roomFromUrl, options = {}) {
  const wss = new WebSocketServer({ noServer: true });
  const authorize = options.authorize;
  const toRoom =
    roomFromUrl ?? ((url) => (url || "/").slice(1).split("?")[0] || "default");

  wss.on("connection", (conn, req, decision) => {
    setupConnection(conn, toRoom(req.url || "/"), Boolean(decision?.readOnly));
  });

  const handleUpgrade = async (req, socket, head) => {
    let decision = { ok: true, readOnly: false };
    if (authorize) {
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
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, decision);
    });
  };

  return { wss, handleUpgrade };
}
