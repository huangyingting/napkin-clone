/**
 * Tests for the shared FNV-1a hash utility (issue #487).
 *
 * Asserts that:
 *  - `fnv1aHash32` is deterministic, 8-char hex.
 *  - Both former call sites (`deck.ts` via computeSectionId and `deck-hash.ts`
 *    via `fnv1aHex`) produce byte-for-byte identical output for the same input.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { fnv1aHash32 } from "./fnv-hash";
import { fnv1aHex } from "./deck-hash";
import { buildDeckFromBlocks } from "./deck";
import type { DocumentBlock } from "@/lib/visual/document-export";

// ---------------------------------------------------------------------------
// fnv1aHash32 — standalone
// ---------------------------------------------------------------------------

test("fnv1aHash32: deterministic and 8-char hex", () => {
  const a = fnv1aHash32("hello world");
  const b = fnv1aHash32("hello world");
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{8}$/);
});

test("fnv1aHash32: empty string has stable output", () => {
  const h = fnv1aHash32("");
  assert.match(h, /^[0-9a-f]{8}$/);
  assert.equal(h, fnv1aHash32(""));
});

test("fnv1aHash32: differs for different inputs", () => {
  assert.notEqual(fnv1aHash32("abc"), fnv1aHash32("abd"));
  assert.notEqual(fnv1aHash32("ABC"), fnv1aHash32("abc"));
});

// ---------------------------------------------------------------------------
// Identical output from both former call sites (byte-for-byte guarantee #487)
// ---------------------------------------------------------------------------

const PROBE_STRINGS = [
  "intro",
  "hello world",
  "The Quick Brown Fox",
  "section title with spaces",
  "",
  "a",
  "0123456789",
  "special !@#$%^&*()",
];

for (const input of PROBE_STRINGS) {
  const label = input === "" ? "(empty string)" : `"${input}"`;
  test(`fnv1aHash32 and fnv1aHex produce identical output for ${label}`, () => {
    assert.equal(fnv1aHash32(input), fnv1aHex(input));
  });
}

// ---------------------------------------------------------------------------
// deck.ts call site: sourceSectionId uses fnv1aHash32 via computeSectionId
// ---------------------------------------------------------------------------

test("buildDeckFromBlocks derives sourceSectionId using shared hash (matches fnv1aHex of normalized title)", () => {
  const title = "Introduction";
  const blocks: DocumentBlock[] = [
    { kind: "text", blockType: "heading", level: 1, text: title },
  ];
  const deck = buildDeckFromBlocks(blocks);
  const slide = deck.slides[0];
  const expectedId = fnv1aHash32(title.trim().toLowerCase());
  assert.equal(slide.sourceSectionId, expectedId);
  // Must also match the deck-hash.ts call site (fnv1aHex)
  assert.equal(slide.sourceSectionId, fnv1aHex(title.trim().toLowerCase()));
});

test("buildDeckFromBlocks sourceSectionId is stable across calls", () => {
  const blocks: DocumentBlock[] = [
    { kind: "text", blockType: "heading", level: 2, text: "  Section A  " },
  ];
  const deck1 = buildDeckFromBlocks(blocks);
  const deck2 = buildDeckFromBlocks(blocks);
  assert.equal(
    deck1.slides[0].sourceSectionId,
    deck2.slides[0].sourceSectionId,
  );
});
