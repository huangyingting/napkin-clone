import assert from "node:assert/strict";
import test from "node:test";

import { MAX_DECK_SLIDES, generateDeck } from "@/lib/ai/generate-deck";
import { CURRENT_DECK_SCHEMA_VERSION } from "@/lib/presentation/deck";
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
  const themeId =
    typeof overrides.themeId === "string" ? overrides.themeId : "indigo";
  const slides = (overrides.slides as unknown[] | undefined) ?? [
    {
      id: "slide-welcome",
      index: 0,
      title: "Welcome",
      notes: "Speaker notes here.",
      templateId: "title",
      elements: [
        {
          id: "title-welcome",
          kind: "text",
          role: "title",
          box: { x: 6, y: 6, w: 88, h: 16 },
          zIndex: 0,
          content: {
            kind: "text",
            text: "Welcome",
            paragraphs: [{ text: "Welcome" }],
          },
          designOverrides: {
            textStyle: {
              fontSize: 6,
              bold: true,
              italic: false,
              align: "left",
            },
          },
        },
        {
          id: "body-welcome",
          kind: "text",
          role: "bullet",
          box: { x: 6, y: 26, w: 88, h: 66 },
          zIndex: 1,
          content: {
            kind: "text",
            text: "First point\nSecond point",
            paragraphs: [
              { text: "First point", listType: "bullet" },
              { text: "Second point", listType: "bullet" },
            ],
          },
          designOverrides: {
            textStyle: {
              fontSize: 4.5,
              bold: false,
              italic: false,
              align: "left",
            },
          },
        },
      ],
    },
    {
      id: "slide-details",
      index: 1,
      title: "Details",
      templateId: "content",
      elements: [
        {
          id: "title-details",
          kind: "text",
          role: "title",
          box: { x: 6, y: 6, w: 88, h: 16 },
          zIndex: 0,
          content: {
            kind: "text",
            text: "Details",
            paragraphs: [{ text: "Details" }],
          },
          designOverrides: {
            textStyle: {
              fontSize: 6,
              bold: true,
              italic: false,
              align: "left",
            },
          },
        },
        {
          id: "body-details",
          kind: "text",
          role: "bullet",
          box: { x: 6, y: 26, w: 88, h: 66 },
          zIndex: 1,
          content: {
            kind: "text",
            text: "More",
            paragraphs: [{ text: "More", listType: "bullet" }],
          },
          designOverrides: {
            textStyle: {
              fontSize: 4.5,
              bold: false,
              italic: false,
              align: "left",
            },
          },
        },
      ],
    },
  ];
  return JSON.stringify({
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    canvas: { format: "16:9" },
    design: { themeId },
    masters: [{ id: "master-default", name: "Default", elements: [] }],
    defaultMasterId: "master-default",
    slides,
  });
}

function themeId(deck: unknown): string | undefined {
  return (deck as any).design?.themeId;
}

function slideLayout(slide: unknown): string {
  return (slide as any).templateId ?? "blank";
}

function visualId(element: unknown): string | undefined {
  return (element as any)?.content?.visualId;
}

test("parses a valid deck JSON in one attempt", async () => {
  const { complete, calls } = sequence([deck()]);
  const result = await generateDeck(
    { outline: "outline", visualInventory: INVENTORY },
    { complete },
  );
  assert.equal(calls.count, 1);
  assert.ok(safeParseDeck(result).success);
  assert.equal(themeId(result), "indigo");
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
  const array = "[" + deck() + "," + deck({ themeId: "ocean" }) + "]";
  const { complete } = sequence([array]);
  const result = await generateDeck(
    { outline: "outline", visualInventory: INVENTORY },
    { complete },
  );
  assert.equal(themeId(result), "indigo");
});

test("retries once on malformed JSON then throws GenerationError", async () => {
  const { complete, calls } = sequence(["not json at all", "still not json"]);
  await assert.rejects(
    generateDeck(
      { outline: "outline", visualInventory: INVENTORY },
      { complete },
    ),
    (error) =>
      error instanceof GenerationError &&
      error.message ===
        "Could not generate a valid deck after 2 attempt(s). The AI response was not valid JSON.",
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
            id: "text-box",
            kind: "text",
            role: "title",
            box: { x: -50, y: 150, w: 999, h: -10 },
            content: { kind: "text", text: "Hi" },
            designOverrides: { textStyle: { fontSize: 6, align: "left" } },
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
    slides: [{ title: "Odd", templateId: "carousel" }],
  });
  const { complete } = sequence([payload]);
  const result = await generateDeck(
    { outline: "outline", visualInventory: INVENTORY },
    { complete },
  );
  assert.ok(safeParseDeck(result).success);
  assert.equal(slideLayout(result.slides[0]), "blank");
});

test("strips a visual element referencing an unknown visualId", async () => {
  const payload = JSON.stringify({
    slides: [
      {
        title: "Visuals",
        elements: [
          {
            id: "visual-good",
            kind: "visual",
            box: { x: 10, y: 10, w: 40, h: 40 },
            content: { kind: "visual", visualId: "vis-1" },
          },
          {
            id: "visual-ghost",
            kind: "visual",
            box: { x: 50, y: 10, w: 40, h: 40 },
            content: { kind: "visual", visualId: "ghost-id" },
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
  const visualRefs = (result.slides[0].elements ?? [])
    .filter((el) => el.kind === "visual")
    .map((el) => visualId(el));
  assert.deepEqual(visualRefs, ["vis-1"]);
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
            role: "body",
            box: { x: 0, y: 0, w: 10, h: 10 },
            content: { kind: "text", text: "A" },
            designOverrides: { textStyle: { fontSize: 4, align: "left" } },
          },
          {
            id: "same",
            kind: "text",
            role: "body",
            box: { x: 0, y: 20, w: 10, h: 10 },
            content: { kind: "text", text: "B" },
            designOverrides: { textStyle: { fontSize: 4, align: "left" } },
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

test("upgrades an invalid/default theme to a vibrant theme (#281)", async () => {
  const { complete } = sequence([deck({ themeId: "neon" })]);
  const result = await generateDeck(
    { outline: "outline", visualInventory: INVENTORY },
    { complete },
  );
  assert.equal(themeId(result), "indigo");
});

test("honors preferredTheme when the model returns 'default' (#281)", async () => {
  const { complete } = sequence([deck({ themeId: "default" })]);
  const result = await generateDeck(
    {
      outline: "outline",
      visualInventory: INVENTORY,
      preferredTheme: "ocean",
    },
    { complete },
  );
  assert.equal(themeId(result), "ocean");
});

test("preserves an explicit vibrant theme over preferredTheme (#281)", async () => {
  const { complete } = sequence([deck({ themeId: "forest" })]);
  const result = await generateDeck(
    {
      outline: "outline",
      visualInventory: INVENTORY,
      preferredTheme: "ocean",
    },
    { complete },
  );
  assert.equal(themeId(result), "forest");
});

test("caps the deck to MAX_DECK_SLIDES slides", async () => {
  const slides = Array.from({ length: MAX_DECK_SLIDES + 5 }, (_, i) => ({
    title: `Slide ${i}`,
    templateId: "content",
    elements: [],
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
  const payload = deck({
    slides: [
      {
        id: "welcome",
        index: 0,
        title: "Welcome",
        templateId: "title",
        elements: [
          {
            id: "welcome-title",
            kind: "text",
            role: "title",
            box: { x: 6, y: 6, w: 88, h: 16 },
            zIndex: 0,
            content: { kind: "text", text: "Welcome" },
          },
        ],
      },
      {
        id: "details",
        index: 1,
        title: "Details",
        templateId: "content",
        elements: [
          {
            id: "details-body",
            kind: "text",
            role: "bullet",
            box: { x: 6, y: 26, w: 88, h: 66 },
            zIndex: 0,
            content: {
              kind: "text",
              text: "One\nTwo",
              paragraphs: [
                { text: "One", listType: "bullet" },
                { text: "Two", listType: "bullet" },
              ],
            },
          },
        ],
      },
      {
        id: "picture",
        index: 2,
        title: "Picture",
        templateId: "media",
        elements: [
          {
            id: "picture-visual",
            kind: "visual",
            role: "visual",
            box: { x: 8, y: 24, w: 84, h: 68 },
            zIndex: 0,
            content: { kind: "visual", visualId: "vis-1" },
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
  assert.equal(themeId(result), "indigo", "theme stamped at deck level");
  for (const slide of result.slides) {
    assert.ok(
      slide.elements && slide.elements.length > 0,
      "slide has positioned elements",
    );
    assert.equal(
      "elementsDerived" in slide,
      false,
      "AI slides do not persist removed provenance flags",
    );
  }

  // The media slide places its document visual prominently.
  const media = result.slides[2];
  const visual = media.elements?.find((el) => el.kind === "visual");
  assert.ok(visual && visual.kind === "visual");
  assert.equal(visualId(visual), "vis-1");
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
