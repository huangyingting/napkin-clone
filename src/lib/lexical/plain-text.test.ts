import assert from "node:assert/strict";
import { test } from "node:test";

import { lexicalStateToPlainText } from "./plain-text";

function state(children: unknown[]): string {
  return JSON.stringify({ root: { type: "root", children } });
}

function paragraph(text: string) {
  return { type: "paragraph", children: [{ type: "text", text }] };
}

test("extracts one line per top-level block", () => {
  const json = state([paragraph("Hello"), paragraph("World")]);
  assert.equal(lexicalStateToPlainText(json), "Hello\nWorld");
});

test("concatenates inline text nodes within a block", () => {
  const json = state([
    {
      type: "paragraph",
      children: [
        { type: "text", text: "Hello " },
        { type: "text", text: "there" },
      ],
    },
  ]);
  assert.equal(lexicalStateToPlainText(json), "Hello there");
});

test("maps linebreak nodes to newlines", () => {
  const json = state([
    {
      type: "paragraph",
      children: [
        { type: "text", text: "a" },
        { type: "linebreak" },
        { type: "text", text: "b" },
      ],
    },
  ]);
  assert.equal(lexicalStateToPlainText(json), "a\nb");
});

test("recurses through nested list items", () => {
  const json = state([
    {
      type: "list",
      children: [
        { type: "listitem", children: [{ type: "text", text: "one" }] },
        { type: "listitem", children: [{ type: "text", text: "two" }] },
      ],
    },
  ]);
  assert.equal(lexicalStateToPlainText(json), "one\ntwo");
});

test("accepts an already-parsed object", () => {
  const obj = { root: { type: "root", children: [paragraph("Parsed")] } };
  assert.equal(lexicalStateToPlainText(obj), "Parsed");
});

test("returns empty string for malformed or empty input", () => {
  assert.equal(lexicalStateToPlainText("not json"), "");
  assert.equal(lexicalStateToPlainText(null), "");
  assert.equal(lexicalStateToPlainText({}), "");
  assert.equal(lexicalStateToPlainText(state([])), "");
});
