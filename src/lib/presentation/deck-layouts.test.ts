/**
 * Tests for SlideLayout title/description fields and BUILTIN_LAYOUTS metadata.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { defaultLayouts } from "./deck";

test("defaultLayouts returns layouts for all formats", () => {
  const layouts = defaultLayouts();
  assert.ok(layouts.length > 0);
  // 4 layout names × 2 formats (16:9 and 4:3) = 8
  assert.equal(layouts.length, 8);
});

test("each builtin layout has a title and description", () => {
  const layouts = defaultLayouts();
  for (const layout of layouts) {
    assert.ok(
      typeof layout.title === "string" && layout.title.length > 0,
      `layout "${layout.id}" is missing title`,
    );
    assert.ok(
      typeof layout.description === "string" && layout.description.length > 0,
      `layout "${layout.id}" is missing description`,
    );
  }
});

test("blank layout has correct title and description", () => {
  const layouts = defaultLayouts();
  const blank = layouts.find((l) => l.name === "blank");
  assert.ok(blank, "blank layout not found");
  assert.equal(blank.title, "Blank");
  assert.equal(blank.description, "Empty canvas with no placeholders");
});

test("title-slide layout has correct title and description", () => {
  const layouts = defaultLayouts();
  const titleSlide = layouts.find((l) => l.name === "title-slide");
  assert.ok(titleSlide, "title-slide layout not found");
  assert.equal(titleSlide.title, "Title Slide");
  assert.equal(titleSlide.description, "Centered title and subtitle");
});

test("title-content layout has correct title and description", () => {
  const layouts = defaultLayouts();
  const titleContent = layouts.find((l) => l.name === "title-content");
  assert.ok(titleContent, "title-content layout not found");
  assert.equal(titleContent.title, "Title + Content");
  assert.equal(titleContent.description, "Slide title with body content area");
});

test("two-column layout has correct title and description", () => {
  const layouts = defaultLayouts();
  const twoCol = layouts.find((l) => l.name === "two-column");
  assert.ok(twoCol, "two-column layout not found");
  assert.equal(twoCol.title, "Two Column");
  assert.equal(twoCol.description, "Side-by-side content areas");
});

test("defaultLayouts returns deep-cloned placeholders", () => {
  const a = defaultLayouts();
  const b = defaultLayouts();
  const aLayout = a[0];
  const bLayout = b[0];
  // Mutating one should not affect the other
  if (aLayout.placeholders.length > 0) {
    aLayout.placeholders[0].box.x = 999;
    assert.notEqual(bLayout.placeholders[0]?.box.x, 999);
  }
});
