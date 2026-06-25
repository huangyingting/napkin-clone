import assert from "node:assert/strict";
import { test } from "node:test";

import { GenerationError, MAX_INPUT_CHARS } from "@/lib/ai/generate";
import { ModelOutputBudgetError } from "@/lib/ai/generation-runner";

import { mapGenerateError, parseGeneratePayload } from "./parser";

function assertParseStatus(
  body: Record<string, unknown>,
  expectedStatus: number,
): void {
  const result = parseGeneratePayload(body);
  assert.equal(result.ok, false);
  assert.equal(result.status, expectedStatus);
}

test("parseGeneratePayload accepts the full typed payload", () => {
  const result = parseGeneratePayload({
    text: "make a timeline",
    type: "timeline",
    orientation: "horizontal",
    detailLevel: "detailed",
    stayCloserToText: true,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.payload, {
    text: "make a timeline",
    type: "timeline",
    orientation: "horizontal",
    detailLevel: "detailed",
    stayCloserToText: true,
  });
});

test("parseGeneratePayload preserves validation statuses", () => {
  assert.deepEqual(parseGeneratePayload({ text: " " }), {
    ok: false,
    status: 400,
    message: "`text` is required.",
  });
  assertParseStatus({ text: "x".repeat(MAX_INPUT_CHARS + 1) }, 413);
  assertParseStatus({ text: "ok", type: "bad" }, 400);
});

test("mapGenerateError preserves generation failure contract", () => {
  assert.deepEqual(mapGenerateError(new GenerationError("bad output")), {
    status: 502,
    message: "We couldn't generate visuals from that text. Please try again.",
    log: { reason: "generation-failed", status: 502 },
  });

  test("mapGenerateError maps model-output budget failures safely", () => {
    assert.deepEqual(
      mapGenerateError(new ModelOutputBudgetError("bytes", 10, 5)),
      {
        status: 502,
        message: "The AI response was too large. Please try again.",
        log: { reason: "model-output-budget", status: 502 },
      },
    );
  });
});
