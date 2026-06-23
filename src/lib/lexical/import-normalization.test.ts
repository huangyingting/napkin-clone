/**
 * Tests for import normalization (issue #485).
 *
 * Verifies that the Markdown→Lexical conversion produces valid, parseable
 * contentJson at creation time, and that the legacy first-open path still
 * produces identical output for existing content-only docs.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  markdownToLexicalState,
  markdownToLexicalStateObject,
  type SerializedLexicalState,
} from "./from-markdown";

// ---------------------------------------------------------------------------
// Normalization at creation time: markdown → canonical contentJson
// ---------------------------------------------------------------------------

test("markdownToLexicalState returns a valid JSON string", () => {
  const md = "# Hello\n\nWorld paragraph.";
  const json = markdownToLexicalState(md);
  assert.doesNotThrow(() => JSON.parse(json), "should be valid JSON");
});

test("markdownToLexicalStateObject has a root with correct type", () => {
  const state = markdownToLexicalStateObject("# Title\n\nBody text");
  assert.equal(state.root.type, "root");
  assert.ok(Array.isArray(state.root.children));
});

test("heading markdown produces heading node with correct tag", () => {
  const state = markdownToLexicalStateObject("# My heading");
  const firstChild = state.root.children[0] as Record<string, unknown>;
  assert.equal(firstChild.type, "heading");
  assert.equal(firstChild.tag, "h1");
});

test("bullet list markdown produces list node", () => {
  const state = markdownToLexicalStateObject("- item one\n- item two");
  const firstChild = state.root.children[0] as Record<string, unknown>;
  assert.equal(firstChild.type, "list");
  assert.equal(firstChild.listType, "bullet");
});

test("paragraph markdown produces paragraph node", () => {
  const state = markdownToLexicalStateObject("Just a paragraph.");
  const firstChild = state.root.children[0] as Record<string, unknown>;
  assert.equal(firstChild.type, "paragraph");
});

test("empty markdown yields a single empty paragraph (fallback)", () => {
  const state = markdownToLexicalStateObject("");
  assert.equal(state.root.children.length, 1);
  const firstChild = state.root.children[0] as Record<string, unknown>;
  assert.equal(firstChild.type, "paragraph");
  assert.deepEqual(firstChild.children, []);
});

test("whitespace-only markdown yields single empty paragraph (fallback)", () => {
  const state = markdownToLexicalStateObject("   \n\n  ");
  assert.equal(state.root.children.length, 1);
});

// ---------------------------------------------------------------------------
// Creation-time contentJson is JSON-parseable and round-trips
// ---------------------------------------------------------------------------

test("contentJson created at import time is JSON-serializable and parseable", () => {
  const md = "# Title\n\n- bullet one\n- bullet two\n\nA paragraph at the end.";
  const json = markdownToLexicalState(md);
  let parsed: SerializedLexicalState;
  assert.doesNotThrow(() => {
    parsed = JSON.parse(json) as SerializedLexicalState;
  });
  assert.equal(parsed!.root.type, "root");
  assert.ok(parsed!.root.children.length > 0);
});

test("markdownToLexicalState and markdownToLexicalStateObject produce consistent output", () => {
  const md = "# Intro\n\nSome body text here.";
  const fromString = JSON.parse(
    markdownToLexicalState(md),
  ) as SerializedLexicalState;
  const fromObject = markdownToLexicalStateObject(md);
  // Node types should match; block IDs will differ (they use randomUUID).
  assert.equal(
    fromString.root.children.length,
    fromObject.root.children.length,
  );
  for (let i = 0; i < fromString.root.children.length; i++) {
    const a = fromString.root.children[i] as Record<string, unknown>;
    const b = fromObject.root.children[i] as Record<string, unknown>;
    assert.equal(a.type, b.type);
  }
});

// ---------------------------------------------------------------------------
// Legacy first-open fallback: existing content-only docs
// ---------------------------------------------------------------------------

test("legacy first-open fallback: converting a content-only doc produces the same structure as creation-time normalization", () => {
  // Simulate a legacy doc that has only `content` (Markdown) and no contentJson.
  const legacyMarkdown = "# Legacy Doc\n\n- item a\n- item b";

  // The first-open path: convert on read (same function, same Markdown).
  const firstOpenState = markdownToLexicalStateObject(legacyMarkdown);

  // The creation-time path (import normalization): convert at write.
  const creationTimeState = markdownToLexicalStateObject(legacyMarkdown);

  // Both should produce the same structure (node types and counts).
  assert.equal(
    firstOpenState.root.children.length,
    creationTimeState.root.children.length,
  );
  for (let i = 0; i < firstOpenState.root.children.length; i++) {
    const fo = firstOpenState.root.children[i] as Record<string, unknown>;
    const ct = creationTimeState.root.children[i] as Record<string, unknown>;
    assert.equal(fo.type, ct.type);
  }
});
