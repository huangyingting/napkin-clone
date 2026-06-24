import assert from "node:assert/strict";
import { test } from "node:test";

import {
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
