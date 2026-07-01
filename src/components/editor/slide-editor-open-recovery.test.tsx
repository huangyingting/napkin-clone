import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SlideEditorOpenRecovery } from "./slide-editor-button";

test("SlideEditorOpenRecovery renders diagnostics and validation details", () => {
  const html = renderToStaticMarkup(
    createElement(SlideEditorOpenRecovery, {
      error: "Deck schema mismatch",
      diagnostics: [
        {
          code: "invalid-schema-version",
          category: "validation",
          severity: "error",
          target: { scope: "deck" },
          message: "Slide 2 had invalid layout.",
        },
      ],
      validationErrors: ["slides[1].children[0].layout.frame.w is required"],
      onClose: () => undefined,
    }),
  );

  assert.match(html, /Slides could not be opened/);
  assert.match(html, /Deck schema mismatch/);
  assert.match(html, /Slide 2 had invalid layout\./);
  assert.match(html, /Validation details/);
  assert.match(
    html,
    /slides\[1\]\.children\[0\]\.layout\.frame\.w is required/,
  );
});

test("SlideEditorOpenRecovery omits validation details when none are provided", () => {
  const html = renderToStaticMarkup(
    createElement(SlideEditorOpenRecovery, {
      error: "Deck payload malformed",
      diagnostics: [],
      onClose: () => undefined,
    }),
  );

  assert.match(html, /Deck payload malformed/);
  assert.equal(html.includes("Validation details"), false);
});
