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
import type { DocumentBlock } from "@/lib/visual/document-export";

function textBlock(
  text: string,
  blockType: "paragraph" | "heading" | "quote" | "hr" = "paragraph",
  level?: 1 | 2 | 3,
): DocumentBlock {
  return { kind: "text", blockType, text, ...(level ? { level } : {}) };
}

function slide(partial: Partial<Slide>): Slide {
  return {
    id: "test-id",
    index: 0,
    title: "",
    bullets: [],
    visualIds: [],
    layout: "content",
    notes: "",
    theme: "default",
    ...partial,
  };
}

function deck(slides: Slide[], theme: Deck["theme"] = "default"): Deck {
  return { slides, theme };
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
  const a = deck([slide({ title: "Intro", bullets: ["a", "b"] })]);
  const b = deck([slide({ title: "Intro", bullets: ["a", "b"] })]);
  assert.equal(computeDeckContentHash(a), computeDeckContentHash(b));
});

test("content hash ignores free-form elements and per-slide colors", () => {
  const base = slide({ title: "Intro", bullets: ["a"] });
  const withElements = slide({
    title: "Intro",
    bullets: ["a"],
    background: "#ffffff",
    accent: "#123456",
    elements: [
      {
        id: "el-1",
        kind: "text",
        role: "title",
        text: "Intro",
        zIndex: 0,
        box: { x: 0, y: 0, w: 10, h: 10 },
        style: { fontSize: 5, bold: true, italic: false, align: "left" },
      },
    ],
  });
  assert.equal(
    computeDeckContentHash(deck([base])),
    computeDeckContentHash(deck([withElements])),
  );
});

test("content hash changes when document-derived content changes", () => {
  const a = deck([slide({ title: "Intro", bullets: ["a"] })]);
  const b = deck([slide({ title: "Intro", bullets: ["a", "c"] })]);
  assert.notEqual(computeDeckContentHash(a), computeDeckContentHash(b));

  const titleChanged = deck([slide({ title: "Outro", bullets: ["a"] })]);
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
  const built = deck([slide({ title: "Intro", bullets: ["a"] })]);
  const stamped = stampDeckContentHash(built, computeDeckContentHash(built));
  const current = computeDeckContentHash(
    deck([slide({ title: "Intro", bullets: ["a", "b"] })]),
  );
  assert.equal(isDeckStale(stamped, current), true);
});

test("isDeckStale: false for legacy decks with no stored hash", () => {
  const legacy = deck([slide({ title: "Intro" })]);
  assert.equal(legacy.deckContentHash, undefined);
  assert.equal(isDeckStale(legacy, "anything"), false);
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
