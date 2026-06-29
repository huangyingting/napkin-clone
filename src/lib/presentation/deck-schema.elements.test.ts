import assert from "node:assert/strict";
import { test } from "node:test";

import { safeParseDeck, validateElement } from "./deck-schema";
import {
  validateBackgroundDesign,
  validateMasterElement,
  validateTextRuns,
} from "./deck-validation/elements";
import {
  CONNECTOR_ARROWS,
  TEXT_FIT_MODES,
  validateFiniteNumber,
  validateStringArray,
  validateUnitFraction,
  validateOpacity,
} from "./deck-validation/shared";
import type { Deck } from "./deck";
import { currentDeck, elementDeck } from "./deck-schema.test-helpers";

test("safeParseDeck accepts a current deck", () => {
  const result = safeParseDeck(currentDeck());
  assert.equal(result.success, true);
  if (result.success) {
    assert.ok(
      Array.isArray(result.data.slides[0].elements) &&
        result.data.slides[0].elements.length > 0,
    );
    assert.equal((result.data as any).canvas.format, "16:9");
  }
});

test("safeParseDeck round-trips a deck canvas format", () => {
  const result = safeParseDeck({
    ...(currentDeck() as object),
    canvas: { format: "4:3" },
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal((result.data as any).canvas.format, "4:3");
  }
});

test("safeParseDeck preserves a presentation design themeId", () => {
  const result = safeParseDeck({
    ...(currentDeck() as object),
    design: { themeId: "amber" },
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal((result.data as any).design.themeId, "amber");
  }
});

test("safeParseDeck rejects an unknown slide format", () => {
  const result = safeParseDeck({
    ...(currentDeck() as object),
    canvas: { format: "1:1" },
  });
  assert.equal(result.success, false);
});

test("safeParseDeck round-trips every element kind", () => {
  const input = elementDeck([
    {
      id: "t",
      kind: "text",
      role: "title",
      zIndex: 0,
      box: { x: 1, y: 2, w: 3, h: 4 },
      content: { kind: "text", text: "Hello", paragraphs: [{ text: "Hello" }] },
      designOverrides: {
        textStyle: { fontSize: 6, bold: true, italic: false, align: "center" },
      },
    },
    {
      id: "b",
      kind: "text",
      role: "bullet",
      zIndex: 1,
      box: { x: 1, y: 2, w: 3, h: 4 },
      content: {
        kind: "text",
        text: "one\ntwo",
        paragraphs: [
          { text: "one", listType: "bullet" },
          { text: "two", listType: "bullet" },
        ],
      },
      designOverrides: {
        textStyle: { fontSize: 4, bold: false, italic: true, align: "left" },
      },
    },
    {
      id: "v",
      kind: "visual",
      role: "visual",
      zIndex: 2,
      box: { x: 1, y: 2, w: 3, h: 4 },
      content: { kind: "visual", visualId: "vis-1" },
    },
    {
      id: "i",
      kind: "image",
      role: "image",
      zIndex: 3,
      box: { x: 1, y: 2, w: 3, h: 4 },
      content: { kind: "image", src: "https://example.com/a.png", alt: "alt" },
    },
    {
      id: "s",
      kind: "shape",
      role: "label",
      zIndex: 4,
      box: { x: 1, y: 2, w: 3, h: 4 },
      content: { kind: "shape", shape: "ellipse" },
      designOverrides: { fill: { value: "#00ff00" } },
    },
    {
      id: "c",
      kind: "connector",
      zIndex: 5,
      box: { x: 0, y: 0, w: 10, h: 10 },
      content: {
        kind: "connector",
        start: { x: 1, y: 2 },
        end: { x: 4, y: 5 },
      },
    },
    {
      id: "tbl",
      kind: "table",
      role: "table",
      zIndex: 6,
      box: { x: 10, y: 20, w: 60, h: 30 },
      content: {
        kind: "table",
        header: true,
        caption: "Revenue assumptions",
        columns: [
          { id: "col-1", label: "Region", width: 1 },
          { id: "col-2", label: "ARR", width: 1.5 },
        ],
        rows: [
          {
            id: "row-1",
            cells: [
              { text: "NA", runs: [{ text: "NA", bold: true }] },
              { text: "$12M" },
            ],
          },
        ],
      },
      designOverrides: {
        tableStyle: {
          headerFill: { token: "accent" },
          rowFill: { token: "surface" },
          alternateRowFill: { value: "#f4f4f5" },
          borderColor: "#d4d4d8",
          borderWidth: 0.2,
          textStyle: { fontSize: 2.2, align: "left" },
          headerTextStyle: { bold: true, color: "#ffffff" },
        },
      },
    },
  ]);

  const result = safeParseDeck(input);
  assert.equal(result.success, true);
  if (result.success) {
    const slide = result.data.slides[0];
    assert.equal(slide.elements?.length, 7);
    const table = slide.elements?.find((element) => element.kind === "table");
    assert.ok(table);
    assert.equal(table.role, "table");
    assert.equal(table.content.caption, "Revenue assumptions");
    assert.equal(table.content.rows[0].cells[0].runs?.[0]?.bold, true);
    assert.deepEqual((table as any).designOverrides.tableStyle.headerFill, {
      token: "accent",
    });
    assert.deepEqual((slide as any).designOverrides.background, {
      type: "solid",
      color: { value: "#101010" },
    });
    assert.deepEqual((slide as any).designOverrides.accent, {
      value: "#abcdef",
    });
  }
});

test("safeParseDeck round-trips run-level underline and fontSize", () => {
  const result = safeParseDeck(
    elementDeck([
      {
        id: "underlined-text",
        kind: "text",
        zIndex: 0,
        box: { x: 1, y: 2, w: 30, h: 12 },
        content: {
          kind: "text",
          text: "Hello",
          paragraphs: [
            {
              text: "Hello",
              runs: [{ text: "Hello", underline: true, fontSize: 4 }],
            },
          ],
          runs: [{ text: "Hello", underline: true, fontSize: 4 }],
        },
        designOverrides: {
          textStyle: { fontSize: 4, bold: false, italic: false, align: "left" },
        },
      },
    ]),
  );

  assert.equal(result.success, true);
  if (result.success) {
    const element = result.data.slides[0]?.elements?.[0];
    assert.ok(element);
    assert.equal(element.kind, "text");
    if (element.kind === "text") {
      assert.equal((element as any).content.runs?.[0]?.underline, true);
      assert.equal((element as any).content.runs?.[0]?.fontSize, 4);
      assert.equal(
        (element as any).content.paragraphs?.[0]?.runs?.[0]?.underline,
        true,
      );
      assert.equal(
        (element as any).content.paragraphs?.[0]?.runs?.[0]?.fontSize,
        4,
      );
    }
  }
});

test("element validation preserves underline and z-index normalization", () => {
  assert.deepEqual(
    validateTextRuns([{ text: "Label", underline: false }], "runs"),
    [{ text: "Label", underline: false }],
  );

  const element = validateElement(
    {
      ...textElementBase(),
      zIndex: 7,
      designOverrides: {
        textStyle: { underline: true },
      },
    },
    "element",
  ) as any;

  assert.equal(element.zIndex, 7);
  assert.equal(element.designOverrides.textStyle.underline, true);
});

test("safeParseDeck rejects an unknown element kind", () => {
  const result = safeParseDeck(
    elementDeck([
      { id: "x", kind: "nope", zIndex: 0, box: { x: 0, y: 0, w: 1, h: 1 } },
    ]),
  );
  assert.equal(result.success, false);
});

test("safeParseDeck rejects table rows with mismatched cell counts", () => {
  const result = safeParseDeck(
    elementDeck([
      {
        id: "tbl",
        kind: "table",
        zIndex: 0,
        box: { x: 0, y: 0, w: 40, h: 30 },
        content: {
          kind: "table",
          columns: [
            { id: "col-1", label: "A" },
            { id: "col-2", label: "B" },
          ],
          rows: [{ id: "row-1", cells: [{ text: "one" }] }],
        },
      },
    ]),
  );
  assert.equal(result.success, false);
  if (!result.success) {
    assert.match(result.error, /cells must contain exactly 2 cells/);
  }
});

test("safeParseDeck rejects duplicate table column and row ids", () => {
  const duplicateColumns = safeParseDeck(
    elementDeck([
      {
        id: "tbl",
        kind: "table",
        zIndex: 0,
        box: { x: 0, y: 0, w: 40, h: 30 },
        content: {
          kind: "table",
          columns: [
            { id: "col-1", label: "A" },
            { id: "col-1", label: "B" },
          ],
          rows: [{ id: "row-1", cells: [{ text: "one" }, { text: "two" }] }],
        },
      },
    ]),
  );
  assert.equal(duplicateColumns.success, false);

  const duplicateRows = safeParseDeck(
    elementDeck([
      {
        id: "tbl",
        kind: "table",
        zIndex: 0,
        box: { x: 0, y: 0, w: 40, h: 30 },
        content: {
          kind: "table",
          columns: [{ id: "col-1", label: "A" }],
          rows: [
            { id: "row-1", cells: [{ text: "one" }] },
            { id: "row-1", cells: [{ text: "two" }] },
          ],
        },
      },
    ]),
  );
  assert.equal(duplicateRows.success, false);
});

test("validateElement rejects a placeholder element", () => {
  assert.throws(
    () =>
      validateElement(
        {
          id: "ph-title",
          kind: "placeholder",
          placeholderType: "title",
          zIndex: 0,
          box: { x: 0, y: 0, w: 10, h: 10 },
        },
        "element",
      ),
    /element\.kind must be one of: text, visual, image, shape, connector/,
  );
});

test("safeParseDeck rejects an invalid slide background override", () => {
  const input = elementDeck([]) as { slides: { designOverrides: unknown }[] };
  input.slides[0].designOverrides = {
    background: { type: "solid", color: { token: "not-a-token" } },
  };
  assert.equal(safeParseDeck(input).success, false);
});

test("safeParseDeck accepts a text element without local design overrides", () => {
  const result = safeParseDeck(
    elementDeck([
      {
        id: "t",
        kind: "text",
        zIndex: 0,
        box: { x: 0, y: 0, w: 1, h: 1 },
        content: { kind: "text", text: "x" },
      },
    ]),
  );
  assert.equal(result.success, true);
});

test("validated elements preserve a stable shape", () => {
  const result = safeParseDeck(
    elementDeck([
      {
        id: "s",
        kind: "shape",
        role: "label",
        zIndex: 0,
        box: { x: 5, y: 5, w: 10, h: 10 },
        content: { kind: "shape", shape: "rect" },
        designOverrides: { fill: { value: "#123456" } },
      },
    ]),
  );
  assert.equal(result.success, true);
  if (result.success) {
    const deck: Deck = result.data;
    const element = deck.slides[0].elements?.[0];
    assert.equal(element?.kind, "shape");
    if (element?.kind === "shape") {
      assert.deepEqual((element as any).designOverrides.fill, {
        value: "#123456",
      });
      assert.equal((element as any).content.shape, "rect");
    }
  }
});

test("deck validation shared helpers clamp opacity and reject invalid scalar arrays", () => {
  assert.equal(validateFiniteNumber(3, "count"), 3);
  assert.throws(() => validateFiniteNumber("3", "count"), /finite number/);
  assert.equal(validateOpacity(2, "opacity"), 1);
  assert.equal(validateOpacity(-1, "opacity"), 0);
  assert.throws(
    () => validateStringArray("roles", "roles"),
    /must be an array/,
  );
  assert.deepEqual(validateStringArray(["title", "body"], "roles"), [
    "title",
    "body",
  ]);
  assert.equal(validateUnitFraction(0.5, "crop.left"), 0.5);
  assert.throws(() => validateStringArray(["ok", 3], "roles"), /roles\[1\]/);
  assert.throws(
    () => validateUnitFraction(1.5, "crop.left"),
    /between 0 and 1/,
  );
  assert.deepEqual(CONNECTOR_ARROWS, ["none", "arrow", "filled"]);
  assert.deepEqual(TEXT_FIT_MODES, [
    "auto-height",
    "fixed-box",
    "shrink-to-fit",
  ]);
});

test("safeParseDeck accepts optional slide, master, and custom-template fields", () => {
  const result = safeParseDeck({
    ...(currentDeck() as Record<string, unknown>),
    design: { themeId: " default ", themeOverrides: { tokenSet: { id: "x" } } },
    deckContentHash: "hash-1",
    masters: [
      {
        id: "master-default",
        name: "Default",
        background: {
          type: "gradient",
          from: { token: "slideBg" },
          to: { value: "#ffffff" },
          angle: 45,
        },
        designOverrides: {
          background: { type: "image", url: "/bg.png", assetId: "asset-bg" },
        },
        elements: [
          {
            id: "master-logo",
            kind: "image",
            role: "logo",
            layer: "foreground",
            locked: true,
            masterChromeKind: "logo",
            zIndex: 1,
            box: { x: 1, y: 1, w: 8, h: 8 },
            content: { kind: "image", assetId: "asset-logo" },
          },
          {
            id: "master-page",
            kind: "text",
            role: "pageNumber",
            layer: "foreground",
            locked: true,
            masterChromeKind: "pageNumber",
            zIndex: 2,
            box: { x: 90, y: 94, w: 6, h: 4 },
            content: { kind: "text", text: "1" },
          },
          {
            id: "master-watermark",
            kind: "text",
            role: "background",
            layer: "background",
            locked: true,
            masterChromeKind: "watermark",
            zIndex: -1,
            box: { x: 20, y: 40, w: 60, h: 20 },
            content: { kind: "text", text: "Draft" },
          },
        ],
      },
    ],
    customTemplates: [
      {
        id: "tpl-content",
        name: "Content",
        category: "content",
        defaultMasterId: "master-default",
        slideDesignDefaults: {
          background: { type: "solid", color: { value: "#101010" } },
        },
        elements: [
          {
            id: "tpl-title",
            kind: "text",
            role: "title",
            box: { x: 5, y: 5, w: 90, h: 10 },
            contentDefaults: { text: "Title" },
          },
        ],
      },
    ],
    slides: [
      {
        id: "slide-1",
        index: 0,
        title: "Slide",
        notes: "Speaker notes",
        masterId: "master-default",
        templateId: "tpl-content",
        designOverrides: {
          background: {
            type: "gradient",
            from: { value: "#111111" },
            to: { token: "surface" },
          },
        },
        source: { blockId: "block-1" },
        elements: [],
      },
    ],
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal((result.data as any).design.themeId, "default");
  assert.equal((result.data as any).deckContentHash, "hash-1");
  assert.equal(
    (result.data as any).customTemplates[0].defaultMasterId,
    "master-default",
  );
  assert.equal((result.data as any).masters[0].elements.length, 3);
});

test("safeParseDeck validates rich element variants and optional base fields", () => {
  const result = safeParseDeck(
    elementDeck([
      {
        id: "rich-text",
        kind: "text",
        role: "body",
        zIndex: 1,
        opacity: 0.4,
        rotation: 12,
        shadow: true,
        locked: false,
        hidden: false,
        name: "Body copy",
        groupId: "group-1",
        source: {
          documentId: "doc-1",
          blockId: "block-1",
          linkedAt: "2026-01-01T00:00:00.000Z",
          blockKind: "text",
        },
        box: { x: 5, y: 10, w: 40, h: 20 },
        designOverrides: {
          textStyle: {
            fontSize: 4,
            bold: true,
            italic: true,
            underline: true,
            align: "right",
            verticalAlign: "bottom",
            lineHeight: 1.3,
            paragraphSpacing: 1.2,
            color: "#123456",
            fontId: "inter",
          },
          stroke: { color: "#abcdef", width: -2 },
          radius: 99,
          opacity: 2,
          dash: true,
        },
        content: {
          kind: "text",
          text: "Item",
          fitMode: "shrink-to-fit",
          bulletGap: 2,
          bulletIndent: 4,
          runs: [
            {
              text: "Item",
              bold: true,
              italic: true,
              underline: true,
              code: true,
              color: "#ffffff",
              link: "https://example.test",
            },
          ],
          paragraphs: [
            {
              text: "Item",
              indent: 2,
              listType: "number",
              runs: [{ text: "Item" }],
            },
          ],
        },
      },
      {
        id: "styled-image",
        kind: "image",
        role: "image",
        zIndex: 2,
        box: { x: 50, y: 10, w: 30, h: 30 },
        designOverrides: { fitMode: "cover", maskShape: "circle" },
        content: {
          kind: "image",
          src: "https://example.test/image.png",
          assetId: "asset-image",
          alt: "",
          crop: { left: 0.1, right: 0.2, top: 0.3, bottom: 0.1 },
        },
      },
      {
        id: "shape-text",
        kind: "shape",
        role: "label",
        zIndex: 3,
        box: { x: 10, y: 50, w: 20, h: 20 },
        content: {
          kind: "shape",
          shape: "circle",
          text: "Delta",
          textRuns: [{ text: "Delta" }],
        },
      },
      {
        id: "bound-connector",
        kind: "connector",
        zIndex: 4,
        box: { x: 0, y: 0, w: 100, h: 100 },
        designOverrides: { arrowStart: "none", arrowEnd: "filled" },
        content: {
          kind: "connector",
          start: { elementId: "rich-text", anchor: "right" },
          end: { elementId: "shape-text", anchor: "left" },
          routing: "elbow",
        },
      },
      {
        id: "visual-alt",
        kind: "visual",
        role: "visual",
        zIndex: 5,
        box: { x: 35, y: 50, w: 25, h: 25 },
        content: {
          kind: "visual",
          visualId: "vis-1",
          styleThemeId: "theme-1",
          alt: "Chart",
        },
      },
    ]),
  );

  assert.equal(result.success, true);
  if (!result.success) return;
  const elements = result.data.slides[0].elements ?? [];
  assert.equal((elements[0] as any).designOverrides.radius, 50);
  assert.equal((elements[0] as any).designOverrides.stroke.width, 0);
  assert.equal((elements[3] as any).content.routing, "elbow");
  assert.equal((elements[4] as any).content.styleThemeId, "theme-1");
  assert.equal((elements[4] as any).content.alt, "Chart");
});

test("element validation normalizes optional design and content branches", () => {
  assert.deepEqual(
    validateBackgroundDesign(
      { type: "image", url: "/background.png", assetId: "asset-bg" },
      "background",
    ),
    { type: "image", url: "/background.png", assetId: "asset-bg" },
  );

  const element = validateElement(
    {
      ...textElementBase(),
      designOverrides: {
        background: { type: "solid", color: { token: "surface" } },
        fill: { token: "accent" },
        stroke: { color: "#abc", width: 3 },
        radius: -5,
        opacity: -1,
        dash: 1,
      },
      content: {
        kind: "text",
        text: "Bullets",
        runs: [{ text: "Bullets", fontSize: 3 }],
        paragraphs: [{ text: "Bullets", indent: 0 }],
        bulletGap: 1,
        bulletIndent: 2,
      },
    },
    "element",
  ) as any;

  assert.equal(element.designOverrides.radius, 0);
  assert.equal(element.designOverrides.opacity, 0);
  assert.equal(element.designOverrides.dash, true);
  assert.equal(element.content.bulletGap, 1);
  assert.equal(element.content.bulletIndent, 2);
});

test("background validation normalizes supported solid, gradient, and image variants", () => {
  assert.deepEqual(
    validateBackgroundDesign(
      { type: "solid", color: { token: "slideBg" } },
      "background",
    ),
    { type: "solid", color: { token: "slideBg" } },
  );
  assert.deepEqual(
    validateBackgroundDesign(
      {
        type: "gradient",
        from: { value: "#111111" },
        to: { token: "surface" },
        angle: 30,
      },
      "background",
    ),
    {
      type: "gradient",
      from: { value: "#111111" },
      to: { token: "surface" },
      angle: 30,
    },
  );
  assert.deepEqual(
    validateBackgroundDesign(
      { type: "image", url: "/background.png" },
      "background",
    ),
    { type: "image", url: "/background.png" },
  );
  assert.throws(
    () => validateBackgroundDesign({ type: "pattern" }, "background"),
    /background\.type/,
  );
});

test("element validation rejects malformed source, paragraph, and connector point branches", () => {
  assert.throws(
    () =>
      validateElement(
        {
          ...textElementBase(),
          box: null,
        },
        "element",
      ),
    /element\.box must be an object/,
  );
  assert.throws(
    () =>
      validateElement(
        {
          ...textElementBase(),
          source: null,
        },
        "element",
      ),
    /element\.source must be an object/,
  );
  assert.throws(
    () =>
      validateElement(
        {
          ...textElementBase(),
          content: {
            kind: "text",
            text: "Paragraphs",
            paragraphs: [null],
          },
        },
        "element",
      ),
    /element\.content\.paragraphs\[0\] must be an object/,
  );
  assert.throws(
    () =>
      validateElement(
        {
          ...connectorElementBase(),
          content: {
            kind: "connector",
            start: null,
            end: { x: 1, y: 1 },
          },
        },
        "element",
      ),
    /element\.content\.start must be an object/,
  );
  assert.throws(
    () =>
      validateElement(
        {
          ...connectorElementBase(),
          content: {
            kind: "connector",
            start: { elementId: "target", anchor: "diagonal" },
            end: { x: 1, y: 1 },
          },
        },
        "element",
      ),
    /element\.content\.start\.anchor/,
  );
});

test("master element validation accepts every chrome kind contract", () => {
  const cases = [
    [
      "logo",
      {
        ...imageElementBase(),
        id: "master-logo",
        role: "logo",
        layer: "foreground",
        locked: true,
        masterChromeKind: "logo",
      },
    ],
    [
      "footer",
      {
        ...textElementBase(),
        id: "master-footer",
        role: "footer",
        layer: "foreground",
        locked: true,
        masterChromeKind: "footer",
      },
    ],
    [
      "pageNumber",
      {
        ...textElementBase(),
        id: "master-page-number",
        role: "pageNumber",
        layer: "foreground",
        locked: true,
        masterChromeKind: "pageNumber",
      },
    ],
    [
      "watermark",
      {
        ...textElementBase(),
        id: "master-watermark",
        role: "background",
        layer: "background",
        locked: true,
        masterChromeKind: "watermark",
      },
    ],
  ] as const;

  for (const [chromeKind, element] of cases) {
    const validated = validateMasterElement(element, `master.${chromeKind}`);
    assert.equal(validated.masterChromeKind, chromeKind);
    assert.equal(validated.locked, true);
  }
});

test("safeParseDeck rejects invalid deck and element branches with precise errors", () => {
  const invalidDecks = [
    [
      { ...(currentDeck() as Record<string, unknown>), schemaVersion: 99 },
      /schemaVersion 99/,
    ],
    [
      { ...(currentDeck() as Record<string, unknown>), masters: "nope" },
      /Deck\.masters must be an array/,
    ],
    [
      { ...(currentDeck() as Record<string, unknown>), slides: "nope" },
      /Deck\.slides must be an array/,
    ],
    [
      {
        ...(currentDeck() as Record<string, unknown>),
        customTemplates: "nope",
      },
      /customTemplates must be an array/,
    ],
  ] as const;

  for (const [deck, message] of invalidDecks) {
    const result = safeParseDeck(deck);
    assert.equal(result.success, false);
    assert.match(result.error, message);
  }

  const invalidElements = [
    [{ ...textElementBase(), role: "not-a-role" }, /role must be one of/],
    [
      { ...textElementBase(), opacity: Number.NaN },
      /opacity must be a finite number/,
    ],
    [
      { ...textElementBase(), zIndex: Number.NaN },
      /zIndex must be a finite number/,
    ],
    [{ ...textElementBase(), box: null }, /box must be an object/],
    [{ ...textElementBase(), name: "" }, /name must be a non-empty string/],
    [
      { ...textElementBase(), groupId: "" },
      /groupId must be a non-empty string/,
    ],
    [
      {
        ...textElementBase(),
        designOverrides: { fill: null },
      },
      /fill must be an object/,
    ],
    [
      {
        ...textElementBase(),
        designOverrides: { stroke: { color: "red", width: 1 } },
      },
      /stroke\.color must be a hex color/,
    ],
    [
      {
        ...textElementBase(),
        designOverrides: { arrowStart: "triangle" },
      },
      /arrowStart must be one of/,
    ],
    [
      {
        ...textElementBase(),
        designOverrides: { arrowEnd: "triangle" },
      },
      /arrowEnd must be one of/,
    ],
    [
      {
        ...textElementBase(),
        designOverrides: { textStyle: { align: "middle" } },
      },
      /align must be one of/,
    ],
    [
      {
        ...textElementBase(),
        designOverrides: { textStyle: { verticalAlign: "center" } },
      },
      /verticalAlign must be one of/,
    ],
    [
      {
        ...textElementBase(),
        content: {
          kind: "text",
          text: "x",
          paragraphs: [{ text: "x", indent: 6 }],
        },
      },
      /indent must be an integer/,
    ],
    [
      {
        ...textElementBase(),
        content: {
          kind: "text",
          text: "x",
          paragraphs: [{ text: "x", listType: "roman" }],
        },
      },
      /listType must be/,
    ],
    [
      {
        ...textElementBase(),
        content: { kind: "text", text: "x", fitMode: "grow" },
      },
      /fitMode must be one of/,
    ],
    [
      {
        ...textElementBase(),
        content: { kind: "text", text: "x", bulletGap: Infinity },
      },
      /bulletGap must be a finite number/,
    ],
    [
      {
        ...textElementBase(),
        content: { kind: "text", text: "x", bulletIndent: Infinity },
      },
      /bulletIndent must be a finite number/,
    ],
    [
      { ...imageElementBase(), content: { kind: "image", alt: 7 } },
      /src or .*assetId/,
    ],
    [
      {
        ...imageElementBase(),
        content: { kind: "image", src: "", assetId: "" },
      },
      /src or .*assetId/,
    ],
    [
      {
        ...imageElementBase(),
        content: { kind: "image", src: "x", assetId: 7 },
      },
      /assetId must be a string/,
    ],
    [
      { ...imageElementBase(), content: { kind: "image", src: "x", alt: 7 } },
      /alt must be a string/,
    ],
    [
      { ...shapeElementBase(), content: { kind: "shape", shape: "hexagon" } },
      /shape must be one of/,
    ],
    [
      {
        ...connectorElementBase(),
        content: {
          kind: "connector",
          start: { elementId: "" },
          end: { x: 1, y: 1 },
        },
      },
      /elementId must be a non-empty string/,
    ],
    [
      {
        ...connectorElementBase(),
        content: {
          kind: "connector",
          start: { elementId: "x", anchor: "middle" },
          end: { x: 1, y: 1 },
        },
      },
      /anchor must be one of/,
    ],
  ] as const;

  for (const [element, message] of invalidElements) {
    assert.throws(() => validateElement(element, "element"), message);
  }
});

test("background and master chrome validation reject invalid contracts", () => {
  assert.throws(
    () => validateBackgroundDesign(null, "background"),
    /background must be an object/,
  );
  assert.throws(
    () => validateBackgroundDesign({ type: "image", url: "" }, "background"),
    /background\.url must be a non-empty string/,
  );
  assert.throws(
    () =>
      validateBackgroundDesign(
        { type: "image", url: "/bg.png", assetId: 7 },
        "background",
      ),
    /assetId must be a non-empty string/,
  );
  assert.throws(
    () =>
      validateBackgroundDesign(
        { type: "image", url: "/bg.png", assetId: "" },
        "background",
      ),
    /assetId must be a non-empty string/,
  );
  assert.throws(
    () => validateBackgroundDesign({ type: "video" }, "background"),
    /type must be "solid", "gradient", "radialGradient", or "image"/,
  );
  assert.throws(
    () =>
      validateMasterElement(
        {
          ...textElementBase(),
          role: "footer",
          layer: "foreground",
          locked: false,
          masterChromeKind: "footer",
        },
        "master.footer",
      ),
    /locked must be true/,
  );
  assert.throws(
    () =>
      validateMasterElement(
        {
          ...textElementBase(),
          role: "footer",
          layer: "foreground",
          locked: true,
          masterChromeKind: "unknown",
        },
        "master.footer",
      ),
    /masterChromeKind must be one of/,
  );
});

test("element validation covers residual normalization and rejection branches", () => {
  const styled = validateElement(
    {
      ...textElementBase(),
      opacity: 0.5,
      rotation: 5,
      designOverrides: {
        textStyle: {
          italic: true,
          verticalAlign: "middle",
          lineHeight: 1.4,
          paragraphSpacing: 0.8,
        },
      },
      content: {
        kind: "text",
        text: "Line",
        runs: [{ text: "Line", link: "https://example.test" }],
        paragraphs: [{ text: "Line" }],
        bulletGap: 3,
      },
    },
    "element",
  ) as any;

  assert.equal(styled.opacity, 0.5);
  assert.equal(styled.rotation, 5);
  assert.equal(styled.designOverrides.textStyle.italic, true);
  assert.equal(styled.designOverrides.textStyle.verticalAlign, "middle");
  assert.equal(styled.designOverrides.textStyle.lineHeight, 1.4);
  assert.equal(styled.designOverrides.textStyle.paragraphSpacing, 0.8);
  assert.equal(styled.content.runs[0].link, "https://example.test");
  assert.equal(styled.content.bulletGap, 3);

  const designNormalized = validateElement(
    {
      ...connectorElementBase(),
      designOverrides: {
        arrowEnd: "arrow",
        opacity: 0.75,
        dash: 1,
        textStyle: {
          underline: 1,
          align: "center",
        },
      },
    },
    "connector",
  ) as any;
  assert.equal(designNormalized.designOverrides.arrowEnd, "arrow");
  assert.equal(designNormalized.designOverrides.opacity, 0.75);
  assert.equal(designNormalized.designOverrides.dash, true);
  assert.equal(designNormalized.designOverrides.textStyle.underline, true);
  assert.equal(designNormalized.designOverrides.textStyle.align, "center");

  const shaped = validateElement(
    {
      ...shapeElementBase(),
      content: {
        kind: "shape",
        shape: "rect",
        textRuns: [{ text: "Label", underline: true }],
      },
    },
    "shape",
  ) as any;
  assert.equal(shaped.content.textRuns[0].underline, true);

  assert.throws(
    () =>
      validateElement(
        { ...visualElementBase(), content: { kind: "visual" } },
        "visual",
      ),
    /visual\.content\.visualId must be a non-empty string/,
  );
  assert.throws(
    () =>
      validateElement(
        {
          ...imageElementBase(),
          content: { kind: "image", src: "", assetId: "" },
        },
        "image",
      ),
    /image\.content\.src or image\.content\.assetId/,
  );
  assert.throws(
    () => validateElement({ ...textElementBase(), content: null }, "element"),
    /element\.content must be an object/,
  );
  assert.throws(
    () =>
      validateElement(
        {
          ...textElementBase(),
          content: { kind: "shape", text: "x" },
        },
        "element",
      ),
    /element\.content\.kind must match element kind/,
  );
  assert.throws(
    () =>
      validateElement(
        {
          ...textElementBase(),
          content: { kind: "text", text: 7 },
        },
        "element",
      ),
    /element\.content\.text must be a string/,
  );
  assert.throws(
    () =>
      validateElement(
        {
          ...textElementBase(),
          content: { kind: "text", text: "x", runs: [{ text: 7 }] },
        },
        "element",
      ),
    /element\.content\.runs\[0\]\.text must be a string/,
  );
  assert.throws(
    () =>
      validateElement(
        {
          ...textElementBase(),
          content: {
            kind: "text",
            text: "x",
            runs: [{ text: "x", color: "red" }],
          },
        },
        "element",
      ),
    /element\.content\.runs\[0\]\.color must be a hex color/,
  );
  assert.throws(
    () =>
      validateElement(
        {
          ...textElementBase(),
          content: { kind: "text", text: "x", runs: [{ text: "x", link: 7 }] },
        },
        "element",
      ),
    /element\.content\.runs\[0\]\.link must be a string/,
  );
  assert.throws(
    () =>
      validateElement(
        {
          ...connectorElementBase(),
          content: {
            kind: "connector",
            start: { elementId: "shape-base", anchor: "middle" },
            end: { x: 1, y: 1 },
          },
        },
        "connector",
      ),
    /connector\.content\.start\.anchor must be one of/,
  );
});

function textElementBase(): Record<string, unknown> {
  return {
    id: "text-base",
    kind: "text",
    zIndex: 0,
    box: { x: 0, y: 0, w: 10, h: 10 },
    content: { kind: "text", text: "x" },
  };
}

function visualElementBase(): Record<string, unknown> {
  return {
    id: "visual-base",
    kind: "visual",
    zIndex: 0,
    box: { x: 0, y: 0, w: 10, h: 10 },
    content: { kind: "visual", visualId: "vis-1" },
  };
}

function imageElementBase(): Record<string, unknown> {
  return {
    id: "image-base",
    kind: "image",
    zIndex: 0,
    box: { x: 0, y: 0, w: 10, h: 10 },
    content: { kind: "image", src: "https://example.test/image.png" },
  };
}

function shapeElementBase(): Record<string, unknown> {
  return {
    id: "shape-base",
    kind: "shape",
    zIndex: 0,
    box: { x: 0, y: 0, w: 10, h: 10 },
    content: { kind: "shape", shape: "rect" },
  };
}

function connectorElementBase(): Record<string, unknown> {
  return {
    id: "connector-base",
    kind: "connector",
    zIndex: 0,
    box: { x: 0, y: 0, w: 10, h: 10 },
    content: { kind: "connector", start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  };
}
