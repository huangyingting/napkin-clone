/**
 * Unit tests for the deck staleness signal (`deck-hash.ts`). DOM-free,
 * runnable under `node --test`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDeckFromBlocks, type Deck, type Slide } from "./deck";
import {
  computeDeckContentHash,
  deckContentSignature,
  fnv1aHex,
  isDeckStale,
  normalizeTitle,
  stampDeckContentHash,
} from "./deck-hash";
import type { DocumentBlock } from "@/lib/content";

function textBlock(
  text: string,
  blockType: "paragraph" | "heading" | "quote" | "hr" = "paragraph",
  level?: 1 | 2 | 3,
): DocumentBlock {
  return { kind: "text", blockType, text, ...(level ? { level } : {}) };
}

function textElement(text: string, role: "title" | "bullet", zIndex: number) {
  return {
    id: `el-${role}-${zIndex}`,
    kind: "text",
    role,
    box: { x: 0, y: 0, w: 10, h: 10 },
    zIndex,
    content: {
      kind: "text",
      text,
      paragraphs:
        role === "bullet"
          ? text.split("\n").map((line) => ({ text: line, listType: "bullet" }))
          : [{ text }],
    },
    designOverrides: {
      textStyle: {
        fontSize: 5,
        bold: role === "title",
        italic: false,
        align: "left",
      },
    },
  };
}

function visualElement(visualId: string, zIndex: number) {
  return {
    id: `el-visual-${zIndex}`,
    kind: "visual",
    role: "visual",
    box: { x: 0, y: 0, w: 10, h: 10 },
    zIndex,
    content: { kind: "visual", visualId },
  };
}

function slide(partial: Record<string, any>): Slide {
  const title = partial.title ?? "";
  const bodyTexts = (partial.bodyTexts ?? []) as string[];
  const visualRefs = (partial.visualRefs ?? []) as string[];
  const elements = [
    ...(title ? [textElement(title, "title", 0)] : []),
    ...(bodyTexts.length > 0
      ? [textElement(bodyTexts.join("\n"), "bullet", 1)]
      : []),
    ...visualRefs.map((visualId, index) => visualElement(visualId, index + 2)),
    ...(((partial as any).elements ?? []) as unknown[]),
  ];
  return {
    id: "test-id",
    index: 0,
    title,
    notes: partial.notes ?? "",
    ...(partial.templateId !== undefined
      ? { templateId: partial.templateId }
      : { templateId: "content" }),
    ...(partial.designOverrides !== undefined
      ? { designOverrides: partial.designOverrides }
      : {}),
    elements,
  } as unknown as Slide;
}

function deck(slides: Slide[], themeId = "default"): Deck {
  return {
    schemaVersion: 6,
    canvas: { format: "16:9" },
    design: { themeId },
    masters: [{ id: "master-default", name: "Default", elements: [] }],
    defaultMasterId: "master-default",
    slides,
  } as unknown as Deck;
}

test("fnv1aHex is deterministic and 8-char hex", () => {
  const a = fnv1aHex("hello world");
  const b = fnv1aHex("hello world");
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{8}$/);
  assert.notEqual(fnv1aHex("hello world"), fnv1aHex("hello worle"));
});

test("normalizeTitle trims and lower-cases", () => {
  assert.equal(normalizeTitle("  Intro  "), "intro");
  assert.equal(normalizeTitle("INTRO"), "intro");
});

test("identical decks produce identical content hashes", () => {
  const a = deck([slide({ title: "Intro", bodyTexts: ["a", "b"] })]);
  const b = deck([slide({ title: "Intro", bodyTexts: ["a", "b"] })]);
  assert.equal(computeDeckContentHash(a), computeDeckContentHash(b));
});

test("content hash ignores free-form elements and per-slide colors", () => {
  const base = slide({ title: "Intro", bodyTexts: ["a"] });
  const withElements = slide({
    title: "Intro",
    bodyTexts: ["a"],
    designOverrides: {
      background: { type: "solid", color: { value: "#ffffff" } },
      accent: { value: "#123456" },
    } as any,
    elements: [
      {
        id: "el-1",
        kind: "text",
        role: "title",
        zIndex: 99,
        box: { x: 0, y: 0, w: 10, h: 10 },
        content: {
          kind: "text",
          text: "Intro",
          paragraphs: [{ text: "Intro" }],
        },
        designOverrides: {
          textStyle: { fontSize: 9, bold: true, italic: false, align: "left" },
        },
      },
    ],
  });
  assert.equal(
    computeDeckContentHash(deck([base])),
    computeDeckContentHash(deck([withElements])),
  );
});

test("content hash changes when document-derived content changes", () => {
  const a = deck([slide({ title: "Intro", bodyTexts: ["a"] })]);
  const b = deck([slide({ title: "Intro", bodyTexts: ["a", "c"] })]);
  assert.notEqual(computeDeckContentHash(a), computeDeckContentHash(b));

  const titleChanged = deck([slide({ title: "Outro", bodyTexts: ["a"] })]);
  assert.notEqual(
    computeDeckContentHash(a),
    computeDeckContentHash(titleChanged),
  );
});

test("content hash changes with deck theme", () => {
  const a = deck([slide({ title: "Intro" })], "default");
  const b = deck([slide({ title: "Intro" })], "ocean");
  assert.notEqual(computeDeckContentHash(a), computeDeckContentHash(b));
});

test("deckContentSignature is stable and order-sensitive", () => {
  const ab = deck([slide({ title: "A" }), slide({ title: "B" })]);
  const ba = deck([slide({ title: "B" }), slide({ title: "A" })]);
  assert.notEqual(deckContentSignature(ab), deckContentSignature(ba));
});

test("stampDeckContentHash is immutable and records the hash", () => {
  const original = deck([slide({ title: "Intro" })]);
  const stamped = stampDeckContentHash(original, "abc123");
  assert.equal(stamped.deckContentHash, "abc123");
  assert.equal(original.deckContentHash, undefined);
});

test("isDeckStale: false when hashes match", () => {
  const base = deck([slide({ title: "Intro" })]);
  const hash = computeDeckContentHash(base);
  const stamped = stampDeckContentHash(base, hash);
  assert.equal(isDeckStale(stamped, hash), false);
});

test("isDeckStale: true when document hash differs from stored hash", () => {
  const built = deck([slide({ title: "Intro", bodyTexts: ["a"] })]);
  const stamped = stampDeckContentHash(built, computeDeckContentHash(built));
  const current = computeDeckContentHash(
    deck([slide({ title: "Intro", bodyTexts: ["a", "b"] })]),
  );
  assert.equal(isDeckStale(stamped, current), true);
});

test("isDeckStale: false when no stored hash is present", () => {
  const input = deck([slide({ title: "Intro" })]);
  assert.equal(input.deckContentHash, undefined);
  assert.equal(isDeckStale(input, "anything"), false);
});

test("re-deriving the same document yields the same hash (no false staleness)", () => {
  const blocks: DocumentBlock[] = [
    textBlock("Title", "heading", 1),
    textBlock("Section", "heading", 2),
    textBlock("Point one"),
    textBlock("Point two"),
  ];
  const first = computeDeckContentHash(buildDeckFromBlocks(blocks));
  const second = computeDeckContentHash(buildDeckFromBlocks(blocks));
  assert.equal(first, second);
});
