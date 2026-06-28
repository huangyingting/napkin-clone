import assert from "node:assert/strict";
import { test } from "node:test";

import {
  availablePanels,
  defaultPanelTab,
  isPanelAvailable,
  isSelectionToolbarVisible,
  isSlideToolbarVisible,
  shouldCollapseToolbar,
  shouldShowRichToolbarControls,
  TOOLBAR_COMPACT_WIDTH,
  toolbarQuickActions,
  toToolbarSelectionKind,
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

test("availablePanels: empty selection exposes slide, notes, layers", () => {
  assert.deepEqual(
    availablePanels({ kind: null, hasSourceRef: false, selectedCount: 0 }),
    ["slide", "notes", "layers"],
  );
});

test("availablePanels: single text element", () => {
  assert.deepEqual(
    availablePanels({ kind: "text", hasSourceRef: false, selectedCount: 1 }),
    ["text", "arrange", "effects", "layers"],
  );
});

test("availablePanels: non-line shape exposes Text + Appearance", () => {
  assert.deepEqual(
    availablePanels({ kind: "shape", hasSourceRef: false, selectedCount: 1 }),
    ["text", "appearance", "arrange", "effects", "layers"],
  );
});

test("availablePanels: line shape has Appearance but no Text", () => {
  assert.deepEqual(
    availablePanels({ kind: "line", hasSourceRef: false, selectedCount: 1 }),
    ["appearance", "arrange", "effects", "layers"],
  );
});

test("availablePanels: image/connector expose Appearance", () => {
  for (const kind of ["image", "connector"] as const) {
    assert.deepEqual(
      availablePanels({ kind, hasSourceRef: false, selectedCount: 1 }),
      ["appearance", "arrange", "effects", "layers"],
      kind,
    );
  }
});

test("availablePanels: visual excludes Appearance", () => {
  assert.deepEqual(
    availablePanels({ kind: "visual", hasSourceRef: false, selectedCount: 1 }),
    ["arrange", "effects", "layers"],
  );
});

test("availablePanels: Source only when a sourceRef exists", () => {
  assert.deepEqual(
    availablePanels({ kind: "visual", hasSourceRef: true, selectedCount: 1 }),
    ["arrange", "effects", "source", "layers"],
  );
  assert.equal(
    isPanelAvailable("source", {
      kind: "visual",
      hasSourceRef: false,
      selectedCount: 1,
    }),
    false,
  );
});

test("availablePanels: multi-selection exposes arrange, effects, layers", () => {
  assert.deepEqual(
    availablePanels({ kind: "text", hasSourceRef: true, selectedCount: 3 }),
    ["arrange", "effects", "layers"],
  );
});

test("isPanelAvailable: empty selection excludes element panels", () => {
  const ctx = { kind: null, hasSourceRef: false, selectedCount: 0 } as const;
  for (const panel of [
    "arrange",
    "text",
    "appearance",
    "effects",
    "source",
  ] as const) {
    assert.equal(isPanelAvailable(panel, ctx), false, panel);
  }
});

test("shouldCollapseToolbar collapses below the compact width", () => {
  assert.equal(shouldCollapseToolbar(TOOLBAR_COMPACT_WIDTH - 1), true);
  assert.equal(shouldCollapseToolbar(400), true);
});

test("shouldCollapseToolbar keeps actions inline at/above the compact width", () => {
  assert.equal(shouldCollapseToolbar(TOOLBAR_COMPACT_WIDTH), false);
  assert.equal(shouldCollapseToolbar(1280), false);
});
