import assert from "node:assert/strict";
import { test } from "node:test";

import type { Slide, SlideElement } from "@/lib/presentation/deck";
import type { SlideThemeColors } from "@/lib/presentation/style-cascade";

import {
  selectBackgroundPreviewStyle,
  selectCanDeleteSlide,
  selectElementTypeLabel,
  selectSafeSelectedIndex,
  selectSelectedElement,
  selectSelectionSummary,
} from "./slide-editor-view-model";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeSlide(overrides: Partial<Slide> = {}): Slide {
  return {
    id: "slide-1",
    index: 0,
    title: "Test slide",
    bullets: [],
    notes: "",
    ...overrides,
  };
}

function makeTheme(
  overrides: Partial<SlideThemeColors> = {},
): SlideThemeColors {
  return {
    bgColor: "#ffffff",
    accentColor: "#0070f3",
    titleColor: "#000000",
    bodyColor: "#333333",
    mutedColor: "#888888",
    ...overrides,
  };
}

function makeElement(
  overrides: { kind: SlideElement["kind"] } & Partial<SlideElement>,
): SlideElement {
  const { kind, ...rest } = overrides;
  const base = {
    id: "el-1",
    name: "",
    box: { x: 0, y: 0, w: 100, h: 50 },
  };
  // Supply minimal required fields per kind
  switch (kind) {
    case "text":
      return {
        ...base,
        kind: "text",
        content: { kind: "text", text: "Text", paragraphs: [{ text: "Text" }] },
        designOverrides: {
          textStyle: { fontSize: 4, bold: false, italic: false, align: "left" },
        },
        ...rest,
      } as unknown as SlideElement;
    case "image":
      return {
        ...base,
        kind: "image",
        content: { kind: "image", src: "" },
        ...rest,
      } as unknown as SlideElement;
    case "shape":
      return {
        ...base,
        kind: "shape",
        content: { kind: "shape", shape: "rect" },
        designOverrides: { fill: { value: "#000000" } },
        ...rest,
      } as unknown as SlideElement;
    case "visual":
      return {
        ...base,
        kind: "visual",
        content: { kind: "visual", visualId: "v1" },
        ...rest,
      } as unknown as SlideElement;
    case "connector":
      return {
        ...base,
        kind: "connector",
        content: {
          kind: "connector",
          start: { x: 0, y: 0 },
          end: { x: 100, y: 0 },
          routing: "straight",
        },
        ...rest,
      } as unknown as SlideElement;
    default:
      throw new Error(`makeElement: unhandled kind ${kind}`);
  }
}

// ── selectSafeSelectedIndex ────────────────────────────────────────────────

test("selectSafeSelectedIndex returns index unchanged when within bounds", () => {
  const slides = [makeSlide({ id: "s1" }), makeSlide({ id: "s2" })];
  assert.equal(selectSafeSelectedIndex(slides, 1), 1);
});

test("selectSafeSelectedIndex clamps index to last slide when out of range", () => {
  const slides = [makeSlide({ id: "s1" }), makeSlide({ id: "s2" })];
  assert.equal(selectSafeSelectedIndex(slides, 5), 1);
});

test("selectSafeSelectedIndex returns 0 for single-slide deck", () => {
  const slides = [makeSlide()];
  assert.equal(selectSafeSelectedIndex(slides, 3), 0);
});

// ── selectCanDeleteSlide ───────────────────────────────────────────────────

test("selectCanDeleteSlide is false for a single-slide deck", () => {
  assert.equal(selectCanDeleteSlide([makeSlide()]), false);
});

test("selectCanDeleteSlide is true when deck has two or more slides", () => {
  assert.equal(
    selectCanDeleteSlide([makeSlide({ id: "s1" }), makeSlide({ id: "s2" })]),
    true,
  );
});

// ── selectElementTypeLabel ─────────────────────────────────────────────────

test("selectElementTypeLabel returns Title for h1 text elements", () => {
  assert.equal(
    selectElementTypeLabel(makeElement({ kind: "text", role: "title" } as any)),
    "Title",
  );
});

test("selectElementTypeLabel returns Text for non-h1 text elements", () => {
  assert.equal(
    selectElementTypeLabel(makeElement({ kind: "text", role: "body" })),
    "Text",
  );
});

test("selectElementTypeLabel returns Image for image elements", () => {
  assert.equal(selectElementTypeLabel(makeElement({ kind: "image" })), "Image");
});

test("selectElementTypeLabel returns Shape for shape elements", () => {
  assert.equal(selectElementTypeLabel(makeElement({ kind: "shape" })), "Shape");
});

test("selectElementTypeLabel returns Visual for visual elements", () => {
  assert.equal(
    selectElementTypeLabel(makeElement({ kind: "visual" })),
    "Visual",
  );
});

test("selectElementTypeLabel returns Connector for connector elements", () => {
  assert.equal(
    selectElementTypeLabel(makeElement({ kind: "connector" })),
    "Connector",
  );
});

// ── selectSelectionSummary ─────────────────────────────────────────────────

test("selectSelectionSummary returns no-selection message when nothing selected", () => {
  const summary = selectSelectionSummary({
    effectiveSelectedElementId: null,
    effectiveSelectedElementIds: new Set(),
    selectedSlide: makeSlide(),
  });
  assert.equal(summary, "No element selected");
});

test("selectSelectionSummary returns multi-selection count for multiple elements", () => {
  const summary = selectSelectionSummary({
    effectiveSelectedElementId: "el-1",
    effectiveSelectedElementIds: new Set(["el-1", "el-2", "el-3"]),
    selectedSlide: makeSlide(),
  });
  assert.equal(summary, "3 elements selected");
});

test("selectSelectionSummary returns element type label for single selection", () => {
  const el = makeElement({ id: "el-42", kind: "text", role: "body" });
  const slide = makeSlide({ elements: [el] });
  const summary = selectSelectionSummary({
    effectiveSelectedElementId: "el-42",
    effectiveSelectedElementIds: new Set(["el-42"]),
    selectedSlide: slide,
  });
  assert.equal(summary, "Text selected");
});

test("selectSelectionSummary returns no-selection message when element id not found", () => {
  const slide = makeSlide({ elements: [] });
  const summary = selectSelectionSummary({
    effectiveSelectedElementId: "missing-id",
    effectiveSelectedElementIds: new Set(["missing-id"]),
    selectedSlide: slide,
  });
  assert.equal(summary, "No element selected");
});

test("selectSelectionSummary returns no-selection when selectedSlide is undefined", () => {
  const summary = selectSelectionSummary({
    effectiveSelectedElementId: "el-1",
    effectiveSelectedElementIds: new Set(["el-1"]),
    selectedSlide: undefined,
  });
  assert.equal(summary, "No element selected");
});

// ── selectSelectedElement ──────────────────────────────────────────────────

test("selectSelectedElement returns null when effectiveSelectedElementId is null", () => {
  const slide = makeSlide({
    elements: [makeElement({ id: "el-1", kind: "text", role: "body" })],
  });
  assert.equal(selectSelectedElement(slide, null), null);
});

test("selectSelectedElement returns null when selectedSlide is undefined", () => {
  assert.equal(selectSelectedElement(undefined, "el-1"), null);
});

test("selectSelectedElement returns null when element id not found", () => {
  const slide = makeSlide({
    elements: [makeElement({ id: "el-1", kind: "text", role: "body" })],
  });
  assert.equal(selectSelectedElement(slide, "not-there"), null);
});

test("selectSelectedElement returns the matching element", () => {
  const el = makeElement({ id: "el-7", kind: "image" });
  const slide = makeSlide({ elements: [el] });
  assert.equal(selectSelectedElement(slide, "el-7"), el);
});

// ── selectBackgroundPreviewStyle ───────────────────────────────────────────

test("selectBackgroundPreviewStyle uses theme bg when slide has no background", () => {
  const style = selectBackgroundPreviewStyle(makeSlide(), makeTheme());
  assert.deepEqual(style, { backgroundColor: "#ffffff" });
});

test("selectBackgroundPreviewStyle uses slide background color over theme", () => {
  const slide = makeSlide({
    designOverrides: {
      background: { type: "solid", color: { value: "#ff0000" } },
    },
  });
  const style = selectBackgroundPreviewStyle(slide, makeTheme());
  assert.deepEqual(style, { backgroundColor: "#ff0000" });
});

test("selectBackgroundPreviewStyle uses gradient when backgroundGradient is set", () => {
  const slide = makeSlide({
    designOverrides: {
      background: {
        type: "gradient",
        from: { value: "#aaa" },
        to: { value: "#bbb" },
        angle: 90,
      },
    },
  });
  const style = selectBackgroundPreviewStyle(slide, makeTheme());
  assert.deepEqual(style, { background: "linear-gradient(90deg, #aaa, #bbb)" });
});

test("selectBackgroundPreviewStyle defaults gradient angle to 135 when omitted", () => {
  const slide = makeSlide({
    designOverrides: {
      background: {
        type: "gradient",
        from: { value: "#111" },
        to: { value: "#222" },
      },
    },
  });
  const style = selectBackgroundPreviewStyle(slide, makeTheme());
  assert.deepEqual(style, {
    background: "linear-gradient(135deg, #111, #222)",
  });
});

test("selectBackgroundPreviewStyle returns theme bg color when slide is undefined", () => {
  const style = selectBackgroundPreviewStyle(undefined, makeTheme());
  assert.deepEqual(style, { backgroundColor: "#ffffff" });
});
