/**
 * End-to-end, network-free deck-generation integration test (issue #267).
 *
 * Unlike the focused unit suites, this exercises the REAL pipeline assembled by
 * hand — `buildDeckSource` → `buildDeckGenerationMessages` → `generateDeck` —
 * with a STUBBED `complete`, so no network, DOM, or model is involved. It is the
 * integration counterpart to the per-module tests: it proves the modules wire
 * together and that the route's contract (valid, orphan-free deck; preserved
 * inventory ids; truncation flag; empty-input guard) holds across the seam.
 *
 * All fixtures come from the shared `__fixtures__/deck-fixtures` module so this
 * suite cannot drift from `deck-source.test.ts` / `run-deck-generation.test.ts`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDeckSource } from "@/lib/ai/deck-source";
import { buildDeckGenerationMessages } from "@/lib/ai/deck-prompt";
import { generateDeck } from "@/lib/ai/generate-deck";
import {
  EmptyInputError,
  GenerationError,
  MAX_INPUT_CHARS,
} from "@/lib/ai/generate";
import { safeParseDeck } from "@/lib/presentation/deck-schema";
import type { Deck } from "@/lib/presentation/deck";
import {
  CODE_FENCED_DECK_JSON,
  DOC_EMPTY,
  DOC_HUGE,
  DOC_NO_VISUALS,
  DOC_WITH_VISUAL,
  MALFORMED_DECK_JSON,
  VALID_DECK_JSON,
  VISUALS_EMPTY,
  VISUALS_V1,
  constantComplete,
  countingComplete,
} from "@/lib/ai/__fixtures__/deck-fixtures";

/** Every `visualId` referenced by a `visual` element across all slides. */
function visualElementIds(deck: Deck): string[] {
  return deck.slides.flatMap((slide) =>
    (slide.elements ?? [])
      .filter((element) => element.kind === "visual")
      .map((element) => (element as { visualId: string }).visualId),
  );
}

// ---------------------------------------------------------------------------
// Success path — real pipeline produces a valid, orphan-free deck.
// ---------------------------------------------------------------------------

test("success: real pipeline yields a valid, orphan-free deck with preserved inventory ids", async () => {
  const source = buildDeckSource(DOC_WITH_VISUAL, VISUALS_V1);

  // The inventory is built from the real document visuals only.
  assert.deepEqual(
    source.visualInventory.map((item) => item.id),
    ["v1"],
  );

  // The prompt builder consumes the source and surfaces the inventory id.
  const messages = buildDeckGenerationMessages(source);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "system");
  assert.equal(messages[1].role, "user");
  assert.ok(
    messages[1].content.includes("v1"),
    "the user prompt must list the inventory visual id",
  );
  assert.ok(
    messages[1].content.includes(source.outline),
    "the user prompt must embed the outline verbatim",
  );

  const deck = await generateDeck(source, {
    complete: constantComplete(VALID_DECK_JSON),
  });

  // Valid against the schema.
  assert.ok(safeParseDeck(deck).success, "generated deck must be schema-valid");

  // Inventory id is preserved in the output...
  const ids = visualElementIds(deck);
  assert.ok(ids.includes("v1"), "the inventory visual id must be preserved");

  // ...and no invented / orphaned visual id survives.
  const knownIds = new Set(source.visualInventory.map((item) => item.id));
  for (const id of ids) {
    assert.ok(
      knownIds.has(id),
      `output must not reference an out-of-inventory visual id: ${id}`,
    );
  }
  assert.ok(
    !ids.includes("ghost"),
    "the invented 'ghost' visual id must be stripped",
  );
});

test("success: code-fenced model output is tolerated and yields a valid deck", async () => {
  const source = buildDeckSource(DOC_WITH_VISUAL, VISUALS_V1);

  const deck = await generateDeck(source, {
    complete: constantComplete(CODE_FENCED_DECK_JSON),
  });

  assert.ok(safeParseDeck(deck).success);
  assert.ok(visualElementIds(deck).includes("v1"));
});

// ---------------------------------------------------------------------------
// Malformed model output — retry then GenerationError.
// ---------------------------------------------------------------------------

test("malformed model JSON: retries once then throws GenerationError", async () => {
  const source = buildDeckSource(DOC_WITH_VISUAL, VISUALS_V1);
  const stub = countingComplete(MALFORMED_DECK_JSON);

  await assert.rejects(
    generateDeck(source, { complete: stub.complete }),
    GenerationError,
  );

  // Default is first attempt + one retry = two model calls.
  assert.equal(stub.calls(), 2, "must retry once before giving up");
});

// ---------------------------------------------------------------------------
// No-visuals document — deck has zero visual elements.
// ---------------------------------------------------------------------------

test("no-visuals doc: generated deck contains zero visual elements", async () => {
  const source = buildDeckSource(DOC_NO_VISUALS, VISUALS_EMPTY);
  assert.deepEqual(source.visualInventory, []);

  // The model still references visuals, but with an empty inventory they are
  // all orphans and must be stripped.
  const deck = await generateDeck(source, {
    complete: constantComplete(VALID_DECK_JSON),
  });

  assert.ok(safeParseDeck(deck).success);
  assert.equal(
    visualElementIds(deck).length,
    0,
    "no visual elements may survive when the inventory is empty",
  );
});

// ---------------------------------------------------------------------------
// Huge document — truncation flag + outline budget.
// ---------------------------------------------------------------------------

test("huge doc: source is truncated and outline stays within MAX_INPUT_CHARS", () => {
  const source = buildDeckSource(DOC_HUGE, VISUALS_EMPTY);

  assert.equal(source.truncated, true, "huge document must report truncated");
  assert.ok(
    source.outline.length <= MAX_INPUT_CHARS,
    `outline length ${source.outline.length} exceeds ${MAX_INPUT_CHARS}`,
  );
});

// ---------------------------------------------------------------------------
// Empty document — generateDeck throws before calling the model.
// ---------------------------------------------------------------------------

test("empty doc: generateDeck throws the empty-input error without calling complete", async () => {
  const source = buildDeckSource(DOC_EMPTY, VISUALS_EMPTY);
  assert.equal(source.outline, "");

  const stub = countingComplete(VALID_DECK_JSON);

  await assert.rejects(
    generateDeck(source, { complete: stub.complete }),
    EmptyInputError,
  );
  assert.equal(
    stub.calls(),
    0,
    "complete must never be called for empty input",
  );
});
