import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeImportedText } from "./normalize";

test("normalizeImportedText trims leading and trailing whitespace", () => {
  assert.equal(normalizeImportedText("  hello world  "), "hello world");
});

test("normalizeImportedText collapses 3+ blank lines to a single blank line", () => {
  const input = "Para one\n\n\n\n\nPara two";
  const result = normalizeImportedText(input);
  assert.ok(!result.includes("\n\n\n"));
  assert.ok(result.includes("Para one"));
  assert.ok(result.includes("Para two"));
});

test("normalizeImportedText strips null bytes", () => {
  const input = "Hello\x00World";
  assert.ok(!normalizeImportedText(input).includes("\x00"));
  assert.ok(normalizeImportedText(input).includes("Hello"));
});

test("normalizeImportedText strips control characters except newlines/tabs", () => {
  const input = "Hello\x07\x08World"; // BEL and BS
  const result = normalizeImportedText(input);
  assert.ok(!result.includes("\x07"));
  assert.ok(!result.includes("\x08"));
  assert.ok(result.includes("Hello"));
  assert.ok(result.includes("World"));
});

test("normalizeImportedText preserves newlines and tabs", () => {
  const input = "Line one\n\tIndented\nLine two";
  const result = normalizeImportedText(input);
  assert.ok(result.includes("\n"));
  assert.ok(result.includes("\t"));
});

test("normalizeImportedText returns empty string for blank input", () => {
  assert.equal(normalizeImportedText(""), "");
  assert.equal(normalizeImportedText("   "), "");
  assert.equal(normalizeImportedText("\n\n\n"), "");
});

test("normalizeImportedText truncates at MAX_INPUT_CHARS", async () => {
  // Import MAX_INPUT_CHARS dynamically to avoid pulling in all of the AI module's dependencies.
  const { MAX_INPUT_CHARS } = await import("@/lib/ai/generate");
  const overlong = "x".repeat(MAX_INPUT_CHARS + 5000);
  const result = normalizeImportedText(overlong);
  assert.ok(result.length <= MAX_INPUT_CHARS);
});
