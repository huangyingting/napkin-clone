import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildScriptErrorLog,
  buildScriptLogRecord,
  logScriptError,
  logScriptInfo,
  logScriptWarning,
} from "./structured-log.mjs";

describe("structured-log.mjs", () => {
  test("buildScriptLogRecord aligns core fields with app logs and redacts", () => {
    const record = buildScriptLogRecord("info", "collab.flush.result", "ok", {
      room: "doc-1",
      token: "secret-token",
      text: "raw document content",
      level: "error",
      scope: "spoofed",
      message: "spoofed",
    });

    assert.equal(record.level, "info");
    assert.equal(record.scope, "collab.flush.result");
    assert.equal(record.message, "ok");
    assert.equal(record.room, "doc-1");
    assert.equal(record.token, "[redacted]");
    assert.equal(record.text, "[redacted]");
    assert.ok(!JSON.stringify(record).includes("secret-token"));
    assert.ok(!JSON.stringify(record).includes("raw document content"));
  });

  test("buildScriptErrorLog records error fields and redacts context", () => {
    const record = buildScriptErrorLog(
      "collab.core.message",
      new TypeError("boom"),
      {
        cookie: "session=secret",
      },
    );

    assert.equal(record.level, "error");
    assert.equal(record.scope, "collab.core.message");
    assert.equal(record.errorName, "TypeError");
    assert.equal(record.message, "boom");
    assert.equal(record.cookie, "[redacted]");
  });

  test("emit helpers write one JSON line to the expected console method", () => {
    const originals = {
      info: console.info,
      warn: console.warn,
      error: console.error,
    };
    const lines = { info: [], warn: [], error: [] };
    console.info = (line) => lines.info.push(String(line));
    console.warn = (line) => lines.warn.push(String(line));
    console.error = (line) => lines.error.push(String(line));
    try {
      logScriptInfo("collab.server.listen", "listening", { port: 1234 });
      logScriptWarning("collab.flush.configure", "disabled", {
        reason: "missing-secret",
      });
      logScriptError("collab.auth.request", new Error("failed"), {
        Authorization: "Bearer secret",
      });
    } finally {
      console.info = originals.info;
      console.warn = originals.warn;
      console.error = originals.error;
    }

    assert.equal(lines.info.length, 1);
    assert.equal(lines.warn.length, 1);
    assert.equal(lines.error.length, 1);
    assert.equal(JSON.parse(lines.info[0]).level, "info");
    assert.equal(JSON.parse(lines.warn[0]).level, "warning");
    const error = JSON.parse(lines.error[0]);
    assert.equal(error.level, "error");
    assert.equal(error.Authorization, "[redacted]");
    assert.ok(!lines.error[0].includes("Bearer secret"));
  });
});
