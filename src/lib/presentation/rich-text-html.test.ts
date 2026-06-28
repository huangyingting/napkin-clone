import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import {
  bulletsToRuns,
  escapeHtml,
  mergeRuns,
  normalizeCssColor,
  plainTextToRuns,
  runStyle,
  runsToHtml,
  serializeRichText,
  shouldStoreRuns,
  splitRunsIntoLines,
} from "./rich-text-html";

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

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
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

test("rich text helpers preserve underline runs", () => {
  const underlined = element("u", [text("Underlined")]);
  underlined.style.fontSize = "4cqh";
  const root = element("div", [underlined]);

  assert.deepEqual(serializeRichText(root as unknown as HTMLElement).runs, [
    { text: "Underlined", underline: true, fontSize: 4 },
  ]);
  assert.match(
    runsToHtml([{ text: "Underlined", underline: true, fontSize: 4 }], ""),
    /text-decoration:underline/,
  );
  assert.match(
    runsToHtml([{ text: "Underlined", underline: true, fontSize: 4 }], ""),
    /font-size:4cqh/,
  );
});

test("escapeHtml and normalizeCssColor sanitize text and supported color formats", () => {
  assert.equal(
    escapeHtml('A&B <tag> "quote"'),
    "A&amp;B &lt;tag&gt; &quot;quote&quot;",
  );
  assert.equal(normalizeCssColor(" #abc "), "#abc");
  assert.equal(normalizeCssColor("rgba(12, 34, 999, 0.5)"), "#0c22ff");
  assert.equal(normalizeCssColor("not-a-color"), undefined);
  assert.equal(normalizeCssColor(undefined), undefined);
});

test("plainTextToRuns and runsToHtml preserve line breaks and safe fallback HTML", () => {
  assert.deepEqual(plainTextToRuns("A\nB"), [
    { text: "A" },
    { text: "\n" },
    { text: "B" },
  ]);
  assert.deepEqual(plainTextToRuns(""), [{ text: "" }]);
  assert.equal(runsToHtml([], "A\n<B>"), "A<br>&lt;B&gt;");
  assert.equal(runsToHtml([{ text: "" }], ""), "<br>");
});

test("runStyle emits code styling and runsToHtml converts embedded newlines", () => {
  assert.match(runStyle({ text: "code", code: true }), /font-family/);
  assert.match(runStyle({ text: "code", code: true }), /background-color/);
  assert.equal(runsToHtml([{ text: "A\nB" }], ""), "A<br>B");
});

test("mergeRuns combines adjacent identical styles and drops empty runs", () => {
  assert.deepEqual(
    mergeRuns([
      { text: "", bold: true },
      { text: "A", bold: true },
      { text: "B", bold: true },
      { text: "C", italic: true },
    ]),
    [
      { text: "AB", bold: true },
      { text: "C", italic: true },
    ],
  );
});

test("serializeRichText reads semantic tags, inline styles, links, colors, and nbsp", () => {
  const link = element("a", [text("Link\u00a0text")]);
  link.setAttribute("href", "https://example.test");
  link.style.color = "rgb(1, 2, 3)";
  link.style.fontWeight = "700";
  link.style.fontStyle = "italic";
  link.style.textDecoration = "underline";
  link.style.fontSize = "6cqh";
  const root = element("div", [
    element("strong", [text("Bold")]),
    element("em", [text("Em")]),
    element("code", [text("Code")]),
    link,
    element("br"),
    element("span", [text("Plain")]),
  ]);

  assert.deepEqual(serializeRichText(root as unknown as HTMLElement).runs, [
    { text: "Bold", bold: true },
    { text: "Em", italic: true },
    { text: "Code", code: true },
    {
      text: "Link text",
      link: "https://example.test",
      bold: true,
      italic: true,
      underline: true,
      fontSize: 6,
      color: "#010203",
    },
    { text: "\nPlain" },
  ]);
});

test("shouldStoreRuns, bulletsToRuns, and splitRunsIntoLines preserve rich list lines", () => {
  assert.equal(shouldStoreRuns([{ text: "plain" }]), false);
  assert.equal(shouldStoreRuns([{ text: "A\nB" }]), true);
  assert.equal(
    shouldStoreRuns([{ text: "rich", link: "https://example.test" }]),
    true,
  );

  const runs = bulletsToRuns(
    ["one", "two", ""],
    [[{ text: "ONE", bold: true }], [], [{ text: "THREE", italic: true }]],
  );
  assert.deepEqual(runs, [
    { text: "ONE", bold: true },
    { text: "\n" },
    { text: "two" },
    { text: "\n" },
    { text: "THREE", italic: true },
  ]);
  assert.deepEqual(splitRunsIntoLines(runs), [
    { text: "ONE", runs: [{ text: "ONE", bold: true }] },
    { text: "two", runs: [{ text: "two" }] },
    { text: "THREE", runs: [{ text: "THREE", italic: true }] },
  ]);
});

test("bulletsToRuns keeps separators around empty rich rows", () => {
  assert.deepEqual(bulletsToRuns(["", "tail"]), [
    { text: "\n" },
    { text: "tail" },
  ]);
  assert.deepEqual(splitRunsIntoLines([{ text: "A\n\nB", bold: true }]), [
    { text: "A", runs: [{ text: "A", bold: true }] },
    { text: "", runs: [] },
    { text: "B", runs: [{ text: "B", bold: true }] },
  ]);
});

test("bulletsToRuns omits empty plain rows while preserving their separators", () => {
  assert.deepEqual(bulletsToRuns(["lead", "", "tail"]), [
    { text: "lead" },
    { text: "\n" },
    { text: "\n" },
    { text: "tail" },
  ]);
});
