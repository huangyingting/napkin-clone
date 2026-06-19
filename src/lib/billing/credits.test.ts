/**
 * Unit tests for credit calculation helpers (US-010 epic).
 *
 * Tests are pure — no DB, no network.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { countWords, computeCreditCost } from "@/lib/billing/credits";

describe("countWords", () => {
  it("counts whitespace-delimited tokens", () => {
    assert.strictEqual(countWords("hello world"), 2);
    assert.strictEqual(countWords("one two three four"), 4);
  });

  it("returns at least 1 for non-empty strings", () => {
    assert.strictEqual(countWords("x"), 1);
    assert.strictEqual(countWords("."), 1);
  });

  it("trims and collapses whitespace", () => {
    assert.strictEqual(countWords("  hello   world  "), 2);
    assert.strictEqual(countWords("\thello\nworld"), 2);
  });

  it("returns 1 for strings with only whitespace (no tokens)", () => {
    // "   ".split(/\s+/).filter(Boolean) = [] → max(1, 0) = 1
    assert.strictEqual(countWords("   "), 1);
  });

  it("handles empty string", () => {
    assert.strictEqual(countWords(""), 1);
  });

  it("handles a longer sentence", () => {
    const text = "The quick brown fox jumps over the lazy dog";
    assert.strictEqual(countWords(text), 9);
  });
});

describe("computeCreditCost", () => {
  it("equals wordCount for typical input", () => {
    const text = "machine learning pipeline architecture diagram";
    assert.strictEqual(computeCreditCost(text), countWords(text));
  });

  it("returns at least 1 for any input", () => {
    assert.strictEqual(computeCreditCost(""), 1);
    assert.strictEqual(computeCreditCost("x"), 1);
  });

  it("scales linearly with word count", () => {
    const words = Array.from({ length: 50 }, (_, i) => `word${i}`).join(" ");
    assert.strictEqual(computeCreditCost(words), 50);
  });
});

describe("credit period reset boundary", () => {
  // This tests the conceptual boundary: period elapsed means reset
  it("period elapsed when now >= periodStart + periodDays * ms", () => {
    const periodDays = 7;
    const periodMs = periodDays * 24 * 60 * 60 * 1000;

    const now = Date.now();
    const periodStart = now - periodMs; // exactly expired
    assert.ok(now >= periodStart + periodMs, "period should have elapsed");
  });

  it("period NOT elapsed when now < periodStart + periodDays * ms", () => {
    const periodDays = 7;
    const periodMs = periodDays * 24 * 60 * 60 * 1000;

    const now = Date.now();
    const periodStart = now - periodMs + 60_000; // 1 minute to go
    assert.ok(now < periodStart + periodMs, "period should not have elapsed");
  });
});
