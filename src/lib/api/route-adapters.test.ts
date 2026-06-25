import assert from "node:assert/strict";
import { test } from "node:test";

import {
  privateImmutableCacheHeaders,
  readFormData,
  readJsonObject,
  requiredSearchParam,
  retryAfterHeader,
} from "@/lib/api/route-adapters";

test("readJsonObject preserves legacy route error bodies", async () => {
  const invalid = await readJsonObject({
    async json() {
      throw new Error("bad json");
    },
  });

  assert.equal(invalid.ok, false);
  assert.equal(invalid.response.status, 400);
  assert.deepEqual(await invalid.response.json(), {
    error: "Request body must be valid JSON.",
  });
});

test("readFormData maps parser failures to legacy route errors", async () => {
  const result = await readFormData({
    async formData() {
      throw new Error("bad form");
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.response.status, 400);
  assert.deepEqual(await result.response.json(), {
    error: "Request must be multipart/form-data.",
  });
});

test("shared adapters expose statically comparable headers and params", () => {
  assert.deepEqual(retryAfterHeader(9), { "Retry-After": "9" });
  assert.deepEqual(privateImmutableCacheHeaders("image/png"), {
    "Content-Type": "image/png",
    "Cache-Control": "private, max-age=31536000, immutable",
  });
  assert.equal(
    requiredSearchParam("https://example.test/api?room= doc ", "room"),
    "doc",
  );
  assert.equal(
    requiredSearchParam("https://example.test/api?room= ", "room"),
    null,
  );
});
