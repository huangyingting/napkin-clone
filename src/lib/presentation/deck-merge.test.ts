/**
 * Unit tests for the "Sync from document" merge (`deck-merge.ts`). DOM-free,
 * runnable under `node --test`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck, Slide, SlideElement, TextRun, VisualElement } from "./deck";
import {
  DEFAULT_VISUAL_BOX,
  buildDeckFromBlocks,
  normalizeTextParagraphs,
} from "./deck";
import { mergeDeckFromDocument } from "./deck-merge";
import {
  buildBulletsElement,
  buildDeck,
  buildSlide,
  buildTextElement,
  buildVisualElement,
} from "@/test/builders/deck";

function element(id: string): SlideElement {
  return buildTextElement({
    id,
    text: "manual",
    zIndex: 0,
    box: { x: 10, y: 10, w: 20, h: 20 },
    style: { fontSize: 5, bold: false, italic: false, align: "left" },
  });
}

function textOf(element: SlideElement | undefined): string | undefined {
  return (element as any)?.content?.text ?? (element as any)?.text;
}

function sourceOf(element: SlideElement | undefined) {
  return (element as any)?.source ?? (element as any)?.source;
}

function textStyleOf(element: SlideElement | undefined) {
  return (
    (element as any)?.designOverrides?.textStyle ?? (element as any)?.style
  );
}

function bulletsOf(slide: Slide): string[] {
  if (Array.isArray((slide as any).bullets)) return (slide as any).bullets;
  const bullet = (slide.elements ?? []).find(
    (item) => item.kind === "text" && (item as any).role === "bullet",
  );
  return ((bullet as any)?.content?.paragraphs ?? []).map(
    (paragraph: any) => paragraph.text ?? "",
  );
}

function slideBackgroundOf(slide: Slide): string | undefined {
  const background = (slide as any).designOverrides?.background;
  if (background?.type !== "solid") return undefined;
  return background.color?.value ?? background.color;
}

function slideAccentOf(slide: Slide): string | undefined {
  return (slide as any).designOverrides?.accent?.value ?? (slide as any).accent;
}

function withTitleElement(
  title: string,
  elements: SlideElement[],
): SlideElement[] {
  if (!title.trim()) return elements;
  if (elements.some((el) => el.kind === "text" && el.textRole === "h1")) {
    return elements;
  }
  const id = `title-${title.toLowerCase().replace(/\s+/g, "-") || "slide"}`;
  return [titleElement(id, title.trim()), ...elements];
}

function slide(partial: Partial<Slide>): Slide {
  const title = partial.title ?? "";
  const suppliedElements = partial.elements ?? [];
  const bulletElements =
    Array.isArray((partial as any).bullets) &&
    suppliedElements.length === 0 &&
    !suppliedElements.some((element) => (element as any).role === "bullet")
      ? [
          buildBulletsElement({
            id: "body",
            bullets: (partial as any).bullets,
            bulletRuns: (partial as any).bulletRuns,
          }),
        ]
      : [];
  const visualElements =
    Array.isArray((partial as any).visualIds) && suppliedElements.length === 0
      ? (partial as any).visualIds.map((visualId: string, index: number) =>
          buildVisualElement({
            id: `visual-${index}`,
            visualId,
          }),
        )
      : [];
  const elements = withTitleElement(title, [
    ...suppliedElements,
    ...bulletElements,
    ...visualElements,
  ]);
  return buildSlide({
    id: "test-id",
    index: 0,
    title: "",
    bullets: [],
    visualIds: [],
    layout: "content",
    notes: "",
    ...partial,
    elements,
  });
}

function deck(slides: Slide[], themeId = "default"): Deck {
  return buildDeck({
    slides: slides.map((s, index) => ({ ...s, index })),
    themeId,
  });
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
  assert.deepEqual(bulletsOf(s), ["new", "extra"]);
  // Title + manual elements + colors preserved.
  assert.equal(s.elements?.length, 3);
  assert.deepEqual(
    s.elements?.map((e) => e.id),
    ["title-intro", "el-1", "el-2"],
  );
  assert.equal(slideBackgroundOf(s), "#ffffff");
  assert.equal(slideAccentOf(s), "#123456");

  assert.equal(summary.updatedCount, 1);
  assert.equal(summary.appendedCount, 0);
  assert.equal(summary.preservedCount, 0);
  assert.equal(summary.preservedElementCount, 3);
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
  assert.deepEqual(bulletsOf(merged.slides[0]), ["y"]);
  assert.equal(merged.slides[0].elements?.[1].id, "a");
  assert.equal(merged.slides[1].title, "Second");
  assert.deepEqual(bulletsOf(merged.slides[1]), ["x"]);
  assert.equal(merged.slides[1].elements?.[1].id, "b");
});

test("index match used when titles differ/empty", () => {
  const existing = deck([
    slide({ title: "", bullets: ["old"], elements: [element("a")] }),
  ]);
  const fresh = deck([slide({ title: "", bullets: ["new"] })]);

  const { deck: merged, summary } = mergeDeckFromDocument(existing, fresh);

  assert.equal(merged.slides.length, 1);
  assert.deepEqual(bulletsOf(merged.slides[0]), ["new"]);
  assert.equal(merged.slides[0].elements?.[0].id, "a");
  assert.equal(summary.updatedCount, 1);
});

function titleElement(id: string, text: string): SlideElement {
  return buildTextElement({
    id,
    textRole: "h1",
    text,
    zIndex: 1,
    box: { x: 6, y: 6, w: 88, h: 16 },
    style: { fontSize: 6, bold: true, italic: false, align: "left" },
  });
}

test("renamed title element matches its slide instead of appending a duplicate (#244)", () => {
  // Existing slide was renamed on stage: the title element holds the new name
  // while the title mirror is stale. Sync brings a doc slide using the
  // new name — it must match the renamed slide, not orphan it + append a dupe.
  const existing = deck([
    slide({
      title: "Old Name",
      bullets: ["kept"],
      elements: [titleElement("t1", "New Name"), element("b1")],
    }),
  ]);
  const fresh = deck([slide({ title: "New Name", bullets: ["fresh"] })]);

  const { deck: merged, summary } = mergeDeckFromDocument(existing, fresh);

  assert.equal(merged.slides.length, 1);
  assert.deepEqual(bulletsOf(merged.slides[0]), ["fresh"]);
  assert.deepEqual(
    merged.slides[0].elements?.map((e) => e.id),
    ["t1", "b1"],
  );
  assert.equal(summary.updatedCount, 1);
  assert.equal(summary.appendedCount, 0);
  assert.equal(summary.preservedCount, 0);
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
  assert.deepEqual(bulletsOf(merged.slides[1]), ["fresh"]);
  // New slides carry contiguous indices; deck theme is deck-level.
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
  assert.equal(orphan.elements?.length, 3);
  assert.equal(summary.preservedCount, 1);
  assert.equal(summary.updatedCount, 1);
});

test("unchanged matched slide reports no content change and keeps reference", () => {
  const existing = deck([slide({ title: "Intro", bullets: ["same"] })]);
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

// ---------------------------------------------------------------------------
// Provenance-aware re-materialization (issue #221)
// ---------------------------------------------------------------------------

/** Returns the rendered text of every text/bullets element on a slide. */
function elementText(s: Slide): string[] {
  return (s.elements ?? []).flatMap((el) => {
    if (el.kind === "text") {
      return normalizeTextParagraphs(el).map((paragraph) => paragraph.text);
    }
    return [];
  });
}

test("derived slide: sync re-materializes elements so document edits render", () => {
  // An auto-built slide (elementsDerived=true) whose elements were derived from
  // document content.
  const existing = deck([
    slide({
      title: "Intro",
      bullets: ["old bullet"],
      elements: [
        {
          id: "title",
          kind: "text",
          textRole: "h1",
          text: "Intro",
          paragraphs: [{ text: "Intro" }],
          zIndex: 0,
          box: { x: 6, y: 6, w: 88, h: 16 },
          style: { fontSize: 6, bold: true, italic: false, align: "left" },
        },
        {
          id: "body",
          kind: "text",
          text: "old bullet",
          paragraphs: [{ text: "old bullet", listType: "bullet" }],
          textRole: "bullet",
          zIndex: 1,
          box: { x: 6, y: 26, w: 88, h: 66 },
          style: { fontSize: 4.5, bold: false, italic: false, align: "left" },
        },
      ],
      elementsDerived: true,
    }),
  ]);
  const fresh = deck([slide({ title: "Intro", bullets: ["new bullet"] })]);

  const { deck: merged, summary } = mergeDeckFromDocument(existing, fresh);

  const s = merged.slides[0];
  // Document-derived fields refreshed.
  assert.deepEqual(bulletsOf(s), ["new bullet"]);
  // The RENDERED elements text now reflects the document edit.
  assert.ok(elementText(s).includes("new bullet"));
  assert.ok(!elementText(s).includes("old bullet"));
  assert.equal(summary.updatedCount, 1);
  // Re-materialized elements are regenerated, not preserved.
  assert.equal(summary.preservedElementCount, 0);
});

test("hand-edited slide: sync preserves elements verbatim", () => {
  const existing = deck([
    slide({
      title: "Intro",
      bullets: ["old bullet"],
      elements: [element("manual-1"), element("manual-2")],
      elementsDerived: false,
    }),
  ]);
  const fresh = deck([slide({ title: "Intro", bullets: ["new bullet"] })]);

  const { deck: merged, summary } = mergeDeckFromDocument(existing, fresh);

  const s = merged.slides[0];
  // Document-derived fields still refreshed.
  assert.deepEqual(bulletsOf(s), ["new bullet"]);
  // Title + hand-authored elements preserved untouched.
  assert.deepEqual(
    s.elements?.map((e) => e.id),
    ["title-intro", "manual-1", "manual-2"],
  );
  assert.equal(summary.updatedCount, 1);
  assert.equal(summary.preservedElementCount, 3);
});

test("untitled slide with no elements materializes fresh v6 content during sync", () => {
  const existing = deck([slide({ title: "", bullets: ["old"], elements: [] })]);
  const fresh = deck([
    slide({ title: "", bullets: ["brand new"], elements: [] }),
  ]);

  const { deck: merged } = mergeDeckFromDocument(existing, fresh);

  const s = merged.slides[0];
  assert.deepEqual(elementText(s), ["brand new"]);
});

test("slide with elements but no provenance flag is treated as hand-edited", () => {
  const existing = deck([
    slide({
      title: "Intro",
      bullets: ["old"],
      elements: [element("manual-el")],
    }),
  ]);
  const fresh = deck([slide({ title: "Intro", bullets: ["new"] })]);

  const { deck: merged } = mergeDeckFromDocument(existing, fresh);

  // No flag → preserved verbatim (never clobber unknown decks).
  assert.deepEqual(
    merged.slides[0].elements?.map((e) => e.id),
    ["title-intro", "manual-el"],
  );
});

// ---------------------------------------------------------------------------
// Rich-text run refresh on derived slides (issue #254)
// ---------------------------------------------------------------------------

/** The title element's runs, or undefined. */
function titleElementRuns(s: Slide): TextRun[] | undefined {
  const el = (s.elements ?? []).find(
    (e) =>
      e.kind === "text" &&
      (((e as any).role ?? (e as any).textRole) === "title" ||
        (e as any).textRole === "h1"),
  );
  return el && el.kind === "text"
    ? ((el as any).content?.runs ?? el.runs)
    : undefined;
}

/** The bullets element's per-line runs, or undefined. */
function bulletElementRuns(s: Slide): TextRun[][] | undefined {
  const el = (s.elements ?? []).find(
    (e) =>
      e.kind === "text" &&
      ((e as any).role ?? (e as any).textRole) === "bullet",
  );
  return el && el.kind === "text"
    ? normalizeTextParagraphs(el).map((paragraph) => paragraph.runs ?? [])
    : undefined;
}

function visualElementId(element: unknown): string | undefined {
  return (element as any)?.content?.visualId ?? (element as any)?.visualId;
}

function slideSectionId(slide: Slide): string | undefined {
  return (slide as any).source?.sectionId ?? (slide as any).sourceSectionId;
}

test("derived slide: document run text change reaches re-materialized elements", () => {
  // Stale derived slide: its element runs carry the OLD document content.
  const existing = deck([
    slide({
      title: "Intro",
      titleRuns: [{ text: "Intro" }],
      bullets: ["old bullet"],
      bulletRuns: [[{ text: "old bullet", bold: true }]],
      elements: [
        {
          id: "title",
          kind: "text",
          textRole: "h1",
          text: "Intro",
          runs: [{ text: "Intro" }],
          paragraphs: [{ text: "Intro", runs: [{ text: "Intro" }] }],
          zIndex: 0,
          box: { x: 6, y: 6, w: 88, h: 16 },
          style: { fontSize: 6, bold: true, italic: false, align: "left" },
        },
        {
          id: "body",
          kind: "text",
          text: "old bullet",
          paragraphs: [
            {
              text: "old bullet",
              runs: [{ text: "old bullet", bold: true }],
              listType: "bullet",
            },
          ],
          textRole: "bullet",
          zIndex: 1,
          box: { x: 6, y: 26, w: 88, h: 66 },
          style: { fontSize: 4.5, bold: false, italic: false, align: "left" },
        },
      ],
      elementsDerived: true,
    }),
  ]);
  const fresh = deck([
    slide({
      title: "Intro",
      bullets: ["new bullet"],
      bulletRuns: [[{ text: "new bullet", bold: true }]],
    }),
  ]);

  const { deck: merged, summary } = mergeDeckFromDocument(existing, fresh);
  const s = merged.slides[0];

  // Re-materialized element RUNS (preferred by renderer/exporter) reflect the
  // fresh document, not the stale "old bullet" runs.
  assert.deepEqual(bulletElementRuns(s), [
    [{ text: "new bullet", bold: true }],
  ]);
  // The bullets element runs must not carry the stale content.
  assert.ok(
    !JSON.stringify(bulletElementRuns(s)).includes("old bullet"),
    "stale bullet runs leaked into re-materialized elements",
  );
  // Plain bullet mirror refreshed too.
  assert.deepEqual(bulletsOf(s), ["new bullet"]);
  assert.equal(s.elementsDerived, true);
  assert.equal(summary.updatedCount, 1);
});

test("derived slide: stale title runs dropped when fresh has none", () => {
  const existing = deck([
    slide({
      title: "Intro",
      titleRuns: [{ text: "Intro", bold: true }],
      bullets: ["body"],
      elements: [
        {
          id: "title",
          kind: "text",
          textRole: "h1",
          text: "Intro",
          runs: [{ text: "Intro", bold: true }],
          zIndex: 0,
          box: { x: 6, y: 6, w: 88, h: 16 },
          style: { fontSize: 6, bold: true, italic: false, align: "left" },
        },
      ],
      elementsDerived: true,
    }),
  ]);
  // Fresh document keeps the matching title but drops the bold style
  // (no titleRuns) — a style-only change on the title.
  const fresh = deck([slide({ title: "Intro", bullets: ["body"] })]);

  const { deck: merged, summary } = mergeDeckFromDocument(existing, fresh);
  const s = merged.slides[0];

  // Stale bold title runs must NOT be carried onto the re-materialized element;
  // the renderer/exporter then falls back to the plain (unformatted) title.
  assert.equal(titleElementRuns(s), undefined);
  assert.ok(elementText(s).includes("Intro"));
  assert.equal(summary.updatedCount, 1);
});

test("formatting-only document edit (same text, new runs) is detected as changed", () => {
  // Identical plain text, only the bold flag in the runs changed.
  const existing = deck([
    slide({
      title: "Intro",
      bullets: ["point"],
      bulletRuns: [[{ text: "point" }]],
      elements: [
        {
          id: "body",
          kind: "text",
          text: "point",
          paragraphs: [
            { text: "point", runs: [{ text: "point" }], listType: "bullet" },
          ],
          textRole: "bullet",
          zIndex: 0,
          box: { x: 6, y: 26, w: 88, h: 66 },
          style: { fontSize: 4.5, bold: false, italic: false, align: "left" },
        },
      ],
      elementsDerived: true,
    }),
  ]);
  const fresh = deck([
    slide({
      title: "Intro",
      bullets: ["point"],
      bulletRuns: [[{ text: "point", bold: true }]],
    }),
  ]);

  const { deck: merged, summary } = mergeDeckFromDocument(existing, fresh);
  const s = merged.slides[0];

  // sameContent must classify this as changed → updated, not unchanged.
  assert.equal(summary.updatedCount, 1);
  assert.equal(summary.unchangedCount, 0);
  // Re-materialized runs carry the new formatting.
  assert.deepEqual(bulletElementRuns(s), [[{ text: "point", bold: true }]]);
});

test("hand-edited slide: run refresh never clobbers verbatim elements", () => {
  const existing = deck([
    slide({
      title: "Intro",
      bullets: ["old bullet"],
      titleRuns: [{ text: "Intro", bold: true }],
      bulletRuns: [[{ text: "old bullet" }]],
      elements: [element("manual-1"), element("manual-2")],
      elementsDerived: false,
    }),
  ]);
  const fresh = deck([
    slide({
      title: "Intro",
      bullets: ["new bullet"],
      bulletRuns: [[{ text: "new bullet", bold: true }]],
    }),
  ]);

  const { deck: merged, summary } = mergeDeckFromDocument(existing, fresh);
  const s = merged.slides[0];

  // Hand-authored elements preserved verbatim.
  assert.deepEqual(
    s.elements?.map((e) => e.id),
    ["title-intro", "manual-1", "manual-2"],
  );
  // Document-derived fields are refreshed alongside the preserved elements.
  assert.deepEqual(bulletsOf(s), ["new bullet"]);
  assert.deepEqual(s.bulletRuns, [[{ text: "new bullet", bold: true }]]);
  assert.equal(summary.updatedCount, 1);
  assert.equal(summary.preservedElementCount, 3);
});

// ---------------------------------------------------------------------------
// New document visuals appended to hand-edited slides (issue #294)
// ---------------------------------------------------------------------------

function visualElement(id: string, visualId: string): VisualElement {
  return buildVisualElement({
    id,
    visualId,
    zIndex: 0,
    box: { x: 10, y: 10, w: 30, h: 30 },
  });
}

test("new document visual is appended to hand-edited slide (#294)", () => {
  const existing = deck([
    slide({
      title: "Intro",
      bullets: ["text"],
      visualIds: [],
      elements: [element("manual-1")],
      elementsDerived: false,
    }),
  ]);
  const fresh = deck([
    slide({ title: "Intro", bullets: ["text"], visualIds: ["vis-a"] }),
  ]);

  const { deck: merged } = mergeDeckFromDocument(existing, fresh);
  const s = merged.slides[0];

  // The appended visual element must reference the new visual id.
  const visualEls = (s.elements ?? []).filter(
    (el): el is VisualElement => el.kind === "visual",
  );
  assert.equal(visualEls.length, 1);
  assert.equal(visualElementId(visualEls[0]), "vis-a");
  // It should use the default centered box from buildVisualElement.
  assert.deepEqual(visualEls[0].box, DEFAULT_VISUAL_BOX);
});

test("existing manual elements are unchanged and new visual is appended after (#294)", () => {
  const manualEl = element("manual-1");
  const existing = deck([
    slide({
      title: "Intro",
      bullets: ["text"],
      visualIds: [],
      elements: [manualEl],
      elementsDerived: false,
    }),
  ]);
  const fresh = deck([
    slide({ title: "Intro", bullets: ["text"], visualIds: ["vis-b"] }),
  ]);

  const { deck: merged } = mergeDeckFromDocument(existing, fresh);
  const s = merged.slides[0];
  const els = s.elements ?? [];

  assert.equal(els.length, 3);
  assert.equal(textOf(els.find((el) => el.id === manualEl.id)), "manual");
  const visual = els.find((el): el is VisualElement => el.kind === "visual");
  assert.equal(visualElementId(visual), "vis-b");
});

test("already-rendered visual id is not duplicated (#294)", () => {
  const existing = deck([
    slide({
      title: "Intro",
      bullets: ["text"],
      visualIds: ["vis-c"],
      elements: [element("manual-1"), visualElement("v-el-1", "vis-c")],
      elementsDerived: false,
    }),
  ]);
  // Fresh doc also references "vis-c" — already on the slide, must not duplicate.
  const fresh = deck([
    slide({
      title: "Intro",
      bullets: ["text"],
      visualIds: ["vis-c"],
    }),
  ]);

  const { deck: merged } = mergeDeckFromDocument(existing, fresh);
  const s = merged.slides[0];
  const visualEls = (s.elements ?? []).filter(
    (el): el is VisualElement => el.kind === "visual",
  );
  assert.equal(visualEls.length, 1);
  assert.equal(visualElementId(visualEls[0]), "vis-c");
});

test("merge summary reports visualsAdded for hand-edited slide (#294)", () => {
  const existing = deck([
    slide({
      title: "Intro",
      bullets: ["text"],
      visualIds: [],
      elements: [element("manual-1")],
      elementsDerived: false,
    }),
  ]);
  const fresh = deck([
    slide({ title: "Intro", bullets: ["text"], visualIds: ["vis-d", "vis-e"] }),
  ]);

  const { summary } = mergeDeckFromDocument(existing, fresh);

  assert.equal(summary.changes.length, 1);
  assert.equal(summary.changes[0].kind, "updated");
  assert.equal(summary.changes[0].visualsAdded, 2);
});

// ---------------------------------------------------------------------------
// Stable sourceSectionId matching — Pass 0 (issue #296)
// ---------------------------------------------------------------------------

test("renamed on-stage title: Pass 0 matches by sourceSectionId, no duplicate (#296)", () => {
  // Slide was synced from a doc section "Intro"; user renamed its on-stage title
  // to "Introduction" via the canvas editor, but the frozen sourceSectionId
  // still identifies the original section. The doc heading stays "Intro".
  const existing = deck([
    slide({
      title: "Intro",
      bullets: ["kept"],
      sourceSectionId: "sec-intro",
      elements: [element("manual-el")],
      elementsDerived: false,
    }),
  ]);
  // Fresh deck re-derived from unchanged doc heading "Intro" → same sourceSectionId.
  const fresh = deck([
    slide({
      title: "Intro",
      bullets: ["updated content"],
      sourceSectionId: "sec-intro",
    }),
  ]);

  const { deck: merged, summary } = mergeDeckFromDocument(existing, fresh);

  // One slide updated in-place — no duplicate appended.
  assert.equal(merged.slides.length, 1);
  assert.deepEqual(bulletsOf(merged.slides[0]), ["updated content"]);
  // Hand-edited elements preserved.
  assert.deepEqual(
    merged.slides[0].elements?.map((e) => e.id),
    ["title-intro", "manual-el"],
  );
  assert.equal(summary.updatedCount, 1);
  assert.equal(summary.appendedCount, 0);
  assert.equal(summary.preservedCount, 0);
});

test("renamed slide title diverges from doc heading: sourceSectionId still matches (#296)", () => {
  // Existing slide.title drifted from the doc heading (user renamed on stage).
  // Title-match would fail; Pass 0 by sourceSectionId must succeed.
  const existing = deck([
    slide({
      title: "Old On-Stage Name",
      bullets: ["original"],
      sourceSectionId: "sec-features",
      elements: [element("feat-el")],
    }),
  ]);
  const fresh = deck([
    slide({
      title: "Features",
      bullets: ["fresh bullets"],
      sourceSectionId: "sec-features",
    }),
  ]);

  const { deck: merged, summary } = mergeDeckFromDocument(existing, fresh);

  assert.equal(merged.slides.length, 1);
  assert.deepEqual(bulletsOf(merged.slides[0]), ["fresh bullets"]);
  assert.equal(summary.updatedCount, 1);
  assert.equal(summary.appendedCount, 0);
});

test("reordered sections: match by sourceSectionId, existing order preserved (#296)", () => {
  const existing = deck([
    slide({
      title: "Alpha",
      bullets: ["a-old"],
      sourceSectionId: "sec-alpha",
      elements: [element("el-a")],
      elementsDerived: false,
    }),
    slide({
      title: "Beta",
      bullets: ["b-old"],
      sourceSectionId: "sec-beta",
      elements: [element("el-b")],
      elementsDerived: false,
    }),
  ]);
  // Fresh deck has sections in reverse order but same ids.
  const fresh = deck([
    slide({ title: "Beta", bullets: ["b-new"], sourceSectionId: "sec-beta" }),
    slide({ title: "Alpha", bullets: ["a-new"], sourceSectionId: "sec-alpha" }),
  ]);

  const { deck: merged, summary } = mergeDeckFromDocument(existing, fresh);

  // Existing order is preserved; content is refreshed.
  assert.equal(merged.slides.length, 2);
  assert.equal(merged.slides[0].title, "Alpha");
  assert.deepEqual(bulletsOf(merged.slides[0]), ["a-new"]);
  assert.equal(merged.slides[0].elements?.[1].id, "el-a");
  assert.equal(merged.slides[1].title, "Beta");
  assert.deepEqual(bulletsOf(merged.slides[1]), ["b-new"]);
  assert.equal(merged.slides[1].elements?.[1].id, "el-b");
  assert.equal(summary.updatedCount, 2);
  assert.equal(summary.appendedCount, 0);
});

test("duplicate section ids: first-unconsumed pairing, no crash or over-duplication (#296)", () => {
  // Two existing slides with the same sourceSectionId (identical heading text
  // in the document produces identical ids). Both should be matched 1-to-1 with
  // the two fresh slides that carry the same id.
  const existing = deck([
    slide({
      title: "Topic",
      bullets: ["first"],
      sourceSectionId: "sec-topic",
      elements: [element("el-1")],
      elementsDerived: false,
    }),
    slide({
      title: "Topic",
      bullets: ["second"],
      sourceSectionId: "sec-topic",
      elements: [element("el-2")],
      elementsDerived: false,
    }),
  ]);
  const fresh = deck([
    slide({
      title: "Topic",
      bullets: ["fresh-1"],
      sourceSectionId: "sec-topic",
    }),
    slide({
      title: "Topic",
      bullets: ["fresh-2"],
      sourceSectionId: "sec-topic",
    }),
  ]);

  const { deck: merged, summary } = mergeDeckFromDocument(existing, fresh);

  // Both slides matched and updated; no duplicates appended.
  assert.equal(merged.slides.length, 2);
  assert.deepEqual(bulletsOf(merged.slides[0]), ["fresh-1"]);
  assert.deepEqual(bulletsOf(merged.slides[1]), ["fresh-2"]);
  assert.equal(merged.slides[0].elements?.[1].id, "el-1");
  assert.equal(merged.slides[1].elements?.[1].id, "el-2");
  assert.equal(summary.updatedCount, 2);
  assert.equal(summary.appendedCount, 0);
});

test("slides without sourceSectionId still match by title element (#296 regression)", () => {
  const existing = deck([
    slide({
      title: "Intro",
      bullets: ["old-intro"],
      elements: [element("intro-el")],
    }),
    slide({ title: "Outro", bullets: ["old-outro"] }),
  ]);
  // Fresh slides carry sourceSectionId but existing don't — title match still
  // fires in Pass 1.
  const fresh = deck([
    slide({
      title: "Outro",
      bullets: ["outro-new"],
      sourceSectionId: "sec-outro",
    }),
    slide({
      title: "Intro",
      bullets: ["intro-new"],
      sourceSectionId: "sec-intro",
    }),
  ]);

  const { deck: merged, summary } = mergeDeckFromDocument(existing, fresh);

  assert.equal(merged.slides.length, 2);
  assert.equal(merged.slides[0].title, "Intro");
  assert.deepEqual(bulletsOf(merged.slides[0]), ["intro-new"]);
  assert.equal(merged.slides[0].elements?.[1].id, "intro-el");
  assert.equal(merged.slides[1].title, "Outro");
  assert.deepEqual(bulletsOf(merged.slides[1]), ["outro-new"]);
  assert.equal(summary.updatedCount, 2);
  assert.equal(summary.appendedCount, 0);
});

test("buildDeckFromBlocks stamps sourceSectionId; end-to-end: renamed slide title syncs without duplicate (#296)", () => {
  // Derive an initial deck from document blocks.
  const blocks = [
    {
      kind: "text" as const,
      blockType: "heading" as const,
      level: 2 as const,
      text: "Getting Started",
      runs: [],
    },
    {
      kind: "text" as const,
      blockType: "paragraph" as const,
      text: "Learn the basics.",
    },
  ];
  const initialDeck = buildDeckFromBlocks(blocks);
  const derivedSlide = initialDeck.slides[0];

  // The derived slide should carry a sourceSectionId.
  assert.ok(
    slideSectionId(derivedSlide) !== undefined,
    "buildDeckFromBlocks must stamp sourceSectionId on heading-based slides",
  );

  // Simulate user editing the on-stage title ("Getting Started" → "Quick Start").
  // In practice this clears elementsDerived; here we just patch the title field
  // to simulate a stale slide.title while sourceSectionId stays frozen.
  const existingDeck: Deck = {
    ...initialDeck,
    slides: [
      {
        ...derivedSlide,
        title: "Quick Start (renamed on stage)",
        elements: [element("manual-el")],
        elementsDerived: false,
      },
    ],
  };

  // Re-derive from the SAME document blocks (heading text unchanged).
  const freshDeck = buildDeckFromBlocks(blocks);
  // Confirm the fresh slide has the same sourceSectionId as the initial derive.
  assert.equal(
    slideSectionId(freshDeck.slides[0]),
    slideSectionId(derivedSlide),
  );

  const { deck: merged, summary } = mergeDeckFromDocument(
    existingDeck,
    freshDeck,
  );

  // Pass 0 must match by sourceSectionId — one update, no duplicate appended.
  assert.equal(merged.slides.length, 1);
  assert.equal(summary.updatedCount, 1);
  assert.equal(summary.appendedCount, 0);
  // Hand-edited element preserved (hand-edited slide).
  assert.deepEqual(
    merged.slides[0].elements?.map((e) => e.id),
    ["manual-el"],
  );
});

// ---------------------------------------------------------------------------
// Element-level source-ref precedence in merge (#409)
// ---------------------------------------------------------------------------

import type { TextElement } from "./deck";
import type { DocumentBlock, DocumentTextBlock } from "@/lib/content";
import { hashDocumentBlock } from "./document-block-hash";

function linkedTextElement(
  id: string,
  blockId: string,
  contentHash: string,
  text: string = "original",
): TextElement {
  return buildTextElement({
    id,
    text,
    box: { x: 10, y: 10, w: 60, h: 15 },
    zIndex: 1,
    style: { fontSize: 4, bold: false, italic: false, align: "left" },
    source: {
      documentId: "doc-1",
      blockId,
      contentHash,
      linkedAt: "2026-01-01T00:00:00.000Z",
      blockKind: "text",
    },
  });
}

function freshTextBlock(blockId: string, text: string): DocumentTextBlock {
  return { kind: "text", blockType: "paragraph", text, blockId };
}

test("element-level merge: updates linked text element content (#409)", () => {
  const block = freshTextBlock("blk-1", "Original text");
  const hash = hashDocumentBlock(block);
  const el = linkedTextElement("el-linked", "blk-1", hash, "Original text");

  const existing = deck([
    slide({
      title: "Slide",
      elements: [element("manual-1"), el],
      elementsDerived: false,
    }),
  ]);
  const fresh = deck([slide({ title: "Slide" })]);

  // Simulate document change: text was updated.
  const changedBlock = freshTextBlock("blk-1", "Updated text");
  const freshBlocks: DocumentBlock[] = [changedBlock];

  const { deck: merged } = mergeDeckFromDocument(existing, fresh, {
    freshBlocks,
  });

  const s = merged.slides[0];
  const els = s.elements ?? [];
  // manual element unchanged:
  assert.ok(els.some((e) => e.id === "manual-1"));
  const updatedEl = els.find((e) => e.id === "el-linked");
  assert.ok(updatedEl !== undefined);
  assert.equal(updatedEl.kind, "text");
  assert.equal(textOf(updatedEl), "Updated text");
  // geometry preserved:
  assert.deepEqual(updatedEl.box, el.box);
  assert.equal(updatedEl.zIndex, el.zIndex);
  // sourceRef updated:
  assert.equal(
    sourceOf(updatedEl)?.contentHash,
    hashDocumentBlock(changedBlock),
  );
});

test("element-level merge: preserves geometry and style of updated element (#409)", () => {
  const block = freshTextBlock("blk-2", "Old content");
  const hash = hashDocumentBlock(block);
  const el: TextElement = {
    id: "el-positioned",
    kind: "text",
    text: "Old content",
    box: { x: 30, y: 40, w: 25, h: 12 },
    zIndex: 5,
    style: { fontSize: 6, bold: true, italic: false, align: "center" },
    source: {
      documentId: "doc-1",
      blockId: "blk-2",
      contentHash: hash,
      linkedAt: "2026-01-01T00:00:00.000Z",
      blockKind: "text",
    },
  };

  const existing = deck([
    slide({ title: "T", elements: [el], elementsDerived: false }),
  ]);
  const fresh = deck([slide({ title: "T" })]);
  const newBlock = freshTextBlock("blk-2", "New content");

  const { deck: merged } = mergeDeckFromDocument(existing, fresh, {
    freshBlocks: [newBlock],
  });

  const updatedEl = merged.slides[0].elements?.find(
    (e) => e.id === "el-positioned",
  ) as TextElement | undefined;
  assert.ok(updatedEl !== undefined);
  assert.equal(textOf(updatedEl), "New content");
  // style/geometry must be preserved verbatim:
  assert.equal(updatedEl.zIndex, 5);
  assert.deepEqual(updatedEl.box, { x: 30, y: 40, w: 25, h: 12 });
  assert.deepEqual(textStyleOf(updatedEl), {
    fontSize: 6,
    bold: true,
    italic: false,
    align: "center",
  });
});

test("element-level merge: orphaned element (missing block) is not deleted (#409/#410)", () => {
  const block = freshTextBlock("blk-deleted", "Was here");
  const hash = hashDocumentBlock(block);
  const orphan = linkedTextElement(
    "el-orphan",
    "blk-deleted",
    hash,
    "Was here",
  );

  const existing = deck([
    slide({ title: "T", elements: [orphan], elementsDerived: false }),
  ]);
  const fresh = deck([slide({ title: "T" })]);

  // freshBlocks does NOT include blk-deleted — simulates deletion.
  const { deck: merged } = mergeDeckFromDocument(existing, fresh, {
    freshBlocks: [],
  });

  const els = merged.slides[0].elements ?? [];
  // Orphaned element must survive — never auto-deleted.
  assert.equal(els.length, 2);
  const orphanEl = els.find((e) => e.id === "el-orphan") as
    | TextElement
    | undefined;
  assert.ok(orphanEl);
  assert.equal(textOf(orphanEl), "Was here");
});

test("element-level merge: unlinked elements are not updated (#409)", () => {
  const block = freshTextBlock("blk-x", "Original");
  const hash = hashDocumentBlock(block);
  const unlinkedEl: TextElement = {
    id: "el-unlinked",
    kind: "text",
    text: "Manual override",
    box: { x: 10, y: 10, w: 60, h: 15 },
    zIndex: 1,
    style: { fontSize: 4, bold: false, italic: false, align: "left" },
    source: {
      documentId: "doc-1",
      blockId: "blk-x",
      contentHash: hash,
      linkedAt: "2026-01-01T00:00:00.000Z",
      unlinked: true,
      blockKind: "text",
    },
  };

  const existing = deck([
    slide({ title: "T", elements: [unlinkedEl], elementsDerived: false }),
  ]);
  const fresh = deck([slide({ title: "T" })]);
  const changedBlock = freshTextBlock("blk-x", "Changed");

  const { deck: merged } = mergeDeckFromDocument(existing, fresh, {
    freshBlocks: [changedBlock],
  });

  const els = merged.slides[0].elements ?? [];
  // Unlinked element must not be updated — manual override is preserved.
  const preserved = els.find((e) => e.id === "el-unlinked") as
    | TextElement
    | undefined;
  assert.equal(textOf(preserved), "Manual override");
});

test("element-level merge: decks without freshBlocks fall back to slide-level merge", () => {
  const block = freshTextBlock("blk-1", "Original");
  const hash = hashDocumentBlock(block);
  const el = linkedTextElement("el-1", "blk-1", hash, "Original");

  const existing = deck([
    slide({
      title: "Slide",
      bullets: ["old bullet"],
      elements: [element("manual-1"), el],
      elementsDerived: false,
    }),
  ]);
  const fresh = deck([slide({ title: "Slide", bullets: ["new bullet"] })]);

  // No freshBlocks — element content should NOT be updated.
  const { deck: merged } = mergeDeckFromDocument(existing, fresh);
  const updatedEl = merged.slides[0].elements?.find((e) => e.id === "el-1");
  assert.ok(updatedEl !== undefined);
  assert.equal(textOf(updatedEl), "Original"); // unchanged
  // But slide-level bullet was updated:
  assert.deepEqual(bulletsOf(merged.slides[0]), ["new bullet"]);
});

test("element-level merge: mixed linked/unlinked/manual elements on one slide (#409)", () => {
  const block = freshTextBlock("blk-linked", "Linked content");
  const hash = hashDocumentBlock(block);
  const linkedEl = linkedTextElement(
    "el-linked",
    "blk-linked",
    hash,
    "Linked content",
  );
  const manualEl = element("el-manual");
  const unlinkedEl: TextElement = {
    id: "el-unlinked",
    kind: "text",
    text: "Manual override",
    box: { x: 10, y: 10, w: 60, h: 15 },
    zIndex: 2,
    style: { fontSize: 4, bold: false, italic: false, align: "left" },
    source: {
      documentId: "doc-1",
      blockId: "blk-linked",
      contentHash: hash,
      linkedAt: "2026-01-01T00:00:00.000Z",
      unlinked: true,
      blockKind: "text",
    },
  };

  const existing = deck([
    slide({
      title: "T",
      elements: [manualEl, linkedEl, unlinkedEl],
      elementsDerived: false,
    }),
  ]);
  const fresh = deck([slide({ title: "T" })]);
  const changedBlock = freshTextBlock("blk-linked", "Changed content");

  const { deck: merged } = mergeDeckFromDocument(existing, fresh, {
    freshBlocks: [changedBlock],
  });

  const els = merged.slides[0].elements ?? [];
  assert.equal(els.length, 4);

  const manual = els.find((e) => e.id === "el-manual");
  const linked = els.find((e) => e.id === "el-linked") as TextElement;
  const unlinked = els.find((e) => e.id === "el-unlinked") as TextElement;

  assert.ok(manual !== undefined); // manual element unchanged
  assert.equal(textOf(linked), "Changed content"); // linked element updated
  assert.equal(textOf(unlinked), "Manual override"); // unlinked element not touched
});
