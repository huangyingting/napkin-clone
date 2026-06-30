import assert from "node:assert/strict";
import { test } from "node:test";

import { fitCanvasToViewport } from "./stage-fit";

test("fitCanvasToViewport treats 100% as fit without scroll", () => {
  const fit = fitCanvasToViewport({
    viewport: { width: 900, height: 500 },
    aspectRatio: 16 / 9,
    zoomPercent: 100,
  });

  assert.equal(fit.needsScroll, false);
  assert.ok(fit.frame.width <= 900);
  assert.ok(fit.frame.height <= 500);
  assert.equal(fit.scrollContentSize.width, 900);
  assert.equal(fit.scrollContentSize.height, 500);
});

test("fitCanvasToViewport scrolls only when zoom exceeds fit", () => {
  const fit = fitCanvasToViewport({
    viewport: { width: 900, height: 500 },
    aspectRatio: 16 / 9,
    zoomPercent: 150,
  });

  assert.equal(fit.needsScroll, true);
  assert.ok(fit.frame.width > 900 || fit.frame.height > 500);
  assert.ok(
    fit.scrollContentSize.width > 900 || fit.scrollContentSize.height > 500,
  );
});

test("fitCanvasToViewport shifts left for a right overlay only when there is slack", () => {
  const fit = fitCanvasToViewport({
    viewport: { width: 1400, height: 600 },
    aspectRatio: 16 / 9,
    zoomPercent: 100,
    rightOverlayWidth: 352,
  });
  const centeredLeft = (1400 - fit.frame.width) / 2;

  assert.ok(fit.frame.left < centeredLeft);
  assert.equal(fit.needsScroll, false);
});
