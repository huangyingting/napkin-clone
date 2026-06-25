import assert from "node:assert/strict";
import { test } from "node:test";

import type { LexicalCommand, LexicalEditor } from "lexical";

import type { EditorContextSnapshot } from "./editor-context";
import { isToolActive, toolsFor, VISUAL_KIND_META } from "./tool-registry";

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
