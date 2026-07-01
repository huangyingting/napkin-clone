import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./slide-editor-vnext.tsx", import.meta.url),
  "utf8",
);

describe("SlideEditorVNext document-source command surface", () => {
  test("renders document-source command controls", () => {
    assert.equal(source.includes('aria-label="Document source"'), true);
    assert.equal(source.includes("Sync from document"), true);
    assert.equal(source.includes("From document"), true);
  });

  test("wires document source block insertion commands", () => {
    assert.equal(source.includes("handleInsertDocumentSourceBlock"), true);
    assert.equal(source.includes("documentSourceInsertBlocks"), true);
  });
});
