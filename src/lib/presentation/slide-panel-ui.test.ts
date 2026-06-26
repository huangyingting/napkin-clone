import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defaultPanelTab,
  defaultInspectorMode,
  isSelectionToolbarVisible,
  isSlideToolbarVisible,
  shouldCollapseToolbar,
  shouldShowRichToolbarControls,
  TOOLBAR_COMPACT_WIDTH,
  toolbarPanelEntries,
  toolbarQuickActions,
  toToolbarSelectionKind,
} from "./slide-panel-ui";

test("defaultPanelTab is position with a selection", () => {
  assert.equal(defaultPanelTab(true), "position");
});

test("defaultPanelTab is slide with no selection", () => {
  assert.equal(defaultPanelTab(false), "slide");
});

test("defaultInspectorMode is properties", () => {
  assert.equal(defaultInspectorMode(), "properties");
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

test("isSlideToolbarVisible is shown only for an empty selection", () => {
  assert.equal(
    isSlideToolbarVisible({ selectedElementId: null, selectedCount: 0 }),
    true,
  );
  assert.equal(
    isSlideToolbarVisible({ selectedElementId: "element-1", selectedCount: 1 }),
    false,
  );
  assert.equal(
    isSlideToolbarVisible({ selectedElementId: null, selectedCount: 2 }),
    false,
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

// ---------------------------------------------------------------------------
// Context-toolbar contract (#651)
// ---------------------------------------------------------------------------

test("toToolbarSelectionKind maps element kind + shape subtype", () => {
  assert.equal(toToolbarSelectionKind("text"), "text");
  assert.equal(toToolbarSelectionKind("image"), "image");
  assert.equal(toToolbarSelectionKind("visual"), "visual");
  assert.equal(toToolbarSelectionKind("connector"), "connector");
  assert.equal(toToolbarSelectionKind("shape", "rect"), "shape");
  assert.equal(toToolbarSelectionKind("shape", "line"), "line");
  assert.equal(toToolbarSelectionKind("mystery"), null);
});

test("toolbarQuickActions: text-like kinds expose the compact text-style bar", () => {
  for (const kind of ["text", "shape"] as const) {
    assert.equal(toolbarQuickActions(kind).textStyle, true, kind);
  }
  assert.equal(toolbarQuickActions("line").textStyle, false);
  assert.equal(toolbarQuickActions("image").textStyle, false);
});

test("toolbarQuickActions: shape and line expose fill color", () => {
  assert.equal(toolbarQuickActions("shape").shapeColor, true);
  assert.equal(toolbarQuickActions("line").shapeColor, true);
  assert.equal(toolbarQuickActions("text").shapeColor, false);
});

test("toolbarQuickActions: only connectors expose dash + routing toggles", () => {
  const conn = toolbarQuickActions("connector");
  assert.equal(conn.connectorDash, true);
  assert.equal(conn.connectorRouting, true);
  for (const kind of ["text", "shape", "image", "visual"] as const) {
    const a = toolbarQuickActions(kind);
    assert.equal(a.connectorDash, false, kind);
    assert.equal(a.connectorRouting, false, kind);
  }
});

test("toolbarPanelEntries: text element offers Text + Effects + Position", () => {
  const e = toolbarPanelEntries({
    kind: "text",
    hasSourceRef: false,
    selectedCount: 1,
  });
  assert.deepEqual(e, {
    text: true,
    media: false,
    effects: true,
    source: false,
    position: true,
  });
});

test("toolbarPanelEntries: line shape gets no Text panel entry", () => {
  const e = toolbarPanelEntries({
    kind: "line",
    hasSourceRef: false,
    selectedCount: 1,
  });
  assert.equal(e.text, false);
  assert.equal(e.media, false);
  assert.equal(e.effects, true);
});

test("toolbarPanelEntries: image/visual/connector offer Media", () => {
  for (const kind of ["image", "visual", "connector"] as const) {
    assert.equal(
      toolbarPanelEntries({ kind, hasSourceRef: false, selectedCount: 1 })
        .media,
      true,
      kind,
    );
  }
});

test("toolbarPanelEntries: Source entry only when a sourceRef exists", () => {
  assert.equal(
    toolbarPanelEntries({
      kind: "visual",
      hasSourceRef: true,
      selectedCount: 1,
    }).source,
    true,
  );
  assert.equal(
    toolbarPanelEntries({
      kind: "visual",
      hasSourceRef: false,
      selectedCount: 1,
    }).source,
    false,
  );
});

test("toolbarPanelEntries: multi-select exposes no single-element entries", () => {
  const e = toolbarPanelEntries({
    kind: "text",
    hasSourceRef: true,
    selectedCount: 3,
  });
  assert.deepEqual(e, {
    text: false,
    media: false,
    effects: false,
    source: false,
    position: false,
  });
});

test("toolbarPanelEntries: no selection exposes nothing", () => {
  const e = toolbarPanelEntries({
    kind: null,
    hasSourceRef: false,
    selectedCount: 0,
  });
  assert.deepEqual(e, {
    text: false,
    media: false,
    effects: false,
    source: false,
    position: false,
  });
});

test("shouldCollapseToolbar collapses below the compact width", () => {
  assert.equal(shouldCollapseToolbar(TOOLBAR_COMPACT_WIDTH - 1), true);
  assert.equal(shouldCollapseToolbar(400), true);
});

test("shouldCollapseToolbar keeps actions inline at/above the compact width", () => {
  assert.equal(shouldCollapseToolbar(TOOLBAR_COMPACT_WIDTH), false);
  assert.equal(shouldCollapseToolbar(1280), false);
});
