import assert from "node:assert/strict";
import { test } from "node:test";

import { createHeadlessEditor } from "@lexical/headless";
import { LinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListItemNode,
  ListNode,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isTextNode,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  type ElementNode,
  type LexicalCommand,
  type LexicalEditor,
} from "lexical";

import type { EditorContextSnapshot } from "./selection-snapshot";
import {
  createVisualInsertRunner,
  TOOL_APPLIERS,
  TOOL_RUNNERS,
} from "./tool-mutations";

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
    selectionText: "hello",
    isEmptyBlock: false,
    rects: { selection: null, block: null },
    ...overrides,
  };
}

function makeEditor(): LexicalEditor {
  const editor = createHeadlessEditor({
    namespace: "tool-mutations-test",
    nodes: [
      HeadingNode,
      QuoteNode,
      ListNode,
      ListItemNode,
      LinkNode,
      HorizontalRuleNode,
    ],
    onError(error) {
      throw error;
    },
  });
  editor.focus = (() => {}) as LexicalEditor["focus"];
  return editor;
}

function seedParagraph(editor: LexicalEditor, text = "hello world"): string {
  let blockKey = "";
  editor.update(
    () => {
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode(text));
      $getRoot().clear().append(paragraph);
      blockKey = paragraph.getKey();
      paragraph.selectStart();
    },
    { discrete: true },
  );
  return blockKey;
}

function firstBlock(editor: LexicalEditor): ElementNode {
  return editor.getEditorState().read(() => {
    const block = $getRoot().getFirstChild();
    assert.ok(block && $isElementNode(block), "expected first block element");
    return block;
  });
}

function firstTextStyle(editor: LexicalEditor): string {
  return editor.getEditorState().read(() => {
    const block = $getRoot().getFirstChild();
    assert.ok(block && $isElementNode(block));
    const text = block.getFirstChild();
    assert.ok(text && $isTextNode(text), "expected first text node");
    return text.getStyle();
  });
}

function firstNodeType(editor: LexicalEditor): string {
  return editor.getEditorState().read(() => {
    const node = $getRoot().getFirstChild();
    assert.ok(node, "expected first node");
    return node.getType();
  });
}

function commandRecorder(): {
  editor: LexicalEditor;
  calls: Array<{ command: LexicalCommand<unknown>; payload: unknown }>;
} {
  const calls: Array<{ command: LexicalCommand<unknown>; payload: unknown }> =
    [];
  const editor = {
    dispatchCommand(command: LexicalCommand<unknown>, payload: unknown) {
      calls.push({ command, payload });
      return true;
    },
  } as LexicalEditor;
  return { editor, calls };
}

test("toolbar format and alignment runners dispatch the expected Lexical commands", () => {
  const { editor, calls } = commandRecorder();

  for (const [runner, payload] of [
    [TOOL_RUNNERS.formatBold, "bold"],
    [TOOL_RUNNERS.formatItalic, "italic"],
    [TOOL_RUNNERS.formatUnderline, "underline"],
    [TOOL_RUNNERS.formatStrikethrough, "strikethrough"],
    [TOOL_RUNNERS.formatCode, "code"],
  ] as const) {
    runner(editor, ctx());
    assert.equal(calls.at(-1)?.command, FORMAT_TEXT_COMMAND);
    assert.equal(calls.at(-1)?.payload, payload);
  }

  for (const [runner, payload] of [
    [TOOL_RUNNERS.alignLeft, "left"],
    [TOOL_RUNNERS.alignCenter, "center"],
    [TOOL_RUNNERS.alignRight, "right"],
    [TOOL_RUNNERS.alignJustify, "justify"],
  ] as const) {
    runner(editor, ctx());
    assert.equal(calls.at(-1)?.command, FORMAT_ELEMENT_COMMAND);
    assert.equal(calls.at(-1)?.payload, payload);
  }
});

test("link runner unlinks, cancels, trims URLs, and treats blank input as removal", () => {
  const { editor, calls } = commandRecorder();
  const originalPrompt = globalThis.window?.prompt;
  const originalWindow = globalThis.window;
  const prompts: Array<string | null> = [
    null,
    "  https://example.com  ",
    "   ",
  ];
  (
    globalThis as typeof globalThis & {
      window: { prompt: () => string | null };
    }
  ).window = { prompt: () => prompts.shift() ?? null };

  try {
    TOOL_RUNNERS.formatLink(editor, ctx({ isLink: true }));
    assert.equal(calls.at(-1)?.command, TOGGLE_LINK_COMMAND);
    assert.equal(calls.at(-1)?.payload, null);

    TOOL_RUNNERS.formatLink(editor, ctx({ isLink: false }));
    assert.equal(calls.length, 1, "cancelled prompt should not dispatch");

    TOOL_RUNNERS.formatLink(editor, ctx({ isLink: false }));
    assert.equal(calls.at(-1)?.payload, "https://example.com");

    TOOL_RUNNERS.formatLink(editor, ctx({ isLink: false }));
    assert.equal(calls.at(-1)?.payload, null);
  } finally {
    if (originalWindow === undefined) {
      delete (globalThis as typeof globalThis & { window?: unknown }).window;
    } else {
      (
        globalThis as typeof globalThis & { window: typeof originalWindow }
      ).window = originalWindow;
      if (originalPrompt) originalWindow.prompt = originalPrompt;
    }
  }
});

test("list runners remove the current list or dispatch the requested list insertion", () => {
  const { editor, calls } = commandRecorder();

  TOOL_RUNNERS.blockBullet(editor, ctx({ blockType: "bullet" }));
  assert.equal(calls.at(-1)?.command, REMOVE_LIST_COMMAND);

  TOOL_RUNNERS.blockBullet(editor, ctx({ blockType: "paragraph" }));
  assert.equal(calls.at(-1)?.command, INSERT_UNORDERED_LIST_COMMAND);

  TOOL_RUNNERS.blockNumber(editor, ctx({ blockType: "number" }));
  assert.equal(calls.at(-1)?.command, REMOVE_LIST_COMMAND);

  TOOL_RUNNERS.blockNumber(editor, ctx({ blockType: "paragraph" }));
  assert.equal(calls.at(-1)?.command, INSERT_ORDERED_LIST_COMMAND);
});

function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

test("block runners toggle headings and quotes through the active range selection", async () => {
  for (const [runner, activeType, expectedType] of [
    [TOOL_RUNNERS.blockH1, "paragraph", "heading"],
    [TOOL_RUNNERS.blockH2, "paragraph", "heading"],
    [TOOL_RUNNERS.blockH3, "paragraph", "heading"],
    [TOOL_RUNNERS.blockQuote, "paragraph", "quote"],
    [TOOL_RUNNERS.blockH1, "h1", "paragraph"],
  ] as const) {
    const editor = makeEditor();
    seedParagraph(editor);
    runner(editor, ctx({ blockType: activeType }));
    await tick();
    assert.equal(firstBlock(editor).getType(), expectedType);
  }
});

test("color applicators patch a real range selection and ignore a missing selection", async () => {
  const editor = makeEditor();
  seedParagraph(editor, "colored");
  editor.update(
    () => {
      const block = $getRoot().getFirstChild();
      assert.ok(block && $isElementNode(block));
      const text = block.getFirstChild();
      assert.ok(text && $isTextNode(text));
      text.select(0, 7);
    },
    { discrete: true },
  );

  TOOL_APPLIERS.textColor(editor, "#123456");
  TOOL_APPLIERS.highlightColor(editor, "#abcdef");
  await tick();
  assert.match(firstTextStyle(editor), /color: #123456/);
  assert.match(firstTextStyle(editor), /background-color: #abcdef/);

  editor.update(() => {
    $getRoot().selectEnd();
  });
  TOOL_APPLIERS.textColor(editor, null);
});

test("block insert runners replace the selected block using block key and fallback selection", async () => {
  for (const [runner, expectedType] of [
    [TOOL_RUNNERS.insertH1, "heading"],
    [TOOL_RUNNERS.insertH2, "heading"],
    [TOOL_RUNNERS.insertH3, "heading"],
    [TOOL_RUNNERS.insertQuote, "quote"],
    [TOOL_RUNNERS.insertDivider, "horizontalrule"],
  ] as const) {
    const editor = makeEditor();
    const blockKey = seedParagraph(editor, "replace me");
    runner(editor, ctx({ blockKey }));
    await tick();
    assert.equal(firstNodeType(editor), expectedType);
  }

  const editor = makeEditor();
  seedParagraph(editor, "selection fallback");
  TOOL_RUNNERS.insertQuote(editor, ctx({ blockKey: undefined }));
  await tick();
  assert.equal(firstBlock(editor).getType(), "quote");
});

test("block insertion no-ops when no block can be resolved and visual insert dispatches transient keys", async () => {
  const editor = makeEditor();
  seedParagraph(editor, "unchanged");
  TOOL_RUNNERS.insertH1(editor, ctx({ blockKey: "missing-key" }));
  await tick();
  assert.equal(firstBlock(editor).getType(), "paragraph");

  const { editor: commandEditor, calls } = commandRecorder();
  createVisualInsertRunner("flowchart")(
    commandEditor,
    ctx({ blockKey: "live-node-key" }),
  );
  assert.deepEqual(calls.at(-1)?.payload, {
    kind: "flowchart",
    afterNodeKey: "live-node-key",
  });
});
