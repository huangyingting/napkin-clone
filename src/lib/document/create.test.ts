import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clampDocumentContent,
  clampDocumentTitle,
  importedMarkdownToContentJson,
} from "./create";
import {
  DOCUMENT_CONTENT_MAX_LENGTH,
  DOCUMENT_TITLE_MAX_LENGTH,
} from "@/lib/limits";

test("clampDocumentTitle trims, clamps, and falls back", () => {
  assert.equal(
    clampDocumentTitle("  Quarterly plan  ", "Untitled"),
    "Quarterly plan",
  );
  assert.equal(clampDocumentTitle("   ", "Untitled"), "Untitled");
  assert.equal(
    clampDocumentTitle("x".repeat(DOCUMENT_TITLE_MAX_LENGTH + 5), "Untitled")
      .length,
    DOCUMENT_TITLE_MAX_LENGTH,
  );
});

test("clampDocumentContent uses the shared document content limit", () => {
  assert.equal(
    clampDocumentContent("x".repeat(DOCUMENT_CONTENT_MAX_LENGTH + 5)).length,
    DOCUMENT_CONTENT_MAX_LENGTH,
  );
});

test("importedMarkdownToContentJson produces Lexical document JSON", () => {
  const contentJson = importedMarkdownToContentJson("# Heading");
  assert.equal(typeof contentJson, "object");
  assert.notEqual(contentJson, null);
  assert.equal((contentJson as { root?: unknown }).root !== undefined, true);
});
