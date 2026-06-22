import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { serializeRichText } from "./rich-text-html";

const globals = globalThis as unknown as {
  Node: unknown;
  HTMLElement: unknown;
};
const originalNode = globals.Node;
const originalHTMLElement = globals.HTMLElement;

class FakeNode {
  static readonly TEXT_NODE = 3;

  readonly nodeType: number;
  readonly textContent: string | null;
  readonly childNodes: FakeNode[];

  constructor(
    nodeType: number,
    textContent: string | null,
    children: FakeNode[] = [],
  ) {
    this.nodeType = nodeType;
    this.textContent = textContent;
    this.childNodes = children;
  }
}

class FakeTextNode extends FakeNode {
  constructor(text: string) {
    super(FakeNode.TEXT_NODE, text);
  }
}

class FakeElement extends FakeNode {
  readonly tagName: string;
  readonly style: Partial<CSSStyleDeclaration> = {};
  private readonly attributes = new Map<string, string>();

  constructor(tagName: string, children: FakeNode[] = []) {
    super(1, null, children);
    this.tagName = tagName.toUpperCase();
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
}

function text(value: string): FakeTextNode {
  return new FakeTextNode(value);
}

function element(tagName: string, children: FakeNode[] = []): FakeElement {
  return new FakeElement(tagName, children);
}

before(() => {
  globals.Node = FakeNode;
  globals.HTMLElement = FakeElement;
});

after(() => {
  globals.Node = originalNode;
  globals.HTMLElement = originalHTMLElement;
});

test("serializeRichText keeps a newline between inline text and a following block", () => {
  const root = element("div", [
    text("First line"),
    element("div", [text("Second line")]),
  ]);

  assert.equal(
    serializeRichText(root as unknown as HTMLElement).text,
    "First line\nSecond line",
  );
});

test("serializeRichText keeps one newline between sibling contentEditable divs", () => {
  const root = element("div", [
    element("div", [text("First line")]),
    element("div", [text("Second line")]),
  ]);

  assert.equal(
    serializeRichText(root as unknown as HTMLElement).text,
    "First line\nSecond line",
  );
});
