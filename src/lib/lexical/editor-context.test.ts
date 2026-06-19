import assert from "node:assert/strict";
import { test } from "node:test";

import { createHeadlessEditor } from "@lexical/headless";
import { LinkNode, $createLinkNode } from "@lexical/link";
import {
  ListItemNode,
  ListNode,
  $createListItemNode,
  $createListNode,
} from "@lexical/list";
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import {
  HeadingNode,
  QuoteNode,
  $createHeadingNode,
  $createQuoteNode,
} from "@lexical/rich-text";
import {
  $createNodeSelection,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $setSelection,
  type LexicalEditor,
} from "lexical";

import { FIXTURES } from "@/lib/visual/fixtures";

import { $createVisualNode, VisualNode } from "@/app/app/documents/[id]/visual-node";

import {
  readSelectionDescriptor,
  type SelectionDescriptor,
} from "./editor-context";

/**
 * Headless editor wired with the SAME node set the app registers in
 * `lexical-editor.tsx` (`NODES`), so selection derivation is exercised against a
 * representative document.
 */
function makeEditor(): LexicalEditor {
  return createHeadlessEditor({
    namespace: "editor-context-test",
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
 * Build a document inside a discrete update, then read the derived descriptor
 * from the committed editor state (where `$getSelection` resolves the selection
 * that `build` left behind).
 */
function derive(
  editor: LexicalEditor,
  build: () => void,
): SelectionDescriptor {
  editor.update(build, { discrete: true });
  return editor.getEditorState().read(() => readSelectionDescriptor());
}

test("empty paragraph with a collapsed caret derives kind 'empty-block'", () => {
  const editor = makeEditor();
  const descriptor = derive(editor, () => {
    const paragraph = $createParagraphNode();
    $getRoot().clear().append(paragraph);
    paragraph.select(0, 0);
  });

  assert.equal(descriptor.kind, "empty-block");
  assert.equal(descriptor.isCollapsed, true);
  assert.equal(descriptor.isEmptyBlock, true);
  assert.equal(descriptor.blockType, "paragraph");
  assert.equal(descriptor.blockText, "");
});

test("collapsed caret inside non-empty text derives kind 'collapsed'", () => {
  const editor = makeEditor();
  const descriptor = derive(editor, () => {
    const paragraph = $createParagraphNode();
    const text = $createTextNode("Hello world");
    paragraph.append(text);
    $getRoot().clear().append(paragraph);
    text.select(2, 2);
  });

  assert.equal(descriptor.kind, "collapsed");
  assert.equal(descriptor.isCollapsed, true);
  assert.equal(descriptor.isEmptyBlock, false);
  assert.equal(descriptor.blockType, "paragraph");
  assert.equal(descriptor.blockText, "Hello world");
});

test("non-collapsed text selection derives kind 'range'", () => {
  const editor = makeEditor();
  const descriptor = derive(editor, () => {
    const paragraph = $createParagraphNode();
    const text = $createTextNode("Hello world");
    paragraph.append(text);
    $getRoot().clear().append(paragraph);
    text.select(0, 5);
  });

  assert.equal(descriptor.kind, "range");
  assert.equal(descriptor.isCollapsed, false);
  assert.equal(descriptor.isEmptyBlock, false);
});

test("no selection (blurred editor) derives kind 'none'", () => {
  const editor = makeEditor();
  const descriptor = derive(editor, () => {
    const paragraph = $createParagraphNode();
    paragraph.append($createTextNode("text"));
    $getRoot().clear().append(paragraph);
    $setSelection(null);
  });

  assert.equal(descriptor.kind, "none");
  assert.equal(descriptor.isCollapsed, true);
  assert.equal(descriptor.blockType, undefined);
  assert.equal(descriptor.blockKey, undefined);
});

test("selected visual decorator derives kind 'visual' with stable id + transient key", () => {
  const editor = makeEditor();
  let nodeKey = "";
  const descriptor = derive(editor, () => {
    const visual = $createVisualNode(FIXTURES.flowchart, "vis-stable-1");
    $getRoot().clear().append(visual);
    nodeKey = visual.getKey();
    const selection = $createNodeSelection();
    selection.add(visual.getKey());
    $setSelection(selection);
  });

  assert.equal(descriptor.kind, "visual");
  // selectedVisualId is the stable, anchor-safe id (never the live key).
  assert.equal(descriptor.selectedVisualId, "vis-stable-1");
  // selectedVisualNodeKey is the transient Lexical key for the same node.
  assert.equal(descriptor.selectedVisualNodeKey, nodeKey);
  assert.notEqual(descriptor.selectedVisualId, descriptor.selectedVisualNodeKey);
});

test("blockType maps headings h1/h2/h3", () => {
  for (const tag of ["h1", "h2", "h3"] as const) {
    const editor = makeEditor();
    const descriptor = derive(editor, () => {
      const heading = $createHeadingNode(tag);
      const text = $createTextNode(`Heading ${tag}`);
      heading.append(text);
      $getRoot().clear().append(heading);
      text.select(0, 0);
    });
    assert.equal(descriptor.blockType, tag, `expected blockType ${tag}`);
  }
});

test("blockType maps a quote block", () => {
  const editor = makeEditor();
  const descriptor = derive(editor, () => {
    const quote = $createQuoteNode();
    const text = $createTextNode("A quote");
    quote.append(text);
    $getRoot().clear().append(quote);
    text.select(0, 0);
  });
  assert.equal(descriptor.blockType, "quote");
});

test("blockType maps a paragraph", () => {
  const editor = makeEditor();
  const descriptor = derive(editor, () => {
    const paragraph = $createParagraphNode();
    const text = $createTextNode("Plain");
    paragraph.append(text);
    $getRoot().clear().append(paragraph);
    text.select(0, 0);
  });
  assert.equal(descriptor.blockType, "paragraph");
});

test("blockType maps bullet and number lists", () => {
  for (const [listType, expected] of [
    ["bullet", "bullet"],
    ["number", "number"],
  ] as const) {
    const editor = makeEditor();
    const descriptor = derive(editor, () => {
      const list = $createListNode(listType);
      const item = $createListItemNode();
      const text = $createTextNode("Item");
      item.append(text);
      list.append(item);
      $getRoot().clear().append(list);
      text.select(0, 0);
    });
    assert.equal(descriptor.blockType, expected, `expected ${expected} list`);
  }
});

test("activeFormats reflects each inline format applied to the selection", () => {
  for (const format of [
    "bold",
    "italic",
    "underline",
    "strikethrough",
    "code",
  ] as const) {
    const editor = makeEditor();
    const descriptor = derive(editor, () => {
      const paragraph = $createParagraphNode();
      const text = $createTextNode("styled");
      paragraph.append(text);
      $getRoot().clear().append(paragraph);
      const selection = text.select(0, 6);
      selection.formatText(format);
    });
    assert.ok(
      descriptor.activeFormats.has(format),
      `expected activeFormats to include ${format}`,
    );
    assert.equal(
      descriptor.activeFormats.size,
      1,
      `expected only ${format} active`,
    );
  }
});

test("activeFormats reflects multiple simultaneous formats", () => {
  const editor = makeEditor();
  const descriptor = derive(editor, () => {
    const paragraph = $createParagraphNode();
    const text = $createTextNode("styled");
    paragraph.append(text);
    $getRoot().clear().append(paragraph);
    const selection = text.select(0, 6);
    selection.formatText("bold");
    selection.formatText("italic");
  });

  assert.ok(descriptor.activeFormats.has("bold"));
  assert.ok(descriptor.activeFormats.has("italic"));
  assert.equal(descriptor.activeFormats.has("underline"), false);
});

test("isLink is true when the selection sits within a link", () => {
  const editor = makeEditor();
  const descriptor = derive(editor, () => {
    const paragraph = $createParagraphNode();
    const link = $createLinkNode("https://example.com");
    const text = $createTextNode("click me");
    link.append(text);
    paragraph.append(link);
    $getRoot().clear().append(paragraph);
    text.select(0, 8);
  });

  assert.equal(descriptor.isLink, true);
  assert.equal(descriptor.kind, "range");
});

test("isLink is false for plain text selections", () => {
  const editor = makeEditor();
  const descriptor = derive(editor, () => {
    const paragraph = $createParagraphNode();
    const text = $createTextNode("no link here");
    paragraph.append(text);
    $getRoot().clear().append(paragraph);
    text.select(0, 5);
  });

  assert.equal(descriptor.isLink, false);
});

test("blockText reflects the live block's text content", () => {
  const editor = makeEditor();
  const descriptor = derive(editor, () => {
    const paragraph = $createParagraphNode();
    paragraph.append($createTextNode("first "));
    paragraph.append($createTextNode("second"));
    $getRoot().clear().append(paragraph);
    paragraph.selectStart();
  });

  assert.equal(descriptor.blockText, "first second");
  assert.ok(descriptor.blockKey, "expected a live blockKey for the paragraph");
});
