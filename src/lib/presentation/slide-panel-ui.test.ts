import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defaultPanelTab,
  isSelectionToolbarVisible,
  shouldShowRichToolbarControls,
} from "./slide-panel-ui";

test("defaultPanelTab is arrange with a selection", () => {
  assert.equal(defaultPanelTab(true), "arrange");
});

test("defaultPanelTab is slide with no selection", () => {
  assert.equal(defaultPanelTab(false), "slide");
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
