import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildGenerateBody,
  canGenerateForSelection,
  canGenerateFromText,
  candidatesFrom,
  generateTargetForContext,
  isCreditError,
  messageFrom,
  parseCandidates,
  requestVisualCandidates,
  stampSourceText,
  type GenerateSelection,
} from "./generate";
import { hashSourceText, type Visual } from "./schema";
import { FIXTURES } from "./fixtures";

// A schema-valid visual reused across the parse/stamp tests.
const VALID_VISUAL: Visual = FIXTURES.list;

// ---------------------------------------------------------------------------
// messageFrom — extract a string error or fall back.
// ---------------------------------------------------------------------------

test("messageFrom returns the payload error string when present", () => {
  assert.equal(
    messageFrom({ error: "Out of credits" }, "fallback"),
    "Out of credits",
  );
});

test("messageFrom falls back when error is missing or non-string", () => {
  assert.equal(messageFrom({}, "fallback"), "fallback");
  assert.equal(messageFrom({ error: 42 }, "fallback"), "fallback");
  assert.equal(messageFrom(null, "fallback"), "fallback");
  assert.equal(messageFrom("nope", "fallback"), "fallback");
});

// ---------------------------------------------------------------------------
// candidatesFrom / parseCandidates — pull and validate candidates.
// ---------------------------------------------------------------------------

test("candidatesFrom returns the array or empty", () => {
  assert.deepEqual(candidatesFrom({ candidates: [1, 2] }), [1, 2]);
  assert.deepEqual(candidatesFrom({ candidates: "x" }), []);
  assert.deepEqual(candidatesFrom({}), []);
  assert.deepEqual(candidatesFrom(null), []);
});

test("parseCandidates keeps only schema-valid visuals", () => {
  const parsed = parseCandidates({
    candidates: [VALID_VISUAL, { type: "not-real" }, 5],
  });
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].title, VALID_VISUAL.title);
});

test("parseCandidates returns empty for non-array payloads", () => {
  assert.deepEqual(parseCandidates(null), []);
  assert.deepEqual(parseCandidates({ candidates: {} }), []);
});

// ---------------------------------------------------------------------------
// buildGenerateBody — only non-"auto"/unset knobs are forwarded.
// ---------------------------------------------------------------------------

test("buildGenerateBody includes only the text by default", () => {
  assert.deepEqual(buildGenerateBody("hello"), { text: "hello" });
});

test("buildGenerateBody omits 'auto' knobs", () => {
  assert.deepEqual(
    buildGenerateBody("hi", {
      type: "auto",
      orientation: "auto",
      detailLevel: "auto",
      stayCloserToText: false,
    }),
    { text: "hi" },
  );
});

test("buildGenerateBody forwards concrete knobs", () => {
  assert.deepEqual(
    buildGenerateBody("hi", {
      type: "timeline",
      orientation: "vertical",
      detailLevel: "detailed",
      stayCloserToText: true,
    }),
    {
      text: "hi",
      type: "timeline",
      orientation: "vertical",
      detailLevel: "detailed",
      stayCloserToText: true,
    },
  );
});

// ---------------------------------------------------------------------------
// Eligibility — canGenerateFromText / generateTargetForContext.
// ---------------------------------------------------------------------------

test("canGenerateFromText requires non-whitespace content", () => {
  assert.equal(canGenerateFromText("hi"), true);
  assert.equal(canGenerateFromText("   "), false);
  assert.equal(canGenerateFromText(""), false);
  assert.equal(canGenerateFromText(undefined), false);
  assert.equal(canGenerateFromText(null), false);
});

test("generateTargetForContext resolves a range selection with text", () => {
  const ctx: GenerateSelection = {
    kind: "range",
    blockKey: "k1",
    blockText: "  Some text  ",
  };
  assert.deepEqual(generateTargetForContext(ctx), {
    blockKey: "k1",
    text: "Some text",
  });
  assert.equal(canGenerateForSelection(ctx), true);
});

test("generateTargetForContext resolves a collapsed caret in a non-empty block", () => {
  const ctx: GenerateSelection = {
    kind: "collapsed",
    blockKey: "k2",
    blockText: "Active block",
  };
  assert.deepEqual(generateTargetForContext(ctx), {
    blockKey: "k2",
    text: "Active block",
  });
});

test("generateTargetForContext rejects unusable selections", () => {
  // Wrong kind.
  assert.equal(
    generateTargetForContext({ kind: "visual", blockKey: "k", blockText: "x" }),
    null,
  );
  assert.equal(
    generateTargetForContext({ kind: "none", blockText: "x" }),
    null,
  );
  // Missing block key.
  assert.equal(
    generateTargetForContext({ kind: "range", blockText: "x" }),
    null,
  );
  // Empty / whitespace text.
  assert.equal(
    generateTargetForContext({
      kind: "range",
      blockKey: "k",
      blockText: "   ",
    }),
    null,
  );
  assert.equal(
    generateTargetForContext({ kind: "range", blockKey: "k" }),
    null,
  );
});

// ---------------------------------------------------------------------------
// stampSourceText — stamp source text + hash, or pass through.
// ---------------------------------------------------------------------------

test("stampSourceText stamps trimmed source text and its hash", () => {
  const stamped = stampSourceText(VALID_VISUAL, "  My source  ");
  assert.equal(stamped.sourceText, "My source");
  assert.equal(stamped.sourceTextHash, hashSourceText("My source"));
});

test("stampSourceText passes the visual through for empty text", () => {
  const stamped = stampSourceText(VALID_VISUAL, "   ");
  assert.equal(stamped, VALID_VISUAL);
});

// ---------------------------------------------------------------------------
// requestVisualCandidates — the shared fetch path (injectable fetch).
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

test("requestVisualCandidates returns validated candidates on success", async () => {
  const fetchImpl = (async () =>
    jsonResponse({ candidates: [VALID_VISUAL] })) as unknown as typeof fetch;
  const result = await requestVisualCandidates("hi", {}, fetchImpl);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.candidates.length, 1);
  }
});

test("requestVisualCandidates POSTs to /api/generate with the built body", async () => {
  let capturedUrl: string | undefined;
  let capturedBody: unknown;
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    capturedUrl = url;
    capturedBody = init?.body ? JSON.parse(String(init.body)) : undefined;
    return jsonResponse({ candidates: [VALID_VISUAL] });
  }) as unknown as typeof fetch;

  await requestVisualCandidates("hello", { type: "timeline" }, fetchImpl);
  assert.equal(capturedUrl, "/api/generate");
  assert.deepEqual(capturedBody, { text: "hello", type: "timeline" });
});

test("requestVisualCandidates surfaces the server error message", async () => {
  const fetchImpl = (async () =>
    jsonResponse(
      { error: "Out of credits" },
      false,
      402,
    )) as unknown as typeof fetch;
  const result = await requestVisualCandidates("hi", {}, fetchImpl);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, "Out of credits");
  }
});

test("requestVisualCandidates errors when no usable candidates come back", async () => {
  const fetchImpl = (async () =>
    jsonResponse({ candidates: [{ bogus: true }] })) as unknown as typeof fetch;
  const result = await requestVisualCandidates("hi", {}, fetchImpl);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /No usable visuals/);
  }
});

test("requestVisualCandidates returns a network error when fetch throws", async () => {
  const fetchImpl = (async () => {
    throw new Error("offline");
  }) as unknown as typeof fetch;
  const result = await requestVisualCandidates("hi", {}, fetchImpl);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /Couldn't reach the generator/);
  }
});

// ---------------------------------------------------------------------------
// isCreditError — pure error-kind classification.
// ---------------------------------------------------------------------------

test("isCreditError returns true for a 402 credit error result", () => {
  assert.equal(
    isCreditError({
      ok: false,
      error: "Insufficient credits",
      errorKind: "credit",
    }),
    true,
  );
});

test("isCreditError returns false for a non-credit error result", () => {
  assert.equal(
    isCreditError({
      ok: false,
      error: "Something went wrong",
      errorKind: "other",
    }),
    false,
  );
});

test("isCreditError returns false for a successful result", () => {
  assert.equal(isCreditError({ ok: true, candidates: [] }), false);
});

test("requestVisualCandidates sets errorKind=credit on 402 response", async () => {
  const fetchImpl = (async () =>
    jsonResponse(
      { error: "Insufficient credits" },
      false,
      402,
    )) as unknown as typeof fetch;
  const result = await requestVisualCandidates("hi", {}, fetchImpl);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errorKind, "credit");
  }
});

test("requestVisualCandidates sets errorKind=other on non-402 error response", async () => {
  const fetchImpl = (async () =>
    jsonResponse(
      { error: "Server error" },
      false,
      500,
    )) as unknown as typeof fetch;
  const result = await requestVisualCandidates("hi", {}, fetchImpl);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errorKind, "other");
  }
});

test("requestVisualCandidates sets errorKind=other when no usable candidates", async () => {
  const fetchImpl = (async () =>
    jsonResponse({ candidates: [{ bogus: true }] })) as unknown as typeof fetch;
  const result = await requestVisualCandidates("hi", {}, fetchImpl);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errorKind, "other");
  }
});

test("requestVisualCandidates sets errorKind=other on network failure", async () => {
  const fetchImpl = (async () => {
    throw new Error("offline");
  }) as unknown as typeof fetch;
  const result = await requestVisualCandidates("hi", {}, fetchImpl);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errorKind, "other");
  }
});
