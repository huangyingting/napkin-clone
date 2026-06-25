import assert from "node:assert/strict";
import test from "node:test";

import {
  ModelOutputBudgetError,
  extractJson,
  runGenerationAttempts,
  type CompleteFn,
} from "@/lib/ai/generation-runner";
import {
  AI_MODEL_OUTPUT_MAX_BYTES,
  AI_MODEL_OUTPUT_MAX_JSON_NODES,
} from "@/lib/limits";
import type { GenerationFailureContext } from "@/lib/ai/generation-diagnostics";

function completeSequence(responses: string[]): {
  complete: CompleteFn;
  messages: string[];
} {
  const messages: string[] = [];
  let calls = 0;
  return {
    complete: async (chatMessages) => {
      messages.push(chatMessages.map((message) => message.content).join("\n"));
      const response = responses[Math.min(calls, responses.length - 1)];
      calls += 1;
      return response;
    },
    messages,
  };
}

test("shared runner retries with the prior failure reason", async () => {
  const failures: GenerationFailureContext[] = [];
  const { complete, messages } = completeSequence([
    JSON.stringify({ repaired: false }),
    JSON.stringify({ repaired: true }),
  ]);

  const result = await runGenerationAttempts({
    pipeline: "visual",
    maxAttempts: 2,
    initialFailureReason: "initial",
    complete,
    buildMessages: (retryReason) => [
      {
        role: "user",
        content: retryReason ? `retry: ${retryReason}` : "first attempt",
      },
    ],
    repair: (parsed) =>
      (parsed as { repaired?: boolean }).repaired
        ? { success: true, data: parsed }
        : { success: false, reason: "repair failed" },
    validate: (repaired) => ({ success: true, data: repaired }),
    makeServiceError: (reason, cause) => new Error(reason, { cause }),
    makeFinalError: (_attempts, lastReason) => new Error(lastReason),
    reportFailure: (context) => failures.push(context),
  });

  assert.deepEqual(result, { repaired: true });
  assert.equal(messages.length, 2);
  assert.equal(messages[0], "first attempt");
  assert.equal(messages[1], "retry: repair failed");
  assert.equal(failures.length, 1);
  assert.equal(failures[0].stage, "repair");
  assert.equal(failures[0].reason, "repair failed");
});

test("shared runner preserves exhausted retry count in final error", async () => {
  const { complete } = completeSequence(["not json"]);

  await assert.rejects(
    runGenerationAttempts({
      pipeline: "deck",
      maxAttempts: 3,
      initialFailureReason: "initial",
      complete,
      buildMessages: () => [{ role: "user", content: "try" }],
      repair: (parsed) => ({ success: true, data: parsed }),
      validate: (parsed) => ({ success: true, data: parsed }),
      makeServiceError: (reason, cause) => new Error(reason, { cause }),
      makeFinalError: (attempts, lastReason) =>
        new Error(`${attempts}: ${lastReason}`),
      reportFailure: () => {},
    }),
    /3: The AI response was not valid JSON\./,
  );
});

test("extractJson handles objects, arrays, fences, and surrounding prose", () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson("[1,2,3]"), [1, 2, 3]);
  assert.deepEqual(extractJson('Sure!\n```json\n{"a":2}\n```'), { a: 2 });
  assert.deepEqual(extractJson('prefix {"a":3} suffix'), { a: 3 });
  assert.equal(extractJson("not json at all"), undefined);
  assert.equal(extractJson(""), undefined);
});

test("extractJson rejects model output over byte budget", () => {
  assert.throws(
    () => extractJson("x".repeat(AI_MODEL_OUTPUT_MAX_BYTES + 1)),
    (error) =>
      error instanceof ModelOutputBudgetError &&
      error.metric === "bytes" &&
      error.limit === AI_MODEL_OUTPUT_MAX_BYTES,
  );
});

test("extractJson rejects parsed output over node budget", () => {
  const overBudget = JSON.stringify(
    Array.from({ length: AI_MODEL_OUTPUT_MAX_JSON_NODES + 1 }, () => 1),
  );
  assert.throws(
    () => extractJson(overBudget),
    (error) =>
      error instanceof ModelOutputBudgetError && error.metric === "jsonNodes",
  );
});
