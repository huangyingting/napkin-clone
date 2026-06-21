import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_IMAGE_UPLOAD_BYTES,
  isEmptyImageSrc,
  validateImageFile,
} from "./image-element";

// ---------------------------------------------------------------------------
// isEmptyImageSrc — the empty/missing-source predicate
// ---------------------------------------------------------------------------

test("isEmptyImageSrc: null and undefined are empty", () => {
  assert.equal(isEmptyImageSrc(null), true);
  assert.equal(isEmptyImageSrc(undefined), true);
});

test("isEmptyImageSrc: empty and whitespace-only strings are empty", () => {
  assert.equal(isEmptyImageSrc(""), true);
  assert.equal(isEmptyImageSrc("   "), true);
  assert.equal(isEmptyImageSrc("\n\t "), true);
});

test("isEmptyImageSrc: a URL or data URL is not empty", () => {
  assert.equal(isEmptyImageSrc("https://example.com/a.png"), false);
  assert.equal(isEmptyImageSrc("data:image/png;base64,AAAA"), false);
});

// ---------------------------------------------------------------------------
// validateImageFile — type + size guard for uploads
// ---------------------------------------------------------------------------

test("validateImageFile: accepts an image under the size limit", () => {
  const result = validateImageFile({ type: "image/png", size: 1024 });
  assert.deepEqual(result, { ok: true });
});

test("validateImageFile: rejects a non-image MIME type", () => {
  const result = validateImageFile({ type: "application/pdf", size: 10 });
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.reason : "", /image file/i);
});

test("validateImageFile: rejects a file over the size limit", () => {
  const result = validateImageFile({
    type: "image/jpeg",
    size: MAX_IMAGE_UPLOAD_BYTES + 1,
  });
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.reason : "", /smaller than/i);
});

test("validateImageFile: a file exactly at the limit is accepted", () => {
  const result = validateImageFile({
    type: "image/gif",
    size: MAX_IMAGE_UPLOAD_BYTES,
  });
  assert.deepEqual(result, { ok: true });
});

test("validateImageFile: honors a custom maxBytes override", () => {
  const accepted = validateImageFile({ type: "image/webp", size: 50 }, 100);
  assert.deepEqual(accepted, { ok: true });
  const rejected = validateImageFile({ type: "image/webp", size: 150 }, 100);
  assert.equal(rejected.ok, false);
});
