import assert from "node:assert/strict";
import { test } from "node:test";

import { EmptyInputError, GenerationError } from "@/lib/ai/generate";
import { runDeckGeneration } from "@/lib/ai/run-deck-generation";
import { safeParseDeck } from "@/lib/presentation/deck-schema";
import type { Visual } from "@/lib/visual/schema";
import {
  buildContentJson as state,
  buildHeadingNode as heading,
  buildListNode as list,
  buildParagraphNode,
  buildTextNode,
  buildVisualLexicalNode as visualNode,
  type SerializedFixtureRootChild,
} from "@/test/builders/lexical";
import {
  buildVisual,
  buildVisualMap,
  buildVisualNode,
} from "@/test/builders/visual";

// ---------------------------------------------------------------------------
// Fixtures — mirror the Lexical serialised JSON the editor emits (matching
// deck-source.test.ts) plus a stub `complete` returning fixture deck JSON.
// ---------------------------------------------------------------------------

function visual(id: string, overrides: Partial<Visual> = {}): Visual {
  return buildVisual({
    nodes: [
      buildVisualNode({ id: `${id}-n1`, label: "Start" }),
      buildVisualNode({ id: `${id}-n2`, label: "Finish", x: 360 }),
    ],
    edges: [],
    ...overrides,
  });
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
  return JSON.stringify({ themeId: "indigo", slides });
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

  const { deck } = await runDeckGeneration({
    contentJson: DOC_WITH_VISUAL,
    visuals: buildVisualMap(["v1", visual("v1")]),
    complete,
  });

  assert.ok(safeParseDeck(deck).success);
  assert.equal(deck.themeId, "indigo");
  assert.ok(deck.slides.length >= 2);
});

test("malformed JSON: throws GenerationError after retries", async () => {
  const complete = constantComplete("this is not JSON at all");

  await assert.rejects(
    runDeckGeneration({
      contentJson: DOC_WITH_VISUAL,
      visuals: buildVisualMap(["v1", visual("v1")]),
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
      visuals: buildVisualMap(),
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
            box: { x: 10, y: 10, w: 80, h: 20 },
          },
        ],
      },
    ]),
  );

  const { deck } = await runDeckGeneration({
    contentJson: DOC_NO_VISUAL,
    visuals: buildVisualMap(),
    complete,
  });

  assert.ok(safeParseDeck(deck).success);
  const visualElements = deck.slides.flatMap((slide) =>
    (slide.elements ?? []).filter((element) => element.kind === "visual"),
  );
  assert.equal(visualElements.length, 0);
});

test("threads preferredTheme through to upgrade a model 'default' (#281)", async () => {
  const complete = constantComplete(
    JSON.stringify({
      themeId: "default",
      slides: [{ title: "Welcome", layout: "title" }],
    }),
  );

  const { deck } = await runDeckGeneration({
    contentJson: DOC_NO_VISUAL,
    visuals: buildVisualMap(),
    complete,
    preferredTheme: "ocean",
  });

  assert.ok(safeParseDeck(deck).success);
  assert.equal(deck.themeId, "ocean");
});

test("preferredTheme does not override an explicit vibrant model theme (#281)", async () => {
  const complete = constantComplete(
    JSON.stringify({
      themeId: "forest",
      slides: [{ title: "Welcome", layout: "title" }],
    }),
  );

  const { deck } = await runDeckGeneration({
    contentJson: DOC_NO_VISUAL,
    visuals: buildVisualMap(),
    complete,
    preferredTheme: "ocean",
  });

  assert.equal(deck.themeId, "forest");
});

test("threads truncated=false through for a small document", async () => {
  const complete = constantComplete(deckJson([{ title: "X" }]));

  const result = await runDeckGeneration({
    contentJson: DOC_NO_VISUAL,
    visuals: buildVisualMap(),
    complete,
  });

  assert.equal(result.truncated, false);
  assert.ok(safeParseDeck(result.deck).success);
});

test("threads truncated=true through for a huge document", async () => {
  // A document large enough to blow past MAX_INPUT_CHARS, so buildDeckSource
  // trims detail and the run reports truncation.
  const children: SerializedFixtureRootChild[] = [heading(1, "Top")];
  for (let i = 0; i < 2000; i++) {
    children.push(
      buildParagraphNode([buildTextNode(`para ${i} ` + "x".repeat(200))]),
    );
  }
  const complete = constantComplete(deckJson([{ title: "X" }]));

  const result = await runDeckGeneration({
    contentJson: state(children),
    visuals: buildVisualMap(),
    complete,
  });

  assert.equal(result.truncated, true);
});
