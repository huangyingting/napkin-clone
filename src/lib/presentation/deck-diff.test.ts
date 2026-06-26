/**
 * Unit tests for the AI deck preview diff (`deck-diff.ts`). DOM-free, runnable
 * under `node --test`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck, Slide, SlideElement } from "./deck";
import { diffDecks } from "./deck-diff";

function slide(partial: Partial<Slide>): Slide {
  const title = partial.title ?? "";
  const elements =
    partial.elements ??
    (title.trim().length > 0 ? [titleElement("title", title.trim())] : []);
  return {
    id: "test-id",
    index: 0,
    title: "",
    bullets: [],
    visualIds: [],
    layout: "content",
    notes: "",
    elements,
    ...partial,
  };
}

function deck(slides: Slide[], themeId = "default"): Deck {
  return {
    slides: slides.map((s, index) => ({ ...s, index })),
    themeId,
  };
}

function titleElement(id: string, text: string): SlideElement {
  return {
    id,
    kind: "text",
    textRole: "h1",
    text,
    zIndex: 0,
    box: { x: 5, y: 5, w: 90, h: 15 },
    style: { fontSize: 8, bold: true, italic: false, align: "left" },
  };
}

test("identical decks → no changes", () => {
  const baseline = deck([
    slide({ title: "Intro", bullets: ["a", "b"] }),
    slide({ title: "Body", bullets: ["c"] }),
  ]);
  const proposed = deck([
    slide({ title: "Intro", bullets: ["a", "b"] }),
    slide({ title: "Body", bullets: ["c"] }),
  ]);

  const diff = diffDecks(baseline, proposed);

  assert.equal(diff.added, 0);
  assert.equal(diff.changed, 0);
  assert.equal(diff.removed, 0);
  assert.equal(diff.unchanged, 2);
  assert.equal(diff.proposedCount, 2);
  assert.equal(diff.summary, "2 slides — no changes from current");
  assert.deepEqual(
    diff.entries.map((e) => e.status),
    ["unchanged", "unchanged"],
  );
});

test("empty baseline → all added", () => {
  const baseline = deck([]);
  const proposed = deck([
    slide({ title: "One" }),
    slide({ title: "Two" }),
    slide({ title: "Three" }),
  ]);

  const diff = diffDecks(baseline, proposed);

  assert.equal(diff.added, 3);
  assert.equal(diff.changed, 0);
  assert.equal(diff.removed, 0);
  assert.equal(diff.unchanged, 0);
  assert.equal(diff.summary, "3 slides — 3 new");
  assert.ok(diff.entries.every((e) => e.status === "added"));
});

test("detects added, changed, and removed slides", () => {
  const baseline = deck([
    slide({ title: "Keep", bullets: ["same"] }),
    slide({ title: "Edit me", bullets: ["old"] }),
    slide({ title: "Gone", bullets: ["bye"] }),
  ]);
  const proposed = deck([
    slide({ title: "Keep", bullets: ["same"] }),
    slide({ title: "Edit me", bullets: ["new", "more"] }),
    slide({ title: "Brand new", bullets: ["hello"] }),
  ]);

  const diff = diffDecks(baseline, proposed);

  assert.equal(diff.unchanged, 1);
  assert.equal(diff.changed, 1);
  assert.equal(diff.added, 1);
  assert.equal(diff.removed, 1);
  assert.equal(diff.summary, "3 slides — 1 new, 1 changed, 1 removed");

  const keep = diff.entries.find((e) => e.title === "Keep");
  const edit = diff.entries.find((e) => e.title === "Edit me");
  const brand = diff.entries.find((e) => e.title === "Brand new");
  const gone = diff.entries.find((e) => e.title === "Gone");
  assert.equal(keep?.status, "unchanged");
  assert.equal(edit?.status, "changed");
  assert.equal(brand?.status, "added");
  assert.equal(gone?.status, "removed");
  assert.equal(gone?.proposedIndex, -1);
  assert.equal(brand?.baselineIndex, -1);
});

test("matches by normalized title regardless of order (reorder → no changes)", () => {
  const baseline = deck([
    slide({ title: "Alpha", bullets: ["a"] }),
    slide({ title: "Beta", bullets: ["b"] }),
    slide({ title: "Gamma", bullets: ["c"] }),
  ]);
  const proposed = deck([
    slide({ title: "Gamma", bullets: ["c"] }),
    slide({ title: "Alpha", bullets: ["a"] }),
    slide({ title: "Beta", bullets: ["b"] }),
  ]);

  const diff = diffDecks(baseline, proposed);

  assert.equal(diff.added, 0);
  assert.equal(diff.removed, 0);
  assert.equal(diff.changed, 0);
  assert.equal(diff.unchanged, 3);
});

test("matches title carried by free-form title element", () => {
  const baseline = deck([slide({ title: "Vision", bullets: ["baseline"] })]);
  const proposed = deck([
    slide({
      title: "",
      elements: [titleElement("t1", "Vision")],
    }),
  ]);

  const diff = diffDecks(baseline, proposed);

  // Same effective title → matched (not added/removed); content differs → changed.
  assert.equal(diff.added, 0);
  assert.equal(diff.removed, 0);
  assert.equal(diff.changed, 1);
  assert.equal(diff.unchanged, 0);
});

test("positionally matches title-less slides by index", () => {
  const baseline = deck([
    slide({ title: "", bullets: ["one"] }),
    slide({ title: "", bullets: ["two"] }),
  ]);
  const proposed = deck([
    slide({ title: "", bullets: ["one"] }),
    slide({ title: "", bullets: ["changed"] }),
  ]);

  const diff = diffDecks(baseline, proposed);

  assert.equal(diff.added, 0);
  assert.equal(diff.removed, 0);
  assert.equal(diff.unchanged, 1);
  assert.equal(diff.changed, 1);
});

test("does not mutate either input deck", () => {
  const baseline = deck([
    slide({ title: "A", bullets: ["x"], visualIds: ["v1"] }),
    slide({ title: "Drop", bullets: ["y"] }),
  ]);
  const proposed = deck([
    slide({ title: "A", bullets: ["x", "z"], visualIds: ["v1"] }),
    slide({ title: "New", bullets: ["q"] }),
  ]);
  const baselineSnapshot = JSON.parse(JSON.stringify(baseline));
  const proposedSnapshot = JSON.parse(JSON.stringify(proposed));

  diffDecks(baseline, proposed);

  assert.deepEqual(baseline, baselineSnapshot);
  assert.deepEqual(proposed, proposedSnapshot);
});

test("entries carry proposed/baseline indices for added and removed", () => {
  const baseline = deck([slide({ title: "Old" })]);
  const proposed = deck([slide({ title: "Fresh" })]);

  const diff = diffDecks(baseline, proposed);

  const added = diff.entries.find((e) => e.status === "added");
  const removed = diff.entries.find((e) => e.status === "removed");
  assert.equal(added?.proposedIndex, 0);
  assert.equal(added?.baselineIndex, -1);
  assert.equal(removed?.proposedIndex, -1);
  assert.equal(removed?.baselineIndex, 0);
});

test("single-slide summary uses singular noun", () => {
  const diff = diffDecks(deck([]), deck([slide({ title: "Only" })]));
  assert.equal(diff.summary, "1 slide — 1 new");
});
