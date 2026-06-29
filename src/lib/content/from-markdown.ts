/**
 * Framework-free converter from the editor's supported Markdown subset
 * (headings H1–H3, bullet lists, and paragraphs) to a serialized Lexical editor
 * state JSON.
 *
 * It produces the serialized shape Lexical's `editorState.toJSON()` emits for
 * `ParagraphNode`, `HeadingNode`, `ListNode`, and `ListItemNode`, plus the
 * additive durable `bid` field on block-level nodes. The result still
 * round-trips through Lexical's `parseEditorState`. It deliberately does not
 * import `lexical`/React so it stays pure and unit-testable under `node --test`.
 */

import { parseMarkdown } from "@/lib/content/markdown";
import { generateBlockId } from "@/lib/lexical/block-id";

type SerializedTextNode = {
  detail: number;
  format: number;
  mode: string;
  style: string;
  text: string;
  type: "text";
  version: number;
};

type SerializedElementNode = {
  children: unknown[];
  direction: null;
  format: "";
  indent: number;
  type: string;
  version: number;
  [key: string]: unknown;
};

export type SerializedLexicalState = {
  root: {
    children: SerializedElementNode[];
    direction: null;
    format: "";
    indent: number;
    type: "root";
    version: number;
  };
};

function textNode(text: string): SerializedTextNode {
  return {
    detail: 0,
    format: 0,
    mode: "normal",
    style: "",
    text,
    type: "text",
    version: 1,
  };
}

function inlineChildren(text: string): SerializedTextNode[] {
  return text === "" ? [] : [textNode(text)];
}

function paragraphNode(text: string): SerializedElementNode {
  return {
    bid: generateBlockId(),
    children: inlineChildren(text),
    direction: null,
    format: "",
    indent: 0,
    type: "paragraph",
    version: 1,
    textFormat: 0,
    textStyle: "",
  };
}

function headingNode(level: 1 | 2 | 3, text: string): SerializedElementNode {
  return {
    bid: generateBlockId(),
    children: inlineChildren(text),
    direction: null,
    format: "",
    indent: 0,
    type: "heading",
    version: 1,
    tag: `h${level}`,
  };
}

function listItemNode(text: string, value: number): SerializedElementNode {
  return {
    bid: generateBlockId(),
    children: inlineChildren(text),
    direction: null,
    format: "",
    indent: 0,
    type: "listitem",
    version: 1,
    value,
  };
}

function bulletListNode(items: string[]): SerializedElementNode {
  return {
    children: items.map((item, index) => listItemNode(item, index + 1)),
    direction: null,
    format: "",
    indent: 0,
    type: "list",
    version: 1,
    listType: "bullet",
    start: 1,
    tag: "ul",
  };
}

function tableCellNode(text: string, header: boolean): SerializedElementNode {
  return {
    children: [paragraphNode(text)],
    direction: null,
    format: "",
    indent: 0,
    type: "tablecell",
    version: 1,
    headerState: header ? 2 : 0,
  };
}

function tableRowNode(cells: string[], header: boolean): SerializedElementNode {
  return {
    children: cells.map((cell) => tableCellNode(cell, header)),
    direction: null,
    format: "",
    indent: 0,
    type: "tablerow",
    version: 1,
  };
}

function tableNode(columns: string[], rows: string[][]): SerializedElementNode {
  return {
    bid: generateBlockId(),
    children: [
      tableRowNode(columns, true),
      ...rows.map((row) => tableRowNode(row, false)),
    ],
    direction: null,
    format: "",
    indent: 0,
    type: "table",
    version: 1,
  };
}

/**
 * Converts a Markdown string into a serialized Lexical editor state object.
 * Empty or whitespace-only input yields a state with a single empty paragraph.
 */
export function markdownToLexicalStateObject(
  markdown: string,
): SerializedLexicalState {
  const blocks = parseMarkdown(markdown ?? "");
  const children: SerializedElementNode[] = [];

  for (const block of blocks) {
    if (block.kind === "heading") {
      children.push(headingNode(block.level, block.text));
    } else if (block.kind === "bullets") {
      children.push(bulletListNode(block.items));
    } else if (block.kind === "table") {
      children.push(tableNode(block.columns, block.rows));
    } else {
      children.push(paragraphNode(block.text));
    }
  }

  if (children.length === 0) {
    children.push(paragraphNode(""));
  }

  return {
    root: {
      children,
      direction: null,
      format: "",
      indent: 0,
      type: "root",
      version: 1,
    },
  };
}

/**
 * Convenience wrapper returning the serialized state as a JSON string, suitable
 * for passing to Lexical's `editorState` config.
 */
export function markdownToLexicalState(markdown: string): string {
  return JSON.stringify(markdownToLexicalStateObject(markdown));
}
