import assert from "node:assert/strict";
import { test } from "node:test";

import { sanitizeFilename } from "@/lib/visual/export-filename";

// ---------------------------------------------------------------------------
// Basic trimming and passthrough
// ---------------------------------------------------------------------------

test("sanitizeFilename: plain ASCII name is returned unchanged", () => {
  assert.equal(sanitizeFilename("Revenue Costs"), "Revenue Costs");
});

test("sanitizeFilename: trims leading and trailing whitespace", () => {
  assert.equal(sanitizeFilename("  hello world  "), "hello world");
});

// ---------------------------------------------------------------------------
// Reserved / unsafe characters
// ---------------------------------------------------------------------------

test("sanitizeFilename: forward slash is replaced with underscore", () => {
  assert.equal(sanitizeFilename("Revenue / Costs"), "Revenue _ Costs");
});

test("sanitizeFilename: backslash is replaced with underscore", () => {
  assert.equal(sanitizeFilename("A\\B"), "A_B");
});

test("sanitizeFilename: colon is replaced with underscore", () => {
  assert.equal(sanitizeFilename("title: subtitle"), "title_ subtitle");
});

test("sanitizeFilename: asterisk is replaced with underscore", () => {
  assert.equal(sanitizeFilename("foo*bar"), "foo_bar");
});

test("sanitizeFilename: question mark is replaced with underscore", () => {
  assert.equal(sanitizeFilename("what?"), "what_");
});

test("sanitizeFilename: double-quote is replaced with underscore", () => {
  assert.equal(sanitizeFilename('"quoted"'), "_quoted_");
});

test("sanitizeFilename: less-than is replaced with underscore", () => {
  assert.equal(sanitizeFilename("a<b"), "a_b");
});

test("sanitizeFilename: greater-than is replaced with underscore", () => {
  assert.equal(sanitizeFilename("a>b"), "a_b");
});

test("sanitizeFilename: pipe is replaced with underscore", () => {
  assert.equal(sanitizeFilename("a|b"), "a_b");
});

test("sanitizeFilename: all reserved chars in one string", () => {
  const result = sanitizeFilename('/\\:*?"<>|');
  assert.ok(!result.includes("/"), "no forward slash");
  assert.ok(!result.includes("\\"), "no backslash");
  assert.ok(!result.includes(":"), "no colon");
  assert.ok(!result.includes("*"), "no asterisk");
  assert.ok(!result.includes("?"), "no question mark");
  assert.ok(!result.includes('"'), "no double-quote");
  assert.ok(!result.includes("<"), "no less-than");
  assert.ok(!result.includes(">"), "no greater-than");
  assert.ok(!result.includes("|"), "no pipe");
});

// ---------------------------------------------------------------------------
// Control characters
// ---------------------------------------------------------------------------

test("sanitizeFilename: ASCII control chars are replaced with underscore", () => {
  const withControl = "hello\x00world\x1fend";
  const result = sanitizeFilename(withControl);
  assert.ok(!result.includes("\x00"), "no null byte");
  assert.ok(!result.includes("\x1f"), "no unit separator");
  assert.ok(result.includes("hello"), "keeps normal chars");
});

test("sanitizeFilename: DEL (0x7f) is replaced with underscore", () => {
  assert.equal(sanitizeFilename("foo\x7fbar"), "foo_bar");
});

// ---------------------------------------------------------------------------
// Whitespace collapsing
// ---------------------------------------------------------------------------

test("sanitizeFilename: multiple spaces collapse to one", () => {
  assert.equal(sanitizeFilename("hello   world"), "hello world");
});

test("sanitizeFilename: tabs and newlines collapse to single space", () => {
  assert.equal(sanitizeFilename("a\t\nb"), "a b");
});

// ---------------------------------------------------------------------------
// Leading/trailing dots and spaces
// ---------------------------------------------------------------------------

test("sanitizeFilename: leading dots are stripped", () => {
  assert.equal(sanitizeFilename("...hidden"), "hidden");
});

test("sanitizeFilename: trailing dots are stripped", () => {
  assert.equal(sanitizeFilename("file..."), "file");
});

test("sanitizeFilename: leading and trailing dots/spaces are stripped", () => {
  assert.equal(sanitizeFilename("  . ..hello.. .  "), "hello");
});

// ---------------------------------------------------------------------------
// Empty / whitespace-only → fallback
// ---------------------------------------------------------------------------

test("sanitizeFilename: empty string returns default fallback 'visual'", () => {
  assert.equal(sanitizeFilename(""), "visual");
});

test("sanitizeFilename: whitespace-only string returns default fallback", () => {
  assert.equal(sanitizeFilename("   "), "visual");
});

test("sanitizeFilename: only reserved chars replaced with underscores", () => {
  const result = sanitizeFilename("///");
  assert.ok(!result.includes("/"), "no forward slash");
  assert.ok(result.length > 0, "non-empty result");
});

test("sanitizeFilename: custom fallback is used when result is empty", () => {
  assert.equal(sanitizeFilename("", "document"), "document");
});

test("sanitizeFilename: custom fallback is used for all-space input", () => {
  assert.equal(sanitizeFilename("   ", "untitled"), "untitled");
});

// ---------------------------------------------------------------------------
// Length cap (~120)
// ---------------------------------------------------------------------------

test("sanitizeFilename: name within 120 chars is not truncated", () => {
  const name = "a".repeat(120);
  assert.equal(sanitizeFilename(name).length, 120);
});

test("sanitizeFilename: name longer than 120 chars is truncated", () => {
  const name = "b".repeat(200);
  assert.ok(sanitizeFilename(name).length <= 120);
});

test("sanitizeFilename: truncated name does not end with trailing dot", () => {
  // Construct a 122-char string ending in dots after truncation
  const name = "x".repeat(119) + "...";
  const result = sanitizeFilename(name);
  assert.ok(result.length <= 120, "length is capped");
  assert.ok(!result.endsWith("."), "no trailing dot after truncation");
});

// ---------------------------------------------------------------------------
// Unicode passthrough
// ---------------------------------------------------------------------------

test("sanitizeFilename: unicode letters are preserved", () => {
  assert.equal(sanitizeFilename("Bericht über Kosten"), "Bericht über Kosten");
});

test("sanitizeFilename: CJK characters are preserved", () => {
  assert.equal(sanitizeFilename("收入与支出"), "收入与支出");
});

test("sanitizeFilename: emoji are preserved", () => {
  const result = sanitizeFilename("chart 📊 revenue");
  assert.ok(result.includes("📊"), "emoji should be preserved");
});

// ---------------------------------------------------------------------------
// Extension handling (caller responsibility — documented via usage test)
// ---------------------------------------------------------------------------

test("sanitizeFilename + extension: builds safe filename with .png", () => {
  const result = sanitizeFilename("Revenue / Costs") + ".png";
  assert.ok(result.endsWith(".png"), "extension preserved");
  assert.ok(!result.includes("/"), "no path separator");
});

test("sanitizeFilename + extension: builds safe filename with .svg", () => {
  const result = sanitizeFilename("A:B<C>D") + ".svg";
  assert.ok(result.endsWith(".svg"), "extension preserved");
  assert.ok(!result.includes(":"), "no colon");
});

test("sanitizeFilename + extension: builds safe filename with .pdf", () => {
  const result = sanitizeFilename("Q1 | Q2 Results") + ".pdf";
  assert.ok(result.endsWith(".pdf"), "extension preserved");
  assert.ok(!result.includes("|"), "no pipe");
});

test("sanitizeFilename + extension: builds safe filename with .pptx", () => {
  const result = sanitizeFilename('Slide "deck"') + ".pptx";
  assert.ok(result.endsWith(".pptx"), "extension preserved");
  assert.ok(!result.includes('"'), "no double-quote");
});
