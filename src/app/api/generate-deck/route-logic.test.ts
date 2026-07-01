import assert from "node:assert/strict";
import { test } from "node:test";

import { DECK_SCHEMA_VERSION_V7 } from "@/lib/presentation-vnext/schema";
import type { DeckV7, SlideNode } from "@/lib/presentation-vnext/schema";
import {
  buildDeckV7,
  buildCoverSlide,
  buildContentSlide,
  buildTableSlide,
  buildVisualSlide,
  buildSlideV7,
  buildImageNode,
  resetBuilderCounter,
} from "@/test/builders/deck-v7";
import type { RunVnextDeckGenerationResult } from "@/lib/ai/run-vnext-deck-generation";
import { makeDiagnostic } from "@/lib/presentation-vnext/diagnostics";

import type { GenerateDeckPayload } from "./parser";
import {
  buildGenerateDeckSuccessLogFields,
  buildGenerateDeckSuccessResponse,
  generateDeckForRoute,
} from "./route-logic";

const CONTENT_JSON = {
  root: { children: [{ type: "paragraph", children: [{ text: "Roadmap" }] }] },
};

function makeDeckV7(withTable = false): DeckV7 {
  resetBuilderCounter();
  const slides: SlideNode[] = withTable
    ? [buildCoverSlide(), buildTableSlide()]
    : [buildCoverSlide(), buildContentSlide()];
  return buildDeckV7(slides, { theme: { packageId: "noir" } });
}

function makePayload(): GenerateDeckPayload {
  return {
    contentJson: CONTENT_JSON,
    options: {},
    blocks: [],
    visuals: new Map(),
    outline: "Roadmap\nLaunch plan",
    truncated: false,
    generationMode: "package-template",
    themePackageId: "noir",
  };
}

const complete = async () => "{}";

function makeVnextResult(deck: DeckV7): RunVnextDeckGenerationResult {
  return {
    deck,
    truncated: false,
    selectedKindCounts: { cover: 1, content: 1 },
    diagnostics: [],
  };
}

test("generateDeckForRoute calls runVnext with correct inputs", async () => {
  let vnextCalls = 0;
  const diagnostics = [
    makeDiagnostic("slot-over-capacity", "warning", "Adjusted slot payload", {
      slideId: "slide-1",
    }),
  ];

  const result = await generateDeckForRoute(
    { payload: makePayload(), complete },
    {
      runVnext: async (input) => {
        vnextCalls += 1;
        assert.equal(input.themePackageId, "noir");
        return {
          deck: makeDeckV7(true),
          truncated: true,
          selectedKindCounts: { cover: 1, table: 1 },
          diagnostics,
        };
      },
    },
  );

  assert.equal(vnextCalls, 1);
  assert.equal(result.requestedGenerationMode, "package-template");
  assert.equal(result.generationMode, "vnext");
  assert.equal(result.themePackageId, "noir");
  assert.deepEqual(result.selectedKindCounts, { cover: 1, table: 1 });
  assert.equal(result.truncated, true);
  assert.deepEqual(result.diagnostics, diagnostics);
});

test("generateDeckForRoute returns a DeckV7 with schemaVersion 7", async () => {
  const deck = makeDeckV7();
  const result = await generateDeckForRoute(
    { payload: makePayload(), complete },
    { runVnext: async () => makeVnextResult(deck) },
  );
  assert.equal(result.deck.schemaVersion, DECK_SCHEMA_VERSION_V7);
});

test("generateDeckForRoute propagates vnext failures", async () => {
  await assert.rejects(
    generateDeckForRoute(
      { payload: makePayload(), complete, requestId: "req-1" },
      {
        runVnext: async () => {
          throw new Error("generation failed");
        },
      },
    ),
    /generation failed/,
  );
});

test("buildGenerateDeckSuccessResponse includes vnext metadata", () => {
  const deck = makeDeckV7(true);
  const diagnostics = [
    makeDiagnostic("missing-required-slot", "warning", "Filled missing slot", {
      slideId: "slide-2",
    }),
  ];
  const response = buildGenerateDeckSuccessResponse({
    deck,
    truncated: false,
    diagnostics,
    requestedGenerationMode: "package-template",
    generationMode: "vnext",
    themePackageId: "terra",
    selectedKindCounts: { cover: 1, table: 1 },
  });

  assert.equal(response.truncated, false);
  assert.equal(response.metadata.requestedGenerationMode, "package-template");
  assert.equal(response.metadata.generationMode, "vnext");
  assert.equal(response.metadata.fallback, false);
  assert.equal(response.metadata.themePackageId, "terra");
  assert.equal(response.metadata.tableSlideCount, 1);
  assert.equal(response.metadata.schemaValid, true);
  assert.deepEqual(response.diagnostics, diagnostics);
  assert.deepEqual(response.metadata.selectedKindCounts, {
    cover: 1,
    table: 1,
  });
  // deck in response is DeckV7
  assert.equal(response.deck.schemaVersion, DECK_SCHEMA_VERSION_V7);
});

test("buildGenerateDeckSuccessLogFields includes vnext telemetry", () => {
  const deck = makeDeckV7(true);
  const fields = buildGenerateDeckSuccessLogFields(
    {
      deck,
      truncated: true,
      diagnostics: [],
      requestedGenerationMode: "package-template",
      generationMode: "vnext",
      themePackageId: "noir",
      selectedKindCounts: { cover: 1, table: 1 },
    },
    {
      payload: makePayload(),
      requestId: "req-2",
      latencyMs: 24,
    },
  );

  assert.equal(fields.requestId, "req-2");
  assert.equal(fields.latencyMs, 24);
  assert.equal(fields.packageId, "noir");
  assert.equal(fields.requestedGenerationMode, "package-template");
  assert.equal(fields.generationMode, "vnext");
  assert.equal(fields.fallback, false);
  assert.equal(fields.tableSlideCount, 1);
  assert.equal(fields.schemaValid, true);
  assert.deepEqual(fields.selectedKindCounts, { cover: 1, table: 1 });
});

test("computeV7RouteMetrics: percentSlidesWithVisual never exceeds 1", () => {
  resetBuilderCounter();
  // Slide with TWO image nodes — should count as 1, not 2.
  const twoImageSlide = buildSlideV7("visual-focus", [
    buildImageNode("img-a"),
    buildImageNode("img-b"),
  ]);
  // One plain content slide (no visuals).
  const plainSlide = buildContentSlide();
  const deck = buildDeckV7([twoImageSlide, plainSlide]);

  const fields = buildGenerateDeckSuccessLogFields(
    {
      deck,
      truncated: false,
      diagnostics: [],
      requestedGenerationMode: "package-template",
      generationMode: "vnext",
    },
    { payload: makePayload(), requestId: "req-3", latencyMs: 10 },
  );

  // 1 out of 2 slides has a visual → exactly 0.5, never > 1.
  assert.equal(fields.percentSlidesWithVisual, 0.5);
});

test("computeV7RouteMetrics: visual-only deck percentSlidesWithVisual is 1", () => {
  resetBuilderCounter();
  const deck = buildDeckV7([buildVisualSlide(), buildVisualSlide()]);

  const fields = buildGenerateDeckSuccessLogFields(
    {
      deck,
      truncated: false,
      diagnostics: [],
      requestedGenerationMode: "package-template",
      generationMode: "vnext",
    },
    { payload: makePayload(), requestId: "req-4", latencyMs: 5 },
  );

  assert.equal(fields.percentSlidesWithVisual, 1);
});
