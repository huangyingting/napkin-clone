import assert from "node:assert/strict";
import { test } from "node:test";

import { createHeadlessEditor } from "@lexical/headless";
import { ListItemNode, ListNode } from "@lexical/list";
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { $getRoot, $isElementNode, $isTextNode } from "lexical";

import { collectDocumentBlocks } from "@/lib/visual/document-export";

import {
  BLOCK_NODE_TYPES,
  generateBlockId,
  regenerateBlockIds,
  stampBlockIds,
} from "./block-id";
import {
  $ensureBlockIdsInDocument,
  ensureLexicalBlockIdSupport,
  registerBlockIdTransforms,
} from "./block-id-runtime";
import { markdownToLexicalStateObject } from "./from-markdown";

function legacyState(): {
  root: {
    type: "root";
    version: 1;
    children: unknown[];
  };
} {
  return {
    root: {
      type: "root",
      version: 1,
      children: [
        {
          type: "paragraph",
          key: "legacy-paragraph",
          version: 1,
          direction: null,
          format: "",
          indent: 0,
          textFormat: 0,
          textStyle: "",
          children: [{ type: "text", version: 1, text: "Intro" }],
        },
        {
          type: "heading",
          key: "legacy-heading",
          version: 1,
          direction: null,
          format: "",
          indent: 0,
          tag: "h2",
          children: [{ type: "text", version: 1, text: "Section" }],
        },
        {
          type: "list",
          version: 1,
          listType: "bullet",
          start: 1,
          tag: "ul",
          children: [
            {
              type: "listitem",
              key: "legacy-item",
              version: 1,
              direction: null,
              format: "",
              indent: 0,
              value: 1,
              children: [{ type: "text", version: 1, text: "Point" }],
            },
          ],
        },
        {
          type: "visual",
          version: 1,
          visualId: "vis-1",
          visual: { type: "flowchart", nodes: [], edges: [] },
        },
      ],
    },
  };
}

function nestedListState() {
  return {
    root: {
      type: "root",
      version: 1,
      children: [
        {
          type: "list",
          version: 1,
          listType: "bullet",
          start: 1,
          tag: "ul",
          children: [
            {
              type: "listitem",
              key: "outer-key",
              version: 1,
              direction: null,
              format: "",
              indent: 0,
              value: 1,
              children: [
                { type: "text", version: 1, text: "Outer" },
                {
                  type: "list",
                  version: 1,
                  listType: "bullet",
                  start: 1,
                  tag: "ul",
                  children: [
                    {
                      type: "listitem",
                      key: "inner-key",
                      version: 1,
                      direction: null,
                      format: "",
                      indent: 0,
                      value: 1,
                      children: [{ type: "text", version: 1, text: "Inner" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

function makeHeadlessEditor() {
  ensureLexicalBlockIdSupport();
  const editor = createHeadlessEditor({
    namespace: "block-id-test",
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, HorizontalRuleNode],
    onError(error) {
      throw error;
    },
  });
  const unregister = registerBlockIdTransforms(editor);
  return { editor, unregister };
}

test("generateBlockId produces non-empty distinct strings", () => {
  const first = generateBlockId();
  const second = generateBlockId();
  assert.equal(typeof first, "string");
  assert.equal(typeof second, "string");
  assert.ok(first.length > 0);
  assert.ok(second.length > 0);
  assert.notEqual(first, second);
});

test("BLOCK_NODE_TYPES contains every bid-carrying block node type", () => {
  assert.deepEqual([...BLOCK_NODE_TYPES].sort(), [
    "heading",
    "horizontalrule",
    "listitem",
    "paragraph",
    "quote",
  ]);
});

test("stampBlockIds adds bid to paragraph, heading, and listitem nodes that lack one", () => {
  const stamped = stampBlockIds(legacyState()) as ReturnType<
    typeof legacyState
  >;
  const [paragraph, heading, list] = stamped.root.children as Array<
    Record<string, unknown>
  >;
  const item = (list.children as Array<Record<string, unknown>>)[0];
  assert.match(String(paragraph.bid), /^[A-Za-z0-9]{12}$/);
  assert.match(String(heading.bid), /^[A-Za-z0-9]{12}$/);
  assert.match(String(item.bid), /^[A-Za-z0-9]{12}$/);
});

test("stampBlockIds preserves existing bid values and is idempotent", () => {
  const input = {
    root: {
      type: "root",
      version: 1,
      children: [
        {
          type: "paragraph",
          bid: "keep-bid-1234",
          version: 1,
          direction: null,
          format: "",
          indent: 0,
          textFormat: 0,
          textStyle: "",
          children: [{ type: "text", version: 1, text: "Hello" }],
        },
      ],
    },
  };
  const once = stampBlockIds(input) as typeof input;
  const twice = stampBlockIds(once) as typeof input;
  assert.equal(
    (once.root.children[0] as { bid?: string }).bid,
    "keep-bid-1234",
  );
  assert.equal(
    (twice.root.children[0] as { bid?: string }).bid,
    "keep-bid-1234",
  );
});

test("stampBlockIds skips visual, root, and list container nodes", () => {
  const stamped = stampBlockIds(legacyState()) as Record<string, unknown>;
  const root = stamped.root as Record<string, unknown>;
  const list = (root.children as Array<Record<string, unknown>>)[2];
  const visual = (root.children as Array<Record<string, unknown>>)[3];
  assert.equal(root.bid, undefined);
  assert.equal(list.bid, undefined);
  assert.equal(visual.bid, undefined);
});

test("stampBlockIds handles legacy contentJson without throwing", () => {
  assert.doesNotThrow(() => stampBlockIds(legacyState()));
});

test("stampBlockIds handles empty, null, and invalid input gracefully", () => {
  assert.equal(stampBlockIds(null), null);
  assert.equal(stampBlockIds(undefined), undefined);
  assert.equal(stampBlockIds("plain"), "plain");
  assert.deepEqual(stampBlockIds([]), []);
});

test("regenerateBlockIds always generates new bids even when one already exists", () => {
  const input = {
    root: {
      type: "root",
      version: 1,
      children: [
        {
          type: "paragraph",
          bid: "old-bid-1111",
          version: 1,
          direction: null,
          format: "",
          indent: 0,
          textFormat: 0,
          textStyle: "",
          children: [{ type: "text", version: 1, text: "Hello" }],
        },
      ],
    },
  };
  const result = regenerateBlockIds(input);
  const paragraph = (result.updated as typeof input).root.children[0] as {
    bid: string;
  };
  assert.notEqual(paragraph.bid, "old-bid-1111");
});

test("regenerateBlockIds builds a correct bidMap", () => {
  const result = regenerateBlockIds(legacyState());
  const root = (result.updated as ReturnType<typeof legacyState>).root;
  const paragraph = root.children[0] as { bid: string };
  const heading = root.children[1] as { bid: string };
  const item = ((root.children[2] as { children: unknown[] }).children[0] ?? {
    bid: undefined,
  }) as { bid: string };
  assert.equal(result.bidMap.get("legacy-paragraph"), paragraph.bid);
  assert.equal(result.bidMap.get("legacy-heading"), heading.bid);
  assert.equal(result.bidMap.get("legacy-item"), item.bid);
});

test("regenerateBlockIds handles nested list items", () => {
  const result = regenerateBlockIds(nestedListState()) as {
    updated: ReturnType<typeof nestedListState>;
  };
  const outer = ((result.updated.root.children[0] as { children: unknown[] })
    .children[0] ?? {}) as { bid?: string; children?: unknown[] };
  const innerList = (outer.children?.[1] ?? {}) as { children?: unknown[] };
  const inner = (innerList.children?.[0] ?? {}) as { bid?: string };
  assert.match(String(outer.bid), /^[A-Za-z0-9]{12}$/);
  assert.match(String(inner.bid), /^[A-Za-z0-9]{12}$/);
});

test("collectDocumentBlocks returns blockIds for stamped legacy content and markdown-derived content", () => {
  const legacyBlocks = collectDocumentBlocks(stampBlockIds(legacyState()));
  assert.equal(
    legacyBlocks.every((block) => block.kind === "visual" || block.blockId),
    true,
  );

  const markdownBlocks = collectDocumentBlocks(
    markdownToLexicalStateObject("# Title\n\nParagraph\n\n- One\n- Two"),
  );
  assert.equal(
    markdownBlocks.every((block) => block.kind === "visual" || block.blockId),
    true,
  );
});

test("patched Lexical block nodes preserve bid across parse, edit, and export", () => {
  const { editor, unregister } = makeHeadlessEditor();
  const initial = markdownToLexicalStateObject("Hello world");
  editor.setEditorState(editor.parseEditorState(JSON.stringify(initial)));
  editor.update(
    () => {
      $ensureBlockIdsInDocument();
    },
    { discrete: true },
  );

  const firstBid = editor.getEditorState().read(() => {
    const paragraph = $getRoot().getFirstChild();
    assert.ok(paragraph, "expected a paragraph block");
    const json = paragraph.exportJSON() as { bid?: string };
    return json.bid;
  });

  editor.update(
    () => {
      const paragraph = $getRoot().getFirstChild();
      assert.ok(
        paragraph && $isElementNode(paragraph),
        "expected a paragraph block",
      );
      const text = paragraph.getFirstChild();
      assert.ok(text && $isTextNode(text), "expected a text child");
      text.setTextContent("Edited text");
    },
    { discrete: true },
  );

  const secondBid = editor.getEditorState().read(() => {
    const paragraph = $getRoot().getFirstChild();
    assert.ok(paragraph, "expected a paragraph block after edit");
    const json = paragraph.exportJSON() as { bid?: string };
    return json.bid;
  });

  unregister();
  assert.ok(firstBid);
  assert.equal(secondBid, firstBid);
});
