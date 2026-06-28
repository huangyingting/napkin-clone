import assert from "node:assert/strict";
import { test } from "node:test";

import {
  privateImmutableCacheHeaders,
  readFormData,
  readJsonObject,
  readJsonValue,
  requiredSearchParam,
  retryAfterHeader,
} from "@/lib/api/route-adapters";

test("readJsonObject returns shared route error bodies", async () => {
  const invalid = await readJsonObject({
    async json() {
      throw new Error("bad json");
    },
  });

  assert.equal(invalid.ok, false);
  assert.equal(invalid.response.status, 400);
  assert.deepEqual(await invalid.response.json(), {
    error: "Request body must be valid JSON.",
    code: "VALIDATION_ERROR",
  });
});

test("readFormData maps parser failures to shared route errors", async () => {
  const result = await readFormData({
    async formData() {
      throw new Error("bad form");
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.response.status, 400);
  assert.deepEqual(await result.response.json(), {
    error: "Request must be multipart/form-data.",
    code: "VALIDATION_ERROR",
  });
});

test("body adapters reject oversized content-length before parsing", async () => {
  let jsonParsed = false;
  const oversizedJson = await readJsonObject(
    {
      headers: new Headers({ "content-length": "11" }),
      async json() {
        jsonParsed = true;
        return {};
      },
    },
    { maxBytes: 10 },
  );
  assert.equal(oversizedJson.ok, false);
  assert.equal(oversizedJson.response.status, 413);
  assert.equal(jsonParsed, false);

  const oversizedValue = await readJsonValue(
    {
      headers: new Headers({ "content-length": "12" }),
      async json() {
        return {};
      },
    },
    "bad json",
    { maxBytes: 10 },
  );
  assert.equal(oversizedValue.ok, false);
  assert.equal(oversizedValue.response.status, 413);

  const oversizedForm = await readFormData(
    {
      headers: new Headers({ "content-length": "12" }),
      async formData() {
        return new FormData();
      },
    },
    "bad form",
    undefined,
    { maxBytes: 10 },
  );
  assert.equal(oversizedForm.ok, false);
  assert.equal(oversizedForm.response.status, 413);
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
