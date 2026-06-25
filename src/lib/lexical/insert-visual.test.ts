import assert from "node:assert/strict";
import { test } from "node:test";

import { createHeadlessEditor } from "@lexical/headless";
import { LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isNodeSelection,
  type LexicalEditor,
} from "lexical";

import {
  VISUAL_KINDS,
  safeParseVisual,
  type VisualKind,
} from "@/lib/visual/schema";

import {
  $createVisualNode,
  $isVisualNode,
  VisualNode,
  type SerializedVisualNode,
} from "@/lib/lexical/visual-node";

import { $insertBlankVisualAfter } from "./insert-visual";

/**
 * Headless editor wired with the SAME node set the app registers in
 * `lexical-editor.tsx` (`NODES`), so the insertion routine is exercised against
 * a representative document.
 */
function makeEditor(): LexicalEditor {
  return createHeadlessEditor({
    namespace: "insert-visual-test",
    nodes: [
      HeadingNode,
      QuoteNode,
      ListNode,
      ListItemNode,
      LinkNode,
      HorizontalRuleNode,
      VisualNode,
    ],
    onError(error) {
      throw error;
    },
  });
}

/** Collects the type tags of the root's children in document order. */
function rootChildTypes(editor: LexicalEditor): string[] {
  return editor.getEditorState().read(() =>
    $getRoot()
      .getChildren()
      .map((node) => node.getType()),
  );
}

/** Returns the single VisualNode in the document, asserting there is exactly one. */
function onlyVisual(editor: LexicalEditor): VisualNode {
  return editor.getEditorState().read(() => {
    const visuals = $getRoot()
      .getChildren()
      .filter((node): node is VisualNode => $isVisualNode(node));
    assert.equal(visuals.length, 1, "expected exactly one VisualNode");
    return visuals[0];
  });
}

test("inserting a visual creates exactly one schema-valid VisualNode of the requested kind", () => {
  const editor = makeEditor();
  editor.update(
    () => {
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode("intro"));
      $getRoot().clear().append(paragraph);
      paragraph.selectStart();
    },
    { discrete: true },
  );

  editor.update(() => $insertBlankVisualAfter({ kind: "flowchart" }), {
    discrete: true,
  });

  const visual = onlyVisual(editor);
  const payload = editor.getEditorState().read(() => visual.getVisual());

  const parsed = safeParseVisual(payload);
  assert.equal(
    parsed.success,
    true,
    "inserted visual payload should be schema-valid",
  );
  assert.equal(payload.type, "flowchart");
});

test("with afterNodeKey set, the visual lands immediately after the targeted block", () => {
  const editor = makeEditor();
  let secondKey = "";
  editor.update(
    () => {
      const root = $getRoot().clear();
      const first = $createParagraphNode();
      first.append($createTextNode("first"));
      const second = $createParagraphNode();
      second.append($createTextNode("second"));
      const third = $createParagraphNode();
      third.append($createTextNode("third"));
      root.append(first, second, third);
      secondKey = second.getKey();
      // Caret in `third` proves afterNodeKey wins over the current selection.
      third.selectStart();
    },
    { discrete: true },
  );

  editor.update(
    () => $insertBlankVisualAfter({ kind: "mindmap", afterNodeKey: secondKey }),
    { discrete: true },
  );

  // paragraph(first), paragraph(second), visual, paragraph(third)
  assert.deepEqual(rootChildTypes(editor), [
    "paragraph",
    "paragraph",
    "visual",
    "paragraph",
  ]);

  const visualIndex = editor.getEditorState().read(() => {
    const children = $getRoot().getChildren();
    return children.findIndex((node) => $isVisualNode(node));
  });
  assert.equal(
    visualIndex,
    2,
    "visual should sit right after the targeted second block",
  );
});

test("without afterNodeKey, the visual lands after the current selection's block", () => {
  const editor = makeEditor();
  editor.update(
    () => {
      const root = $getRoot().clear();
      const first = $createParagraphNode();
      first.append($createTextNode("first"));
      const second = $createParagraphNode();
      second.append($createTextNode("second"));
      root.append(first, second);
      // Selection sits in `first`, so the visual should follow `first`.
      first.selectStart();
    },
    { discrete: true },
  );

  editor.update(() => $insertBlankVisualAfter({ kind: "list" }), {
    discrete: true,
  });

  // paragraph(first), visual, paragraph(second)
  assert.deepEqual(rootChildTypes(editor), [
    "paragraph",
    "visual",
    "paragraph",
  ]);
});

test("with no resolvable target, the visual is appended at the document end", () => {
  const editor = makeEditor();
  editor.update(
    () => {
      const root = $getRoot().clear();
      const first = $createParagraphNode();
      first.append($createTextNode("first"));
      const second = $createParagraphNode();
      second.append($createTextNode("second"));
      root.append(first, second);
      // No selection and no afterNodeKey → fallback to root append.
    },
    { discrete: true },
  );

  editor.update(() => $insertBlankVisualAfter({ kind: "timeline" }), {
    discrete: true,
  });

  assert.deepEqual(rootChildTypes(editor), [
    "paragraph",
    "paragraph",
    "visual",
  ]);
});

test("the inserted visual is selected as a NodeSelection", () => {
  const editor = makeEditor();
  editor.update(
    () => {
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode("intro"));
      $getRoot().clear().append(paragraph);
      paragraph.selectStart();
    },
    { discrete: true },
  );

  editor.update(() => $insertBlankVisualAfter({ kind: "chart" }), {
    discrete: true,
  });

  const visual = onlyVisual(editor);
  const result = editor.getEditorState().read(() => {
    const selection = $getSelection();
    return {
      isNodeSelection: $isNodeSelection(selection),
      selectedKeys: $isNodeSelection(selection)
        ? selection.getNodes().map((n) => n.getKey())
        : [],
      visualKey: visual.getKey(),
    };
  });

  assert.equal(
    result.isNodeSelection,
    true,
    "selection should be a NodeSelection",
  );
  assert.deepEqual(result.selectedKeys, [result.visualKey]);
});

test("the inserted visual round-trips through exportJSON/importJSON and re-validates", () => {
  const editor = makeEditor();
  editor.update(
    () => {
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode("intro"));
      $getRoot().clear().append(paragraph);
      paragraph.selectStart();
    },
    { discrete: true },
  );

  editor.update(() => $insertBlankVisualAfter({ kind: "concept" }), {
    discrete: true,
  });

  const serialized: SerializedVisualNode = editor
    .getEditorState()
    .read(() => onlyVisualInState().exportJSON());

  // Re-validate the serialized payload exactly as contentJson would persist it.
  const parsed = safeParseVisual(serialized.visual);
  assert.equal(parsed.success, true, "serialized payload should re-validate");
  assert.equal(serialized.type, "visual");
  assert.equal(serialized.visual.type, "concept");

  // Re-hydrate via importJSON inside an editor and confirm it survives.
  let rehydratedKind: VisualKind | undefined;
  editor.update(
    () => {
      const node = VisualNode.importJSON(serialized);
      rehydratedKind = node.getVisual().type;
    },
    { discrete: true },
  );
  assert.equal(rehydratedKind, "concept");

  function onlyVisualInState(): VisualNode {
    const visuals = $getRoot()
      .getChildren()
      .filter((n): n is VisualNode => $isVisualNode(n));
    assert.equal(visuals.length, 1);
    return visuals[0];
  }
});

test("every VisualKind seeds a schema-valid, kind-matching visual on insert", () => {
  for (const kind of VISUAL_KINDS) {
    const editor = makeEditor();
    editor.update(
      () => {
        const paragraph = $createParagraphNode();
        $getRoot().clear().append(paragraph);
        paragraph.selectStart();
      },
      { discrete: true },
    );

    editor.update(() => $insertBlankVisualAfter({ kind }), { discrete: true });

    const node = onlyVisual(editor);
    const payload = editor.getEditorState().read(() => node.getVisual());

    const parsed = safeParseVisual(payload);
    assert.equal(
      parsed.success,
      true,
      `visual for kind ${kind} should be valid`,
    );
    assert.equal(
      payload.type,
      kind,
      `inserted visual should match kind ${kind}`,
    );
  }
});

test("$createVisualNode + $isVisualNode interop holds for the inserted node", () => {
  const editor = makeEditor();
  editor.update(
    () => {
      const paragraph = $createParagraphNode();
      $getRoot().clear().append(paragraph);
      paragraph.selectStart();
      // Sanity: a freshly created node is recognized by the type guard.
      const probe = $createVisualNode({
        version: 1,
        type: "funnel",
        width: 100,
        height: 100,
        nodes: [],
        edges: [],
        style: {
          palette: ["#000000"],
          background: "#ffffff",
          nodeFill: "#ffffff",
          nodeStroke: "#000000",
          nodeText: "#000000",
          edgeColor: "#000000",
          fontFamily: "sans-serif",
          fontSize: 14,
          fontWeight: 600,
        },
      });
      assert.equal($isVisualNode(probe), true);
    },
    { discrete: true },
  );

  editor.update(() => $insertBlankVisualAfter({ kind: "funnel" }), {
    discrete: true,
  });

  // After insert there is exactly one visual at the document root.
  assert.equal(rootChildTypes(editor).filter((t) => t === "visual").length, 1);
});
