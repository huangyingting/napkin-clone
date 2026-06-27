import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildDeckGenerationBody,
  EMPTY_CONTENT_ERROR,
  parseDeckResponse,
  requestDeckGeneration,
} from "./deck-generation-request";
import { CURRENT_DECK_SCHEMA_VERSION } from "@/lib/presentation/deck";

// A schema-valid deck reused across the parse/request tests. Mirrors the
// current deck schema.
const VALID_DECK = {
  schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
  canvas: { format: "16:9" },
  design: { themeId: "default" },
  masters: [{ id: "master-default", name: "Default", elements: [] }],
  defaultMasterId: "master-default",
  slides: [
    {
      id: "slide-1",
      index: 0,
      title: "Current",
      templateId: "content",
      notes: "",
      elements: [
        {
          id: "text-1",
          kind: "text",
          role: "title",
          zIndex: 0,
          box: { x: 6, y: 6, w: 88, h: 16 },
          content: {
            kind: "text",
            text: "Current",
            paragraphs: [{ text: "Current" }],
          },
          designOverrides: {
            textStyle: {
              fontSize: 6,
              bold: true,
              italic: false,
              align: "left",
            },
          },
        },
      ],
    },
  ],
};

// A minimal serialised document content payload (opaque to the helper).
const CONTENT_JSON = { root: { children: [] } };

// ---------------------------------------------------------------------------
// buildDeckGenerationBody — request shaping from contentJson + options.
// ---------------------------------------------------------------------------

test("buildDeckGenerationBody includes contentJson and omits options when unset", () => {
  const body = buildDeckGenerationBody(CONTENT_JSON);
  assert.deepEqual(body, { contentJson: CONTENT_JSON });
  assert.equal("options" in body, false);
});

test("buildDeckGenerationBody includes only the set knobs", () => {
  const body = buildDeckGenerationBody(CONTENT_JSON, {
    length: "short",
    tone: "  playful  ",
    audience: "  execs  ",
  });
  assert.deepEqual(body, {
    contentJson: CONTENT_JSON,
    options: { length: "short", tone: "playful", audience: "execs" },
  });
});

test("buildDeckGenerationBody drops blank tone/audience strings", () => {
  const body = buildDeckGenerationBody(CONTENT_JSON, {
    length: "long",
    tone: "   ",
    audience: "",
  });
  assert.deepEqual(body, {
    contentJson: CONTENT_JSON,
    options: { length: "long" },
  });
});

// ---------------------------------------------------------------------------
// parseDeckResponse — validate { deck, truncated } payloads.
// ---------------------------------------------------------------------------

test("parseDeckResponse returns the deck and truncated flag", () => {
  const parsed = parseDeckResponse({ deck: VALID_DECK, truncated: true });
  assert.ok(parsed);
  assert.equal(parsed.truncated, true);
  assert.equal(parsed.deck.slides[0].title, "Current");
});

test("parseDeckResponse defaults truncated to false", () => {
  const parsed = parseDeckResponse({ deck: VALID_DECK });
  assert.ok(parsed);
  assert.equal(parsed.truncated, false);
});

test("parseDeckResponse returns null for an invalid or missing deck", () => {
  assert.equal(parseDeckResponse({ deck: { not: "a deck" } }), null);
  assert.equal(parseDeckResponse({ truncated: true }), null);
  assert.equal(parseDeckResponse(null), null);
  assert.equal(parseDeckResponse("nope"), null);
});

// ---------------------------------------------------------------------------
// requestDeckGeneration — the shared fetch path (injectable fetch).
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

test("requestDeckGeneration returns the parsed deck on success", async () => {
  const fetchImpl = (async () =>
    jsonResponse({
      deck: VALID_DECK,
      truncated: true,
    })) as unknown as typeof fetch;
  const result = await requestDeckGeneration(CONTENT_JSON, {}, fetchImpl);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.truncated, true);
    assert.equal(result.deck.slides[0].title, "Current");
  }
});

test("requestDeckGeneration POSTs to /api/generate-deck with the built body", async () => {
  let seenUrl = "";
  let seenBody: unknown = null;
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    seenUrl = url;
    seenBody = JSON.parse(String(init?.body));
    return jsonResponse({ deck: VALID_DECK, truncated: false });
  }) as unknown as typeof fetch;
  await requestDeckGeneration(
    CONTENT_JSON,
    { length: "medium", audience: "students" },
    fetchImpl,
  );
  assert.equal(seenUrl, "/api/generate-deck");
  assert.deepEqual(seenBody, {
    contentJson: CONTENT_JSON,
    options: { length: "medium", audience: "students" },
  });
});

test("requestDeckGeneration classifies a 404 as unavailable (flag off)", async () => {
  const fetchImpl = (async () =>
    jsonResponse(
      { error: "Not found." },
      false,
      404,
    )) as unknown as typeof fetch;
  const result = await requestDeckGeneration(CONTENT_JSON, {}, fetchImpl);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errorKind, "unavailable");
  }
});

test("requestDeckGeneration classifies a 402 as credit", async () => {
  const fetchImpl = (async () =>
    jsonResponse(
      { error: "Insufficient credits." },
      false,
      402,
    )) as unknown as typeof fetch;
  const result = await requestDeckGeneration(CONTENT_JSON, {}, fetchImpl);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errorKind, "credit");
    assert.equal(result.error, "Insufficient credits.");
  }
});

test("requestDeckGeneration classifies a 504 as timeout", async () => {
  const fetchImpl = (async () =>
    jsonResponse(
      { error: "Too slow." },
      false,
      504,
    )) as unknown as typeof fetch;
  const result = await requestDeckGeneration(CONTENT_JSON, {}, fetchImpl);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errorKind, "timeout");
  }
});

test("requestDeckGeneration classifies an empty-outline 400 as empty", async () => {
  const fetchImpl = (async () =>
    jsonResponse(
      { error: "`contentJson` does not contain any usable outline content." },
      false,
      400,
    )) as unknown as typeof fetch;
  const result = await requestDeckGeneration(CONTENT_JSON, {}, fetchImpl);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errorKind, "empty");
    assert.equal(result.error, EMPTY_CONTENT_ERROR);
  }
});

test("requestDeckGeneration classifies a non-empty 400 as other", async () => {
  const fetchImpl = (async () =>
    jsonResponse(
      { error: "`contentJson` is required." },
      false,
      400,
    )) as unknown as typeof fetch;
  const result = await requestDeckGeneration(CONTENT_JSON, {}, fetchImpl);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errorKind, "other");
  }
});

test("requestDeckGeneration classifies other non-OK statuses as other", async () => {
  const fetchImpl = (async () =>
    jsonResponse({ error: "boom" }, false, 500)) as unknown as typeof fetch;
  const result = await requestDeckGeneration(CONTENT_JSON, {}, fetchImpl);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errorKind, "other");
    assert.equal(result.error, "boom");
  }
});

test("requestDeckGeneration returns a network error when fetch throws", async () => {
  const fetchImpl = (async () => {
    throw new Error("offline");
  }) as unknown as typeof fetch;
  const result = await requestDeckGeneration(CONTENT_JSON, {}, fetchImpl);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errorKind, "network");
  }
});

test("requestDeckGeneration classifies an aborted fetch as timeout", async () => {
  const fetchImpl = (async () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  }) as unknown as typeof fetch;
  const result = await requestDeckGeneration(CONTENT_JSON, {}, fetchImpl);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errorKind, "timeout");
  }
});

test("requestDeckGeneration classifies an unparseable success payload as other", async () => {
  const fetchImpl = (async () =>
    jsonResponse({
      deck: { bogus: true },
      truncated: false,
    })) as unknown as typeof fetch;
  const result = await requestDeckGeneration(CONTENT_JSON, {}, fetchImpl);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errorKind, "other");
  }
});
