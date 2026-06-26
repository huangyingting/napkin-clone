import assert from "node:assert/strict";
import { test } from "node:test";

import type { SlideElement } from "./deck";
import {
  elementPointerDownIntent,
  isInlineEditableStageElement,
  shouldClearSelectionOnStagePointerDown,
  shouldEnterInlineTextEditOnClick,
} from "./stage-interaction";

function textElement(): SlideElement {
  return {
    id: "text-1",
    kind: "text",
    text: "Hello",
    zIndex: 1,
    box: { x: 10, y: 10, w: 40, h: 10 },
    style: { fontSize: 5, bold: false, italic: false, align: "left" },
  };
}

function visualElement(): SlideElement {
  return {
    id: "visual-1",
    kind: "visual",
    visualId: "vis-1",
    zIndex: 1,
    box: { x: 10, y: 10, w: 40, h: 40 },
  };
}

function lineShapeElement(): SlideElement {
  return {
    id: "line-1",
    kind: "shape",
    shape: "line",
    color: "#111111",
    zIndex: 1,
    box: { x: 10, y: 10, w: 30, h: 4 },
  };
}

test("elementPointerDownIntent tracks unselected elements for select-or-drag", () => {
  assert.equal(
    elementPointerDownIntent({ isSelected: false, isAdditive: false }),
    "select-or-drag",
  );
});

test("elementPointerDownIntent drags only when the element is already selected", () => {
  assert.equal(
    elementPointerDownIntent({ isSelected: true, isAdditive: false }),
    "drag-selected",
  );
});

test("elementPointerDownIntent preserves modifier-click selection toggles", () => {
  assert.equal(
    elementPointerDownIntent({ isSelected: false, isAdditive: true }),
    "toggle-selection",
  );
  assert.equal(
    elementPointerDownIntent({ isSelected: true, isAdditive: true }),
    "toggle-selection",
  );
});

test("shouldEnterInlineTextEditOnClick rejects the first selection click", () => {
  assert.equal(
    shouldEnterInlineTextEditOnClick({
      element: textElement(),
      mode: "move",
      moved: false,
      wasPrimarySelected: false,
      selectedCount: 0,
    }),
    false,
  );
});

test("shouldEnterInlineTextEditOnClick accepts a second click on selected text", () => {
  assert.equal(
    shouldEnterInlineTextEditOnClick({
      element: textElement(),
      mode: "move",
      moved: false,
      wasPrimarySelected: true,
      selectedCount: 1,
    }),
    true,
  );
});

test("shouldEnterInlineTextEditOnClick rejects drag gestures and multi-selection", () => {
  assert.equal(
    shouldEnterInlineTextEditOnClick({
      element: textElement(),
      mode: "move",
      moved: true,
      wasPrimarySelected: true,
      selectedCount: 1,
    }),
    false,
  );
  assert.equal(
    shouldEnterInlineTextEditOnClick({
      element: textElement(),
      mode: "move",
      moved: false,
      wasPrimarySelected: true,
      selectedCount: 2,
    }),
    false,
  );
});

test("shouldEnterInlineTextEditOnClick only edits inline-editable elements", () => {
  assert.equal(isInlineEditableStageElement(textElement()), true);
  assert.equal(isInlineEditableStageElement(visualElement()), false);
  assert.equal(isInlineEditableStageElement(lineShapeElement()), false);
  assert.equal(
    shouldEnterInlineTextEditOnClick({
      element: visualElement(),
      mode: "move",
      moved: false,
      wasPrimarySelected: true,
      selectedCount: 1,
    }),
    false,
  );
});

test("shouldClearSelectionOnStagePointerDown clears only primary clicks while editing", () => {
  assert.equal(
    shouldClearSelectionOnStagePointerDown({
      activeEditingId: "text-1",
      isPrimaryButton: true,
    }),
    true,
  );
  assert.equal(
    shouldClearSelectionOnStagePointerDown({
      activeEditingId: "text-1",
      isPrimaryButton: false,
    }),
    false,
  );
  assert.equal(
    shouldClearSelectionOnStagePointerDown({
      activeEditingId: null,
      isPrimaryButton: true,
    }),
    false,
  );
});
