import assert from "node:assert/strict";
import { test, describe } from "node:test";

import { getQuickActionIds, type QuickActionId } from "./visual-quick-action-bar";

const ALL_ACTION_IDS: QuickActionId[] = [
  "colors",
  "layout",
  "duplicate",
  "delete",
  "more",
];

describe("getQuickActionIds", () => {
  test("returns all five action ids for a flowchart kind", () => {
    const ids = getQuickActionIds("flowchart");
    assert.deepStrictEqual(ids, ALL_ACTION_IDS);
  });

  test("includes the required mutation actions (duplicate and delete)", () => {
    const ids = getQuickActionIds("mindmap");
    assert.ok(ids.includes("duplicate"), "should include duplicate");
    assert.ok(ids.includes("delete"), "should include delete");
  });

  test("includes the navigation actions (colors, layout, more)", () => {
    const ids = getQuickActionIds("timeline");
    assert.ok(ids.includes("colors"), "should include colors");
    assert.ok(ids.includes("layout"), "should include layout");
    assert.ok(ids.includes("more"), "should include more");
  });

  test("returns same actions for all known visual kinds", () => {
    const kinds = [
      "flowchart",
      "mindmap",
      "timeline",
      "chart",
      "notes",
      "sequence",
      "kanban",
      "org",
      "er",
      "network",
    ] as const;
    for (const kind of kinds) {
      const ids = getQuickActionIds(kind);
      assert.strictEqual(
        ids.length,
        5,
        `expected 5 actions for ${kind}, got ${ids.length}`,
      );
      assert.deepStrictEqual(
        ids,
        ALL_ACTION_IDS,
        `action order should be stable for ${kind}`,
      );
    }
  });

  test("handles unknown kind strings without throwing", () => {
    assert.doesNotThrow(() => {
      const ids = getQuickActionIds("unknown-kind-xyz");
      assert.strictEqual(ids.length, 5);
    });
  });
});
