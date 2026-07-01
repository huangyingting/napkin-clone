import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { buildDeckV7 } from "@/test/builders/deck-v7";
import { PresentModeVNext } from "./present-mode-vnext";
import { PublicPresentViewerVNext } from "./public-present-viewer-vnext";

test("PresentModeVNext renders an empty deck fallback", () => {
  const html = renderToStaticMarkup(
    createElement(PresentModeVNext, {
      deck: buildDeckV7([]),
      onClose: () => undefined,
    }),
  );

  assert.match(html, /No slides to present/);
  assert.match(html, /Close/);
});

test("PublicPresentViewerVNext renders recovery and empty deck states", () => {
  const emptyDeck = buildDeckV7([]);
  const recoveryHtml = renderToStaticMarkup(
    createElement(PublicPresentViewerVNext, {
      deck: emptyDeck,
      title: "Recovery deck",
      showAttribution: true,
      recovery: {
        error: "Deck JSON failed validation",
        validationErrors: ["slides must not be empty"],
        diagnostics: [
          {
            code: "invalid-schema-version",
            category: "validation",
            severity: "error",
            message: "Missing slide content",
            target: { scope: "deck" },
          },
        ],
      },
    }),
  );
  const emptyHtml = renderToStaticMarkup(
    createElement(PublicPresentViewerVNext, {
      deck: emptyDeck,
      title: "Empty deck",
    }),
  );

  assert.match(recoveryHtml, /Presentation deck could not be opened/);
  assert.match(recoveryHtml, /Deck JSON failed validation/);
  assert.match(recoveryHtml, /Missing slide content/);
  assert.match(recoveryHtml, /slides must not be empty/);
  assert.match(emptyHtml, /No slides to display/);
});
