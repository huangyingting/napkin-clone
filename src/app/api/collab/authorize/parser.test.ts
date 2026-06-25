import assert from "node:assert/strict";
import { test } from "node:test";

import { parseCollabAuthorizeRoom } from "./parser";

test("parseCollabAuthorizeRoom trims and requires the room search param", () => {
  assert.equal(
    parseCollabAuthorizeRoom(
      "https://example.test/api/collab/authorize?room= doc ",
    ),
    "doc",
  );
  assert.equal(
    parseCollabAuthorizeRoom(
      "https://example.test/api/collab/authorize?room= ",
    ),
    null,
  );
});
