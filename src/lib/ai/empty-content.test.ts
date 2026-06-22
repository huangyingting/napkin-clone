import assert from "node:assert/strict";
import { test } from "node:test";

import { isEffectivelyEmptyEditorState } from "./empty-content";

/** Build a serialised Lexical editor state string from root children. */
function state(children: unknown[]): string {
  return JSON.stringify({ root: { type: "root", children } });
}

const paragraph = (text: string) => ({
  type: "paragraph",
  children: text ? [{ type: "text", text }] : [],
});

const heading = (text: string) => ({
  type: "heading",
  tag: "h1",
  children: [{ type: "text", text }],
});

const visualNode = (id: string) => ({
  type: "visual",
  visualId: id,
  visual: {
    id,
    kind: "list",
    title: "Steps",
    spec: { items: [{ id: "a", text: "one" }] },
  },
});

test("isEffectivelyEmptyEditorState: empty root → true", () => {
  assert.equal(isEffectivelyEmptyEditorState(state([])), true);
});

test("isEffectivelyEmptyEditorState: only an empty paragraph → true", () => {
  assert.equal(isEffectivelyEmptyEditorState(state([paragraph("")])), true);
});

test("isEffectivelyEmptyEditorState: whitespace-only paragraph → true", () => {
  assert.equal(
    isEffectivelyEmptyEditorState(state([paragraph("   \n  ")])),
    true,
  );
});

test("isEffectivelyEmptyEditorState: doc with text → false", () => {
  assert.equal(
    isEffectivelyEmptyEditorState(state([heading("Hello world")])),
    false,
  );
});

test("isEffectivelyEmptyEditorState: doc with only a visual node → false", () => {
  assert.equal(isEffectivelyEmptyEditorState(state([visualNode("v1")])), false);
});

test("isEffectivelyEmptyEditorState: malformed JSON → true (treated as empty)", () => {
  assert.equal(isEffectivelyEmptyEditorState("not json {"), true);
  assert.equal(isEffectivelyEmptyEditorState(""), true);
});
