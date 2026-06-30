/**
 * Tests for the server-upload path of the use-image-upload hook (Epic #374).
 *
 * The `applyServerUpload` helper is extracted from the hook so it can be
 * exercised without a DOM or React renderer.  Three scenarios are covered:
 *
 *  1. Success — `uploadFn` resolves with `ok: true` → `onAccept` called.
 *  2. Action error — `uploadFn` resolves with `ok: false` (auth, validation,
 *     etc.) → `onError` called; fallback is NOT triggered.
 *  3. Rejection — `uploadFn` rejects (network outage, timeout, etc.) →
 *     `onFallback` called; `onAccept` and `onError` are NOT triggered.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { applyServerUpload } from "@/lib/presentation/use-image-upload";
import type { UploadSlideAssetFn } from "@/lib/presentation/use-image-upload";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal File-like object sufficient for applyServerUpload. */
function makeFile(name = "photo.png", type = "image/png"): File {
  return new File([new Uint8Array([0, 1, 2, 3])], name, { type });
}

function makeOpts(overrides: {
  uploadFn: UploadSlideAssetFn;
  onAccept?: (src: string, assetId?: string) => void;
  onError?: (message: string) => void;
  onFallback?: () => void;
}) {
  return {
    documentId: "doc-test",
    file: makeFile(),
    onAccept:
      overrides.onAccept ??
      (() => assert.fail("onAccept should not be called")),
    onError:
      overrides.onError ?? (() => assert.fail("onError should not be called")),
    onFallback:
      overrides.onFallback ??
      (() => assert.fail("onFallback should not be called")),
    uploadFn: overrides.uploadFn,
  };
}

// ---------------------------------------------------------------------------
// Success path
// ---------------------------------------------------------------------------

describe("applyServerUpload — success", () => {
  it("calls onAccept with url and assetId when uploadFn resolves ok", async () => {
    const calls: Array<[string, string | undefined]> = [];
    const uploadFn: UploadSlideAssetFn = async () => ({
      ok: true,
      data: { url: "/slide-assets/doc1/hash.png", assetId: "asset-123" },
    });

    applyServerUpload(
      makeOpts({
        uploadFn,
        onAccept: (src, assetId) => calls.push([src, assetId]),
        onError: () => assert.fail("onError must not be called on success"),
        onFallback: () =>
          assert.fail("onFallback must not be called on success"),
      }),
    );

    // Wait for the microtask queue to flush.
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "/slide-assets/doc1/hash.png");
    assert.equal(calls[0][1], "asset-123");
  });

  it("passes the correct documentId and file in the FormData to uploadFn", async () => {
    let capturedDocumentId: string | undefined;
    let capturedFileName: string | undefined;

    const uploadFn: UploadSlideAssetFn = async (documentId, formData) => {
      capturedDocumentId = documentId;
      const f = formData.get("file");
      capturedFileName = f instanceof File ? f.name : undefined;
      return { ok: true, data: { url: "/test/url", assetId: "id-1" } };
    };

    applyServerUpload(
      makeOpts({
        uploadFn,
        onAccept: () => {},
        onError: () => assert.fail("onError must not be called"),
        onFallback: () => assert.fail("onFallback must not be called"),
      }),
    );

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(capturedDocumentId, "doc-test");
    assert.equal(capturedFileName, "photo.png");
  });
});

// ---------------------------------------------------------------------------
// Action error path (auth, validation, etc.)
// ---------------------------------------------------------------------------

describe("applyServerUpload — action error", () => {
  it("calls onError with the server message when uploadFn resolves with ok=false", async () => {
    const errors: string[] = [];
    const uploadFn: UploadSlideAssetFn = async () => ({
      ok: false,
      error: "You do not have permission to edit this document.",
    });

    applyServerUpload(
      makeOpts({
        uploadFn,
        onAccept: () =>
          assert.fail("onAccept must not be called on action error"),
        onError: (msg) => errors.push(msg),
        onFallback: () =>
          assert.fail("onFallback must not be called on action error"),
      }),
    );

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(errors.length, 1);
    assert.equal(
      errors[0],
      "You do not have permission to edit this document.",
    );
  });

  it("does NOT fall back to data URL on action error — error is surfaced instead", async () => {
    let fallbackTriggered = false;
    let errorTriggered = false;

    const uploadFn: UploadSlideAssetFn = async () => ({
      ok: false,
      error: "Unsupported file type.",
    });

    applyServerUpload(
      makeOpts({
        uploadFn,
        onAccept: () => assert.fail("onAccept must not be called"),
        onError: () => {
          errorTriggered = true;
        },
        onFallback: () => {
          fallbackTriggered = true;
        },
      }),
    );

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(
      errorTriggered,
      true,
      "onError must be called for action errors",
    );
    assert.equal(
      fallbackTriggered,
      false,
      "onFallback must not be called for action errors",
    );
  });
});

// ---------------------------------------------------------------------------
// Rejection / network failure path
// ---------------------------------------------------------------------------

describe("applyServerUpload — rejection (network / unexpected error)", () => {
  it("calls onFallback when uploadFn rejects", async () => {
    let fallbackCalled = false;
    const uploadFn: UploadSlideAssetFn = async () => {
      throw new Error("Network error");
    };

    applyServerUpload(
      makeOpts({
        uploadFn,
        onAccept: () => assert.fail("onAccept must not be called on rejection"),
        onError: () => assert.fail("onError must not be called on rejection"),
        onFallback: () => {
          fallbackCalled = true;
        },
      }),
    );

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(fallbackCalled, true);
  });

  it("does NOT call onError when uploadFn rejects (network failures use fallback)", async () => {
    let errorCalled = false;
    const uploadFn: UploadSlideAssetFn = async () => {
      throw new TypeError("fetch failed");
    };

    applyServerUpload(
      makeOpts({
        uploadFn,
        onAccept: () => assert.fail("onAccept must not be called"),
        onError: () => {
          errorCalled = true;
        },
        onFallback: () => {},
      }),
    );

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(
      errorCalled,
      false,
      "network rejections must not trigger onError",
    );
  });
});
