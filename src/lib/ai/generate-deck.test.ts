import assert from "node:assert/strict";
import test from "node:test";

import { MAX_DECK_SLIDES, generateDeck } from "@/lib/ai/generate-deck";
import {
  EmptyInputError,
  GenerationError,
  InputTooLongError,
  MAX_INPUT_CHARS,
} from "@/lib/ai/generate";
import { safeParseDeck } from "@/lib/presentation/deck-schema";

const INVENTORY = [
  { id: "vis-1", title: "Chart", type: "chart", summary: "A chart" },
];

interface Sequence {
  complete: (messages: unknown) => Promise<string>;
  calls: { count: number; messages: unknown[] };
}

function sequence(responses: string[]): Sequence {
  const calls = { count: 0, messages: [] as unknown[] };
  const complete = async (messages: unknown): Promise<string> => {
    calls.messages.push(messages);
    const response = responses[Math.min(calls.count, responses.length - 1)];
    calls.count += 1;
    return response;
  };
  return { complete, calls };
}

function deck(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    theme: "indigo",
    slides: [
      {
        title: "Welcome",
        bullets: ["First point", "Second point"],
        notes: "Speaker notes here.",
        layout: "title",
      },
      {
        title: "Details",
        bullets: ["More"],
        layout: "content",
      },
    ],
    ...overrides,
  });
}

test("parses a valid deck JSON in one attempt", async () => {
  const { complete, calls } = sequence([deck()]);
  const result = await generateDeck(
    { outline: "outline", visualInventory: INVENTORY },
    { complete },
  );
  assert.equal(calls.count, 1);
  assert.ok(safeParseDeck(result).success);
  assert.equal(result.theme, "indigo");
  assert.equal(result.slides.length, 2);
});

test("tolerates a code-fenced JSON deck", async () => {
  const fenced = "```json\n" + deck() + "\n```";
  const { complete } = sequence([fenced]);
  const result = await generateDeck(
    { outline: "outline", visualInventory: INVENTORY },
    { complete },
  );
  assert.ok(safeParseDeck(result).success);
});

test("tolerates prose-wrapped JSON deck", async () => {
  const prose = "Here is your deck:\n" + deck() + "\nHope that helps!";
  const { complete } = sequence([prose]);
  const result = await generateDeck(
    { outline: "outline", visualInventory: INVENTORY },
    { complete },
  );
  assert.ok(safeParseDeck(result).success);
});

test("takes the first deck when the model returns an array", async () => {
  const array = "[" + deck() + "," + deck({ theme: "ocean" }) + "]";
  const { complete } = sequence([array]);
  const result = await generateDeck(
    { outline: "outline", visualInventory: INVENTORY },
    { complete },
  );
  assert.equal(result.theme, "indigo");
});

test("retries once on malformed JSON then throws GenerationError", async () => {
  const { complete, calls } = sequence(["not json at all", "still not json"]);
  await assert.rejects(
    generateDeck(
      { outline: "outline", visualInventory: INVENTORY },
      { complete },
    ),
    (error) => error instanceof GenerationError,
  );
  assert.equal(calls.count, 2);
});

test("recovers on the retry attempt after a first garbled response", async () => {
  const { complete, calls } = sequence(["garbage", deck()]);
  const result = await generateDeck(
    { outline: "outline", visualInventory: INVENTORY },
    { complete },
  );
  assert.equal(calls.count, 2);
  assert.ok(safeParseDeck(result).success);
});

test("clamps out-of-range element boxes into [0,100]", async () => {
  const payload = JSON.stringify({
    slides: [
      {
        title: "Box",
        elements: [
          {
            kind: "text",
            text: "Hi",
            role: "title",
            box: { x: -50, y: 150, w: 999, h: -10 },
            style: { fontSize: 6, align: "left" },
          },
        ],
      },
    ],
  });
  const { complete } = sequence([payload]);
  const result = await generateDeck(
    { outline: "outline", visualInventory: INVENTORY },
    { complete },
  );
  assert.ok(safeParseDeck(result).success);
  const box = result.slides[0].elements?.[0].box;
  assert.ok(box);
  for (const value of [box.x, box.y, box.w, box.h]) {
    assert.ok(value >= 0 && value <= 100, `value ${value} out of range`);
  }
});

test("maps an unknown layout to 'blank'", async () => {
  const payload = JSON.stringify({
    slides: [{ title: "Odd", layout: "carousel" }],
  });
  const { complete } = sequence([payload]);
  const result = await generateDeck(
    { outline: "outline", visualInventory: INVENTORY },
    { complete },
  );
  assert.ok(safeParseDeck(result).success);
  assert.equal(result.slides[0].layout, "blank");
});

test("strips a visual element referencing an unknown visualId", async () => {
  const payload = JSON.stringify({
    slides: [
      {
        title: "Visuals",
        elements: [
          {
            kind: "visual",
            visualId: "vis-1",
            box: { x: 10, y: 10, w: 40, h: 40 },
          },
          {
            kind: "visual",
            visualId: "ghost-id",
            box: { x: 50, y: 10, w: 40, h: 40 },
          },
        ],
      },
    ],
  });
  const { complete } = sequence([payload]);
  const result = await generateDeck(
    { outline: "outline", visualInventory: INVENTORY },
    { complete },
  );
  assert.ok(safeParseDeck(result).success);
  const visualIds = (result.slides[0].elements ?? [])
    .filter((el) => el.kind === "visual")
    .map((el) => (el as { visualId: string }).visualId);
  assert.deepEqual(visualIds, ["vis-1"]);
});

test("regenerates duplicate element ids within a slide", async () => {
  const payload = JSON.stringify({
    slides: [
      {
        title: "Dups",
        elements: [
          {
            id: "same",
            kind: "text",
            text: "A",
            role: "body",
            box: { x: 0, y: 0, w: 10, h: 10 },
            style: { fontSize: 4, align: "left" },
          },
          {
            id: "same",
            kind: "text",
            text: "B",
            role: "body",
            box: { x: 0, y: 20, w: 10, h: 10 },
            style: { fontSize: 4, align: "left" },
          },
        ],
      },
    ],
  });
  const { complete } = sequence([payload]);
  const result = await generateDeck(
    { outline: "outline", visualInventory: INVENTORY },
    { complete },
  );
  const ids = (result.slides[0].elements ?? []).map((el) => el.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("defaults an invalid theme to 'default'", async () => {
  const { complete } = sequence([deck({ theme: "neon" })]);
  const result = await generateDeck(
    { outline: "outline", visualInventory: INVENTORY },
    { complete },
  );
  assert.equal(result.theme, "default");
});

test("caps the deck to MAX_DECK_SLIDES slides", async () => {
  const slides = Array.from({ length: MAX_DECK_SLIDES + 5 }, (_, i) => ({
    title: `Slide ${i}`,
    layout: "content",
  }));
  const { complete } = sequence([JSON.stringify({ slides })]);
  const result = await generateDeck(
    { outline: "outline", visualInventory: INVENTORY },
    { complete },
  );
  assert.equal(result.slides.length, MAX_DECK_SLIDES);
  assert.ok(safeParseDeck(result).success);
});

test("rejects an empty outline before any LLM call", async () => {
  let called = false;
  const complete = async (): Promise<string> => {
    called = true;
    return deck();
  };
  await assert.rejects(
    generateDeck({ outline: "   ", visualInventory: INVENTORY }, { complete }),
    (error) => error instanceof EmptyInputError,
  );
  assert.equal(called, false);
});

test("normalizes generateDeck output: every slide has authored elements", async () => {
  const payload = JSON.stringify({
    theme: "indigo",
    slides: [
      { title: "Welcome", layout: "title" },
      { title: "Details", bullets: ["One", "Two"], layout: "content" },
      { title: "Picture", visualIds: ["vis-1"], layout: "media" },
    ],
  });
  const { complete } = sequence([payload]);
  const result = await generateDeck(
    { outline: "outline", visualInventory: INVENTORY },
    { complete },
  );

  assert.ok(safeParseDeck(result).success);
  for (const slide of result.slides) {
    assert.ok(
      slide.elements && slide.elements.length > 0,
      "slide has positioned elements",
    );
    assert.equal(slide.elementsDerived, false, "AI slides are authored");
    assert.equal(slide.theme, "indigo", "theme stamped uniformly");
  }

  // The media slide places its document visual prominently.
  const media = result.slides[2];
  const visual = media.elements?.find((el) => el.kind === "visual");
  assert.ok(visual && visual.kind === "visual");
  assert.equal(visual.visualId, "vis-1");
  assert.ok(visual.box.w * visual.box.h >= 50 * 50, "prominent visual box");
});

test("rejects an oversized outline before any LLM call", async () => {
  let called = false;
  const complete = async (): Promise<string> => {
    called = true;
    return deck();
  };
  await assert.rejects(
    generateDeck(
      { outline: "x".repeat(MAX_INPUT_CHARS + 1), visualInventory: INVENTORY },
      { complete },
    ),
    (error) => error instanceof InputTooLongError,
  );
  assert.equal(called, false);
});
