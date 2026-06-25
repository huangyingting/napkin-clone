import assert from "node:assert/strict";
import test from "node:test";

import {
  deckModelOutput,
  invalidVisualsModelPayload,
  repairableDeckModelOutput,
  visualModelOutput,
  visualsModelPayload,
} from "@/lib/ai/__fixtures__/model-contract-fixtures";
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
