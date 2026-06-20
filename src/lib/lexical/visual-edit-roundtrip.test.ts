import assert from "node:assert/strict";
import { test } from "node:test";

import { createHeadlessEditor } from "@lexical/headless";
import { createEmptyHistoryState, registerHistory } from "@lexical/history";
import { LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import {
  $createParagraphNode,
  $getRoot,
  UNDO_COMMAND,
  type LexicalEditor,
} from "lexical";

import {
  safeParseVisual,
  type Visual,
  type VisualKind,
} from "@/lib/visual/schema";
import { STYLE_THEMES } from "@/lib/visual/themes";
import {
  applyTheme,
  isThemeActive,
  setNodeStyle,
  setVisualKind,
  setVisualStyle,
} from "@/lib/visual/transforms";

import {
  $isVisualNode,
  VisualNode,
  type SerializedVisualNode,
} from "@/app/app/documents/[id]/visual-node";

import { $insertBlankVisualAfter } from "./insert-visual";

/**
 * Headless editor wired with the SAME node set the app registers in
 * `lexical-editor.tsx`, so the edit/restyle round-trip is exercised against a
 * representative document — and through the real `VisualNode` serialization that
 * backs the `contentJson` persistence boundary.
 */
function makeEditor(): LexicalEditor {
  return createHeadlessEditor({
    namespace: "visual-edit-roundtrip-test",
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

/**
 * Seeds a document with a single blank visual of `kind` (via the real insert
 * routine) and returns the editor plus the inserted node's key.
 */
function seedVisual(kind: VisualKind): { editor: LexicalEditor; key: string } {
  const editor = makeEditor();
  editor.update(
    () => {
      const paragraph = $createParagraphNode();
      $getRoot().clear().append(paragraph);
      paragraph.selectStart();
    },
    { discrete: true },
  );

  let key = "";
  editor.update(
    () => {
      key = $insertBlankVisualAfter({ kind }).getKey();
    },
    { discrete: true },
  );
  return { editor, key };
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

/** Reads the current Visual payload off the single VisualNode. */
function readVisual(editor: LexicalEditor): Visual {
  const node = onlyVisual(editor);
  return editor.getEditorState().read(() => node.getVisual());
}

/**
 * Serializes the single VisualNode (the `contentJson` persistence boundary),
 * then re-hydrates it via `VisualNode.importJSON` and returns the resulting
 * Visual — simulating a save → reload round-trip.
 */
function roundTripThroughJSON(editor: LexicalEditor): {
  serialized: SerializedVisualNode;
  rehydrated: Visual;
} {
  const node = onlyVisual(editor);
  const serialized = editor.getEditorState().read(() => node.exportJSON());

  let rehydrated: Visual | undefined;
  editor.update(
    () => {
      rehydrated = VisualNode.importJSON(serialized).getVisual();
    },
    { discrete: true },
  );
  assert.ok(rehydrated, "importJSON should yield a Visual");
  return { serialized, rehydrated };
}

/** Applies a transform to the selected visual via the real node.setVisual flow. */
function editVisual(
  editor: LexicalEditor,
  transform: (current: Visual) => Visual,
): void {
  editor.update(
    () => {
      const node = onlyVisual(editor);
      node.setVisual(transform(node.getVisual()));
    },
    { discrete: true },
  );
}

test("applyTheme persists into the node and survives exportJSON/importJSON for every theme", () => {
  for (const theme of STYLE_THEMES) {
    const { editor } = seedVisual("flowchart");

    // Sanity: a fresh blank visual is NOT already on this theme.
    const before = readVisual(editor);
    assert.equal(
      isThemeActive(before, theme.id),
      false,
      `blank visual should not already match theme ${theme.id}`,
    );

    editVisual(editor, (current) => applyTheme(current, theme.id));

    const after = readVisual(editor);
    assert.equal(
      isThemeActive(after, theme.id),
      true,
      `node Visual should reflect theme ${theme.id} after setVisual`,
    );
    assert.equal(
      after.type,
      "flowchart",
      "kind/structure preserved across restyle",
    );
    assert.equal(
      after.nodes.length,
      before.nodes.length,
      "node count preserved",
    );
    assert.equal(
      after.edges.length,
      before.edges.length,
      "edge count preserved",
    );
    assert.equal(
      safeParseVisual(after).success,
      true,
      `themed visual ${theme.id} should be schema-valid`,
    );

    const { serialized, rehydrated } = roundTripThroughJSON(editor);
    assert.equal(serialized.type, "visual");
    assert.equal(
      isThemeActive(rehydrated, theme.id),
      true,
      `theme ${theme.id} should survive the contentJson round-trip`,
    );
    assert.equal(safeParseVisual(serialized.visual).success, true);
  }
});

test("applyTheme preserves typography (font fields untouched by the theme)", () => {
  const { editor } = seedVisual("mindmap");
  const before = readVisual(editor);

  editVisual(editor, (current) => applyTheme(current, "ocean"));

  const after = readVisual(editor);
  assert.equal(after.style.fontFamily, before.style.fontFamily);
  assert.equal(after.style.fontSize, before.style.fontSize);
  assert.equal(after.style.fontWeight, before.style.fontWeight);
});

test("setVisualKind switches the selected visual's kind and round-trips through JSON", () => {
  const { editor } = seedVisual("flowchart");
  const before = readVisual(editor);
  const labelsBefore = before.nodes.map((n) => n.label).sort();

  editVisual(editor, (current) => setVisualKind(current, "list"));

  const after = readVisual(editor);
  assert.equal(after.type, "list", "node Visual should reflect the new kind");
  assert.equal(
    safeParseVisual(after).success,
    true,
    "switched visual should be schema-valid for the new kind",
  );
  // Node labels are preserved across a kind switch (only layout is derived).
  assert.deepEqual(after.nodes.map((n) => n.label).sort(), labelsBefore);
  // A list is a derived-layout kind: stale x/y are dropped.
  for (const node of after.nodes) {
    assert.equal(node.x, undefined, "list nodes should drop x");
    assert.equal(node.y, undefined, "list nodes should drop y");
  }

  const { serialized, rehydrated } = roundTripThroughJSON(editor);
  assert.equal(serialized.visual.type, "list");
  assert.equal(
    rehydrated.type,
    "list",
    "new kind should survive the JSON round-trip",
  );
  assert.equal(safeParseVisual(serialized.visual).success, true);
});

test("setVisualKind to a positioned kind assigns fresh coordinates and round-trips", () => {
  const { editor } = seedVisual("list");

  editVisual(editor, (current) => setVisualKind(current, "flowchart"));

  const after = readVisual(editor);
  assert.equal(after.type, "flowchart");
  for (const node of after.nodes) {
    assert.equal(
      typeof node.x,
      "number",
      "flowchart nodes get an x coordinate",
    );
    assert.equal(typeof node.y, "number", "flowchart nodes get a y coordinate");
  }

  const { rehydrated } = roundTripThroughJSON(editor);
  assert.equal(rehydrated.type, "flowchart");
  assert.equal(safeParseVisual(rehydrated).success, true);
});

test("setVisualStyle (background) and setNodeStyle (fill/stroke/text) persist through the contentJson boundary", () => {
  const { editor } = seedVisual("concept");
  const targetId = readVisual(editor).nodes[0].id;

  editVisual(editor, (current) => {
    const themed = setVisualStyle(current, { background: "#101010" });
    const filled = setNodeStyle(themed, targetId, "color", "#ff0000");
    const stroked = setNodeStyle(filled, targetId, "stroke", "#00ff00");
    return setNodeStyle(stroked, targetId, "textColor", "#0000ff");
  });

  const after = readVisual(editor);
  assert.equal(
    after.style.background,
    "#101010",
    "background persists into the node",
  );
  const target = after.nodes.find((n) => n.id === targetId);
  assert.ok(target, "target node should still exist");
  assert.equal(target.color, "#ff0000");
  assert.equal(target.stroke, "#00ff00");
  assert.equal(target.textColor, "#0000ff");

  // contentJson source-of-truth invariant: it all survives serialize → rehydrate.
  const { serialized, rehydrated } = roundTripThroughJSON(editor);
  assert.equal(serialized.visual.style.background, "#101010");
  assert.equal(rehydrated.style.background, "#101010");
  const rehydratedTarget = rehydrated.nodes.find((n) => n.id === targetId);
  assert.ok(rehydratedTarget);
  assert.equal(rehydratedTarget.color, "#ff0000");
  assert.equal(rehydratedTarget.stroke, "#00ff00");
  assert.equal(rehydratedTarget.textColor, "#0000ff");
  assert.equal(safeParseVisual(serialized.visual).success, true);
});

test("transforms + setVisual produce a NEW Visual; the previously-read Visual is not mutated", () => {
  const { editor } = seedVisual("flowchart");

  // Capture the Visual reference + a snapshot of its observable fields BEFORE editing.
  const original = readVisual(editor);
  const originalBackground = original.style.background;
  const originalPalette = [...original.style.palette];
  const originalType = original.type;
  const originalFirstNodeColor = original.nodes[0].color;

  editVisual(editor, (current) => {
    const themed = applyTheme(current, "grape");
    const kinded = setVisualKind(themed, "list");
    return setNodeStyle(kinded, current.nodes[0].id, "color", "#abcdef");
  });

  // The previously-read object must be untouched (no shared-reference mutation
  // leaking back into Yjs/contentJson).
  assert.equal(original.type, originalType, "captured Visual.type unchanged");
  assert.equal(
    original.style.background,
    originalBackground,
    "captured background unchanged",
  );
  assert.deepEqual(
    original.style.palette,
    originalPalette,
    "captured palette unchanged",
  );
  assert.equal(
    original.nodes[0].color,
    originalFirstNodeColor,
    "captured node color unchanged",
  );

  // And the node genuinely advanced to the new state.
  const after = readVisual(editor);
  assert.equal(after.type, "list");
  assert.equal(isThemeActive(after, "grape"), true);
  assert.notEqual(after, original, "node now holds a different Visual object");
});

/**
 * Verifies that visual edits (setVisual) are undoable at sensible granularity.
 *
 * In the live editor the Yjs UndoManager handles undo; here we use
 * `@lexical/history` as the undo mechanism (no Yjs in headless tests) to verify
 * that:
 *  1. A visual edit via `node.setVisual()` is captured by a history listener.
 *  2. Dispatching `UNDO_COMMAND` synchronously reverts the visual to its
 *     pre-edit payload.
 *  3. The `VisualNode.__visual` property is properly stored in the Lexical editor
 *     state snapshot that the undo mechanism restores.
 *
 * The production constraint "do not add HistoryPlugin alongside the Yjs
 * UndoManager" applies only to the live collaborative editor.  Using
 * `registerHistory` here is correct: there is no Yjs binding in headless tests.
 */
test("visual edit → UNDO_COMMAND reverts the visual to its pre-edit state", () => {
  // Register history BEFORE seeding so the initial document updates are
  // captured as history entries — making the pre-edit state undoable.
  const editor = makeEditor();
  const historyState = createEmptyHistoryState();
  const unregister = registerHistory(editor, historyState, 0);

  // Seed the document (two discrete updates so each gets its own history entry).
  editor.update(
    () => {
      const paragraph = $createParagraphNode();
      $getRoot().clear().append(paragraph);
      paragraph.selectStart();
    },
    { discrete: true },
  );
  editor.update(
    () => {
      $insertBlankVisualAfter({ kind: "flowchart" });
    },
    { discrete: true },
  );

  // The seeded state is now the top of the undo stack as `current`.
  const baseline = readVisual(editor);

  // Apply a theme edit — marks the VisualNode dirty, history captures it and
  // pushes the seeded state onto the undoStack.
  editor.update(
    () => {
      const node = onlyVisual(editor);
      node.setVisual(applyTheme(node.getVisual(), "ocean"));
    },
    { discrete: true },
  );

  const after = readVisual(editor);
  assert.notEqual(
    after.style.background,
    baseline.style.background,
    "theme edit should change the visual background",
  );
  assert.ok(
    historyState.undoStack.length > 0,
    "undoStack should have an entry after the visual edit",
  );

  // Dispatch UNDO_COMMAND — handled synchronously by registerHistory, which
  // calls editor.setEditorState(prevState, { tag: HISTORIC_TAG }).
  // In headless tests without a DOM, the state restore is queued as a pending
  // update; a subsequent discrete update flushes it synchronously.
  editor.dispatchCommand(UNDO_COMMAND, undefined);
  editor.update(() => {}, { discrete: true });

  const reverted = readVisual(editor);
  assert.equal(
    reverted.style.background,
    baseline.style.background,
    "undo should revert the visual background to the pre-edit value",
  );
  assert.equal(
    reverted.type,
    baseline.type,
    "undo should preserve the visual kind",
  );
  assert.equal(
    reverted.nodes.length,
    baseline.nodes.length,
    "undo should preserve node count",
  );

  unregister();
});
