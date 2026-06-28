import assert from "node:assert/strict";
import test from "node:test";

import {
  deckModelOutput,
  INVALID_VISUALS_MODEL_JSON,
  invalidVisualsModelPayload,
  MALFORMED_MODEL_JSON,
  repairableDeckModelOutput,
  REPAIRABLE_DECK_MODEL_JSON,
  VALID_DECK_MODEL_JSON,
  VALID_VISUALS_MODEL_JSON,
  visualModelOutput,
  visualsModelPayload,
} from "@/lib/ai/__fixtures__/model-contract-fixtures";
import {
  CODE_FENCED_DECK_JSON,
  DOC_EMPTY,
  DOC_HEADINGS_ONLY,
  DOC_HUGE,
  DOC_NO_VISUALS,
  DOC_WITH_VISUAL,
  FORMAT_BOLD,
  MALFORMED_DECK_JSON,
  VALID_DECK_JSON,
  VISUALS_EMPTY,
  VISUALS_V1,
  VISUAL_V1,
  constantComplete,
  countingComplete,
  heading,
  hr,
  list,
  paragraph,
  quote,
  state,
  text,
  visualMap,
  visualNode,
} from "@/lib/ai/__fixtures__/deck-fixtures";
import { repairDeck } from "@/lib/ai/deck-repair";
import { coerceCandidates } from "@/lib/ai/generate";
import { safeParseDeck } from "@/lib/presentation/deck-schema";
import { safeParseVisual } from "@/lib/visual/schema";

test("visual model contract fixtures cover valid and invalid candidate outputs", () => {
  assert.equal(safeParseVisual(visualModelOutput()).success, true);
  assert.equal(coerceCandidates(visualsModelPayload()).length, 3);
  assert.equal(coerceCandidates(invalidVisualsModelPayload()).length, 3);
});

test("deck model contract fixtures cover valid and repairable outputs", () => {
  const valid = repairDeck(deckModelOutput());
  const repairable = repairDeck(repairableDeckModelOutput());
  assert.ok(valid);
  assert.ok(repairable);
  assert.equal(safeParseDeck(valid).success, true);
  assert.equal(safeParseDeck(repairable).success, true);
});

test("model JSON fixture constants parse to contract shapes", () => {
  assert.equal(
    coerceCandidates(JSON.parse(VALID_VISUALS_MODEL_JSON)).length,
    3,
  );
  assert.equal(
    coerceCandidates(JSON.parse(INVALID_VISUALS_MODEL_JSON)).length,
    3,
  );

  const validDeck = repairDeck(JSON.parse(VALID_DECK_MODEL_JSON));
  const repairableDeck = repairDeck(JSON.parse(REPAIRABLE_DECK_MODEL_JSON));
  assert.ok(validDeck);
  assert.ok(repairableDeck);
  assert.equal(safeParseDeck(validDeck).success, true);
  assert.equal(safeParseDeck(repairableDeck).success, true);
  assert.throws(() => JSON.parse(MALFORMED_MODEL_JSON));
});

test("deck fixtures expose reusable content and completion helpers", async () => {
  for (const doc of [
    DOC_WITH_VISUAL,
    DOC_HEADINGS_ONLY,
    DOC_NO_VISUALS,
    DOC_HUGE,
    DOC_EMPTY,
  ]) {
    assert.equal(typeof doc, "string");
  }

  assert.equal(VISUALS_V1.get("v1"), VISUAL_V1);
  assert.equal(VISUALS_EMPTY.size, 0);
  assert.equal(JSON.parse(VALID_DECK_JSON).schemaVersion, 6);
  assert.ok(CODE_FENCED_DECK_JSON.includes(VALID_DECK_JSON));
  assert.throws(() => JSON.parse(MALFORMED_DECK_JSON));

  const customVisualNode = visualNode("custom");
  const serialized = state([
    heading(1, "Heading"),
    paragraph(text("Bold", FORMAT_BOLD)),
    list(["One"]),
    quote("Quote"),
    hr(),
    customVisualNode,
  ]);
  assert.equal(typeof serialized, "string");
  assert.equal(
    visualMap(["custom", customVisualNode.visual]).get("custom"),
    customVisualNode.visual,
  );
  assert.equal(await constantComplete("ok")(), "ok");

  const counted = countingComplete("retry");
  assert.equal(await counted.complete(), "retry");
  assert.equal(await counted.complete(), "retry");
  assert.equal(counted.calls(), 2);
});
