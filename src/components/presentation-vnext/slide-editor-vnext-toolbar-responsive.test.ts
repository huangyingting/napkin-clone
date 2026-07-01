import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SlideEditorVNext } from "./slide-editor-vnext";
import {
  buildMinimalDeckV7,
  buildMinimalThemePackage,
} from "@/test/builders/deck-v7";

function renderEditor(
  overrides: Partial<Parameters<typeof SlideEditorVNext>[0]> = {},
): string {
  return renderToStaticMarkup(
    createElement(SlideEditorVNext, {
      documentId: "doc-toolbar-responsive",
      deck: buildMinimalDeckV7(),
      themePackage: buildMinimalThemePackage(),
      onDeckChange: () => undefined,
      ...overrides,
    }),
  );
}

describe("SlideEditorVNext responsive toolbar compaction", () => {
  test("renders compact primary commands while keeping source, save, and close reachable", () => {
    const html = renderEditor({
      onSave: async () => ({ ok: true, data: undefined }),
      onExportPptx: async () => undefined,
      onClose: () => undefined,
    });

    assert.match(html, /aria-label="Document source"/);
    assert.match(html, /aria-label="Open additional toolbar commands"/);
    assert.match(html, /aria-label="Save slide deck"/);
    assert.match(html, /aria-label="Close slide editor"/);
  });

  test("hides the wide inline command strip in compact markup", () => {
    const html = renderEditor({
      onSave: async () => ({ ok: true, data: undefined }),
      onExportPptx: async () => undefined,
    });

    assert.doesNotMatch(html, /aria-label="Toggle snap to guides"/);
    assert.doesNotMatch(html, /<label[^>]*>\s*Theme\s*<\/label>/);
    assert.doesNotMatch(html, /<label[^>]*>\s*Ratio\s*<\/label>/);
  });
});
