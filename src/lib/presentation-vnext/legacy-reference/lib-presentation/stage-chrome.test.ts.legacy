import assert from "node:assert/strict";
import { test } from "node:test";

import {
  HIDDEN_ELEMENT_TREATMENT,
  LOCKED_ELEMENT_TREATMENT,
  resolveElementInteractionState,
  selectionFrameChrome,
  STAGE_CHROME_Z_INDEX,
  stageElementOverlayZIndex,
} from "./stage-chrome";

test("stageElementOverlayZIndex keeps unselected overlays in slide order", () => {
  assert.equal(
    stageElementOverlayZIndex({ elementZIndex: 7, selected: false }),
    8,
  );
});

test("stageElementOverlayZIndex lifts selected overlays into the chrome layer", () => {
  assert.equal(
    stageElementOverlayZIndex({ elementZIndex: 7, selected: true }),
    STAGE_CHROME_Z_INDEX.selectedElementOverlay,
  );
});

test("stage chrome layers keep feedback and handles above slide content", () => {
  assert.ok(
    STAGE_CHROME_Z_INDEX.preselectedFrame >
      STAGE_CHROME_Z_INDEX.selectedElementOverlay,
  );
  assert.ok(
    STAGE_CHROME_Z_INDEX.selectedFrame > STAGE_CHROME_Z_INDEX.preselectedFrame,
  );
  assert.ok(
    STAGE_CHROME_Z_INDEX.multiSelectionBounds >
      STAGE_CHROME_Z_INDEX.selectedFrame,
  );
  assert.ok(STAGE_CHROME_Z_INDEX.marquee > STAGE_CHROME_Z_INDEX.snapGuide);
  assert.ok(STAGE_CHROME_Z_INDEX.liveBadge > STAGE_CHROME_Z_INDEX.marquee);
});

// ---------------------------------------------------------------------------
// Editor state-feedback contract (#655)
// ---------------------------------------------------------------------------

test("resolveElementInteractionState defaults to idle with no flags", () => {
  assert.equal(resolveElementInteractionState({}), "idle");
});

test("resolveElementInteractionState: active manipulation outranks selection", () => {
  assert.equal(
    resolveElementInteractionState({ selected: true, dragging: true }),
    "dragging",
  );
  assert.equal(
    resolveElementInteractionState({ selected: true, resizing: true }),
    "resizing",
  );
  assert.equal(
    resolveElementInteractionState({ selected: true, rotating: true }),
    "rotating",
  );
  assert.equal(
    resolveElementInteractionState({ selected: true, editing: true }),
    "editing",
  );
});

test("resolveElementInteractionState: selection outranks hover preselection", () => {
  assert.equal(
    resolveElementInteractionState({ selected: true, preselected: true }),
    "selected",
  );
  assert.equal(
    resolveElementInteractionState({ preselected: true }),
    "preselected",
  );
});

test("resolveElementInteractionState: editing has top priority", () => {
  assert.equal(
    resolveElementInteractionState({
      editing: true,
      dragging: true,
      resizing: true,
      selected: true,
      preselected: true,
    }),
    "editing",
  );
});

test("selectionFrameChrome: selected frame is heavier and fully opaque", () => {
  const selected = selectionFrameChrome("selected");
  assert.equal(selected.borderWidthPx, 2);
  assert.equal(selected.opacity, 1);
  assert.equal(selected.zIndex, STAGE_CHROME_Z_INDEX.selectedFrame);
});

test("selectionFrameChrome: preselected frame is lighter and translucent", () => {
  const pre = selectionFrameChrome("preselected");
  assert.ok(pre.borderWidthPx < selectionFrameChrome("selected").borderWidthPx);
  assert.ok(pre.opacity < 1);
  assert.equal(pre.zIndex, STAGE_CHROME_Z_INDEX.preselectedFrame);
});

test("selected frame stacks above the hover preselection frame", () => {
  assert.ok(
    selectionFrameChrome("selected").zIndex >
      selectionFrameChrome("preselected").zIndex,
  );
});

test("locked elements stay visible but non-interactive; hidden ones are dimmed + unrendered", () => {
  assert.equal(LOCKED_ELEMENT_TREATMENT.stageOpacity, 1);
  assert.equal(LOCKED_ELEMENT_TREATMENT.pointerInteractive, false);
  assert.equal(HIDDEN_ELEMENT_TREATMENT.renderedOnStage, false);
  assert.ok(HIDDEN_ELEMENT_TREATMENT.layerTreeOpacity < 1);
});
