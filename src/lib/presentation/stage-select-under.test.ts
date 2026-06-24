import assert from "node:assert/strict";
import { test } from "node:test";

import type { ElementBox, SlideElement } from "./deck";
import type { HitTestCandidate } from "./stage-hit-test";
import {
  nextSelectUnderTarget,
  selectUnderTargets,
} from "./stage-select-under";

function box(x: number, y: number, w: number, h: number): ElementBox {
  return { x, y, w, h };
}

function rect(id: string, groupId?: string): SlideElement {
  return {
    id,
    kind: "shape",
    shape: "rect",
    color: "#333333",
    zIndex: 1,
    box: box(10, 10, 20, 20),
    ...(groupId ? { groupId } : {}),
  };
}

function hit(element: SlideElement, score: number): HitTestCandidate {
  return {
    element,
    box: element.box,
    score,
    reason: "shape-interior",
  };
}

test("selectUnderTargets preserves ranked hit order", () => {
  const elements = [rect("a"), rect("b"), rect("c")];
  const targets = selectUnderTargets(
    [hit(elements[2], 100), hit(elements[0], 90), hit(elements[1], 80)],
    elements,
  );

  assert.deepEqual(
    targets.map((target) => target.element.id),
    ["c", "a", "b"],
  );
});

test("nextSelectUnderTarget selects the top target when current selection is outside the stack", () => {
  const elements = [rect("a"), rect("b"), rect("outside")];

  const target = nextSelectUnderTarget(
    [hit(elements[0], 100), hit(elements[1], 90)],
    elements,
    {
      selectedElementIds: new Set(["outside"]),
    },
  );

  assert.equal(target?.element.id, "a");
});

test("nextSelectUnderTarget cycles after the currently selected target", () => {
  const elements = [rect("a"), rect("b"), rect("c")];

  const target = nextSelectUnderTarget(
    [hit(elements[0], 100), hit(elements[1], 90), hit(elements[2], 80)],
    elements,
    {
      selectedElementIds: new Set(["b"]),
    },
  );

  assert.equal(target?.element.id, "c");
});

test("nextSelectUnderTarget wraps back to the first target", () => {
  const elements = [rect("a"), rect("b")];

  const target = nextSelectUnderTarget(
    [hit(elements[0], 100), hit(elements[1], 90)],
    elements,
    {
      selectedElementIds: new Set(["b"]),
    },
  );

  assert.equal(target?.element.id, "a");
});

test("selectUnderTargets collapses unentered group members into one group target", () => {
  const elements = [rect("a", "g1"), rect("b", "g1"), rect("c")];

  const targets = selectUnderTargets(
    [hit(elements[1], 100), hit(elements[0], 90), hit(elements[2], 80)],
    elements,
  );

  assert.deepEqual(
    targets.map((target) => ({ kind: target.kind, ids: target.elementIds })),
    [
      { kind: "group", ids: ["a", "b"] },
      { kind: "element", ids: ["c"] },
    ],
  );
});

test("selectUnderTargets keeps entered group members separate", () => {
  const elements = [rect("a", "g1"), rect("b", "g1")];

  const targets = selectUnderTargets(
    [hit(elements[1], 100), hit(elements[0], 90)],
    elements,
    { groupEditingId: "g1" },
  );

  assert.deepEqual(
    targets.map((target) => target.elementIds),
    [["b"], ["a"]],
  );
});
