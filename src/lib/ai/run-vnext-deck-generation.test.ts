/**
 * vNext deck generation contract tests.
 *
 * Tests the generation pipeline:
 *   AiDeckPlanV1 (raw AI output) → repairAiDeckPlan → compileSlide → DeckV7
 *
 * Uses a stub `complete` function so no real AI calls are made.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  runVnextDeckGeneration,
  type RunVnextDeckGenerationInput,
} from "@/lib/ai/run-vnext-deck-generation";
import type { CompleteFn } from "@/lib/ai/generate";
import { DECK_SCHEMA_VERSION_V7 } from "@/lib/presentation-vnext/schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid AiDeckPlanV1 JSON with a cover + content slide. */
const VALID_PLAN_JSON = JSON.stringify({
  planVersion: 1,
  locale: "en",
  slides: [
    {
      kind: "cover",
      slots: {
        title: { type: "shortText", text: "My Presentation" },
        subtitle: { type: "shortText", text: "A strategic overview" },
      },
    },
    {
      kind: "content",
      slots: {
        title: { type: "shortText", text: "Key Findings" },
        bullets: {
          type: "bullets",
          items: [{ text: "Finding one" }, { text: "Finding two" }],
        },
      },
    },
  ],
});

function makeStubComplete(response: string): CompleteFn {
  return async () => response;
}

function makeSequenceComplete(responses: string[]): {
  complete: CompleteFn;
  getCallCount: () => number;
} {
  let calls = 0;
  return {
    complete: async () => {
      const response = responses[Math.min(calls, responses.length - 1)];
      calls += 1;
      return response;
    },
    getCallCount: () => calls,
  };
}

function makeInput(
  complete: CompleteFn,
  overrides: Partial<RunVnextDeckGenerationInput> = {},
): RunVnextDeckGenerationInput {
  return {
    contentJson: {
      root: {
        children: [
          {
            type: "heading",
            tag: "h1",
            children: [{ text: "My Presentation" }],
          },
          {
            type: "paragraph",
            children: [{ text: "Key findings from our research." }],
          },
        ],
      },
    },
    visuals: new Map(),
    themePackageId: "clarity",
    complete,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runVnextDeckGeneration", () => {
  test("produces a schemaVersion 7 deck", async () => {
    const result = await runVnextDeckGeneration(
      makeInput(makeStubComplete(VALID_PLAN_JSON)),
    );
    assert.equal(result.deck.schemaVersion, DECK_SCHEMA_VERSION_V7);
  });

  test("deck has at least one slide per plan slide", async () => {
    const result = await runVnextDeckGeneration(
      makeInput(makeStubComplete(VALID_PLAN_JSON)),
    );
    assert.equal(result.deck.slides.length, 2);
  });

  test("deck theme packageId matches input", async () => {
    const result = await runVnextDeckGeneration(
      makeInput(makeStubComplete(VALID_PLAN_JSON)),
    );
    assert.equal(result.deck.theme.packageId, "clarity");
  });

  test("selectedKindCounts reflect compiled slide kinds", async () => {
    const result = await runVnextDeckGeneration(
      makeInput(makeStubComplete(VALID_PLAN_JSON)),
    );
    assert.equal(result.selectedKindCounts["cover"], 1);
    assert.equal(result.selectedKindCounts["content"], 1);
  });

  test("deck canvas defaults to 16:9", async () => {
    const result = await runVnextDeckGeneration(
      makeInput(makeStubComplete(VALID_PLAN_JSON)),
    );
    assert.equal(result.deck.canvas.format, "16:9");
  });

  test("custom canvas is preserved", async () => {
    const canvas = {
      format: "4:3" as const,
      width: 100,
      height: 75,
      unit: "percent" as const,
    };
    const result = await runVnextDeckGeneration(
      makeInput(makeStubComplete(VALID_PLAN_JSON), { canvas }),
    );
    assert.equal(result.deck.canvas.format, "4:3");
  });

  test("slide nodes have generated ids (not AI-provided)", async () => {
    const result = await runVnextDeckGeneration(
      makeInput(makeStubComplete(VALID_PLAN_JSON)),
    );
    for (const slide of result.deck.slides) {
      assert.ok(typeof slide.id === "string" && slide.id.length > 0);
      // Generated ids follow the prefix-counter pattern from template compiler
      assert.ok(
        slide.id.startsWith("slide-"),
        `Expected slide id to start with "slide-", got "${slide.id}"`,
      );
    }
  });

  test("slide template kind matches plan kind", async () => {
    const result = await runVnextDeckGeneration(
      makeInput(makeStubComplete(VALID_PLAN_JSON)),
    );
    assert.equal(result.deck.slides[0].template.kind, "cover");
    assert.equal(result.deck.slides[1].template.kind, "content");
  });

  test("truncated flag comes from source extraction", async () => {
    const result = await runVnextDeckGeneration(
      makeInput(makeStubComplete(VALID_PLAN_JSON)),
    );
    // Small content never truncates
    assert.equal(result.truncated, false);
  });

  test("repair diagnostic for unknown kind surfaces in result diagnostics", async () => {
    const planWithUnknownKind = JSON.stringify({
      planVersion: 1,
      locale: "en",
      slides: [
        {
          kind: "not-a-real-kind",
          slots: { title: { type: "shortText", text: "T" } },
        },
      ],
    });
    const result = await runVnextDeckGeneration(
      makeInput(makeStubComplete(planWithUnknownKind)),
    );
    // Repair maps unknown kind to "content" with a warning
    assert.equal(result.deck.slides[0].template.kind, "content");
    assert.ok(
      result.diagnostics.some((d) => d.code === "unknown-template-kind"),
      "Expected unknown-template-kind diagnostic",
    );
  });

  test("rejects empty outline", async () => {
    await assert.rejects(
      runVnextDeckGeneration(
        makeInput(makeStubComplete(VALID_PLAN_JSON), {
          contentJson: { root: { children: [] } },
        }),
      ),
      /empty/i,
    );
  });

  test("rejects after max attempts when AI returns garbage", async () => {
    const badComplete: CompleteFn = async () => "not json at all {{{";
    await assert.rejects(
      runVnextDeckGeneration(makeInput(badComplete, { maxAttempts: 1 })),
      /Could not generate/i,
    );
  });

  test("retries malformed slot payload through normal repair path", async () => {
    const malformedPlan = JSON.stringify({
      planVersion: 1,
      slides: [
        {
          kind: "cover",
          slots: {
            title: { type: "shortText", text: { bad: true } },
          },
        },
      ],
    });

    const { complete, getCallCount } = makeSequenceComplete([
      malformedPlan,
      VALID_PLAN_JSON,
    ]);

    const result = await runVnextDeckGeneration(
      makeInput(complete, { maxAttempts: 2 }),
    );
    assert.equal(getCallCount(), 2);
    assert.equal(result.deck.slides.length, 2);
  });

  test("rejects malformed slot payload with final generation error", async () => {
    const malformedPlan = JSON.stringify({
      planVersion: 1,
      slides: [
        {
          kind: "cover",
          slots: {
            title: { type: "shortText", text: { bad: true } },
          },
        },
      ],
    });

    await assert.rejects(
      runVnextDeckGeneration(
        makeInput(makeStubComplete(malformedPlan), { maxAttempts: 1 }),
      ),
      /Could not generate a valid v7 deck plan/i,
    );
  });

  test("deck asset registry is initialized empty", async () => {
    const result = await runVnextDeckGeneration(
      makeInput(makeStubComplete(VALID_PLAN_JSON)),
    );
    assert.deepEqual(result.deck.assets.images, {});
  });

  test("plan locale is preserved in deck metadata", async () => {
    const frPlan = JSON.stringify({
      planVersion: 1,
      locale: "fr",
      slides: [
        {
          kind: "cover",
          slots: { title: { type: "shortText", text: "Ma Présentation" } },
        },
      ],
    });
    const result = await runVnextDeckGeneration(
      makeInput(makeStubComplete(frPlan)),
    );
    assert.equal(result.deck.metadata?.locale, "fr");
  });
});
