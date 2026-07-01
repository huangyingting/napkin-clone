import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { buildMinimalDeckV7 } from "@/test/builders/deck-v7";
import { PresentModeVNext } from "./present-mode-vnext";
import { PublicPresentViewerVNext } from "./public-present-viewer-vnext";

function countOccurrences(value: string, token: string): number {
  return value.split(token).length - 1;
}

describe("v7 present/public reduced-motion classes", () => {
  test("present mode HUD and nav affordances include reduced-motion transition guards", () => {
    const html = renderToStaticMarkup(
      createElement(PresentModeVNext, {
        deck: buildMinimalDeckV7(),
        onClose: () => undefined,
      }),
    );

    assert.equal(
      countOccurrences(
        html,
        "transition-opacity duration-300 motion-reduce:transition-none",
      ) >= 2,
      true,
    );
    assert.ok(
      html.includes(
        "transition-all duration-300 motion-reduce:transition-none",
      ),
    );
    assert.equal(
      countOccurrences(
        html,
        "transition-opacity motion-reduce:transition-none group-hover:opacity-100 group-focus-visible:opacity-100",
      ) >= 2,
      true,
    );
  });

  test("public viewer HUD and nav affordances include reduced-motion transition guards", () => {
    const html = renderToStaticMarkup(
      createElement(PublicPresentViewerVNext, {
        deck: buildMinimalDeckV7(),
        title: "Reduced motion check",
      }),
    );

    assert.equal(
      countOccurrences(
        html,
        "transition-opacity duration-300 motion-reduce:transition-none",
      ) >= 2,
      true,
    );
    assert.ok(
      html.includes(
        "transition-all duration-300 motion-reduce:transition-none",
      ),
    );
    assert.equal(
      countOccurrences(
        html,
        "transition-opacity motion-reduce:transition-none group-hover:opacity-100 group-focus-visible:opacity-100",
      ) >= 2,
      true,
    );
  });
});
