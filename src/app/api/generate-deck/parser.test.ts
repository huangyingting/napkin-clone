import assert from "node:assert/strict";
import { test } from "node:test";

import { GenerationError } from "@/lib/ai/generate";
import { ModelOutputBudgetError } from "@/lib/ai/generation-runner";
import { AI_OPTION_MAX_CHARS } from "@/lib/limits";

import {
  mapGenerateDeckError,
  parseDeckOptions,
  parseGenerateDeckPayload,
} from "./parser";

test("parseDeckOptions accepts current tuning fields", () => {
  assert.deepEqual(
    parseDeckOptions({ length: "short", tone: "clear", audience: "execs" }),
    {
      options: { length: "short", tone: "clear", audience: "execs" },
    },
  );
});

test("parseDeckOptions rejects superseded or invalid option shapes", () => {
  assert.deepEqual(parseDeckOptions("short"), {
    error: "`options` must be an object.",
  });
  assert.deepEqual(parseDeckOptions({ length: "tiny" }), {
    error: "`options.length` must be one of: short, medium, long.",
  });
  assert.deepEqual(
    parseDeckOptions({ tone: "x".repeat(AI_OPTION_MAX_CHARS + 1) }),
    {
      error: `\`options.tone\` is too long (${AI_OPTION_MAX_CHARS + 1} characters). The maximum is ${AI_OPTION_MAX_CHARS}.`,
    },
  );
});

test("parseGenerateDeckPayload preserves required content errors", () => {
  assert.deepEqual(parseGenerateDeckPayload({}), {
    ok: false,
    status: 400,
    message: "`contentJson` is required.",
  });
});

test("mapGenerateDeckError preserves generation failure contract", () => {
  assert.deepEqual(mapGenerateDeckError(new GenerationError("bad output")), {
    status: 502,
    message:
      "We couldn't generate a deck from that document. Please try again.",
    log: { reason: "generation-failed", status: 502 },
  });

  test("mapGenerateDeckError maps model-output budget failures safely", () => {
    assert.deepEqual(
      mapGenerateDeckError(new ModelOutputBudgetError("bytes", 10, 5)),
      {
        status: 502,
        message: "The AI response was too large. Please try again.",
        log: { reason: "model-output-budget", status: 502 },
      },
    );
  });
});
