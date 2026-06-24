import assert from "node:assert/strict";
import { test } from "node:test";

import type { ElementBox, SlideElement } from "./deck";
import { hitTestSlideElements } from "./stage-hit-test";

function box(x: number, y: number, w: number, h: number): ElementBox {
  return { x, y, w, h };
}

function rect(
  id: string,
  zIndex: number,
  elementBox: ElementBox,
): SlideElement {
  return {
    id,
    kind: "shape",
    shape: "rect",
    color: "#333333",
    zIndex,
    box: elementBox,
  };
}

function text(
  id: string,
  zIndex: number,
  elementBox: ElementBox,
  value = "Title",
): SlideElement {
  return {
    id,
    kind: "text",
    role: "body",
    text: value,
    zIndex,
    box: elementBox,
    style: { fontSize: 5, bold: false, italic: false, align: "left" },
  };
}

function visual(
  id: string,
  zIndex: number,
  elementBox: ElementBox,
): SlideElement {
  return {
    id,
    kind: "visual",
    visualId: `visual-${id}`,
    zIndex,
    box: elementBox,
  };
}

test("hitTestSlideElements returns the top visible element by zIndex", () => {
  const elements = [
    rect("bottom", 0, box(10, 10, 40, 40)),
    rect("top", 1, box(20, 20, 40, 40)),
  ];
  const hits = hitTestSlideElements({ x: 30, y: 30 }, elements);
  assert.deepEqual(
    hits.map((hit) => hit.element.id),
    ["top", "bottom"],
  );
});

test("hitTestSlideElements prefers covered text content over a large covering shape", () => {
  const elements = [
    text("covered-text", 0, box(10, 40, 80, 20), "Revenue"),
    rect("large-cover", 20, box(0, 0, 100, 100)),
  ];

  const hits = hitTestSlideElements({ x: 12, y: 50 }, elements);
  assert.equal(hits[0]?.element.id, "covered-text");
  assert.equal(hits[0]?.reason, "text-content");
});

test("hitTestSlideElements prefers shape edge over covered text", () => {
  const elements = [
    text("covered-text", 0, box(10, 40, 80, 20), "Revenue"),
    rect("large-cover", 20, box(10, 30, 80, 40)),
  ];

  const hits = hitTestSlideElements({ x: 10.5, y: 50 }, elements);
  assert.equal(hits[0]?.element.id, "large-cover");
  assert.equal(hits[0]?.reason, "shape-edge");
});

test("hitTestSlideElements keeps selected covering elements sticky", () => {
  const elements = [
    text("covered-text", 0, box(10, 40, 80, 20), "Revenue"),
    rect("selected-cover", 20, box(0, 0, 100, 100)),
  ];

  const hits = hitTestSlideElements({ x: 12, y: 50 }, elements, {
    selectedElementIds: new Set(["selected-cover"]),
  });
  assert.equal(hits[0]?.element.id, "selected-cover");
});

test("hitTestSlideElements lets small covering shapes beat underlying text", () => {
  const elements = [
    text("covered-text", 0, box(10, 40, 80, 20), "Revenue"),
    rect("small-cover", 20, box(10, 45, 12, 10)),
  ];

  const hits = hitTestSlideElements({ x: 15, y: 50 }, elements);
  assert.equal(hits[0]?.element.id, "small-cover");
});

test("hitTestSlideElements lets lower elements show through empty text frame areas", () => {
  const elements = [
    rect("bottom", 0, box(0, 0, 100, 100)),
    text("wide-text", 10, box(0, 0, 100, 100), "Hi"),
  ];

  const hits = hitTestSlideElements({ x: 90, y: 90 }, elements);
  assert.equal(hits[0]?.element.id, "bottom");
});

test("hitTestSlideElements still hits text when pointer is on visible text area", () => {
  const elements = [
    rect("bottom", 0, box(0, 0, 100, 100)),
    text("wide-text", 10, box(0, 0, 100, 100), "Hi"),
  ];

  const hits = hitTestSlideElements({ x: 2, y: 50 }, elements);
  assert.equal(hits[0]?.element.id, "wide-text");
});

test("hitTestSlideElements uses measured text geometry when provided", () => {
  const elements = [
    rect("bottom", 0, box(0, 0, 100, 100)),
    text("wide-text", 10, box(0, 0, 100, 100), "A wrapped localized title"),
  ];
  const textHitGeometry = new Map([
    ["wide-text", { contentBoxes: [box(40, 40, 12, 8)] }],
  ]);

  const emptyFrameHits = hitTestSlideElements({ x: 2, y: 50 }, elements, {
    textHitGeometry,
  });
  assert.equal(emptyFrameHits[0]?.element.id, "bottom");

  const measuredHits = hitTestSlideElements({ x: 42, y: 42 }, elements, {
    textHitGeometry,
  });
  assert.equal(measuredHits[0]?.element.id, "wide-text");
  assert.equal(measuredHits[0]?.reason, "text-content");
});

test("hitTestSlideElements treats measured text padding as text-near", () => {
  const elements = [
    rect("bottom", 0, box(0, 0, 100, 100)),
    text("wide-text", 10, box(0, 0, 100, 100), "Revenue"),
  ];

  const hits = hitTestSlideElements({ x: 38, y: 42 }, elements, {
    textHitGeometry: new Map([
      ["wide-text", { contentBoxes: [box(40, 40, 12, 8)] }],
    ]),
  });

  assert.equal(hits[0]?.element.id, "wide-text");
  assert.equal(hits[0]?.reason, "text-near");
});

test("hitTestSlideElements falls back to heuristic text geometry on cache miss", () => {
  const elements = [
    rect("bottom", 0, box(0, 0, 100, 100)),
    text("wide-text", 10, box(0, 0, 100, 100), "Hi"),
  ];

  const hits = hitTestSlideElements({ x: 2, y: 50 }, elements, {
    textHitGeometry: new Map(),
  });
  assert.equal(hits[0]?.element.id, "wide-text");
  assert.equal(hits[0]?.reason, "text-content");
});

test("hitTestSlideElements skips hidden and locked elements by default", () => {
  const hidden = { ...rect("hidden", 20, box(0, 0, 100, 100)), hidden: true };
  const locked = { ...rect("locked", 10, box(0, 0, 100, 100)), locked: true };
  const bottom = rect("bottom", 0, box(0, 0, 100, 100));

  const hits = hitTestSlideElements({ x: 50, y: 50 }, [bottom, locked, hidden]);
  assert.deepEqual(
    hits.map((hit) => hit.element.id),
    ["bottom"],
  );
});

test("hitTestSlideElements uses media geometry regions for visual/image hits", () => {
  const elements = [
    rect("bottom", 0, box(0, 0, 100, 100)),
    visual("sparse-visual", 10, box(0, 0, 100, 100)),
  ];
  const mediaHitGeometry = new Map([
    ["sparse-visual", { regions: [box(20, 20, 10, 10)] }],
  ]);

  const emptyRegionHits = hitTestSlideElements({ x: 80, y: 80 }, elements, {
    mediaHitGeometry,
  });
  assert.equal(emptyRegionHits[0]?.element.id, "bottom");

  const regionHits = hitTestSlideElements({ x: 25, y: 25 }, elements, {
    mediaHitGeometry,
  });
  assert.equal(regionHits[0]?.element.id, "sparse-visual");
});

test("hitTestSlideElements falls back to fitted media box without media geometry", () => {
  const elements = [
    rect("bottom", 0, box(0, 0, 100, 100)),
    visual("visual-box", 10, box(0, 0, 100, 100)),
  ];

  const hits = hitTestSlideElements({ x: 80, y: 80 }, elements);

  assert.equal(hits[0]?.element.id, "visual-box");
});

test("hitTestSlideElements can include locked elements when requested", () => {
  const locked = { ...rect("locked", 10, box(0, 0, 100, 100)), locked: true };
  const bottom = rect("bottom", 0, box(0, 0, 100, 100));

  const hits = hitTestSlideElements({ x: 50, y: 50 }, [bottom, locked], {
    includeLocked: true,
  });
  assert.equal(hits[0]?.element.id, "locked");
});

test("hitTestSlideElements uses distance threshold for line shapes", () => {
  const line: SlideElement = {
    id: "line",
    kind: "shape",
    shape: "line",
    color: "#111111",
    zIndex: 1,
    box: box(10, 50, 80, 4),
  };

  assert.equal(
    hitTestSlideElements({ x: 50, y: 52 }, [line])[0]?.element.id,
    "line",
  );
  assert.equal(hitTestSlideElements({ x: 50, y: 65 }, [line]).length, 0);
});
