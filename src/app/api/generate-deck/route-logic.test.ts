import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CURRENT_DECK_SCHEMA_VERSION,
  type Deck,
} from "@/lib/presentation/deck";

import type { GenerateDeckPayload } from "./parser";
import {
  buildGenerateDeckSuccessLogFields,
  buildGenerateDeckSuccessResponse,
  generateDeckForRoute,
} from "./route-logic";

const CONTENT_JSON = {
  root: { children: [{ type: "paragraph", children: [{ text: "Roadmap" }] }] },
};

function makeDeck(withTable = false): Deck {
  return {
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    canvas: { format: "16:9" },
    design: { themeId: "default" },
    masters: [{ id: "master-default", name: "Default", elements: [] }],
    defaultMasterId: "master-default",
    slides: [
      {
        id: "slide-1",
        index: 0,
        title: "Roadmap",
        templateId: withTable ? "theme:terra:table" : "theme:terra:content",
        notes: "",
        elements: withTable
          ? [
              {
                id: "table-1",
                kind: "table",
                role: "table",
                zIndex: 0,
                box: { x: 10, y: 10, w: 80, h: 50 },
                content: {
                  kind: "table",
                  header: true,
                  caption: "Metrics",
                  columns: [
                    { id: "col-1", label: "Metric" },
                    { id: "col-2", label: "Value" },
                  ],
                  rows: [
                    {
                      id: "row-1",
                      cells: [{ text: "Reach" }, { text: "42" }],
                    },
                    {
                      id: "row-2",
                      cells: [{ text: "Cost" }, { text: "7" }],
                    },
                  ],
                },
              },
            ]
          : [],
      },
    ],
  };
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

test("generateDeckForRoute runs only the package-template pipeline", async () => {
  let packageCalls = 0;
  let baseDeckCalls = 0;

  const result = await generateDeckForRoute(
    { payload: makePayload(), complete },
    {
      buildBaseDeck: () => {
        baseDeckCalls += 1;
        return makeDeck();
      },
      runPackageTemplate: async (input) => {
        packageCalls += 1;
        assert.equal(input.packageId, "noir");
        return {
          deck: makeDeck(true),
          truncated: true,
          selectedKindCounts: { cover: 1, table: 1 },
        };
      },
    },
  );

  assert.equal(packageCalls, 1);
  assert.equal(baseDeckCalls, 1);
  assert.equal(result.requestedGenerationMode, "package-template");
  assert.equal(result.generationMode, "package-template");
  assert.equal(result.themePackageId, "noir");
  assert.deepEqual(result.selectedKindCounts, { cover: 1, table: 1 });
  assert.equal(result.truncated, true);
});

test("generateDeckForRoute propagates package-template failures", async () => {
  await assert.rejects(
    generateDeckForRoute(
      { payload: makePayload(), complete, requestId: "req-1" },
      {
        runPackageTemplate: async () => {
          throw new Error("repair failed");
        },
      },
    ),
    /repair failed/,
  );
});

test("buildGenerateDeckSuccessResponse includes package-template metadata", () => {
  const response = buildGenerateDeckSuccessResponse({
    deck: makeDeck(true),
    truncated: false,
    requestedGenerationMode: "package-template",
    generationMode: "package-template",
    themePackageId: "terra",
    selectedKindCounts: { table: 1 },
  });

  assert.equal(response.truncated, false);
  assert.equal(response.metadata.requestedGenerationMode, "package-template");
  assert.equal(response.metadata.generationMode, "package-template");
  assert.equal(response.metadata.fallback, false);
  assert.equal(response.metadata.themePackageId, "terra");
  assert.equal(response.metadata.tableSlideCount, 1);
  assert.equal(response.metadata.schemaValid, true);
  assert.deepEqual(response.metadata.selectedKindCounts, { table: 1 });
});

test("buildGenerateDeckSuccessLogFields includes package-template telemetry", () => {
  const fields = buildGenerateDeckSuccessLogFields(
    {
      deck: makeDeck(true),
      truncated: true,
      requestedGenerationMode: "package-template",
      generationMode: "package-template",
      themePackageId: "noir",
      selectedKindCounts: { table: 1 },
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
  assert.equal(fields.generationMode, "package-template");
  assert.equal(fields.fallback, false);
  assert.equal(fields.tableSlideCount, 1);
  assert.equal(fields.schemaValid, true);
  assert.deepEqual(fields.selectedKindCounts, { table: 1 });
});
