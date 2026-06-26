import assert from "node:assert/strict";
import { test } from "node:test";

import { safeParseDeck } from "./deck-schema";
import { elementDeck } from "./deck-schema.test-helpers";

// ---------------------------------------------------------------------------
// fitMode on text / bullets elements (issue #333)
// ---------------------------------------------------------------------------

function textElementWithFitMode(fitMode: unknown) {
  return elementDeck([
    {
      id: "t",
      kind: "text",
      role: "body",
      text: "hi",
      zIndex: 0,
      box: { x: 0, y: 0, w: 10, h: 10 },
      style: { fontSize: 4, bold: false, italic: false, align: "left" },
      fitMode,
    },
  ]);
}

function bulletsElementWithFitMode(fitMode: unknown) {
  return elementDeck([
    {
      id: "b",
      kind: "bullets",
      bullets: ["one", "two"],
      items: [{ text: "one" }, { text: "two" }],
      zIndex: 0,
      box: { x: 0, y: 0, w: 10, h: 10 },
      style: { fontSize: 4, bold: false, italic: false, align: "left" },
      fitMode,
    },
  ]);
}

test("safeParseDeck round-trips fitMode=fixed-box on a text element", () => {
  const result = safeParseDeck(textElementWithFitMode("fixed-box"));
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.kind, "text");
    if (el?.kind === "text") {
      assert.equal(el.fitMode, "fixed-box");
    }
  }
});

test("safeParseDeck round-trips fitMode=shrink-to-fit on a text element", () => {
  const result = safeParseDeck(textElementWithFitMode("shrink-to-fit"));
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.kind, "text");
    if (el?.kind === "text") {
      assert.equal(el.fitMode, "shrink-to-fit");
    }
  }
});

test("safeParseDeck omits fitMode when absent on a text element", () => {
  const result = safeParseDeck(textElementWithFitMode(undefined));
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.kind, "text");
    if (el?.kind === "text") {
      assert.equal(el.fitMode, undefined);
    }
  }
});

test("safeParseDeck rejects an invalid fitMode on a text element", () => {
  const result = safeParseDeck(textElementWithFitMode("magic-shrink"));
  assert.equal(result.success, false);
});

test("safeParseDeck round-trips fitMode=fixed-box on a bullets element", () => {
  const result = safeParseDeck(bulletsElementWithFitMode("fixed-box"));
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.kind, "bullets");
    if (el?.kind === "bullets") {
      assert.equal(el.fitMode, "fixed-box");
    }
  }
});

test("safeParseDeck round-trips fitMode=shrink-to-fit on a bullets element", () => {
  const result = safeParseDeck(bulletsElementWithFitMode("shrink-to-fit"));
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.kind, "bullets");
    if (el?.kind === "bullets") {
      assert.equal(el.fitMode, "shrink-to-fit");
    }
  }
});

test("safeParseDeck rejects an invalid fitMode on a bullets element", () => {
  const result = safeParseDeck(bulletsElementWithFitMode(42));
  assert.equal(result.success, false);
});

// ---------------------------------------------------------------------------
// Layer metadata — hidden and name (issue #331)
// ---------------------------------------------------------------------------

function elementWithMetadata(extra: Record<string, unknown>) {
  return elementDeck([
    {
      id: "m",
      kind: "text",
      role: "body",
      text: "meta",
      zIndex: 0,
      box: { x: 0, y: 0, w: 10, h: 10 },
      style: { fontSize: 4, bold: false, italic: false, align: "left" },
      ...extra,
    },
  ]);
}

test("safeParseDeck round-trips hidden=true on a slide element", () => {
  const result = safeParseDeck(elementWithMetadata({ hidden: true }));
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.hidden, true);
  }
});

test("safeParseDeck round-trips hidden=false on a slide element", () => {
  const result = safeParseDeck(elementWithMetadata({ hidden: false }));
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.hidden, false);
  }
});

test("safeParseDeck omits hidden when absent on a slide element", () => {
  const result = safeParseDeck(elementWithMetadata({}));
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.hidden, undefined);
  }
});

test("safeParseDeck round-trips a non-empty name on a slide element", () => {
  const result = safeParseDeck(elementWithMetadata({ name: "My Layer" }));
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.name, "My Layer");
  }
});

test("safeParseDeck omits name when absent on a slide element", () => {
  const result = safeParseDeck(elementWithMetadata({}));
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.name, undefined);
  }
});

test("safeParseDeck omits name when empty string on a slide element", () => {
  const result = safeParseDeck(elementWithMetadata({ name: "" }));
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.name, undefined);
  }
});

// ---------------------------------------------------------------------------
// verticalAlign, lineHeight, paragraphSpacing on TextElementStyle (issue #334)
// ---------------------------------------------------------------------------

function textElementWithStyle(style: unknown) {
  return elementDeck([
    {
      id: "t",
      kind: "text",
      role: "body",
      text: "hi",
      zIndex: 0,
      box: { x: 0, y: 0, w: 10, h: 10 },
      style,
    },
  ]);
}

test("safeParseDeck round-trips verticalAlign=top on a text element", () => {
  const result = safeParseDeck(
    textElementWithStyle({
      fontSize: 4,
      bold: false,
      italic: false,
      align: "left",
      verticalAlign: "top",
    }),
  );
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.kind, "text");
    if (el?.kind === "text") {
      assert.equal(el.style.verticalAlign, "top");
    }
  }
});

test("safeParseDeck round-trips verticalAlign=bottom on a text element", () => {
  const result = safeParseDeck(
    textElementWithStyle({
      fontSize: 4,
      bold: false,
      italic: false,
      align: "left",
      verticalAlign: "bottom",
    }),
  );
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.kind, "text");
    if (el?.kind === "text") {
      assert.equal(el.style.verticalAlign, "bottom");
    }
  }
});

test("safeParseDeck omits verticalAlign when absent on a text element", () => {
  const result = safeParseDeck(
    textElementWithStyle({
      fontSize: 4,
      bold: false,
      italic: false,
      align: "left",
    }),
  );
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.kind, "text");
    if (el?.kind === "text") {
      assert.equal(el.style.verticalAlign, undefined);
    }
  }
});

test("safeParseDeck rejects an invalid verticalAlign on a text element", () => {
  const result = safeParseDeck(
    textElementWithStyle({
      fontSize: 4,
      bold: false,
      italic: false,
      align: "left",
      verticalAlign: "center",
    }),
  );
  assert.equal(result.success, false);
});

test("safeParseDeck round-trips lineHeight on a text element", () => {
  const result = safeParseDeck(
    textElementWithStyle({
      fontSize: 4,
      bold: false,
      italic: false,
      align: "left",
      lineHeight: 1.5,
    }),
  );
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.kind, "text");
    if (el?.kind === "text") {
      assert.equal(el.style.lineHeight, 1.5);
    }
  }
});

test("safeParseDeck rejects a non-finite lineHeight on a text element", () => {
  const result = safeParseDeck(
    textElementWithStyle({
      fontSize: 4,
      bold: false,
      italic: false,
      align: "left",
      lineHeight: Infinity,
    }),
  );
  assert.equal(result.success, false);
});

test("safeParseDeck round-trips paragraphSpacing on a text element", () => {
  const result = safeParseDeck(
    textElementWithStyle({
      fontSize: 4,
      bold: false,
      italic: false,
      align: "left",
      paragraphSpacing: 2,
    }),
  );
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.kind, "text");
    if (el?.kind === "text") {
      assert.equal(el.style.paragraphSpacing, 2);
    }
  }
});

test("safeParseDeck rejects a non-finite paragraphSpacing on a text element", () => {
  const result = safeParseDeck(
    textElementWithStyle({
      fontSize: 4,
      bold: false,
      italic: false,
      align: "left",
      paragraphSpacing: NaN,
    }),
  );
  assert.equal(result.success, false);
});

// ---------------------------------------------------------------------------
// bulletGap / bulletIndent on BulletsElement (issue #334)
// ---------------------------------------------------------------------------

function bulletsElementWith(extra: unknown) {
  return elementDeck([
    {
      id: "b",
      kind: "bullets",
      bullets: ["one", "two"],
      items: [{ text: "one" }, { text: "two" }],
      zIndex: 0,
      box: { x: 0, y: 0, w: 10, h: 10 },
      style: { fontSize: 4, bold: false, italic: false, align: "left" },
      ...(extra as object),
    },
  ]);
}

test("safeParseDeck round-trips bulletGap on a bullets element", () => {
  const result = safeParseDeck(bulletsElementWith({ bulletGap: 1.5 }));
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.kind, "bullets");
    if (el?.kind === "bullets") {
      assert.equal(el.bulletGap, 1.5);
    }
  }
});

test("safeParseDeck omits bulletGap when absent on a bullets element", () => {
  const result = safeParseDeck(bulletsElementWith({}));
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.kind, "bullets");
    if (el?.kind === "bullets") {
      assert.equal(el.bulletGap, undefined);
    }
  }
});

test("safeParseDeck rejects a non-finite bulletGap on a bullets element", () => {
  const result = safeParseDeck(bulletsElementWith({ bulletGap: "wide" }));
  assert.equal(result.success, false);
});

test("safeParseDeck round-trips bulletIndent on a bullets element", () => {
  const result = safeParseDeck(bulletsElementWith({ bulletIndent: 5 }));
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.kind, "bullets");
    if (el?.kind === "bullets") {
      assert.equal(el.bulletIndent, 5);
    }
  }
});

test("safeParseDeck rejects a non-finite bulletIndent on a bullets element", () => {
  const result = safeParseDeck(bulletsElementWith({ bulletIndent: null }));
  assert.equal(result.success, false);
});

test("safeParseDeck round-trips verticalAlign=middle on a bullets element style", () => {
  const result = safeParseDeck(
    elementDeck([
      {
        id: "b",
        kind: "bullets",
        bullets: ["x"],
        items: [{ text: "x" }],
        zIndex: 0,
        box: { x: 0, y: 0, w: 10, h: 10 },
        style: {
          fontSize: 4,
          bold: false,
          italic: false,
          align: "left",
          verticalAlign: "middle",
        },
      },
    ]),
  );
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.kind, "bullets");
    if (el?.kind === "bullets") {
      assert.equal(el.style.verticalAlign, "middle");
    }
  }
});

// ---------------------------------------------------------------------------
// items[] — multi-level bullets (#335)
// ---------------------------------------------------------------------------

test("safeParseDeck round-trips items[] with indent and listType", () => {
  const result = safeParseDeck(
    bulletsElementWith({
      items: [
        { text: "Top level", indent: 0, listType: "bullet" },
        { text: "Nested", indent: 1, listType: "number" },
        { text: "Deep", indent: 2, listType: "bullet" },
      ],
    }),
  );
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.kind, "bullets");
    if (el?.kind === "bullets") {
      assert.equal(el.items?.length, 3);
      assert.equal(el.items?.[0].indent, 0);
      assert.equal(el.items?.[0].listType, "bullet");
      assert.equal(el.items?.[1].indent, 1);
      assert.equal(el.items?.[1].listType, "number");
      assert.equal(el.items?.[2].indent, 2);
    }
  }
});

test("safeParseDeck rejects indent out of range (>5)", () => {
  const result = safeParseDeck(
    bulletsElementWith({
      items: [{ text: "Too deep", indent: 6, listType: "bullet" }],
    }),
  );
  assert.equal(result.success, false);
});

test("safeParseDeck rejects invalid listType", () => {
  const result = safeParseDeck(
    bulletsElementWith({
      items: [{ text: "Bad type", listType: "roman" }],
    }),
  );
  assert.equal(result.success, false);
});

test("safeParseDeck accepts items[] without optional indent/listType", () => {
  const result = safeParseDeck(
    bulletsElementWith({
      items: [{ text: "Simple item" }],
    }),
  );
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.kind, "bullets");
    if (el?.kind === "bullets") {
      assert.equal(el.items?.[0].text, "Simple item");
      assert.equal(el.items?.[0].indent, undefined);
      assert.equal(el.items?.[0].listType, undefined);
    }
  }
});

test("safeParseDeck rejects negative indent (-1) on items[]", () => {
  const result = safeParseDeck(
    bulletsElementWith({
      items: [{ text: "Bad", indent: -1 }],
    }),
  );
  assert.equal(result.success, false);
});

test("safeParseDeck rejects non-integer float indent (1.5) on items[]", () => {
  const result = safeParseDeck(
    bulletsElementWith({
      items: [{ text: "Bad", indent: 1.5 }],
    }),
  );
  assert.equal(result.success, false);
});
