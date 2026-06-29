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

test("buildDeckGenerationBody includes package-template request fields", () => {
  const body = buildDeckGenerationBody(
    CONTENT_JSON,
    { length: "medium" },
    { themePackageId: "noir" },
  );
  assert.deepEqual(body, {
    contentJson: CONTENT_JSON,
    options: { length: "medium" },
    themePackageId: "noir",
  });
});

// ---------------------------------------------------------------------------
// parseDeckResponse — validate { deck, truncated } payloads.
// ---------------------------------------------------------------------------

test("parseDeckResponse returns the deck and truncated flag", () => {
  const parsed = parseDeckResponse({ deck: VALID_DECK, truncated: true });
  assert.ok(parsed);
  assert.equal(parsed.truncated, true);
  assert.ok(parsed.deck, "deck should be present in v6 response");
  assert.equal(parsed.deck.slides[0].title, "Current");
});

test("parseDeckResponse returns package-template response metadata", () => {
  const parsed = parseDeckResponse({
    deck: VALID_DECK,
    truncated: false,
    metadata: {
      requestedGenerationMode: "package-template",
      generationMode: "package-template",
      fallback: false,
      tableSlideCount: 2,
      schemaValid: true,
      themePackageId: "noir",
      selectedKindCounts: { table: 1, cover: 1, ignored: "bad" },
    },
  });

  assert.ok(parsed);
  assert.deepEqual(parsed.metadata, {
    requestedGenerationMode: "package-template",
    generationMode: "package-template",
    fallback: false,
    tableSlideCount: 2,
    schemaValid: true,
    themePackageId: "noir",
    selectedKindCounts: { table: 1, cover: 1 },
  });
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
    assert.ok(result.deck, "deck should be populated for a v6 response");
    assert.equal(result.deck?.slides[0].title, "Current");
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

// ---------------------------------------------------------------------------
// parseDeckResponse — v7 typed extension point
// ---------------------------------------------------------------------------

const VALID_DECK_V7 = {
  schemaVersion: 7,
  canvas: { format: "16:9", width: 100, height: 56.25, unit: "percent" },
  theme: { packageId: "neutral" },
  assets: { images: {} },
  slides: [
    {
      id: "slide-0001",
      type: "slide",
      template: { kind: "cover" },
      style: { ref: "slide.cover" },
      children: [],
    },
  ],
};

test("parseDeckResponse returns deckV7 for a v7-only response even when v6 parse fails", () => {
  const parsed = parseDeckResponse({ deck: VALID_DECK_V7, truncated: false });
  assert.ok(parsed, "v7-only response should parse successfully");
  assert.ok(parsed.deckV7, "deckV7 should be populated for a v7 deck");
  assert.equal(
    parsed.deck,
    undefined,
    "deck should be absent for a v7-only response",
  );
  assert.equal(parsed.truncated, false);
});

test("parseDeckResponse returns deckV7 === undefined for v6 response", () => {
  const parsed = parseDeckResponse({ deck: VALID_DECK, truncated: false });
  assert.ok(parsed, "v6 response should parse successfully");
  assert.equal(
    parsed.deckV7,
    undefined,
    "deckV7 should be absent for v6 responses",
  );
});

// ---------------------------------------------------------------------------
// DeckGenerateResult — deckV7 extension point (type-level check)
// ---------------------------------------------------------------------------

test("DeckGenerateResult.deckV7 is exposed as optional on success", async () => {
  const fetchImpl = (async () =>
    jsonResponse({
      deck: VALID_DECK,
      truncated: false,
    })) as unknown as typeof fetch;
  const result = await requestDeckGeneration(CONTENT_JSON, {}, fetchImpl);
  assert.ok(result.ok);
  if (result.ok) {
    // deckV7 is undefined for v6 responses — structural presence in the type
    // is verified by TypeScript; here we confirm the runtime value.
    assert.equal(result.deckV7, undefined);
  }
});

test("requestDeckGeneration succeeds for a v7 API response and populates deckV7", async () => {
  const fetchImpl = (async () =>
    jsonResponse({
      deck: VALID_DECK_V7,
      truncated: false,
    })) as unknown as typeof fetch;
  const result = await requestDeckGeneration(CONTENT_JSON, {}, fetchImpl);
  assert.equal(result.ok, true, "v7 API response should succeed");
  if (result.ok) {
    assert.ok(result.deckV7, "deckV7 should be populated for a v7 response");
    assert.equal(
      result.deck,
      undefined,
      "deck should be absent for a v7-only response",
    );
    assert.equal(result.truncated, false);
  }
});
