import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resolveInlineCollabConfig,
  resolveStandaloneCollabConfig,
} from "./collab-config.mjs";

test("resolveInlineCollabConfig defaults to inline collaboration on app port 4000", () => {
  assert.deepEqual(resolveInlineCollabConfig({}), {
    port: 4000,
    hostname: "0.0.0.0",
    inlineCollab: true,
  });
});

test("resolveInlineCollabConfig preserves explicit process values", () => {
  assert.deepEqual(
    resolveInlineCollabConfig({
      PORT: "5000",
      HOST: "127.0.0.1",
      COLLAB_INLINE: "0",
    }),
    {
      port: 5000,
      hostname: "127.0.0.1",
      inlineCollab: false,
    },
  );
});

test("resolveStandaloneCollabConfig defaults to standalone port 1234", () => {
  assert.deepEqual(resolveStandaloneCollabConfig({}), {
    port: 1234,
    host: "0.0.0.0",
  });
});

test("resolveStandaloneCollabConfig preserves explicit bind values", () => {
  assert.deepEqual(
    resolveStandaloneCollabConfig({
      COLLAB_PORT: "7000",
      COLLAB_HOST: "127.0.0.1",
    }),
    {
      port: 7000,
      host: "127.0.0.1",
    },
  );
});
