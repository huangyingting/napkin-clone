import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defaultLayouts,
  isSourceLinked,
  isSourceStale,
  relinkSource,
  unlinkSource,
  type Deck,
  type SourceRef,
  type TextElement,
} from "./deck";
import {
  safeParseDeck,
  validateElement,
  validateImageCrop,
  validateImageFitMode,
  validateImageMaskShape,
  validateSourceRef,
} from "./deck-schema";
import {
  buildDeck,
  buildImageElement,
  buildSlide,
  buildSourceRef,
  buildTextElement,
} from "@/test/builders/deck";

// ---------------------------------------------------------------------------
// Current deck validation
// ---------------------------------------------------------------------------

function currentDeck(): unknown {
  return buildDeck({
    theme: "default",
    slides: [
      buildSlide({
        id: "sl-current",
        title: "Current",
        bullets: ["a", "b"],
        layout: "content",
        elements: [
          buildTextElement({
            id: "txt-1",
            text: "Current",
            role: "title",
            zIndex: 0,
            box: { x: 6, y: 6, w: 88, h: 16 },
            style: { fontSize: 6, bold: true, italic: false, align: "left" },
          }),
        ],
      }),
    ],
  });
}

function imageElementDeck(overrides: Record<string, unknown> = {}): unknown {
  return elementDeck([
    {
      ...buildImageElement({
        id: "img-1",
        src: "https://example.com/a.png",
        zIndex: 0,
        box: { x: 8, y: 10, w: 32, h: 24 },
      }),
      ...overrides,
    },
  ]);
}

test("safeParseDeck accepts a current deck", () => {
  const result = safeParseDeck(currentDeck());
  assert.equal(result.success, true);
  if (result.success) {
    assert.ok(
      Array.isArray(result.data.slides[0].elements) &&
        result.data.slides[0].elements.length > 0,
    );
    assert.equal(result.data.slideFormat, "16:9");
  }
});

test("safeParseDeck round-trips a deck slide format", () => {
  const result = safeParseDeck({
    ...(currentDeck() as object),
    slideFormat: "4:3",
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.slideFormat, "4:3");
  }
});

test("safeParseDeck preserves an optional deck themeId", () => {
  const result = safeParseDeck({
    ...(currentDeck() as object),
    themeId: "amber",
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.themeId, "amber");
  }
});

test("safeParseDeck rejects an unknown slide format", () => {
  const result = safeParseDeck({
    ...(currentDeck() as object),
    slideFormat: "1:1",
  });
  assert.equal(result.success, false);
});

// ---------------------------------------------------------------------------
// Free-form element validation
// ---------------------------------------------------------------------------

function elementDeck(elements: unknown[]): unknown {
  return buildDeck({
    theme: "indigo",
    slides: [
      slideFixture({
        id: "sl-element",
        theme: "indigo",
        background: "#101010",
        accent: "#abcdef",
        elements,
      }) as unknown as Deck["slides"][number],
    ],
  });
}

function slideFixture(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const theme = (overrides.theme as Deck["theme"] | undefined) ?? "default";
  return buildSlide({
    theme,
    id: "sl-fixture",
    title: "",
    bullets: [],
    layout: "blank",
    elements: [],
    ...overrides,
  } as Partial<Deck["slides"][number]>) as unknown as Record<string, unknown>;
}

function makeSourceRef(overrides: Partial<SourceRef> = {}): SourceRef {
  return buildSourceRef({
    documentId: "doc-1",
    blockId: "block-1",
    contentHash: "hash-1",
    ...overrides,
  });
}

function sourceLinkedTextElement(
  sourceRef: SourceRef = makeSourceRef(),
): TextElement {
  return buildTextElement({
    id: "linked-text",
    role: "body",
    text: "Linked content",
    zIndex: 0,
    box: { x: 1, y: 2, w: 30, h: 12 },
    style: { fontSize: 4, bold: false, italic: false, align: "left" },
    sourceRef,
  });
}

test("safeParseDeck round-trips every element kind", () => {
  const input = elementDeck([
    {
      id: "t",
      kind: "text",
      role: "title",
      text: "Hello",
      zIndex: 0,
      box: { x: 1, y: 2, w: 3, h: 4 },
      style: { fontSize: 6, bold: true, italic: false, align: "center" },
    },
    {
      id: "b",
      kind: "bullets",
      bullets: ["one", "two"],
      items: [{ text: "one" }, { text: "two" }],
      zIndex: 1,
      box: { x: 1, y: 2, w: 3, h: 4 },
      style: { fontSize: 4, bold: false, italic: true, align: "left" },
    },
    {
      id: "v",
      kind: "visual",
      visualId: "vis-1",
      zIndex: 2,
      box: { x: 1, y: 2, w: 3, h: 4 },
    },
    {
      id: "i",
      kind: "image",
      src: "https://example.com/a.png",
      alt: "alt",
      zIndex: 3,
      box: { x: 1, y: 2, w: 3, h: 4 },
    },
    {
      id: "s",
      kind: "shape",
      shape: "ellipse",
      color: "#00ff00",
      zIndex: 4,
      box: { x: 1, y: 2, w: 3, h: 4 },
    },
  ]);

  const result = safeParseDeck(input);
  assert.equal(result.success, true);
  if (result.success) {
    const slide = result.data.slides[0];
    assert.equal(slide.elements?.length, 5);
    assert.equal(slide.background, "#101010");
    assert.equal(slide.accent, "#abcdef");
  }
});

test("safeParseDeck rejects an unknown element kind", () => {
  const result = safeParseDeck(
    elementDeck([
      { id: "x", kind: "nope", zIndex: 0, box: { x: 0, y: 0, w: 1, h: 1 } },
    ]),
  );
  assert.equal(result.success, false);
});

test("validateSourceRef accepts source link metadata", () => {
  const ref = makeSourceRef({ unlinked: true });
  assert.deepEqual(validateSourceRef(ref, "sourceRef"), ref);
});

test("safeParseDeck round-trips an element sourceRef", () => {
  const result = safeParseDeck(elementDeck([sourceLinkedTextElement()]));
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.kind, "text");
    assert.deepEqual(el?.sourceRef, makeSourceRef());
  }
});

test("validateSourceRef rejects invalid source link metadata", () => {
  assert.throws(
    () =>
      validateSourceRef(
        {
          documentId: "doc-1",
          blockId: "",
          linkedAt: "not-a-timestamp",
        },
        "sourceRef",
      ),
    /sourceRef\.blockId must be a non-empty string/,
  );
  assert.throws(
    () =>
      validateSourceRef(
        {
          documentId: "doc-1",
          blockId: "block-1",
          linkedAt: "not-a-timestamp",
        },
        "sourceRef",
      ),
    /sourceRef\.linkedAt must be a valid ISO timestamp/,
  );
});

// ---------------------------------------------------------------------------
// Image crop / fit / mask validation (issue #342)
// ---------------------------------------------------------------------------

test("validateImageFitMode accepts the supported fit modes", () => {
  for (const fitMode of ["contain", "cover", "fill", "none"] as const) {
    assert.equal(validateImageFitMode(fitMode, "fitMode"), fitMode);
  }
  assert.equal(validateImageFitMode(undefined, "fitMode"), undefined);
});

test("validateImageFitMode rejects an unknown fit mode", () => {
  assert.throws(
    () => validateImageFitMode("stretch", "fitMode"),
    /fitMode must be one of/,
  );
});

test("validateImageMaskShape accepts the supported mask shapes", () => {
  for (const maskShape of ["none", "circle", "rounded", "diamond"] as const) {
    assert.equal(validateImageMaskShape(maskShape, "maskShape"), maskShape);
  }
  assert.equal(validateImageMaskShape(undefined, "maskShape"), undefined);
});

test("validateImageMaskShape rejects an unknown mask shape", () => {
  assert.throws(
    () => validateImageMaskShape("star", "maskShape"),
    /maskShape must be one of/,
  );
});

test("validateImageCrop accepts fractional top/right/bottom/left values", () => {
  assert.deepEqual(validateImageCrop(undefined, "crop"), undefined);
  assert.deepEqual(
    validateImageCrop({ top: 0.1, right: 0.2, bottom: 0.3, left: 0.4 }, "crop"),
    {
      top: 0.1,
      right: 0.2,
      bottom: 0.3,
      left: 0.4,
    },
  );
});

test("validateImageCrop rejects out-of-range crop fractions", () => {
  assert.throws(
    () =>
      validateImageCrop(
        { top: -0.1, right: 0.2, bottom: 0.3, left: 0.4 },
        "crop",
      ),
    /crop\.top must be between 0 and 1/,
  );
});

test("safeParseDeck round-trips image crop, fitMode, and maskShape", () => {
  const result = safeParseDeck(
    imageElementDeck({
      fitMode: "fill",
      maskShape: "diamond",
      crop: { top: 0.1, right: 0.2, bottom: 0.3, left: 0.05 },
    }),
  );
  assert.equal(result.success, true);
  if (result.success) {
    const element = result.data.slides[0].elements?.[0];
    assert.equal(element?.kind, "image");
    if (element?.kind === "image") {
      assert.equal(element.fitMode, "fill");
      assert.equal(element.maskShape, "diamond");
      assert.deepEqual(element.crop, {
        top: 0.1,
        right: 0.2,
        bottom: 0.3,
        left: 0.05,
      });
    }
  }
});

test("safeParseDeck ignores obsolete image fit alias", () => {
  const result = safeParseDeck(imageElementDeck({ fit: "cover" }));
  assert.equal(result.success, true);
  if (result.success) {
    const element = result.data.slides[0].elements?.[0];
    assert.equal(element?.kind, "image");
    if (element?.kind === "image") {
      assert.equal(element.fitMode, undefined);
      assert.equal("fit" in element, false);
    }
  }
});

test("safeParseDeck rejects an invalid image crop", () => {
  assert.equal(
    safeParseDeck(
      imageElementDeck({
        crop: { top: 1.1, right: 0, bottom: 0, left: 0 },
      }),
    ).success,
    false,
  );
});

// ---------------------------------------------------------------------------
// assetId schema validator (Epic #374)
// ---------------------------------------------------------------------------

test("safeParseDeck round-trips assetId when it is a non-empty string", () => {
  const result = safeParseDeck(imageElementDeck({ assetId: "clr1234abcdef" }));
  assert.equal(result.success, true);
  if (result.success) {
    const element = result.data.slides[0].elements?.[0];
    assert.equal(element?.kind, "image");
    if (element?.kind === "image") {
      assert.equal(element.assetId, "clr1234abcdef");
    }
  }
});

test("safeParseDeck accepts an image element without assetId (optional field)", () => {
  const result = safeParseDeck(imageElementDeck());
  assert.equal(result.success, true);
  if (result.success) {
    const element = result.data.slides[0].elements?.[0];
    assert.equal(element?.kind, "image");
    if (element?.kind === "image") {
      assert.equal(element.assetId, undefined);
    }
  }
});

test("safeParseDeck rejects assetId that is not a string", () => {
  const result = safeParseDeck(imageElementDeck({ assetId: 42 }));
  assert.equal(result.success, false);
});

test("validateSourceRef rejects empty documentId", () => {
  assert.throws(
    () =>
      validateSourceRef(
        {
          documentId: "",
          blockId: "block-1",
          linkedAt: "2026-06-22T17:49:04.676Z",
        },
        "sourceRef",
      ),
    /sourceRef\.documentId must be a non-empty string/,
  );
});

test("safeParseDeck rejects an element with an invalid sourceRef", () => {
  const result = safeParseDeck(
    elementDeck([
      {
        ...sourceLinkedTextElement(),
        sourceRef: {
          documentId: "doc-1",
          blockId: "block-1",
          linkedAt: "yesterday",
        },
      },
    ]),
  );
  assert.equal(result.success, false);
});

test("isSourceLinked and isSourceStale reflect source link state", () => {
  const linked = sourceLinkedTextElement(
    makeSourceRef({ contentHash: "hash-a" }),
  );
  assert.equal(isSourceLinked(linked), true);
  assert.equal(isSourceStale(linked, "hash-a"), false);
  assert.equal(isSourceStale(linked, "hash-b"), true);

  const withoutHash = sourceLinkedTextElement(
    makeSourceRef({ contentHash: undefined }),
  );
  assert.equal(isSourceStale(withoutHash, "hash-b"), false);
  assert.equal(
    isSourceLinked(sourceLinkedTextElement(makeSourceRef({ unlinked: true }))),
    false,
  );
});

test("unlinkSource marks an element as intentionally unlinked", () => {
  const element = sourceLinkedTextElement();
  const unlinked = unlinkSource(element);
  assert.notEqual(unlinked, element);
  assert.deepEqual(unlinked.sourceRef, {
    ...makeSourceRef(),
    unlinked: true,
  });
  assert.equal(isSourceLinked(unlinked), false);
});

test("unlinkSource returns same object identity when element has no sourceRef", () => {
  const element: TextElement = {
    id: "no-source",
    kind: "text",
    role: "body",
    text: "No source",
    zIndex: 0,
    box: { x: 0, y: 0, w: 10, h: 5 },
    style: { fontSize: 4, bold: false, italic: false, align: "left" },
  };
  assert.strictEqual(unlinkSource(element), element);
});

test("unlinkSource returns same object identity when sourceRef.unlinked is already true", () => {
  const element = sourceLinkedTextElement(makeSourceRef({ unlinked: true }));
  assert.strictEqual(unlinkSource(element), element);
});

test("relinkSource restores an active source link", () => {
  const element = unlinkSource(sourceLinkedTextElement());
  const relinked = relinkSource(
    element,
    makeSourceRef({
      blockId: "block-2",
      contentHash: "hash-2",
      linkedAt: "2026-06-23T00:00:00.000Z",
      unlinked: true,
    }),
  );
  assert.equal(isSourceLinked(relinked), true);
  assert.deepEqual(relinked.sourceRef, {
    documentId: "doc-1",
    blockId: "block-2",
    contentHash: "hash-2",
    linkedAt: "2026-06-23T00:00:00.000Z",
    blockKind: "text",
  });
});

test("validateElement accepts a placeholder element", () => {
  const element = validateElement(
    {
      id: "ph-title",
      kind: "placeholder",
      placeholderType: "title",
      label: "Deck title",
      zIndex: 0,
      box: { x: 8, y: 12, w: 84, h: 16 },
    },
    "element",
  );
  assert.equal(element.kind, "placeholder");
  if (element.kind === "placeholder") {
    assert.equal(element.placeholderType, "title");
    assert.equal(element.label, "Deck title");
  }
});

test("validateElement rejects an unknown placeholder type", () => {
  assert.throws(
    () =>
      validateElement(
        {
          id: "ph-bad",
          kind: "placeholder",
          placeholderType: "chart",
          zIndex: 0,
          box: { x: 0, y: 0, w: 10, h: 10 },
        },
        "element",
      ),
    /placeholderType/,
  );
});

test("safeParseDeck round-trips reusable layouts", () => {
  const layouts = defaultLayouts().filter((layout) => layout.format === "16:9");
  const result = safeParseDeck({
    ...(currentDeck() as object),
    layouts,
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.layouts?.length, layouts.length);
    assert.equal(
      result.data.layouts?.[1]?.placeholders[0]?.kind,
      "placeholder",
    );
  }
});

test("safeParseDeck rejects a non-hex background", () => {
  const input = elementDeck([]) as { slides: { background: string }[] };
  input.slides[0].background = "red";
  assert.equal(safeParseDeck(input).success, false);
});

test("safeParseDeck rejects a text element missing its style", () => {
  const result = safeParseDeck(
    elementDeck([
      {
        id: "t",
        kind: "text",
        role: "body",
        text: "x",
        zIndex: 0,
        box: { x: 0, y: 0, w: 1, h: 1 },
      },
    ]),
  );
  assert.equal(result.success, false);
});

test("validated elements preserve a stable shape", () => {
  const result = safeParseDeck(
    elementDeck([
      {
        id: "s",
        kind: "shape",
        shape: "rect",
        color: "#123456",
        zIndex: 0,
        box: { x: 5, y: 5, w: 10, h: 10 },
      },
    ]),
  );
  assert.equal(result.success, true);
  if (result.success) {
    const deck: Deck = result.data;
    const element = deck.slides[0].elements?.[0];
    assert.equal(element?.kind, "shape");
    if (element?.kind === "shape") {
      assert.equal(element.color, "#123456");
      assert.equal(element.shape, "rect");
    }
  }
});

// ---------------------------------------------------------------------------
// deckContentHash round-trips (issue #205 — staleness signal in deck JSON)
// ---------------------------------------------------------------------------

test("safeParseDeck preserves a deckContentHash when present", () => {
  const result = safeParseDeck({
    ...(currentDeck() as object),
    deckContentHash: "abc12345",
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.deckContentHash, "abc12345");
  }
});

test("safeParseDeck omits deckContentHash when absent or empty", () => {
  const absent = safeParseDeck(currentDeck());
  assert.equal(absent.success, true);
  if (absent.success) {
    assert.equal(absent.data.deckContentHash, undefined);
  }

  const empty = safeParseDeck({
    ...(currentDeck() as object),
    deckContentHash: "",
  });
  assert.equal(empty.success, true);
  if (empty.success) {
    assert.equal(empty.data.deckContentHash, undefined);
  }
});

test("safeParseDeck rejects a non-string deckContentHash", () => {
  const result = safeParseDeck({
    ...(currentDeck() as object),
    deckContentHash: 42,
  });
  assert.equal(result.success, false);
});

// ---------------------------------------------------------------------------
// elementsDerived provenance flag (issue #221, #486)
// ---------------------------------------------------------------------------

test("safeParseDeck round-trips the elementsDerived flag (true preserved)", () => {
  const withTrue = safeParseDeck({
    ...(currentDeck() as { slides: { [k: string]: unknown }[] }),
    slides: [
      {
        ...(currentDeck() as { slides: object[] }).slides[0],
        elementsDerived: true,
      },
    ],
  });
  assert.equal(withTrue.success, true);
  if (withTrue.success) {
    assert.equal(withTrue.data.slides[0].elementsDerived, true);
  }

  const withFalse = safeParseDeck({
    ...(currentDeck() as { slides: object[] }),
    slides: [
      {
        ...(currentDeck() as { slides: object[] }).slides[0],
        elementsDerived: false,
      },
    ],
  });
  assert.equal(withFalse.success, true);
  if (withFalse.success) {
    assert.equal(withFalse.data.slides[0].elementsDerived, false);
  }
});

test("safeParseDeck leaves elementsDerived absent when absent", () => {
  const result = safeParseDeck(currentDeck());
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.slides[0].elementsDerived, undefined);
  }
});

test("safeParseDeck rejects non-boolean elementsDerived", () => {
  const result = safeParseDeck({
    ...(currentDeck() as { slides: object[] }),
    slides: [
      {
        ...(currentDeck() as { slides: object[] }).slides[0],
        elementsDerived: "yes",
      },
    ],
  });
  assert.equal(result.success, false);
});

// ---------------------------------------------------------------------------
// Stable slide id
// ---------------------------------------------------------------------------

test("safeParseDeck rejects a slide missing its id", () => {
  const input = currentDeck() as { slides: Array<Record<string, unknown>> };
  delete input.slides[0].id;
  const result = safeParseDeck(input);
  assert.equal(result.success, false);
});

test("safeParseDeck preserves an existing slide id", () => {
  const input = {
    ...(currentDeck() as { slides: object[] }),
    slides: [
      {
        ...(currentDeck() as { slides: object[] }).slides[0],
        id: "sl-existing-abc",
      },
    ],
  };
  const result = safeParseDeck(input);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.slides[0].id, "sl-existing-abc");
  }
});

// ---------------------------------------------------------------------------
// ConnectorElement — new first-class connector kind (issue #323)
// ---------------------------------------------------------------------------

test("safeParseDeck accepts a connector element with two free points", () => {
  const result = safeParseDeck(
    elementDeck([
      {
        id: "c1",
        kind: "connector",
        zIndex: 5,
        box: { x: 0, y: 0, w: 100, h: 100 },
        start: { x: 10, y: 20 },
        end: { x: 80, y: 70 },
      },
    ]),
  );
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.kind, "connector");
    if (el?.kind === "connector") {
      assert.deepEqual(el.start, { x: 10, y: 20 });
      assert.deepEqual(el.end, { x: 80, y: 70 });
      assert.equal(el.stroke, undefined);
      assert.equal(el.arrowStart, undefined);
      assert.equal(el.arrowEnd, undefined);
      assert.equal(el.dash, undefined);
      assert.equal(el.routing, undefined);
    }
  }
});

test("safeParseDeck accepts a connector element with bound endpoints", () => {
  const result = safeParseDeck(
    elementDeck([
      {
        id: "c2",
        kind: "connector",
        zIndex: 0,
        box: { x: 0, y: 0, w: 100, h: 100 },
        start: { elementId: "el-a", anchor: "right" },
        end: { elementId: "el-b", anchor: "left" },
      },
    ]),
  );
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.kind, "connector");
    if (el?.kind === "connector") {
      assert.deepEqual(el.start, { elementId: "el-a", anchor: "right" });
      assert.deepEqual(el.end, { elementId: "el-b", anchor: "left" });
    }
  }
});

test("safeParseDeck round-trips connector optional fields", () => {
  const result = safeParseDeck(
    elementDeck([
      {
        id: "c3",
        kind: "connector",
        zIndex: 1,
        box: { x: 0, y: 0, w: 100, h: 100 },
        start: { x: 5, y: 5 },
        end: { x: 95, y: 95 },
        stroke: { color: "#ff0000", width: 1.5 },
        arrowStart: "none",
        arrowEnd: "filled",
        dash: true,
        routing: "elbow",
        opacity: 0.7,
      },
    ]),
  );
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.kind, "connector");
    if (el?.kind === "connector") {
      assert.deepEqual(el.stroke, { color: "#ff0000", width: 1.5 });
      assert.equal(el.arrowStart, "none");
      assert.equal(el.arrowEnd, "filled");
      assert.equal(el.dash, true);
      assert.equal(el.routing, "elbow");
      assert.equal(el.opacity, 0.7);
    }
  }
});

test("safeParseDeck rejects a connector with a missing start", () => {
  const result = safeParseDeck(
    elementDeck([
      {
        id: "c4",
        kind: "connector",
        zIndex: 0,
        box: { x: 0, y: 0, w: 100, h: 100 },
        end: { x: 50, y: 50 },
      },
    ]),
  );
  assert.equal(result.success, false);
});

test("safeParseDeck rejects a connector with an invalid anchor", () => {
  const result = safeParseDeck(
    elementDeck([
      {
        id: "c5",
        kind: "connector",
        zIndex: 0,
        box: { x: 0, y: 0, w: 100, h: 100 },
        start: { elementId: "el-a", anchor: "north" },
        end: { x: 50, y: 50 },
      },
    ]),
  );
  assert.equal(result.success, false);
});

test("safeParseDeck rejects a connector with a non-hex stroke color", () => {
  const result = safeParseDeck(
    elementDeck([
      {
        id: "c6",
        kind: "connector",
        zIndex: 0,
        box: { x: 0, y: 0, w: 100, h: 100 },
        start: { x: 0, y: 0 },
        end: { x: 50, y: 50 },
        stroke: { color: "red", width: 1 },
      },
    ]),
  );
  assert.equal(result.success, false);
});

test("safeParseDeck ignores unrecognised connector routing values", () => {
  // Unknown routing values are silently dropped (not an error)
  const result = safeParseDeck(
    elementDeck([
      {
        id: "c7",
        kind: "connector",
        zIndex: 0,
        box: { x: 0, y: 0, w: 100, h: 100 },
        start: { x: 0, y: 0 },
        end: { x: 50, y: 50 },
        routing: "bezier",
      },
    ]),
  );
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    if (el?.kind === "connector") {
      assert.equal(el.routing, undefined);
    }
  }
});

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
