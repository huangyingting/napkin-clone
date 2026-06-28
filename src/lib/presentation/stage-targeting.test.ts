import assert from "node:assert/strict";
import { test } from "node:test";

import type { ElementBox, SlideElement } from "./deck";
import {
  groupedElementIds,
  isStageTargetSelected,
  preselectionFromStageTarget,
  resolveStageElementTarget,
  resolveStageHitTarget,
  samePreselection,
} from "./stage-targeting";

function box(x: number, y: number, w: number, h: number): ElementBox {
  return { x, y, w, h };
}

function rect(id: string, groupId?: string): SlideElement {
  return {
    id,
    kind: "shape",
    content: { kind: "shape", shape: "rect" },
    designOverrides: { fill: { value: "#333333" } },
    zIndex: 1,
    box: box(10, 10, 20, 20),
    ...(groupId ? { groupId } : {}),
  };
}

test("groupedElementIds returns group members in slide order", () => {
  const elements = [rect("a", "g1"), rect("b"), rect("c", "g1")];

  assert.deepEqual(groupedElementIds(elements, "g1"), ["a", "c"]);
});

test("resolveStageElementTarget resolves unentered group members to the group", () => {
  const elements = [rect("a", "g1"), rect("b", "g1"), rect("c")];

  const target = resolveStageElementTarget(elements[1], elements);

  assert.equal(target.kind, "group");
  assert.equal(target.element.id, "b");
  assert.equal(target.groupId, "g1");
  assert.deepEqual(target.elementIds, ["a", "b"]);
});

test("resolveStageElementTarget resolves entered group members individually", () => {
  const elements = [rect("a", "g1"), rect("b", "g1")];

  const target = resolveStageElementTarget(elements[1], elements, {
    groupEditingId: "g1",
  });

  assert.equal(target.kind, "element");
  assert.equal(target.element.id, "b");
  assert.deepEqual(target.elementIds, ["b"]);
});

test("resolveStageElementTarget treats single-member group ids as element targets", () => {
  const elements = [rect("a", "g1"), rect("b")];

  const target = resolveStageElementTarget(elements[0], elements);

  assert.equal(target.kind, "element");
  assert.deepEqual(target.elementIds, ["a"]);
});

test("resolveStageHitTarget preserves the raw hit element while returning group selection ids", () => {
  const elements = [rect("a", "g1"), rect("b", "g1")];
  const hit = {
    element: elements[1],
    box: elements[1].box,
    score: 100,
    reason: "shape-interior" as const,
  };

  const target = resolveStageHitTarget(hit, elements);

  assert.equal(target?.kind, "group");
  assert.equal(target?.element.id, "b");
  assert.deepEqual(target?.elementIds, ["a", "b"]);
});

test("isStageTargetSelected requires every group member to be selected", () => {
  const elements = [rect("a", "g1"), rect("b", "g1")];
  const target = resolveStageElementTarget(elements[0], elements);

  assert.equal(isStageTargetSelected(target, new Set(["a"])), false);
  assert.equal(isStageTargetSelected(target, new Set(["a", "b"])), true);
});

test("resolveStageHitTarget returns null for empty hits", () => {
  assert.equal(resolveStageHitTarget(null, []), null);
  assert.equal(resolveStageHitTarget(undefined, []), null);
});

test("preselectionFromStageTarget snapshots element and group targets", () => {
  const elements = [rect("a", "g1"), rect("b", "g1"), rect("c")];

  assert.deepEqual(
    preselectionFromStageTarget(
      resolveStageElementTarget(elements[2], elements),
    ),
    { kind: "element", elementId: "c" },
  );
  assert.deepEqual(
    preselectionFromStageTarget(
      resolveStageElementTarget(elements[0], elements),
    ),
    { kind: "group", groupId: "g1", elementIds: ["a", "b"] },
  );
});

test("samePreselection compares null, element, and ordered group snapshots", () => {
  assert.equal(samePreselection(null, null), true);
  assert.equal(
    samePreselection(null, { kind: "element", elementId: "a" }),
    false,
  );
  assert.equal(
    samePreselection(
      { kind: "element", elementId: "a" },
      { kind: "element", elementId: "a" },
    ),
    true,
  );
  assert.equal(
    samePreselection(
      { kind: "element", elementId: "a" },
      { kind: "group", groupId: "g1", elementIds: ["a"] },
    ),
    false,
  );
  assert.equal(
    samePreselection(
      { kind: "group", groupId: "g1", elementIds: ["a", "b"] },
      { kind: "group", groupId: "g1", elementIds: ["a", "b"] },
    ),
    true,
  );
  assert.equal(
    samePreselection(
      { kind: "group", groupId: "g1", elementIds: ["a", "b"] },
      { kind: "group", groupId: "g1", elementIds: ["a"] },
    ),
    false,
  );
  assert.equal(
    samePreselection(
      { kind: "group", groupId: "g1", elementIds: ["a", "b"] },
      { kind: "group", groupId: "g1", elementIds: ["b", "a"] },
    ),
    false,
  );
  assert.equal(
    samePreselection(
      { kind: "unknown" } as unknown as Parameters<typeof samePreselection>[0],
      { kind: "unknown" } as unknown as Parameters<typeof samePreselection>[1],
    ),
    false,
  );
});
