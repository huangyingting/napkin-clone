import assert from "node:assert/strict";
import { test } from "node:test";

import { createHeadlessEditor } from "@lexical/headless";
import { LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import {
  $getSelectionStyleValueForProperty,
  $patchStyleText,
} from "@lexical/selection";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  type ElementFormatType,
  type LexicalEditor,
  type TextFormatType,
} from "lexical";

import { VisualNode } from "@/app/app/documents/[id]/visual-node";

/**
 * Headless editor wired with the SAME node set the app registers in
 * `lexical-editor.tsx` (`NODES`), so the formatting operations are exercised
 * against a representative document. These tests target the underlying Lexical
 * selection operations directly (selection.formatText, ElementNode.setFormat,
 * $patchStyleText) — independent of the React command/tool-registry wiring.
 */
function makeEditor(): LexicalEditor {
  return createHeadlessEditor({
    namespace: "text-formatting-test",
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

/** Seeds the document with a single paragraph + text node and returns nothing. */
function seedParagraph(editor: LexicalEditor, content: string): void {
  editor.update(
    () => {
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode(content));
      $getRoot().clear().append(paragraph);
      paragraph.selectStart();
    },
    { discrete: true },
  );
}

/**
 * Snapshots the single leaf TextNode under the first block. Format checks and
 * style are resolved eagerly inside the read so the result is usable after the
 * read scope closes.
 */
function firstTextNode(editor: LexicalEditor): {
  hasFormat: (f: TextFormatType) => boolean;
  style: string;
} {
  return editor.getEditorState().read(() => {
    const block = $getRoot().getFirstChild();
    assert.ok(block && $isElementNode(block), "expected a block element");
    const text = block.getFirstChild();
    assert.ok(text && $isTextNode(text), "expected a leaf TextNode");
    const formats = new Set<TextFormatType>(
      (
        [
          "bold",
          "italic",
          "underline",
          "strikethrough",
          "code",
          "subscript",
          "superscript",
          "highlight",
        ] as const
      ).filter((f) => text.hasFormat(f)),
    );
    return { hasFormat: (f) => formats.has(f), style: text.getStyle() };
  });
}

/** Round-trips the whole document through exportJSON → importJSON in a fresh editor. */
function roundTrip(editor: LexicalEditor): LexicalEditor {
  const serialized = editor.getEditorState().toJSON();
  const next = makeEditor();
  const state = next.parseEditorState(JSON.stringify(serialized));
  next.setEditorState(state);
  return next;
}

// ---------------------------------------------------------------------------
// 1. INLINE CODE
// ---------------------------------------------------------------------------

test("inline code: formatText('code') marks the selected text node and toggles off", () => {
  const editor = makeEditor();
  seedParagraph(editor, "const x = 1");

  editor.update(
    () => {
      const block = $getRoot().getFirstChild();
      assert.ok(block && $isElementNode(block));
      const text = block.getFirstChild();
      assert.ok(text && $isTextNode(text));
      text.select(0, 11).formatText("code");
    },
    { discrete: true },
  );
  assert.equal(firstTextNode(editor).hasFormat("code"), true, "code applied");

  editor.update(
    () => {
      const selection = $getSelection();
      assert.ok($isRangeSelection(selection));
      selection.formatText("code");
    },
    { discrete: true },
  );
  assert.equal(
    firstTextNode(editor).hasFormat("code"),
    false,
    "code toggled off",
  );
});

test("inline code: hasFormat('code') survives exportJSON → importJSON", () => {
  const editor = makeEditor();
  seedParagraph(editor, "inline");

  editor.update(
    () => {
      const block = $getRoot().getFirstChild();
      assert.ok(block && $isElementNode(block));
      const text = block.getFirstChild();
      assert.ok(text && $isTextNode(text));
      text.select(0, 6).formatText("code");
    },
    { discrete: true },
  );

  const rehydrated = roundTrip(editor);
  assert.equal(
    firstTextNode(rehydrated).hasFormat("code"),
    true,
    "code format persists through serialization",
  );
});

// ---------------------------------------------------------------------------
// 2. ALIGNMENT (element format)
// ---------------------------------------------------------------------------

function readElementFormat(editor: LexicalEditor): ElementFormatType {
  return editor.getEditorState().read(() => {
    const block = $getRoot().getFirstChild();
    assert.ok(block && $isElementNode(block));
    return block.getFormatType();
  });
}

for (const alignment of ["center", "right"] as const) {
  test(`alignment: setFormat('${alignment}') reflects on the element and round-trips`, () => {
    const editor = makeEditor();
    seedParagraph(editor, "aligned text");

    editor.update(
      () => {
        const block = $getRoot().getFirstChild();
        assert.ok(block && $isElementNode(block));
        block.setFormat(alignment);
      },
      { discrete: true },
    );
    assert.equal(readElementFormat(editor), alignment, `${alignment} applied`);

    const rehydrated = roundTrip(editor);
    assert.equal(
      readElementFormat(rehydrated),
      alignment,
      `${alignment} persists through serialization`,
    );
  });
}

// ---------------------------------------------------------------------------
// 3. TEXT COLOR + HIGHLIGHT via $patchStyleText
// ---------------------------------------------------------------------------

function readStyleValue(editor: LexicalEditor, property: string): string {
  return editor.getEditorState().read(() => {
    const selection = $getSelection();
    assert.ok($isRangeSelection(selection), "expected a range selection");
    return $getSelectionStyleValueForProperty(selection, property);
  });
}

test("color + highlight: $patchStyleText reads back via $getSelectionStyleValueForProperty", () => {
  const editor = makeEditor();
  seedParagraph(editor, "highlighted");

  editor.update(
    () => {
      const block = $getRoot().getFirstChild();
      assert.ok(block && $isElementNode(block));
      const text = block.getFirstChild();
      assert.ok(text && $isTextNode(text));
      const selection = text.select(0, 11);
      $patchStyleText(selection, {
        color: "#e11d48",
        "background-color": "#fde68a",
      });
    },
    { discrete: true },
  );

  assert.equal(readStyleValue(editor, "color"), "#e11d48", "color reads back");
  assert.equal(
    readStyleValue(editor, "background-color"),
    "#fde68a",
    "highlight reads back",
  );
});

test("color + highlight: inline style persists on the TextNode through exportJSON → importJSON", () => {
  const editor = makeEditor();
  seedParagraph(editor, "persisted");

  editor.update(
    () => {
      const block = $getRoot().getFirstChild();
      assert.ok(block && $isElementNode(block));
      const text = block.getFirstChild();
      assert.ok(text && $isTextNode(text));
      const selection = text.select(0, 9);
      $patchStyleText(selection, {
        color: "#e11d48",
        "background-color": "#fde68a",
      });
    },
    { discrete: true },
  );

  const style = firstTextNode(editor).style;
  assert.ok(
    style.includes("color: #e11d48"),
    "color present in source-of-truth style",
  );
  assert.ok(
    style.includes("background-color: #fde68a"),
    "highlight present in source-of-truth style",
  );

  const rehydrated = roundTrip(editor);
  const rehydratedStyle = firstTextNode(rehydrated).style;
  assert.ok(
    rehydratedStyle.includes("color: #e11d48"),
    "color survives serialization (contentJson invariant)",
  );
  assert.ok(
    rehydratedStyle.includes("background-color: #fde68a"),
    "highlight survives serialization (contentJson invariant)",
  );
});

test("color + highlight: patching to '' clears the style", () => {
  const editor = makeEditor();
  seedParagraph(editor, "cleared");

  editor.update(
    () => {
      const block = $getRoot().getFirstChild();
      assert.ok(block && $isElementNode(block));
      const text = block.getFirstChild();
      assert.ok(text && $isTextNode(text));
      text.select(0, 7);
      const selection = $getSelection();
      assert.ok($isRangeSelection(selection));
      $patchStyleText(selection, {
        color: "#e11d48",
        "background-color": "#fde68a",
      });
    },
    { discrete: true },
  );
  assert.notEqual(
    firstTextNode(editor).style,
    "",
    "style applied before clearing",
  );

  editor.update(
    () => {
      const block = $getRoot().getFirstChild();
      assert.ok(block && $isElementNode(block));
      const text = block.getFirstChild();
      assert.ok(text && $isTextNode(text));
      text.select(0, 7);
      const selection = $getSelection();
      assert.ok($isRangeSelection(selection));
      $patchStyleText(selection, { color: "", "background-color": "" });
    },
    { discrete: true },
  );

  const style = firstTextNode(editor).style;
  assert.equal(style.includes("#e11d48"), false, "color value removed");
  assert.equal(style.includes("#fde68a"), false, "highlight value removed");
  assert.equal(readStyleValue(editor, "color"), "", "color reads back empty");
  assert.equal(
    readStyleValue(editor, "background-color"),
    "",
    "highlight reads back empty",
  );
});

// ---------------------------------------------------------------------------
// 4. COMBINED: bold + code + color coexist and round-trip
// ---------------------------------------------------------------------------

test("combined: bold + code + color coexist on one selection and round-trip", () => {
  const editor = makeEditor();
  seedParagraph(editor, "combined");

  editor.update(
    () => {
      const block = $getRoot().getFirstChild();
      assert.ok(block && $isElementNode(block));
      const text = block.getFirstChild();
      assert.ok(text && $isTextNode(text));
      const selection = text.select(0, 8);
      selection.formatText("bold");
      selection.formatText("code");
      $patchStyleText(selection, { color: "#e11d48" });
    },
    { discrete: true },
  );

  const before = firstTextNode(editor);
  assert.equal(before.hasFormat("bold"), true, "bold applied");
  assert.equal(before.hasFormat("code"), true, "code applied");
  assert.ok(before.style.includes("color: #e11d48"), "color applied");

  const rehydrated = roundTrip(editor);
  const after = firstTextNode(rehydrated);
  assert.equal(after.hasFormat("bold"), true, "bold survives round-trip");
  assert.equal(after.hasFormat("code"), true, "code survives round-trip");
  assert.ok(
    after.style.includes("color: #e11d48"),
    "color survives round-trip alongside formats",
  );
});
