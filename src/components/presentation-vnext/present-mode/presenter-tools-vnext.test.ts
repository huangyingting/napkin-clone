import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { resolveDeckRenderTree } from "@/lib/presentation-vnext/render-resolver";
import {
  buildDeckV7,
  buildMinimalThemePackage,
  buildSlideV7,
  buildTextNode,
  resetBuilderCounter,
} from "@/test/builders/deck-v7";
import {
  PresenterPanelVNext,
  SlideOverviewPanelVNext,
} from "./presenter-tools-vnext";

function buildPresenterFixture() {
  resetBuilderCounter();
  const slideOne = buildSlideV7(
    "content",
    [
      buildTextNode({
        role: "title",
        content: {
          paragraphs: [{ id: "fixture-slide-1-title", text: "Kickoff status" }],
        },
      }),
    ],
    {
      name: "Kickoff status",
      notes: "Current slide notes for parity coverage.",
    },
  );
  const slideTwo = buildSlideV7(
    "content",
    [
      buildTextNode({
        role: "title",
        content: {
          paragraphs: [
            {
              id: "fixture-slide-2-title",
              text: "Release Gate Fixture Details",
            },
          ],
        },
      }),
    ],
    { notes: "Use this seeded slide to verify presentation navigation." },
  );
  const deck = buildDeckV7([slideOne, slideTwo], {
    theme: { packageId: "presenter-tools-test-package" },
  });
  const renderTree = resolveDeckRenderTree(
    deck,
    buildMinimalThemePackage("presenter-tools-test-package"),
  );
  return { deck, renderTree };
}

describe("Presenter vNext parity tools", () => {
  test("renders current notes and up-next preview labels", () => {
    const { deck, renderTree } = buildPresenterFixture();
    const html = renderToStaticMarkup(
      React.createElement(PresenterPanelVNext, {
        currentSlide: deck.slides[0],
        currentIndex: 0,
        total: deck.slides.length,
        nextSlide: deck.slides[1],
        nextSlideTree: renderTree.slides[1],
        canvas: renderTree.canvas,
      }),
    );

    assert.match(html, /Current slide notes/);
    assert.match(html, /Slide 1 of 2/);
    assert.match(html, /Kickoff status/);
    assert.match(html, /Current slide notes for parity coverage\./);
    assert.match(html, /Up next/);
    assert.match(html, /Release Gate Fixture Details/);
  });

  test("renders fallback copy when current slide has no notes", () => {
    const { deck, renderTree } = buildPresenterFixture();
    const html = renderToStaticMarkup(
      React.createElement(PresenterPanelVNext, {
        currentSlide: { ...deck.slides[0], notes: undefined },
        currentIndex: 0,
        total: deck.slides.length,
        nextSlide: deck.slides[1],
        nextSlideTree: renderTree.slides[1],
        canvas: renderTree.canvas,
      }),
    );

    assert.match(html, /No speaker notes for this slide\./);
  });

  test("uses unique slide labels in overview jump button names", () => {
    const { deck, renderTree } = buildPresenterFixture();
    const html = renderToStaticMarkup(
      React.createElement(SlideOverviewPanelVNext, {
        slides: deck.slides,
        renderTree,
        currentIndex: 0,
        onJump: () => undefined,
        onClose: () => undefined,
      }),
    );

    assert.match(html, /aria-label="Jump to slide 1, Kickoff status"/);
    assert.match(
      html,
      /aria-label="Jump to slide 2, Release Gate Fixture Details"/,
    );
  });
});
