import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_SLUG_LENGTH, slugify } from "./slug";

test("slugify lowercases and hyphenates whitespace", () => {
  assert.equal(slugify("Hello World"), "hello-world");
  assert.equal(slugify("  Multiple   Spaces  "), "multiple-spaces");
});

test("slugify strips punctuation", () => {
  assert.equal(slugify("Hello, World!"), "hello-world");
  assert.equal(slugify("What's up? (a test)"), "what-s-up-a-test");
});

test("slugify collapses repeated separators into a single dash", () => {
  assert.equal(slugify("a---b___c   d"), "a-b-c-d");
  assert.equal(slugify("a & b & c"), "a-b-c");
});

test("slugify trims leading and trailing dashes", () => {
  assert.equal(slugify("--Hello--"), "hello");
  assert.equal(slugify("!!!edge!!!"), "edge");
});

test("slugify strips accents/diacritics", () => {
  assert.equal(slugify("Café crème brûlée"), "cafe-creme-brulee");
  assert.equal(slugify("naïve résumé"), "naive-resume");
});

test("slugify returns empty string for input with no usable characters", () => {
  assert.equal(slugify(""), "");
  assert.equal(slugify("   "), "");
  assert.equal(slugify("!!!"), "");
  // @ts-expect-error testing non-string input is handled gracefully
  assert.equal(slugify(null), "");
});

test("slugify truncates to the max length without a trailing dash", () => {
  const long = "word ".repeat(60).trim();
  const result = slugify(long);
  assert.ok(result.length <= MAX_SLUG_LENGTH);
  assert.ok(!result.endsWith("-"));
  assert.ok(!result.startsWith("-"));
});

test("slugify keeps numbers", () => {
  assert.equal(slugify("Top 10 Tips for 2026"), "top-10-tips-for-2026");
});
