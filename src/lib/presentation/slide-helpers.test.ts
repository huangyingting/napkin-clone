import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clampSlideIndex,
  findSourceLinkedElements,
  formatProgress,
  getSlideTitleFromElements,
  getSlideVisualIds,
  hashFromSlideIndex,
  presentationProgress,
  resolveSwipeNavigation,
  summarizeSlideContent,
  SWIPE_THRESHOLD_PX,
  slideIndexFromHash,
} from "./slide-helpers";
import type { Slide } from "./deck";

function slideFixture(): Slide {
  return {
    id: "slide-1",
    index: 0,
    title: "Metadata title",
    elements: [
      {
        id: "body",
        kind: "text",
        role: "body",
        box: { x: 0, y: 0, w: 10, h: 10 },
        zIndex: 1,
        content: {
          kind: "text",
          text: "Body fallback",
          paragraphs: [{ text: "First" }, { text: "Second" }],
        },
      },
      {
        id: "title",
        kind: "text",
        role: "title",
        box: { x: 0, y: 0, w: 10, h: 10 },
        zIndex: 0,
        content: { kind: "text", text: "Element title" },
        source: {
          documentId: "doc-1",
          blockId: "block-1",
          linkedAt: "2026-06-27T00:00:00.000Z",
          blockKind: "text",
        },
      },
      {
        id: "visual",
        kind: "visual",
        role: "visual",
        box: { x: 0, y: 0, w: 10, h: 10 },
        zIndex: 2,
        content: { kind: "visual", visualId: "vis-1" },
      },
    ],
  } as unknown as Slide;
}

test("getSlideVisualIds reads visual ids from slide elements", () => {
  assert.deepEqual(getSlideVisualIds(slideFixture()), ["vis-1"]);
});

test("getSlideTitleFromElements reads title role text and ignores metadata", () => {
  assert.equal(getSlideTitleFromElements(slideFixture()), "Element title");
});

test("findSourceLinkedElements returns active source-linked elements", () => {
  assert.deepEqual(
    findSourceLinkedElements(slideFixture()).map((element) => element.id),
    ["title"],
  );
});

test("summarizeSlideContent summarizes element content only", () => {
  assert.deepEqual(summarizeSlideContent(slideFixture()), {
    title: "Element title",
    text: "First\nSecond\nElement title",
    visualIds: ["vis-1"],
    sourceLinkedElementCount: 1,
  });
});

// ---------------------------------------------------------------------------
// clampSlideIndex
// ---------------------------------------------------------------------------

test("clampSlideIndex: returns 0 when total is 0 (defensive)", () => {
  assert.equal(clampSlideIndex(5, 0), 0);
});

test("clampSlideIndex: returns 0 when total is negative (defensive)", () => {
  assert.equal(clampSlideIndex(1, -3), 0);
});

test("clampSlideIndex: clamps below 0 to 0", () => {
  assert.equal(clampSlideIndex(-1, 5), 0);
});

test("clampSlideIndex: clamps above total-1 to total-1", () => {
  assert.equal(clampSlideIndex(10, 5), 4);
});

test("clampSlideIndex: valid mid-range index passes through unchanged", () => {
  assert.equal(clampSlideIndex(2, 5), 2);
});

test("clampSlideIndex: last valid index (total-1) is unchanged", () => {
  assert.equal(clampSlideIndex(4, 5), 4);
});

test("clampSlideIndex: first valid index (0) is unchanged", () => {
  assert.equal(clampSlideIndex(0, 5), 0);
});

test("clampSlideIndex: floors fractional index", () => {
  assert.equal(clampSlideIndex(2.9, 5), 2);
});

// ---------------------------------------------------------------------------
// formatProgress
// ---------------------------------------------------------------------------

test("formatProgress: empty deck returns '0 / 0'", () => {
  assert.equal(formatProgress(0, 0), "0 / 0");
});

test("formatProgress: negative total returns '0 / 0'", () => {
  assert.equal(formatProgress(0, -1), "0 / 0");
});

test("formatProgress: first slide of 12 is '1 / 12'", () => {
  assert.equal(formatProgress(0, 12), "1 / 12");
});

test("formatProgress: third slide of 12 is '3 / 12'", () => {
  assert.equal(formatProgress(2, 12), "3 / 12");
});

test("formatProgress: last slide of 12 is '12 / 12'", () => {
  assert.equal(formatProgress(11, 12), "12 / 12");
});

test("formatProgress: out-of-range index is clamped before formatting", () => {
  assert.equal(formatProgress(99, 5), "5 / 5");
  assert.equal(formatProgress(-1, 5), "1 / 5");
});

test("formatProgress: single slide deck is '1 / 1'", () => {
  assert.equal(formatProgress(0, 1), "1 / 1");
});

test("presentationProgress: returns shared progress label and percentage", () => {
  assert.deepEqual(presentationProgress(2, 5), {
    label: "3 / 5",
    percentage: 50,
  });
  assert.deepEqual(presentationProgress(0, 1), {
    label: "1 / 1",
    percentage: 100,
  });
});

// ---------------------------------------------------------------------------
// slideIndexFromHash
// ---------------------------------------------------------------------------

test("slideIndexFromHash: '#1' returns 0 (first slide)", () => {
  assert.equal(slideIndexFromHash("#1", 5), 0);
});

test("slideIndexFromHash: '#3' returns 2", () => {
  assert.equal(slideIndexFromHash("#3", 5), 2);
});

test("slideIndexFromHash: '#5' returns 4 (last slide)", () => {
  assert.equal(slideIndexFromHash("#5", 5), 4);
});

test("slideIndexFromHash: out-of-range hash is clamped to last slide", () => {
  assert.equal(slideIndexFromHash("#99", 5), 4);
});

test("slideIndexFromHash: '#0' returns 0 (clamp non-positive)", () => {
  assert.equal(slideIndexFromHash("#0", 5), 0);
});

test("slideIndexFromHash: negative hash returns 0", () => {
  assert.equal(slideIndexFromHash("#-2", 5), 0);
});

test("slideIndexFromHash: non-numeric hash returns 0", () => {
  assert.equal(slideIndexFromHash("#abc", 5), 0);
});

test("slideIndexFromHash: empty string returns 0", () => {
  assert.equal(slideIndexFromHash("", 5), 0);
});

test("slideIndexFromHash: missing '#' prefix still parses correctly", () => {
  assert.equal(slideIndexFromHash("3", 5), 2);
});

test("slideIndexFromHash: total 0 always returns 0", () => {
  assert.equal(slideIndexFromHash("#1", 0), 0);
});

// ---------------------------------------------------------------------------
// hashFromSlideIndex
// ---------------------------------------------------------------------------

test("hashFromSlideIndex: index 0 returns '#1'", () => {
  assert.equal(hashFromSlideIndex(0), "#1");
});

test("hashFromSlideIndex: index 2 returns '#3'", () => {
  assert.equal(hashFromSlideIndex(2), "#3");
});

test("hashFromSlideIndex: negative index returns '#1' (clamped)", () => {
  assert.equal(hashFromSlideIndex(-1), "#1");
});

test("hashFromSlideIndex: fractional index is floored", () => {
  assert.equal(hashFromSlideIndex(2.9), "#3");
});

// ---------------------------------------------------------------------------
// resolveSwipeNavigation
// ---------------------------------------------------------------------------

test("resolveSwipeNavigation: a left swipe past the threshold advances", () => {
  assert.equal(resolveSwipeNavigation(-80), "next");
});

test("resolveSwipeNavigation: a right swipe past the threshold goes back", () => {
  assert.equal(resolveSwipeNavigation(80), "prev");
});

test("resolveSwipeNavigation: travel shorter than the threshold is ignored", () => {
  assert.equal(resolveSwipeNavigation(49), null);
  assert.equal(resolveSwipeNavigation(-49), null);
  assert.equal(resolveSwipeNavigation(0), null);
});

test("resolveSwipeNavigation: travel exactly at the threshold registers", () => {
  assert.equal(resolveSwipeNavigation(SWIPE_THRESHOLD_PX), "prev");
  assert.equal(resolveSwipeNavigation(-SWIPE_THRESHOLD_PX), "next");
});

test("resolveSwipeNavigation: a custom threshold is honoured", () => {
  assert.equal(resolveSwipeNavigation(30, 20), "prev");
  assert.equal(resolveSwipeNavigation(-30, 20), "next");
  assert.equal(resolveSwipeNavigation(30, 40), null);
});
