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
    content: { kind: "shape", shape: "rect" },
    designOverrides: { fill: { value: "#333333" } },
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
    content: { kind: "text", text: value, paragraphs: [{ text: value }] },
    zIndex,
    box: elementBox,
    designOverrides: {
      textStyle: { fontSize: 5, bold: false, italic: false, align: "left" },
    },
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
    content: { kind: "visual", visualId: `visual-${id}` },
    zIndex,
    box: elementBox,
  };
}

function image(
  id: string,
  zIndex: number,
  elementBox: ElementBox,
): SlideElement {
  return {
    id,
    kind: "image",
    content: { kind: "image", src: `image-${id}` },
    zIndex,
    box: elementBox,
  } as unknown as SlideElement;
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

test("hitTestSlideElements can ignore selected stickiness for hover preselection", () => {
  const elements = [
    text("covered-text", 0, box(10, 40, 80, 20), "Revenue"),
    rect("selected-cover", 20, box(0, 0, 100, 100)),
  ];

  const hits = hitTestSlideElements({ x: 12, y: 50 }, elements, {
    selectedElementBonus: false,
    selectedElementIds: new Set(["selected-cover"]),
  });
  assert.equal(hits[0]?.element.id, "covered-text");
  assert.equal(hits[0]?.reason, "text-content");
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

test("hitTestSlideElements uses media geometry regions for image hits", () => {
  const elements = [
    rect("bottom", 0, box(0, 0, 100, 100)),
    image("sparse-image", 10, box(0, 0, 100, 100)),
  ];
  const mediaHitGeometry = new Map([
    ["sparse-image", { regions: [box(20, 20, 10, 10)] }],
  ]);

  const emptyRegionHits = hitTestSlideElements({ x: 80, y: 80 }, elements, {
    mediaHitGeometry,
  });
  assert.equal(emptyRegionHits[0]?.element.id, "bottom");

  const regionHits = hitTestSlideElements({ x: 25, y: 25 }, elements, {
    mediaHitGeometry,
  });
  assert.equal(regionHits[0]?.element.id, "sparse-image");
});

test("hitTestSlideElements uses the full visual box even with sparse media geometry", () => {
  const elements = [
    rect("bottom", 0, box(0, 0, 100, 100)),
    visual("sparse-visual", 10, box(0, 0, 100, 100)),
  ];
  const mediaHitGeometry = new Map([
    ["sparse-visual", { regions: [box(20, 20, 10, 10)] }],
  ]);

  const hits = hitTestSlideElements({ x: 80, y: 80 }, elements, {
    mediaHitGeometry,
  });

  assert.equal(hits[0]?.element.id, "sparse-visual");
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
    content: { kind: "shape", shape: "line" },
    designOverrides: { fill: { value: "#111111" } },
    zIndex: 1,
    box: box(10, 50, 80, 4),
  };

  assert.equal(
    hitTestSlideElements({ x: 50, y: 52 }, [line])[0]?.element.id,
    "line",
  );
  assert.equal(hitTestSlideElements({ x: 50, y: 65 }, [line]).length, 0);
});

test("hitTestSlideElements handles zero-length line shapes", () => {
  const line: SlideElement = {
    id: "point-line",
    kind: "shape",
    content: { kind: "shape", shape: "line" },
    zIndex: 1,
    box: box(50, 50, 0, 0),
  };

  assert.equal(
    hitTestSlideElements({ x: 50, y: 50 }, [line], {
      lineThresholdPct: 0.5,
    })[0]?.reason,
    "line-stroke",
  );
  assert.equal(
    hitTestSlideElements({ x: 52, y: 50 }, [line], {
      lineThresholdPct: 0.5,
    }).length,
    0,
  );
});

test("hitTestSlideElements handles rotated and aligned text hit boxes", () => {
  const rotated = {
    ...text("rotated-text", 3, box(40, 40, 20, 10), "Rotated"),
    rotation: 90,
    designOverrides: {
      textStyle: {
        fontSize: 4,
        bold: false,
        italic: false,
        align: "right" as const,
        verticalAlign: "bottom" as const,
      },
    },
  };

  const hits = hitTestSlideElements({ x: 50, y: 50 }, [rotated], {
    stageAspect: 16 / 9,
  });

  assert.equal(hits[0]?.element.id, "rotated-text");
});

test("hitTestSlideElements filters ellipse and triangle interiors", () => {
  const ellipse: SlideElement = {
    id: "ellipse",
    kind: "shape",
    content: { kind: "shape", shape: "ellipse" },
    zIndex: 1,
    box: box(10, 10, 20, 20),
  };
  const triangle: SlideElement = {
    id: "triangle",
    kind: "shape",
    content: { kind: "shape", shape: "triangle" },
    zIndex: 2,
    box: box(40, 10, 20, 20),
  };

  assert.equal(
    hitTestSlideElements({ x: 20, y: 20 }, [ellipse])[0]?.reason,
    "shape-interior",
  );
  assert.equal(hitTestSlideElements({ x: 10, y: 10 }, [ellipse]).length, 0);
  assert.equal(
    hitTestSlideElements({ x: 50, y: 20 }, [triangle])[0]?.element.id,
    "triangle",
  );
  assert.equal(hitTestSlideElements({ x: 40, y: 10 }, [triangle]).length, 0);
});

test("hitTestSlideElements applies z-index and selected bonuses to candidate scores", () => {
  const low = rect("low", 1, box(10, 10, 30, 30));
  const high = rect("high", 20, box(10, 10, 30, 30));
  const selected = rect("selected", 1, box(10, 10, 30, 30));

  const zHits = hitTestSlideElements({ x: 25, y: 25 }, [low, high]);
  assert.ok((zHits[0]?.score ?? 0) > (zHits[1]?.score ?? 0));

  const selectedHits = hitTestSlideElements(
    { x: 25, y: 25 },
    [selected, high],
    { selectedElementIds: new Set(["selected"]) },
  );
  assert.equal(selectedHits[0]?.element.id, "selected");
});

test("hitTestSlideElements resolves connector strokes and fitted boxes", () => {
  const start = rect("start", 0, box(10, 10, 10, 10));
  const end = rect("end", 0, box(70, 10, 10, 10));
  const connector: SlideElement = {
    id: "connector",
    kind: "connector",
    content: {
      kind: "connector",
      start: { elementId: "start", anchor: "right" },
      end: { elementId: "end", anchor: "left" },
    },
    zIndex: 5,
    box: box(0, 0, 100, 100),
  };

  const hits = hitTestSlideElements({ x: 45, y: 15 }, [start, end, connector], {
    fittedBoxes: new Map([
      ["start", box(10, 10, 20, 10)],
      ["end", box(70, 10, 20, 10)],
    ]),
    lineThresholdPct: 2,
  });

  assert.equal(hits[0]?.element.id, "connector");
  assert.equal(hits[0]?.reason, "connector-stroke");
  assert.equal(
    hitTestSlideElements({ x: 45, y: 30 }, [start, end, connector]).some(
      (hit) => hit.element.id === "connector",
    ),
    false,
  );
});
