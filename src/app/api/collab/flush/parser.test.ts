import assert from "node:assert/strict";
import { test } from "node:test";

import { isValidBase64, parseCollabFlushPayload } from "./parser";

test("parseCollabFlushPayload accepts documentId and legacy room aliases", () => {
  assert.deepEqual(
    parseCollabFlushPayload({ documentId: " doc ", update: "AQID" }),
    {
      ok: true,
      payload: { documentId: "doc", update: "AQID" },
    },
  );
  assert.deepEqual(
    parseCollabFlushPayload({ room: "room-1", update: "AQID" }),
    {
      ok: true,
      payload: { documentId: "room-1", update: "AQID" },
    },
  );
});

test("parseCollabFlushPayload preserves validation messages", () => {
  assert.deepEqual(parseCollabFlushPayload({ update: "AQID" }), {
    ok: false,
    status: 400,
    message: "Missing documentId.",
  });
  assert.deepEqual(
    parseCollabFlushPayload({ documentId: "doc", update: "bad" }),
    {
      ok: false,
      status: 400,
      message: "Missing or invalid update.",
    },
  );
  assert.equal(isValidBase64(""), false);
});
