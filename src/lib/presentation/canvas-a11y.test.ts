/**
 * Unit tests for the pure canvas keyboard accessibility helpers
 * (`canvas-a11y.ts`).
 *
 * The keyboard model's real coverage lives here: the fast gate cannot run a
 * browser, so the decision logic behind keyboard resize, traversal, focus
 * restoration, announcements, connector authoring and the help overlay is
 * exercised as headless pure functions.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  announceDelete,
  announceMove,
  announceResize,
  announceSelection,
  buildConnectorBetween,
  canvasShortcutHelp,
  connectorBoundingBox,
  cycleEndpointAnchor,
  defaultAnchorPair,
  focusTargetAfterDelete,
  isArrowKey,
  isConnectableElement,
  nextElementId,
  orderedElementIds,
  resizeBoxByStep,
  selectedConnectablePair,
} from "./canvas-a11y";
import type {
  ConnectorElement,
  ElementBox,
  ShapeElement,
  SlideElement,
  TextElement,
} from "./deck";

const box = (x: number, y: number, w: number, h: number): ElementBox => ({
  x,
  y,
  w,
  h,
});

function textEl(id: string, b: ElementBox): TextElement {
  return {
    id,
    kind: "text",
    box: b,
    zIndex: 1,
    content: { kind: "text", text: id },
    designOverrides: {
      textStyle: { fontSize: 5, bold: false, italic: false, align: "left" },
    },
  };
}

// ---------------------------------------------------------------------------
// resizeBoxByStep
// ---------------------------------------------------------------------------

describe("canvas-a11y: resizeBoxByStep", () => {
  test("ArrowRight widens, ArrowLeft narrows (right edge)", () => {
    const b = box(10, 10, 20, 20);
    assert.deepEqual(resizeBoxByStep(b, "ArrowRight", 1), box(10, 10, 21, 20));
    assert.deepEqual(resizeBoxByStep(b, "ArrowLeft", 1), box(10, 10, 19, 20));
  });

  test("ArrowDown grows taller, ArrowUp shrinks shorter (bottom edge)", () => {
    const b = box(10, 10, 20, 20);
    assert.deepEqual(resizeBoxByStep(b, "ArrowDown", 5), box(10, 10, 20, 25));
    assert.deepEqual(resizeBoxByStep(b, "ArrowUp", 5), box(10, 10, 20, 15));
  });

  test("x and y never move (top-left anchored)", () => {
    const b = box(30, 40, 10, 10);
    const r = resizeBoxByStep(b, "ArrowRight", 5);
    assert.equal(r.x, 30);
    assert.equal(r.y, 40);
  });

  test("clamps to the canvas right / bottom edge", () => {
    const b = box(80, 80, 15, 15);
    assert.deepEqual(resizeBoxByStep(b, "ArrowRight", 10), box(80, 80, 20, 15));
    assert.deepEqual(resizeBoxByStep(b, "ArrowDown", 10), box(80, 80, 15, 20));
  });

  test("clamps to the minimum size and never inverts", () => {
    const b = box(10, 10, 3, 3);
    assert.deepEqual(
      resizeBoxByStep(b, "ArrowLeft", 10, { minPct: 2 }),
      box(10, 10, 2, 3),
    );
    assert.deepEqual(
      resizeBoxByStep(b, "ArrowUp", 10, { minPct: 2 }),
      box(10, 10, 3, 2),
    );
  });

  test("respects a custom canvas extent", () => {
    const b = box(0, 0, 40, 40);
    assert.deepEqual(
      resizeBoxByStep(b, "ArrowRight", 100, {
        canvas: { width: 50, height: 50 },
      }),
      box(0, 0, 50, 40),
    );
  });

  test("returns the same reference when clamped to a no-op", () => {
    const b = box(90, 10, 10, 10);
    assert.equal(resizeBoxByStep(b, "ArrowRight", 5), b);
  });
});

describe("canvas-a11y: isArrowKey", () => {
  test("recognises only the four arrow keys", () => {
    assert.equal(isArrowKey("ArrowLeft"), true);
    assert.equal(isArrowKey("ArrowRight"), true);
    assert.equal(isArrowKey("ArrowUp"), true);
    assert.equal(isArrowKey("ArrowDown"), true);
    assert.equal(isArrowKey("Enter"), false);
    assert.equal(isArrowKey("a"), false);
  });
});

// ---------------------------------------------------------------------------
// orderedElementIds + nextElementId
// ---------------------------------------------------------------------------

describe("canvas-a11y: orderedElementIds", () => {
  test("sorts top→bottom then left→right", () => {
    const els = [
      { id: "c", box: box(0, 50, 10, 10) },
      { id: "b", box: box(50, 0, 10, 10) },
      { id: "a", box: box(0, 0, 10, 10) },
    ];
    assert.deepEqual(orderedElementIds(els), ["a", "b", "c"]);
  });

  test("breaks ties on equal position by id for stability", () => {
    const els = [
      { id: "z", box: box(0, 0, 10, 10) },
      { id: "a", box: box(0, 0, 10, 10) },
    ];
    assert.deepEqual(orderedElementIds(els), ["a", "z"]);
  });

  test("does not mutate the input array", () => {
    const els = [
      { id: "b", box: box(0, 50, 10, 10) },
      { id: "a", box: box(0, 0, 10, 10) },
    ];
    orderedElementIds(els);
    assert.equal(els[0].id, "b");
  });
});

describe("canvas-a11y: nextElementId", () => {
  const ids = ["a", "b", "c"];

  test("moves forward and wraps", () => {
    assert.equal(nextElementId(ids, "a", 1), "b");
    assert.equal(nextElementId(ids, "c", 1), "a");
  });

  test("moves backward and wraps", () => {
    assert.equal(nextElementId(ids, "b", -1), "a");
    assert.equal(nextElementId(ids, "a", -1), "c");
  });

  test("starts at first (forward) / last (backward) when nothing current", () => {
    assert.equal(nextElementId(ids, null, 1), "a");
    assert.equal(nextElementId(ids, null, -1), "c");
    assert.equal(nextElementId(ids, "missing", 1), "a");
  });

  test("returns null for an empty list", () => {
    assert.equal(nextElementId([], "a", 1), null);
  });
});

// ---------------------------------------------------------------------------
// focusTargetAfterDelete
// ---------------------------------------------------------------------------

describe("canvas-a11y: focusTargetAfterDelete", () => {
  const ids = ["a", "b", "c", "d"];

  test("focuses the next surviving element after the deleted one", () => {
    assert.equal(focusTargetAfterDelete(ids, new Set(["b"])), "c");
  });

  test("falls back to the previous element when deleting the last", () => {
    assert.equal(focusTargetAfterDelete(ids, new Set(["d"])), "c");
  });

  test("skips contiguous deletions to the next survivor", () => {
    assert.equal(focusTargetAfterDelete(ids, new Set(["b", "c"])), "d");
  });

  test("returns null when everything is deleted", () => {
    assert.equal(focusTargetAfterDelete(ids, new Set(ids)), null);
  });

  test("returns null when nothing is deleted", () => {
    assert.equal(focusTargetAfterDelete(ids, new Set()), null);
  });
});

// ---------------------------------------------------------------------------
// announcement builders
// ---------------------------------------------------------------------------

describe("canvas-a11y: announcement builders", () => {
  test("announces selected element label", () => {
    assert.equal(announceSelection("Title text"), "Selected Title text");
  });

  test("move rounds coordinates", () => {
    assert.equal(announceMove("Box", 12.4, 33.6), "Moved Box to 12%, 34%");
  });

  test("move preserves the selected label while rounding signed coordinates", () => {
    assert.equal(
      announceMove("Chart A", -1.5, 0.5),
      "Moved Chart A to -1%, 1%",
    );
  });

  test("resize rounds dimensions", () => {
    assert.equal(announceResize("Box", 20.2, 9.8), "Resized Box to 20% by 10%");
  });

  test("announces deleted element label", () => {
    assert.equal(announceDelete("Box"), "Deleted Box");
  });
});

// ---------------------------------------------------------------------------
// connector helpers
// ---------------------------------------------------------------------------

describe("canvas-a11y: connector helpers", () => {
  const connector: ConnectorElement = {
    id: "conn",
    kind: "connector",
    box: box(0, 0, 10, 10),
    zIndex: 1,
    content: {
      kind: "connector",
      start: { elementId: "a", anchor: "right" },
      end: { elementId: "b", anchor: "left" },
    },
  };
  const line: ShapeElement = {
    id: "line",
    kind: "shape",
    content: { kind: "shape", shape: "line" },
    box: box(0, 0, 10, 10),
    zIndex: 1,
    designOverrides: { fill: { value: "#000000" } },
  };

  test("isConnectableElement excludes connectors and line shapes", () => {
    assert.equal(isConnectableElement(textEl("t", box(0, 0, 10, 10))), true);
    assert.equal(isConnectableElement(connector), false);
    assert.equal(isConnectableElement(line), false);
  });

  test("defaultAnchorPair picks facing anchors on the dominant axis", () => {
    assert.deepEqual(defaultAnchorPair(box(0, 0, 10, 10), box(40, 0, 10, 10)), {
      start: "right",
      end: "left",
    });
    assert.deepEqual(defaultAnchorPair(box(40, 0, 10, 10), box(0, 0, 10, 10)), {
      start: "left",
      end: "right",
    });
    assert.deepEqual(defaultAnchorPair(box(0, 0, 10, 10), box(0, 40, 10, 10)), {
      start: "bottom",
      end: "top",
    });
    assert.deepEqual(defaultAnchorPair(box(0, 40, 10, 10), box(0, 0, 10, 10)), {
      start: "top",
      end: "bottom",
    });
  });

  test("connectorBoundingBox spans both points with a minimum extent", () => {
    assert.deepEqual(
      connectorBoundingBox({ x: 10, y: 20 }, { x: 40, y: 20 }),
      box(10, 20, 30, 1),
    );
    assert.deepEqual(
      connectorBoundingBox({ x: 40, y: 50 }, { x: 10, y: 20 }),
      box(10, 20, 30, 30),
    );
  });

  test("selectedConnectablePair returns the pair in reading order", () => {
    const elements: SlideElement[] = [
      textEl("right", box(50, 0, 10, 10)),
      textEl("left", box(0, 0, 10, 10)),
    ];
    const pair = selectedConnectablePair(elements, new Set(["right", "left"]));
    assert.ok(pair);
    assert.equal(pair![0].id, "left");
    assert.equal(pair![1].id, "right");
  });

  test("selectedConnectablePair is null unless exactly two connectables", () => {
    const elements: SlideElement[] = [
      textEl("a", box(0, 0, 10, 10)),
      textEl("b", box(50, 0, 10, 10)),
      connector,
    ];
    assert.equal(selectedConnectablePair(elements, new Set(["a"])), null);
    assert.equal(
      selectedConnectablePair(elements, new Set(["a", "b", "conn"])),
      null,
    );
    assert.equal(
      selectedConnectablePair(elements, new Set(["a", "conn"])),
      null,
    );
  });

  test("buildConnectorBetween binds default endpoints and a spanning box", () => {
    const a = textEl("a", box(0, 0, 10, 10));
    const b = textEl("b", box(40, 0, 10, 10));
    const built = buildConnectorBetween(a, b);
    assert.equal(built.kind, "connector");
    assert.deepEqual(built.content.start, { elementId: "a", anchor: "right" });
    assert.deepEqual(built.content.end, { elementId: "b", anchor: "left" });
    assert.equal(built.designOverrides?.arrowEnd, "arrow");
    // right anchor of a = (10, 5); left anchor of b = (40, 5)
    assert.deepEqual(built.box, box(10, 5, 30, 1));
    assert.ok(!("id" in built));
    assert.ok(!("zIndex" in built));
  });

  test("cycleEndpointAnchor advances a bound endpoint's anchor", () => {
    // CONNECTOR_ANCHORS order: center, top, bottom, left, right.
    const next = cycleEndpointAnchor(connector, "end", 1);
    assert.notEqual(next, connector);
    // end "left" (index 3) + 1 → "right"
    assert.deepEqual(next.content.end, { elementId: "b", anchor: "right" });
    // start "right" (index 4) - 1 → "left"
    const prev = cycleEndpointAnchor(connector, "start", -1);
    assert.deepEqual(prev.content.start, {
      elementId: "a",
      anchor: "left",
    });
  });

  test("cycleEndpointAnchor is a no-op for a free endpoint", () => {
    const freeEnd: ConnectorElement = {
      ...connector,
      content: { ...connector.content, end: { x: 50, y: 50 } },
    };
    assert.equal(cycleEndpointAnchor(freeEnd, "end", 1), freeEnd);
  });
});

// ---------------------------------------------------------------------------
// #535 — canvasShortcutHelp
// ---------------------------------------------------------------------------

describe("canvas-a11y: canvasShortcutHelp (#535)", () => {
  test("returns labelled groups with non-empty entries", () => {
    const groups = canvasShortcutHelp();
    assert.ok(groups.length >= 5);
    for (const group of groups) {
      assert.ok(group.title.length > 0);
      assert.ok(group.entries.length > 0);
      for (const entry of group.entries) {
        assert.ok(entry.keys.length > 0);
        assert.ok(entry.description.length > 0);
      }
    }
  });

  test("documents traversal, edit, resize, and connector shortcuts", () => {
    const flat = canvasShortcutHelp().flatMap((g) => g.entries);
    assert.ok(flat.some((e) => e.keys === "Alt + Arrow"));
    assert.ok(flat.some((e) => e.keys === "Alt + Shift + Arrow"));
    assert.ok(flat.some((e) => e.keys === "[ / ]"));
    assert.ok(flat.some((e) => e.keys === "Shift + [ / ]"));
    assert.ok(flat.some((e) => e.keys === "Tab / Shift + Tab"));
    assert.ok(flat.some((e) => e.keys === "Enter"));
    assert.ok(flat.some((e) => e.keys === "C / Shift + C"));
  });

  test("uses ⌘ on mac and Ctrl elsewhere", () => {
    const mac = canvasShortcutHelp({ isMac: true }).flatMap((g) => g.entries);
    const win = canvasShortcutHelp({ isMac: false }).flatMap((g) => g.entries);
    assert.ok(mac.some((e) => e.keys.includes("⌘")));
    assert.ok(win.some((e) => e.keys.includes("Ctrl")));
  });
});
