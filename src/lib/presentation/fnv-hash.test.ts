/**
 * Tests for the shared FNV-1a hash utility (issue #487).
 *
 * Asserts that:
 *  - `fnv1aHash32` is deterministic, 8-char hex.
 *  - `deck.ts` source IDs use the same shared hash output.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { fnv1aHash32 } from "@/lib/presentation-shared/fnv-hash";
import { buildDeckFromBlocks } from "./deck";
import type { DocumentBlock } from "@/lib/content";

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
// deck.ts call site: source.sectionId uses fnv1aHash32 via computeSectionId
// ---------------------------------------------------------------------------

function sectionId(slide: unknown): string | undefined {
  return (slide as any).source?.sectionId;
}

test("buildDeckFromBlocks derives source.sectionId using shared hash", () => {
  const title = "Introduction";
  const blocks: DocumentBlock[] = [
    { kind: "text", blockType: "heading", level: 1, text: title },
  ];
  const deck = buildDeckFromBlocks(blocks);
  const slide = deck.slides[0];
  const expectedId = fnv1aHash32(title.trim().toLowerCase());
  assert.equal(sectionId(slide), expectedId);
});

test("buildDeckFromBlocks source.sectionId is stable across calls", () => {
  const blocks: DocumentBlock[] = [
    { kind: "text", blockType: "heading", level: 2, text: "  Section A  " },
  ];
  const deck1 = buildDeckFromBlocks(blocks);
  const deck2 = buildDeckFromBlocks(blocks);
  assert.equal(sectionId(deck1.slides[0]), sectionId(deck2.slides[0]));
});
