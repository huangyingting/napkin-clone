import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./slide-editor-vnext.tsx", import.meta.url),
  "utf8",
);

describe("SlideEditorVNext toolbar command ownership", () => {
  test("removes generic element insertion from the top toolbar", () => {
    assert.equal(source.includes('aria-label="Insert element"'), false);
  });

  test("passes insertion handlers to the current-object context toolbar", () => {
    assert.equal(source.includes("onInsertText={handleInsertText}"), true);
    assert.equal(source.includes("onInsertShape={handleInsertShape}"), true);
    assert.equal(source.includes("onInsertImage={handleInsertImage}"), true);
    assert.equal(
      source.includes("onInsertVisual={() => void handleInsertVisual()}"),
      true,
    );
    assert.equal(
      source.includes("onInsertConnector={handleInsertConnector}"),
      true,
    );
    assert.equal(source.includes("onInsertTable={handleInsertTable}"), true);
  });
});
