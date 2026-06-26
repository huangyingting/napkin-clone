import assert from "node:assert/strict";
import { test } from "node:test";

import {
  deriveFromContentJson,
  excerpt,
  readingTimeMinutes,
  wordCount,
} from "./document-stats";

test("wordCount returns 0 for empty or whitespace input", () => {
  assert.equal(wordCount(""), 0);
  assert.equal(wordCount("   \n\t  "), 0);
});

test("wordCount counts whitespace-delimited words", () => {
  assert.equal(wordCount("hello world"), 2);
  assert.equal(wordCount("  one   two\tthree\nfour  "), 4);
});

test("readingTimeMinutes returns 0 for empty input", () => {
  assert.equal(readingTimeMinutes(""), 0);
  assert.equal(readingTimeMinutes("   "), 0);
});

test("readingTimeMinutes returns a minimum of 1 minute for short text", () => {
  assert.equal(readingTimeMinutes("just a few words here"), 1);
});

test("readingTimeMinutes rounds long text at ~200 wpm", () => {
  // 500 words -> 500 / 200 = 2.5 -> rounds to 3
  const text = Array.from({ length: 500 }, () => "word").join(" ");
  assert.equal(readingTimeMinutes(text), 3);

  // 400 words -> exactly 2 minutes
  const text2 = Array.from({ length: 400 }, () => "word").join(" ");
  assert.equal(readingTimeMinutes(text2), 2);
});

test("excerpt strips Markdown syntax", () => {
  const md =
    "# Title\n\nThis is **bold** and _italic_ with `code` and a [link](http://x).";
  const result = excerpt(md);
  assert.ok(!result.includes("#"));
  assert.ok(!result.includes("*"));
  assert.ok(!result.includes("`"));
  assert.ok(!result.includes("]("));
  assert.ok(result.includes("Title"));
  assert.ok(result.includes("bold"));
  assert.ok(result.includes("link"));
});

test("excerpt returns full text when shorter than the limit", () => {
  assert.equal(excerpt("Short text", 100), "Short text");
});

test("excerpt truncates on a word boundary with an ellipsis", () => {
  const text = "The quick brown fox jumps over the lazy dog repeatedly";
  const result = excerpt(text, 20);
  assert.ok(result.endsWith("…"));
  assert.ok(result.length <= 21); // boundary text + ellipsis
  assert.ok(!result.slice(0, -1).includes("  "));
  // no mid-word cut: the body (without ellipsis) is a prefix ending on a full word
  const body = result.slice(0, -1);
  assert.ok(text.startsWith(body));
  assert.ok(text[body.length] === " " || text[body.length] === undefined);
});

test("excerpt handles empty input", () => {
  assert.equal(excerpt(""), "");
});

test("deriveFromContentJson extracts plaintext, excerpt, and readingMinutes from Lexical state", () => {
  const contentJson = {
    root: {
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", text: "Hello world." }],
        },
      ],
    },
  };
  const result = deriveFromContentJson(contentJson);
  assert.equal(result.plaintext, "Hello world.");
  assert.equal(result.excerpt, "Hello world.");
  assert.equal(result.readingMinutes, 1);
});

test("deriveFromContentJson returns empty values for null/invalid contentJson", () => {
  const result = deriveFromContentJson(null);
  assert.equal(result.plaintext, "");
  assert.equal(result.excerpt, "");
  assert.equal(result.readingMinutes, 0);
});
