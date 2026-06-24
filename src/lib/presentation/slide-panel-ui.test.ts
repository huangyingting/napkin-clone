import assert from "node:assert/strict";
import { test } from "node:test";

import {
  inspectorTabForPanel,
  isSelectionToolbarVisible,
  shouldShowRichToolbarControls,
} from "./slide-panel-ui";

test("inspectorTabForPanel maps slide tab to style section", () => {
  assert.equal(inspectorTabForPanel("slide"), "style");
});

test("inspectorTabForPanel maps other tabs to content section", () => {
  assert.equal(inspectorTabForPanel("arrange"), "content");
  assert.equal(inspectorTabForPanel("details"), "content");
  assert.equal(inspectorTabForPanel("layers"), "content");
  assert.equal(inspectorTabForPanel("source"), "content");
});

test("isSelectionToolbarVisible is hidden with no selection", () => {
  assert.equal(
    isSelectionToolbarVisible({ hasSelectedElement: false, selectedCount: 0 }),
    false,
  );
});

test("isSelectionToolbarVisible is shown for single selection", () => {
  assert.equal(
    isSelectionToolbarVisible({ hasSelectedElement: true, selectedCount: 1 }),
    true,
  );
});

test("isSelectionToolbarVisible is shown for multi-selection without primary", () => {
  assert.equal(
    isSelectionToolbarVisible({ hasSelectedElement: false, selectedCount: 3 }),
    true,
  );
});

test("shouldShowRichToolbarControls true for single selection", () => {
  assert.equal(
    shouldShowRichToolbarControls({
      hasSelectedElement: true,
      selectedCount: 1,
    }),
    true,
  );
});

test("shouldShowRichToolbarControls false for multi-selection", () => {
  assert.equal(
    shouldShowRichToolbarControls({
      hasSelectedElement: true,
      selectedCount: 3,
    }),
    false,
  );
});

test("shouldShowRichToolbarControls false with no selected element", () => {
  assert.equal(
    shouldShowRichToolbarControls({
      hasSelectedElement: false,
      selectedCount: 0,
    }),
    false,
  );
});
