/**
 * Unit tests for the "Sync from document" merge (`deck-merge.ts`). DOM-free,
 * runnable under `node --test`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck, Slide, SlideElement } from "./deck";
import { mergeDeckFromDocument } from "./deck-merge";

function element(id: string): SlideElement {
  return {
    id,
    kind: "text",
    role: "body",
    text: "manual",
    zIndex: 0,
    box: { x: 10, y: 10, w: 20, h: 20 },
    style: { fontSize: 5, bold: false, italic: false, align: "left" },
  };
}

function slide(partial: Partial<Slide>): Slide {
  return {
    index: 0,
    title: "",
    bullets: [],
    visualIds: [],
    layout: "content",
    notes: "",
    theme: "default",
    ...partial,
  };
}

function deck(slides: Slide[], theme: Deck["theme"] = "default"): Deck {
  return {
    slides: slides.map((s, index) => ({ ...s, index })),
    theme,
  };
}

test("matched slide: refreshes content but preserves elements", () => {
  const existing = deck([
    slide({
      title: "Intro",
      bullets: ["old"],
      elements: [element("el-1"), element("el-2")],
      background: "#ffffff",
      accent: "#123456",
    }),
  ]);
  const fresh = deck([slide({ title: "Intro", bullets: ["new", "extra"] })]);

  const { deck: merged, summary } = mergeDeckFromDocument(existing, fresh);

  assert.equal(merged.slides.length, 1);
  const s = merged.slides[0];
  assert.deepEqual(s.bullets, ["new", "extra"]);
  // Manual elements + colors preserved.
  assert.equal(s.elements?.length, 2);
  assert.deepEqual(
    s.elements?.map((e) => e.id),
    ["el-1", "el-2"],
  );
  assert.equal(s.background, "#ffffff");
  assert.equal(s.accent, "#123456");

  assert.equal(summary.updatedCount, 1);
  assert.equal(summary.appendedCount, 0);
  assert.equal(summary.preservedCount, 0);
  assert.equal(summary.preservedElementCount, 2);
});

test("title match wins over index ordering", () => {
  const existing = deck([
    slide({ title: "First", elements: [element("a")] }),
    slide({ title: "Second", elements: [element("b")] }),
  ]);
  // Fresh has Second before First — should still match by title.
  const fresh = deck([
    slide({ title: "Second", bullets: ["x"] }),
    slide({ title: "First", bullets: ["y"] }),
  ]);

  const { deck: merged } = mergeDeckFromDocument(existing, fresh);

  assert.equal(merged.slides.length, 2);
  // Existing order is preserved; each keeps its own elements.
  assert.equal(merged.slides[0].title, "First");
  assert.deepEqual(merged.slides[0].bullets, ["y"]);
  assert.equal(merged.slides[0].elements?.[0].id, "a");
  assert.equal(merged.slides[1].title, "Second");
  assert.deepEqual(merged.slides[1].bullets, ["x"]);
  assert.equal(merged.slides[1].elements?.[0].id, "b");
});

test("index match used when titles differ/empty", () => {
  const existing = deck([
    slide({ title: "", bullets: ["old"], elements: [element("a")] }),
  ]);
  const fresh = deck([slide({ title: "", bullets: ["new"] })]);

  const { deck: merged, summary } = mergeDeckFromDocument(existing, fresh);

  assert.equal(merged.slides.length, 1);
  assert.deepEqual(merged.slides[0].bullets, ["new"]);
  assert.equal(merged.slides[0].elements?.[0].id, "a");
  assert.equal(summary.updatedCount, 1);
});

test("appends new slides with no match", () => {
  const existing = deck([slide({ title: "Intro", elements: [element("a")] })]);
  const fresh = deck([
    slide({ title: "Intro" }),
    slide({ title: "Brand New", bullets: ["fresh"] }),
  ]);

  const { deck: merged, summary } = mergeDeckFromDocument(existing, fresh);

  assert.equal(merged.slides.length, 2);
  assert.equal(merged.slides[1].title, "Brand New");
  assert.deepEqual(merged.slides[1].bullets, ["fresh"]);
  // New slides carry the existing deck theme and contiguous indices.
  assert.equal(merged.slides[1].theme, "default");
  assert.equal(merged.slides[1].index, 1);
  assert.equal(summary.appendedCount, 1);
});

test("appendNew:false drops unmatched fresh slides", () => {
  const existing = deck([slide({ title: "Intro" })]);
  const fresh = deck([slide({ title: "Intro" }), slide({ title: "Skip me" })]);

  const { deck: merged, summary } = mergeDeckFromDocument(existing, fresh, {
    appendNew: false,
  });

  assert.equal(merged.slides.length, 1);
  assert.equal(summary.appendedCount, 0);
});

test("orphan existing slides are preserved, never discarded", () => {
  const existing = deck([
    slide({ title: "Intro", elements: [element("a")] }),
    slide({ title: "Manual only", elements: [element("m1"), element("m2")] }),
  ]);
  // Fresh document only knows about "Intro".
  const fresh = deck([slide({ title: "Intro", bullets: ["updated"] })]);

  const { deck: merged, summary } = mergeDeckFromDocument(existing, fresh);

  assert.equal(merged.slides.length, 2);
  // Orphan retained verbatim with its elements.
  const orphan = merged.slides[1];
  assert.equal(orphan.title, "Manual only");
  assert.equal(orphan.elements?.length, 2);
  assert.equal(summary.preservedCount, 1);
  assert.equal(summary.updatedCount, 1);
});

test("unchanged matched slide reports no content change and keeps reference", () => {
  const existing = deck([
    slide({ title: "Intro", bullets: ["same"], elements: [element("a")] }),
  ]);
  const fresh = deck([slide({ title: "Intro", bullets: ["same"] })]);

  const { deck: merged, summary } = mergeDeckFromDocument(existing, fresh);

  assert.equal(summary.updatedCount, 0);
  assert.equal(summary.unchangedCount, 1);
  // No-op merge returns the very same slide object reference.
  assert.equal(merged.slides[0], existing.slides[0]);
});

test("summary lists every resulting slide in order with kinds", () => {
  const existing = deck([
    slide({ title: "Intro", elements: [element("a")] }),
    slide({ title: "Orphan", elements: [element("o")] }),
  ]);
  const fresh = deck([
    slide({ title: "Intro", bullets: ["x"] }),
    slide({ title: "New", bullets: ["n"] }),
  ]);

  const { summary } = mergeDeckFromDocument(existing, fresh);

  assert.equal(summary.changes.length, 3);
  assert.equal(summary.changes[0].kind, "updated");
  assert.equal(summary.changes[1].kind, "preserved");
  assert.equal(summary.changes[2].kind, "appended");
  assert.equal(summary.changes[2].before, undefined);
});

test("indices are contiguous after merge", () => {
  const existing = deck([slide({ title: "A" }), slide({ title: "Orphan" })]);
  const fresh = deck([slide({ title: "A" }), slide({ title: "B" })]);

  const { deck: merged } = mergeDeckFromDocument(existing, fresh);

  assert.deepEqual(
    merged.slides.map((s) => s.index),
    [0, 1, 2],
  );
});

test("merge is immutable — inputs untouched", () => {
  const existing = deck([slide({ title: "Intro", bullets: ["old"] })]);
  const fresh = deck([slide({ title: "Intro", bullets: ["new"] })]);
  const existingCopy = JSON.parse(JSON.stringify(existing));

  mergeDeckFromDocument(existing, fresh);

  assert.deepEqual(existing, existingCopy);
});
