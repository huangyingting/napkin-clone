import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck, MasterElement, SlideElement } from "./deck";
import {
  applyGlobalMasterChromeUpdate,
  getGlobalMaster,
  hasMasterChromeKind,
  isMasterChromeKind,
  isMasterChromeTemplateElement,
  materializeMasterChromePlaceholders,
  readGlobalMasterChromeState,
  updateGlobalMasterChromeElements,
} from "./global-master-chrome";

type TextMasterElement = Extract<MasterElement, { kind: "text" }>;
type TextSlideElement = Extract<SlideElement, { kind: "text" }>;

function assertTextElement(
  element: MasterElement | undefined,
): asserts element is TextMasterElement {
  assert.equal(element?.kind, "text");
}

function assertTextSlideElement(
  element: SlideElement,
): asserts element is TextSlideElement {
  assert.equal(element.kind, "text");
}

function textElement(
  kind: "footer" | "pageNumber" | "watermark",
  overrides: Partial<MasterElement> = {},
): MasterElement {
  return {
    id: kind,
    kind: "text",
    role: kind === "watermark" ? "background" : kind,
    masterChromeKind: kind,
    name: kind,
    layer: kind === "watermark" ? "background" : "foreground",
    locked: true,
    hidden: false,
    box: { x: 6, y: 91, w: 18, h: 5 },
    zIndex: 1,
    content: {
      kind: "text",
      text: kind,
      paragraphs: [{ text: kind, runs: [{ text: kind }] }],
    },
    designOverrides: { textStyle: { align: "left", fontSize: 7 } },
    ...overrides,
  } as MasterElement;
}

function imageElement(overrides: Partial<MasterElement> = {}): MasterElement {
  return {
    id: "logo",
    kind: "image",
    role: "logo",
    masterChromeKind: "logo",
    name: "Logo",
    layer: "foreground",
    locked: true,
    hidden: false,
    box: { x: 4, y: 4, w: 8, h: 5 },
    zIndex: 2,
    content: { kind: "image", src: "/logo.png", assetId: "asset-logo" },
    ...overrides,
  } as MasterElement;
}

function deck(elements: MasterElement[] = []): Deck {
  return {
    slides: [],
    defaultMasterId: "master-1",
    masters: [{ id: "master-1", name: "Master", elements }],
  } as unknown as Deck;
}

test("master chrome kind helpers recognize only supported template elements", () => {
  assert.equal(isMasterChromeKind("logo"), true);
  assert.equal(isMasterChromeKind("unknown"), false);
  assert.equal(hasMasterChromeKind({ masterChromeKind: "footer" }), true);
  assert.equal(hasMasterChromeKind({ masterChromeKind: "unknown" }), false);
  assert.equal(isMasterChromeTemplateElement(textElement("footer")), true);
});

test("getGlobalMaster prefers the default master and falls back to the first", () => {
  const first = { id: "first", name: "First", elements: [] };
  const selected = { id: "selected", name: "Selected", elements: [] };

  assert.equal(
    getGlobalMaster({
      slides: [],
      defaultMasterId: "selected",
      masters: [first, selected],
    } as unknown as Deck),
    selected,
  );
  assert.equal(
    getGlobalMaster({ slides: [], masters: [first] } as unknown as Deck),
    first,
  );
  assert.equal(
    getGlobalMaster({ slides: [], masters: [] } as unknown as Deck),
    undefined,
  );
});

test("readGlobalMasterChromeState infers enabled state, placement, size, and defaults", () => {
  const state = readGlobalMasterChromeState(
    deck([
      imageElement({ box: { x: 80, y: 88, w: 16, h: 9 } }),
      textElement("footer", {
        content: { kind: "text", text: "Acme", paragraphs: [{ text: "Acme" }] },
        designOverrides: { textStyle: { align: "right" } },
      }),
      textElement("pageNumber", {
        box: { x: 41, y: 91, w: 18, h: 5 },
        content: {
          kind: "text",
          text: "{{pageNumber}} / {{pageCount}}",
          paragraphs: [{ text: "{{pageNumber}} / {{pageCount}}" }],
        },
      }),
      textElement("watermark", {
        opacity: 0.9,
        rotation: -28,
        designOverrides: { textStyle: { fontSize: 13 } },
      }),
    ]),
  );

  assert.deepEqual(state.logo, {
    enabled: true,
    src: "/logo.png",
    assetId: "asset-logo",
    placement: "bottom-right",
    size: "large",
  });
  assert.deepEqual(state.footer, {
    enabled: true,
    text: "Acme",
    align: "right",
  });
  assert.deepEqual(state.pageNumber, {
    enabled: true,
    format: "number-total",
    placement: "bottom-center",
  });
  assert.deepEqual(state.watermark, {
    enabled: true,
    text: "watermark",
    opacity: 0.6,
    layout: "diagonal",
    size: "large",
  });

  assert.deepEqual(readGlobalMasterChromeState(deck()).logo, {
    enabled: false,
    src: "",
    placement: "top-right",
    size: "medium",
  });
});

test("updateGlobalMasterChromeElements builds, replaces, hides, and removes chrome", () => {
  const existing = [textElement("footer", { zIndex: 4 })];
  const withLogo = updateGlobalMasterChromeElements(existing, "logo", {
    enabled: true,
    src: "/new-logo.png",
    assetId: "asset-new",
    placement: "top-left",
    size: "small",
  });
  const logo = withLogo.find((element) => element.masterChromeKind === "logo");

  assert.equal(logo?.kind, "image");
  assert.equal(logo?.zIndex, 5);
  assert.deepEqual(logo?.box, { x: 4, y: 4, w: 8, h: 5 });

  const withoutLogo = updateGlobalMasterChromeElements(withLogo, "logo", {
    enabled: true,
    src: "",
    placement: "top-left",
    size: "small",
  });
  assert.equal(
    withoutLogo.some((element) => element.masterChromeKind === "logo"),
    false,
  );

  const withHiddenFooter = updateGlobalMasterChromeElements(
    existing,
    "footer",
    {
      enabled: false,
      text: "Draft",
      align: "center",
    },
  );
  const hiddenFooter = withHiddenFooter[0];
  assertTextElement(hiddenFooter);
  assert.equal(hiddenFooter.hidden, true);
  assert.equal(hiddenFooter.content.text, "Draft");
});

test("applyGlobalMasterChromeUpdate covers page-number and watermark variants", () => {
  const withFooter = applyGlobalMasterChromeUpdate([], {
    kind: "footer",
    state: { enabled: true, text: "Confidential", align: "left" },
  });
  const footer = withFooter[0];
  assertTextElement(footer);
  assert.equal(footer.masterChromeKind, "footer");
  assert.equal(footer.content.text, "Confidential");
  assert.equal(footer.designOverrides?.textStyle?.align, "left");

  const withPageNumber = applyGlobalMasterChromeUpdate([], {
    kind: "pageNumber",
    state: { enabled: true, format: "number-total", placement: "bottom-right" },
  });
  const pageNumber = withPageNumber[0];

  assert.equal(pageNumber.masterChromeKind, "pageNumber");
  assertTextElement(pageNumber);
  assert.equal(pageNumber.content.text, "{{pageNumber}} / {{pageCount}}");
  assert.deepEqual(pageNumber.box, { x: 76, y: 91, w: 18, h: 5 });
  assert.equal(pageNumber.designOverrides?.textStyle?.align, "right");

  const withWatermark = applyGlobalMasterChromeUpdate(withPageNumber, {
    kind: "watermark",
    state: {
      enabled: true,
      text: "Private",
      opacity: 0.01,
      layout: "center",
      size: "small",
    },
  });
  const watermark = withWatermark.find(
    (element) => element.masterChromeKind === "watermark",
  );

  assert.equal(watermark?.opacity, 0.05);
  assert.equal(watermark?.rotation, undefined);
  assert.deepEqual(watermark?.box, { x: 18, y: 42, w: 64, h: 16 });
});

test("applyGlobalMasterChromeUpdate builds simple page numbers and logo content", () => {
  const withPageNumber = applyGlobalMasterChromeUpdate([], {
    kind: "pageNumber",
    state: { enabled: true, format: "number", placement: "bottom-left" },
  });
  const pageNumber = withPageNumber[0];
  assertTextElement(pageNumber);
  assert.equal(pageNumber.content.text, "{{pageNumber}}");
  assert.deepEqual(pageNumber.box, { x: 6, y: 91, w: 18, h: 5 });
  assert.equal(pageNumber.designOverrides?.textStyle?.align, "left");

  const enabledLogoElements = applyGlobalMasterChromeUpdate([], {
    kind: "logo",
    state: {
      enabled: true,
      src: "/brand-mark.svg",
      placement: "top-right",
      size: "medium",
    },
  });
  const enabledLogo = enabledLogoElements[0];
  assert.equal(enabledLogo.kind, "image");
  assert.equal(enabledLogo.hidden, false);
  assert.deepEqual(enabledLogo.box, { x: 84, y: 4, w: 12, h: 7 });
  assert.deepEqual(enabledLogo.content, {
    kind: "image",
    src: "/brand-mark.svg",
    alt: "Logo",
  });

  const withLogo = applyGlobalMasterChromeUpdate([], {
    kind: "logo",
    state: {
      enabled: false,
      src: "/brand.png",
      placement: "bottom-left",
      size: "large",
    },
  });
  const logo = withLogo[0];
  assert.equal(logo.kind, "image");
  assert.equal(logo.hidden, true);
  assert.deepEqual(logo.box, { x: 4, y: 87, w: 16, h: 9 });
  assert.deepEqual(
    (logo as Extract<MasterElement, { kind: "image" }>).content,
    {
      kind: "image",
      src: "/brand.png",
      alt: "Logo",
    },
  );
});

test("updateGlobalMasterChromeElements builds explicit footer, page number, and logo details", () => {
  const footerElements = updateGlobalMasterChromeElements([], "footer", {
    enabled: true,
    text: "Internal",
    align: "right",
  });
  const footer = footerElements[0];
  assertTextElement(footer);
  assert.deepEqual(footer.box, { x: 6, y: 91, w: 88, h: 5 });
  assert.equal(footer.designOverrides?.textStyle?.align, "right");

  const pageNumberElements = updateGlobalMasterChromeElements(
    [],
    "pageNumber",
    {
      enabled: true,
      format: "number-total",
      placement: "bottom-center",
    },
  );
  const pageNumber = pageNumberElements[0];
  assertTextElement(pageNumber);
  assert.equal(pageNumber.content.text, "{{pageNumber}} / {{pageCount}}");
  assert.equal(pageNumber.designOverrides?.textStyle?.align, "center");

  const logoElements = updateGlobalMasterChromeElements([], "logo", {
    enabled: true,
    src: "/logo.svg",
    assetId: "asset-1",
    placement: "top-right",
    size: "medium",
  });
  const logo = logoElements[0] as Extract<MasterElement, { kind: "image" }>;
  assert.equal(logo.kind, "image");
  assert.equal(logo.zIndex, 0);
  assert.deepEqual(logo.box, { x: 84, y: 4, w: 12, h: 7 });
  assert.deepEqual(logo.content, {
    kind: "image",
    src: "/logo.svg",
    assetId: "asset-1",
    alt: "Logo",
  });
});

test("materializeMasterChromePlaceholders replaces text and run placeholders", () => {
  const element = textElement("pageNumber", {
    content: {
      kind: "text",
      text: "Slide {{pageNumber}} of {{pageCount}}",
      paragraphs: [
        {
          text: "Page {{pageNumber}}",
          runs: [{ text: "{{pageNumber}}" }, { text: "/{{pageCount}}" }],
        },
      ],
    },
  });
  const materialized = materializeMasterChromePlaceholders(element, 1, 7);

  assertTextSlideElement(materialized);
  assert.notEqual(materialized, element);
  assert.equal(materialized.content.text, "Slide 2 of 7");
  assert.deepEqual(materialized.content.paragraphs?.[0]?.runs, [
    { text: "2" },
    { text: "/7" },
  ]);
  assert.equal(
    materializeMasterChromePlaceholders(imageElement(), 0, 1).kind,
    "image",
  );
  assert.deepEqual(
    materializeMasterChromePlaceholders(textElement("footer"), 0, 1),
    textElement("footer"),
  );
});
