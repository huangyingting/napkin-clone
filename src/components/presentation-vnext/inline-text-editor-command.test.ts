import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { inlineTextAlignForCommand } from "./inline-text-editor";

const source = readFileSync(
  new URL("./inline-text-editor.tsx", import.meta.url),
  "utf8",
);

describe("inlineTextAlignForCommand", () => {
  test("maps toolbar align commands to persisted text align values", () => {
    assert.equal(inlineTextAlignForCommand("align-left"), "left");
    assert.equal(inlineTextAlignForCommand("align-center"), "center");
    assert.equal(inlineTextAlignForCommand("align-right"), "right");
  });

  test("ignores non-align inline commands", () => {
    assert.equal(inlineTextAlignForCommand("bold"), undefined);
    assert.equal(inlineTextAlignForCommand("bullet-list"), undefined);
    assert.equal(inlineTextAlignForCommand("font-size"), undefined);
  });
});

describe("inline text commit paths", () => {
  test("forwards committed alignment metadata through onCommit", () => {
    assert.match(
      source,
      /onCommit\(\s*nodeId,\s*paragraphs,\s*autoHeightFrame\(\),\s*committedTextAlignRef\.current,\s*\)/,
    );
  });

  test("uses a single commit path for blur, Escape, and Tab", () => {
    assert.equal(source.includes("onBlur={doCommit}"), true);
    assert.equal(source.includes('if (event.key === "Escape")'), true);
    assert.equal(source.includes('if (event.key === "Tab")'), true);
    assert.equal(source.includes("doCommit();"), true);
  });

  test("places click-to-edit caret from the client point and falls back to start", () => {
    assert.match(source, /document\.caretRangeFromPoint\(x, y\)/);
    assert.match(source, /caretPositionFromPoint\?\.\(x, y\)/);
    assert.match(source, /initialCaret\?\.kind === "client"/);
    assert.match(source, /initialCaret\?\.kind === "start"/);
  });
});
