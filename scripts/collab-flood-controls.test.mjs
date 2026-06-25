import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { _testOnly, connCount } from "./collab-core.mjs";

const originalEnv = { ...process.env };
const originalConsoleError = console.error;

afterEach(() => {
  process.env = { ...originalEnv };
  console.error = originalConsoleError;
  for (const doc of _testOnly.docs.values()) {
    for (const conn of doc.conns.keys()) {
      conn.__events?.close?.();
    }
    doc.destroy();
  }
  _testOnly.docs.clear();
  _testOnly.evictTimers.forEach((timer) => clearTimeout(timer));
  _testOnly.evictTimers.clear();
  _testOnly.upgradeWindows.clear();
});

function fakeConn() {
  return {
    readyState: 1,
    __events: {},
    closed: false,
    sent: [],
    on(event, handler) {
      this.__events[event] = handler;
    },
    send(message, cb) {
      this.sent.push(message);
      cb?.();
    },
    ping() {},
    close() {
      this.closed = true;
    },
  };
}

test("collab upgrade limiter blocks after configured budget", () => {
  process.env.COLLAB_UPGRADE_RATE_LIMIT = "1";
  process.env.COLLAB_UPGRADE_RATE_WINDOW_MS = "1000";
  assert.equal(_testOnly.allowUpgradeAttempt("203.0.113.1", 0), true);
  assert.equal(_testOnly.allowUpgradeAttempt("203.0.113.1", 10), false);
  assert.equal(_testOnly.allowUpgradeAttempt("203.0.113.1", 1001), true);
});

test("collab setup enforces room connection cap", () => {
  process.env.COLLAB_MAX_CONNECTIONS_PER_ROOM = "1";
  console.error = () => {};
  const first = fakeConn();
  const second = fakeConn();
  _testOnly.setupConnection(first, "doc-1");
  _testOnly.setupConnection(second, "doc-1");

  assert.equal(first.closed, false);
  assert.equal(second.closed, true);
  assert.equal(connCount(), 1);
});

test("collab message listener closes oversized messages", () => {
  process.env.COLLAB_MAX_MESSAGE_BYTES = "4";
  console.error = () => {};
  const conn = fakeConn();
  _testOnly.setupConnection(conn, "doc-2");
  const doc = _testOnly.docs.get("doc-2");

  _testOnly.messageListener(conn, doc, new Uint8Array(5), false);

  assert.equal(conn.closed, true);
  assert.equal(doc.conns.has(conn), false);
  conn.__events.close();
});

test("collab access revalidation closes sockets after access is revoked", async () => {
  process.env.COLLAB_ACCESS_REVALIDATE_MS = "1";
  console.error = () => {};
  const conn = fakeConn();
  let checks = 0;
  _testOnly.setupConnection(conn, "doc-3", false, null, async () => {
    checks += 1;
    return { ok: false, status: 403 };
  });

  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.equal(checks > 0, true);
  assert.equal(conn.closed, true);
  conn.__events.close();
});

test("collab access revalidation downgrades active sockets to read-only", async () => {
  process.env.COLLAB_ACCESS_REVALIDATE_MS = "1";
  const conn = fakeConn();
  _testOnly.setupConnection(conn, "doc-4", false, null, async () => ({
    ok: true,
    status: 101,
    readOnly: true,
  }));

  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.equal(conn.__textiqReadOnly, true);
  conn.__events.close();
});

test("collab raw socket guard detects clients closed during async auth", () => {
  assert.equal(
    _testOnly.rawSocketClosed({ destroyed: true, writable: true }),
    true,
  );
  assert.equal(
    _testOnly.rawSocketClosed({ destroyed: false, writable: false }),
    true,
  );
  assert.equal(
    _testOnly.rawSocketClosed({ destroyed: false, writable: true }),
    false,
  );
});
