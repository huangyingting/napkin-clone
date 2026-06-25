import assert from "node:assert/strict";
import { test } from "node:test";

import { parseImportUploadRequest } from "./parser";

test("parseImportUploadRequest preserves multipart parser denial body", async () => {
  const result = await parseImportUploadRequest({
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

test("parseImportUploadRequest requires a file field", async () => {
  const result = await parseImportUploadRequest({
    async formData() {
      return new FormData();
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.response.status, 400);
  assert.deepEqual(await result.response.json(), {
    error: "Missing `file` field in form data.",
    code: "VALIDATION_ERROR",
  });
});
