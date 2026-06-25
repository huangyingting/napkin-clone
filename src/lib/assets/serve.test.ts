import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assetEntityTag,
  requestMatchesEntityTag,
  serveStoredAsset,
} from "@/lib/assets/serve";
import type { AssetStorageAdapter } from "@/lib/assets/storage";

test("asset conditional helper matches strong etags and wildcard only", () => {
  assert.equal(requestMatchesEntityTag(null, '"a"'), false);
  assert.equal(requestMatchesEntityTag('"a"', '"a"'), true);
  assert.equal(requestMatchesEntityTag('"b", "a"', '"a"'), true);
  assert.equal(requestMatchesEntityTag("*", '"a"'), true);
  assert.equal(requestMatchesEntityTag('W/"a"', '"a"'), false);
});

test("serveStoredAsset returns 304 without opening a stream when If-None-Match matches", async () => {
  const metadata = { size: 5, mtime: new Date("2026-06-25T00:00:00Z") };
  const etag = assetEntityTag("doc/a.png", metadata);
  let streamed = false;
  const adapter: AssetStorageAdapter = {
    async store() {
      return "";
    },
    urlFor() {
      return "";
    },
    async read() {
      throw new Error("read should not be called");
    },
    async stat() {
      return metadata;
    },
    async stream() {
      streamed = true;
      return new ReadableStream();
    },
    async delete() {},
  };

  const response = await serveStoredAsset({
    adapter,
    storageKey: "doc/a.png",
    mimeType: "image/png",
    request: new Request("https://example.test", {
      headers: { "If-None-Match": etag },
    }),
  });

  assert.equal(response.status, 304);
  assert.equal(response.headers.get("etag"), etag);
  assert.equal(response.headers.get("accept-ranges"), "none");
  assert.equal(streamed, false);
});

test("serveStoredAsset streams local adapters and preserves safe cache headers", async () => {
  const metadata = { size: 5, mtime: new Date("2026-06-25T00:00:00Z") };
  let read = false;
  let streamed = false;
  const adapter: AssetStorageAdapter = {
    async store() {
      return "";
    },
    urlFor() {
      return "";
    },
    async read() {
      read = true;
      return Buffer.from("bytes");
    },
    async stat() {
      return metadata;
    },
    async stream() {
      streamed = true;
      return new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("bytes"));
          controller.close();
        },
      });
    },
    async delete() {},
  };

  const response = await serveStoredAsset({
    adapter,
    storageKey: "doc/a.png",
    mimeType: "image/png",
    request: new Request("https://example.test"),
  });

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "bytes");
  assert.equal(
    response.headers.get("cache-control"),
    "private, max-age=31536000, immutable",
  );
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("content-length"), "5");
  assert.equal(
    response.headers.get("last-modified"),
    metadata.mtime.toUTCString(),
  );
  assert.equal(streamed, true);
  assert.equal(read, false);
});
