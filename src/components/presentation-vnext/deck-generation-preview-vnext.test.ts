import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DeckGenerationDiagnosticsNotice } from "./deck-generation-preview-vnext";

test("shows deduped AI diagnostics review affordance in preview", () => {
  const html = renderToStaticMarkup(
    createElement(DeckGenerationDiagnosticsNotice, {
      diagnosticsCount: 1,
      isRegenerating: false,
      onReview: () => undefined,
    }),
  );

  assert.match(html, /AI generation reported 1 diagnostic/);
  assert.match(html, /Review AI diagnostics \(1\)/);
});
