import assert from "node:assert/strict";
import { test } from "node:test";

import { createHeadlessEditor } from "@lexical/headless";
import { $getRoot } from "lexical";

import { FIXTURES } from "@/lib/visual/fixtures";
import { safeParseVisual } from "@/lib/visual/schema";

import { $createVisualNode, $isVisualNode, VisualNode } from "./visual-node";

function makeEditor() {
  return createHeadlessEditor({
    namespace: "visual-node-test",
    nodes: [VisualNode],
    onError(error) {
      throw error;
    },
  });
}

test("serializes and deserializes a visual node round-trip", () => {
  const visual = FIXTURES.flowchart;

  const editor = makeEditor();
  editor.update(
    () => {
      $getRoot().clear().append($createVisualNode(visual, "vis-1"));
    },
    { discrete: true },
  );

  const json = JSON.stringify(editor.getEditorState().toJSON());

  // Parse into a fresh editor to prove importJSON reconstructs the node.
  const editor2 = makeEditor();
  editor2.setEditorState(editor2.parseEditorState(json));

  editor2.getEditorState().read(() => {
    const node = $getRoot().getChildren().find($isVisualNode);
    assert.ok(node, "expected a VisualNode after round-trip");
    assert.equal(node.getVisualId(), "vis-1");
    assert.deepEqual(node.getVisual(), visual);
  });
});

test("exportJSON includes the visual payload, id, and node type", () => {
  const visual = FIXTURES.mindmap;
  const editor = makeEditor();

  editor.update(
    () => {
      $getRoot().clear().append($createVisualNode(visual, "vis-2"));
    },
    { discrete: true },
  );

  editor.getEditorState().read(() => {
    const node = $getRoot().getChildren().find($isVisualNode);
    assert.ok(node);
    const exported = node.exportJSON();
    assert.equal(exported.type, "visual");
    assert.equal(exported.visualId, "vis-2");
    assert.deepEqual(exported.visual, visual);
  });
});

test("generates a stable id when none is provided", () => {
  const editor = makeEditor();
  editor.update(
    () => {
      $getRoot().clear().append($createVisualNode(FIXTURES.list));
    },
    { discrete: true },
  );

  editor.getEditorState().read(() => {
    const node = $getRoot().getChildren().find($isVisualNode);
    assert.ok(node);
    assert.ok(
      node.getVisualId().length > 0,
      "expected an auto-generated visual id",
    );
  });
});

test("preserves an invalid payload through round-trip and flags it as invalid", () => {
  // The node stores whatever payload it is given; rendering uses safeParseVisual
  // to degrade gracefully, so a malformed visual must not break serialization.
  const broken = { not: "a visual" } as unknown as (typeof FIXTURES)["chart"];

  const editor = makeEditor();
  editor.update(
    () => {
      $getRoot().clear().append($createVisualNode(broken, "vis-bad"));
    },
    { discrete: true },
  );

  const json = JSON.stringify(editor.getEditorState().toJSON());

  const editor2 = makeEditor();
  editor2.setEditorState(editor2.parseEditorState(json));

  editor2.getEditorState().read(() => {
    const node = $getRoot().getChildren().find($isVisualNode);
    assert.ok(node, "expected the visual node to survive round-trip");
    const parsed = safeParseVisual(node.getVisual());
    assert.equal(
      parsed.success,
      false,
      "expected safeParseVisual to flag the broken payload",
    );
  });
});
