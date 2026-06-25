import assert from "node:assert/strict";
import test from "node:test";

import { buildGenerationFailureDiagnostic } from "@/lib/ai/generation-diagnostics";
import { ERROR_CODES } from "@/lib/diagnostics/error-codes";

test("generation repair diagnostics contain only safe structured metadata", () => {
  const diagnostic = buildGenerationFailureDiagnostic({
    pipeline: "deck",
    stage: "validation",
    attempt: 0,
    maxAttempts: 2,
    reason: "Deck.slides must be an array",
    rawCandidateCount: 1,
    validCandidateCount: 0,
    minCandidateCount: 1,
    prompt: "do not log this prompt",
    sourceText: "do not log this source",
    raw: "do not log this raw output",
  } as Parameters<typeof buildGenerationFailureDiagnostic>[0]);

  assert.equal(diagnostic.code, ERROR_CODES.AI_GENERATION_REPAIR_FAILED);
  assert.equal(diagnostic.scope, "ai.generation.deck");
  assert.deepEqual(diagnostic.meta, {
    pipeline: "deck",
    stage: "validation",
    attempt: 1,
    maxAttempts: 2,
    reason: "Deck.slides must be an array",
    rawCandidateCount: 1,
    validCandidateCount: 0,
    minCandidateCount: 1,
  });
  assert.equal(JSON.stringify(diagnostic).includes("do not log"), false);
});
