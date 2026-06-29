import assert from "node:assert/strict";
import { test } from "node:test";

import type { LexicalCommand, LexicalEditor } from "lexical";

import type { EditorContextSnapshot } from "./editor-context";
import { isToolActive, toolsFor, VISUAL_KIND_META } from "./tool-registry";
import { TOOL_ACTIVE, TOOL_VALUES, TOOL_VISIBILITY } from "./tool-predicates";

function ctx(
  overrides: Partial<EditorContextSnapshot> = {},
): EditorContextSnapshot {
  return {
    kind: "range",
    editable: true,
    isCollapsed: false,
    blockType: "paragraph",
    activeFormats: new Set(),
    elementFormat: "",
    textColor: "",
    highlightColor: "",
    isLink: false,
    blockKey: "live-block-key",
    blockBid: "bid-stable-1",
    selectionText: "hello",
    isEmptyBlock: false,
    rects: { selection: null, block: null },
    ...overrides,
  };
}

test("toolsFor preserves public grouping and pure active predicates", () => {
  const snapshot = ctx({ activeFormats: new Set(["bold"]) });
  const tools = toolsFor("text-format", snapshot);
  const bold = tools.find((tool) => tool.id === "format-bold");

  assert.ok(bold, "expected bold text-format tool");
  assert.equal(isToolActive(bold, snapshot), true);
  assert.equal(bold.action.label, "Bold");
  assert.equal(bold.action.shortcutId, "editor.format.bold");
  assert.deepEqual(
    toolsFor("text-format", ctx({ editable: false })),
    [],
    "pure visibility predicate should only inspect the snapshot",
  );
});

test("visual metadata resolves icons without coupling predicates to components", () => {
  assert.equal(VISUAL_KIND_META.flowchart.label, "Flowchart");
  assert.ok(VISUAL_KIND_META.flowchart.icon);
  assert.equal(VISUAL_KIND_META.matrix.description, "2×2 quadrant grid");
});

test("visual insert run dispatches only transient NodeKey payload", () => {
  const visualTool = toolsFor("visual-insert", ctx()).find(
    (tool) => tool.id === "insert-visual-flowchart",
  );
  assert.ok(visualTool?.run, "expected a visual insert runner");

  const payloads: unknown[] = [];
  const editor = {
    dispatchCommand(command: LexicalCommand<unknown>, payload: unknown) {
      assert.ok(command);
      payloads.push(payload);
      return true;
    },
  } as LexicalEditor;

  visualTool.run(editor, ctx());

  assert.deepEqual(payloads, [
    {
      kind: "flowchart",
      afterNodeKey: "live-block-key",
    },
  ]);
});

test("tool predicates cover alignment defaults and color value readers", () => {
  assert.equal(TOOL_VISIBILITY.editable(ctx({ editable: true })), true);
  assert.equal(TOOL_VISIBILITY.editable(ctx({ editable: false })), false);
  assert.equal(
    TOOL_VISIBILITY.rangeSelection(ctx({ kind: "collapsed" })),
    false,
  );
  assert.equal(TOOL_ACTIVE.alignLeft(ctx({ elementFormat: "" })), true);
  assert.equal(TOOL_ACTIVE.alignLeft(ctx({ elementFormat: "start" })), true);
  assert.equal(TOOL_ACTIVE.alignCenter(ctx({ elementFormat: "center" })), true);
  assert.equal(TOOL_ACTIVE.h3(ctx({ blockType: "h3" })), true);
  assert.equal(TOOL_ACTIVE.highlightColor(ctx({ highlightColor: "" })), false);
  assert.equal(TOOL_ACTIVE.textColor(ctx({ textColor: "#111111" })), true);
  assert.equal(TOOL_VALUES.textColor(ctx({ textColor: "#111111" })), "#111111");
  assert.equal(
    TOOL_VALUES.highlightColor(ctx({ highlightColor: "#eeeeee" })),
    "#eeeeee",
  );
});

test("block insert registry exposes ordered list metadata and remains hidden when read-only", () => {
  const tools = toolsFor("block-insert", ctx());
  const number = tools.find((tool) => tool.id === "insert-number");
  assert.ok(number, "expected numbered list insertion tool");
  assert.equal(number.label, "Numbered list");
  assert.deepEqual(number.keywords, ["numbered", "ordered", "list", "ol"]);
  assert.equal(Boolean(number.run), true);
  const table = tools.find((tool) => tool.id === "insert-table");
  assert.ok(table, "expected table insertion tool");
  assert.equal(table.label, "Table");
  assert.deepEqual(table.keywords, ["table", "grid", "rows", "columns"]);

  assert.deepEqual(toolsFor("block-insert", ctx({ editable: false })), []);
});
