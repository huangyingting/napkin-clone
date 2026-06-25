import assert from "node:assert/strict";
import test from "node:test";

import { buildBrowserQaSummary } from "./browser-qa.mjs";

test("browser QA summary prints deterministic URLs and credentials", () => {
  const lines = buildBrowserQaSummary(
    {
      owner: { email: "owner@example.test", password: "owner-pw" },
      viewer: { email: "viewer@example.test", password: "viewer-pw" },
      documentPath: "/app/documents/doc1",
      presentPath: "/present/share1",
      embedPath: "/embed/share1",
    },
    { port: 4555 },
  );

  assert.match(
    lines.join("\n"),
    /http:\/\/localhost:4555\/app\/documents\/doc1/,
  );
  assert.match(lines.join("\n"), /Owner: owner@example\.test \/ owner-pw/);
  assert.match(lines.join("\n"), /Viewer: viewer@example\.test \/ viewer-pw/);
});
