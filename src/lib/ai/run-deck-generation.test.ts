import assert from "node:assert/strict";
import { test } from "node:test";

import { EmptyInputError, GenerationError } from "@/lib/ai/generate";
import { runDeckGeneration } from "@/lib/ai/run-deck-generation";
import { safeParseDeck } from "@/lib/presentation/deck-schema";
import type { Visual } from "@/lib/visual/schema";

// ---------------------------------------------------------------------------
// Fixtures — mirror the Lexical serialised JSON the editor emits (matching
// deck-source.test.ts) plus a stub `complete` returning fixture deck JSON.
// ---------------------------------------------------------------------------

function visual(id: string, overrides: Partial<Visual> = {}): Visual {
  return {
    version: 1,
    type: "flowchart",
    nodes: [
      { id: `${id}-n1`, label: "Start" },
      { id: `${id}-n2`, label: "Finish" },
    ],
    edges: [],
    style: {},
    ...overrides,
  } as unknown as Visual;
}

function text(value: string) {
  return { type: "text", text: value, format: 0 };
}

function heading(level: 1 | 2, value: string) {
  return { type: "heading", tag: `h${level}`, children: [text(value)] };
}

function listItem(value: string) {
  return { type: "listitem", children: [text(value)] };
}

function list(items: string[]) {
  return { type: "list", tag: "ul", children: items.map(listItem) };
}

function visualNode(visualId: string, v: Visual = visual(visualId)) {
  return { type: "visual", visualId, visual: v };
}

function state(children: unknown[]): string {
  return JSON.stringify({ root: { type: "root", children } });
}

const DOC_WITH_VISUAL = state([
  heading(1, "Title"),
  heading(2, "Section"),
  list(["First point", "Second point"]),
  visualNode("v1"),
]);

const DOC_NO_VISUAL = state([
  heading(1, "Title"),
  list(["First point", "Second point"]),
]);

/** A complete fn that always returns the same canned response. */
function constantComplete(response: string) {
  return async () => response;
}

function deckJson(slides: unknown[]): string {
  return JSON.stringify({ theme: "indigo", slides });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("success: returns a safeParseDeck-valid deck from fixture JSON", async () => {
  const complete = constantComplete(
    deckJson([
      { title: "Welcome", bullets: ["First point"], layout: "title" },
      {
        title: "Section",
        layout: "content",
        elements: [
          {
            kind: "visual",
            visualId: "v1",
            box: { x: 10, y: 10, w: 80, h: 60 },
          },
        ],
      },
    ]),
  );

  const deck = await runDeckGeneration({
    contentJson: DOC_WITH_VISUAL,
    visuals: new Map([["v1", visual("v1")]]),
    complete,
  });

  assert.ok(safeParseDeck(deck).success);
  assert.equal(deck.theme, "indigo");
  assert.ok(deck.slides.length >= 2);
});

test("malformed JSON: throws GenerationError after retries", async () => {
  const complete = constantComplete("this is not JSON at all");

  await assert.rejects(
    runDeckGeneration({
      contentJson: DOC_WITH_VISUAL,
      visuals: new Map([["v1", visual("v1")]]),
      complete,
      maxAttempts: 1,
    }),
    GenerationError,
  );
});

test("empty contentJson: throws an empty-input error before calling complete", async () => {
  let called = false;
  const complete = async () => {
    called = true;
    return deckJson([{ title: "X" }]);
  };

  await assert.rejects(
    runDeckGeneration({
      contentJson: state([]),
      visuals: new Map(),
      complete,
    }),
    EmptyInputError,
  );
  assert.equal(called, false, "complete must not be called for empty input");
});

test("no visuals: the generated deck contains no visual elements", async () => {
  // The model references a visual id, but the inventory is empty, so the
  // orphaned visual element must be stripped from the result.
  const complete = constantComplete(
    deckJson([
      {
        title: "Section",
        layout: "content",
        elements: [
          {
            kind: "visual",
            visualId: "v1",
            box: { x: 10, y: 10, w: 80, h: 60 },
          },
          {
            kind: "text",
            text: "Body",
            role: "body",
            box: { x: 10, y: 10, w: 80, h: 20 },
          },
        ],
      },
    ]),
  );

  const deck = await runDeckGeneration({
    contentJson: DOC_NO_VISUAL,
    visuals: new Map(),
    complete,
  });

  assert.ok(safeParseDeck(deck).success);
  const visualElements = deck.slides.flatMap((slide) =>
    (slide.elements ?? []).filter((element) => element.kind === "visual"),
  );
  assert.equal(visualElements.length, 0);
});
