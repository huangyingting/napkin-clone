import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CURRENT_DECK_SCHEMA_VERSION,
  type Deck,
  type SlideElement,
} from "./deck";
import type { MasterElement } from "./deck-core";
import {
  resolvedFillRepresentativeColor,
  resolvedFillToCss,
  resolveSlideRenderModel,
} from "./slide-render-model";

function shapeElement(id: string, zIndex: number): SlideElement {
  return {
    id,
    kind: "shape",
    role: "label",
    box: { x: 0, y: 0, w: 10, h: 10 },
    zIndex,
    content: { kind: "shape", shape: "rect" },
    designOverrides: { fill: { value: "#123456" } },
  } as unknown as SlideElement;
}

function visualElement(id: string, zIndex: number): SlideElement {
  return {
    id,
    kind: "visual",
    role: "visual",
    box: { x: 0, y: 0, w: 40, h: 40 },
    zIndex,
    content: { kind: "visual", visualId: "visual-1" },
    designOverrides: { styleThemeId: "ocean" },
  } as unknown as SlideElement;
}

function tableElement(id: string, zIndex: number): SlideElement {
  return {
    id,
    kind: "table",
    role: "table",
    box: { x: 0, y: 0, w: 60, h: 40 },
    zIndex,
    content: {
      kind: "table",
      header: true,
      caption: "Revenue assumptions",
      columns: [
        { id: "col-1", label: "Region" },
        { id: "col-2", label: "ARR" },
      ],
      rows: [{ id: "row-1", cells: [{ text: "NA" }, { text: "$12M" }] }],
    },
    designOverrides: {
      tableStyle: {
        headerFill: { value: "#123456" },
        alternateRowFill: { token: "surface" },
        borderColor: "#abcdef",
        textStyle: { color: "#111111", fontSize: 2.4 },
        headerTextStyle: { color: "#eeeeee", bold: true },
      },
    },
  } as unknown as SlideElement;
}

function masterTextElement(
  id: string,
  masterChromeKind: "footer" | "watermark",
  zIndex: number,
): MasterElement {
  const text = masterChromeKind === "footer" ? "Footer" : "Watermark";
  return {
    id,
    kind: "text",
    role: masterChromeKind === "footer" ? "footer" : "background",
    masterChromeKind,
    layer: masterChromeKind === "footer" ? "foreground" : "background",
    locked: true,
    box: { x: 0, y: 0, w: 10, h: 10 },
    zIndex,
    content: { kind: "text", text, paragraphs: [{ text }] },
  } as unknown as MasterElement;
}

function deck(): Deck {
  return {
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    canvas: { format: "16:9" },
    design: { themeId: "indigo" },
    defaultMasterId: "master-default",
    masters: [
      {
        id: "master-default",
        name: "Default",
        background: { type: "solid", color: { value: "#eeeeee" } },
        elements: [
          masterTextElement("master-fg", "footer", 2),
          masterTextElement("master-bg", "watermark", 1),
        ],
      },
    ],
    slides: [
      {
        id: "slide-1",
        index: 0,
        title: "Slide",
        designOverrides: {
          background: { type: "solid", color: { value: "#ffffff" } },
        },
        elements: [shapeElement("slide-el", 0)],
      },
    ],
  } as unknown as Deck;
}

function textElement(id: string, text: string, zIndex: number): MasterElement {
  return {
    id,
    kind: "text",
    role: "pageNumber",
    masterChromeKind: "pageNumber",
    layer: "foreground",
    locked: true,
    box: { x: 0, y: 0, w: 10, h: 10 },
    zIndex,
    content: { kind: "text", text, paragraphs: [{ text }] },
  } as unknown as MasterElement;
}

test("resolveSlideRenderModel includes master layers around slide elements", () => {
  const d = deck();
  const model = resolveSlideRenderModel(d, d.slides[0]!);

  assert.equal(model.master?.id, "master-default");
  assert.deepEqual(model.canvas, {
    format: "16:9",
    width: 16,
    height: 9,
    pptxWidthIn: 13.333,
    pptxHeightIn: 7.5,
  });
  assert.equal(model.background.type, "solid");
  if (model.background.type === "solid") {
    assert.equal(model.background.color, "#ffffff");
  }
  assert.deepEqual(
    model.masterBackgroundElements.map((element) => element.id),
    ["master-bg"],
  );
  assert.deepEqual(
    model.slideElements.map((element) => element.id),
    ["slide-el"],
  );
  assert.deepEqual(
    model.masterForegroundElements.map((element) => element.id),
    ["master-fg"],
  );
  assert.deepEqual(
    model.renderedElements.map((element) => element.id),
    ["master-bg", "slide-el", "master-fg"],
  );
  assert.equal(model.elementDesigns["slide-el"]?.kind, "shape");
  if (model.elementDesigns["slide-el"]?.kind === "shape") {
    assert.equal(model.elementDesigns["slide-el"].fill, "#123456");
  }
});

test("resolveSlideRenderModel renders master chrome placeholders per slide", () => {
  const d = deck();
  d.masters = [
    {
      id: "master-default",
      name: "Default",
      elements: [textElement("page", "{{pageNumber}} / {{pageCount}}", 0)],
    },
  ];
  d.slides = [
    d.slides[0]!,
    { ...d.slides[0]!, id: "slide-2", index: 1, elements: [] },
  ];

  const model = resolveSlideRenderModel(d, d.slides[1]!);
  const page = model.masterForegroundElements.find(
    (element) => element.id === "page",
  );

  assert.equal(page?.kind, "text");
  if (page?.kind === "text") {
    assert.equal(page.content.text, "2 / 2");
    assert.equal(page.content.paragraphs?.[0]?.text, "2 / 2");
  }
});

test("resolveSlideRenderModel applies visual style overrides", () => {
  const d = deck();
  d.slides[0] = {
    ...d.slides[0]!,
    elements: [visualElement("visual-el", 0)],
  };

  const model = resolveSlideRenderModel(d, d.slides[0]!);

  assert.equal(model.elementDesigns["visual-el"]?.kind, "visual");
  if (model.elementDesigns["visual-el"]?.kind === "visual") {
    assert.equal(model.elementDesigns["visual-el"].styleThemeId, "ocean");
  }
});

test("resolveSlideRenderModel resolves radial fills and shape effects", () => {
  const d = deck();
  d.slides[0] = {
    ...d.slides[0]!,
    designOverrides: {
      background: {
        type: "radialGradient",
        inner: { value: "#f8fafc" },
        outer: { value: "#0f172a" },
        cx: 42,
        cy: 38,
        r: 74,
      },
    },
    elements: [shapeElement("radial-shape", 0)],
  };
  const element = d.slides[0]!.elements![0]! as any;
  element.designOverrides = {
    fill: {
      type: "radialGradient",
      inner: { value: "#ffffff" },
      outer: { value: "#1e293b" },
      cx: 50,
      cy: 45,
      r: 70,
    },
    effect: { kind: "glass", intensity: "strong" },
  };

  const model = resolveSlideRenderModel(d, d.slides[0]!);

  assert.equal(model.background.type, "radialGradient");
  if (model.background.type === "radialGradient") {
    assert.equal(model.background.inner, "#f8fafc");
    assert.equal(model.background.outer, "#0f172a");
    assert.equal(model.background.r, 74);
  }
  assert.equal(model.elementDesigns["radial-shape"]?.kind, "shape");
  if (model.elementDesigns["radial-shape"]?.kind === "shape") {
    assert.deepEqual(model.elementDesigns["radial-shape"].fill, {
      type: "radialGradient",
      inner: "#ffffff",
      outer: "#1e293b",
      cx: 50,
      cy: 45,
      r: 70,
    });
    assert.deepEqual(model.elementDesigns["radial-shape"].effect, {
      kind: "glass",
      intensity: "strong",
    });
  }
});

test("resolveSlideRenderModel resolves linear gradient element fill", () => {
  const d = deck();
  const element = shapeElement("linear-shape", 0) as any;
  element.designOverrides = {
    fill: {
      type: "linearGradient",
      from: { value: "#6366f1" },
      to: { value: "#22d3ee" },
      angle: 120,
    },
  };
  d.slides[0] = { ...d.slides[0]!, elements: [element] };

  const model = resolveSlideRenderModel(d, d.slides[0]!);

  assert.equal(model.elementDesigns["linear-shape"]?.kind, "shape");
  if (model.elementDesigns["linear-shape"]?.kind === "shape") {
    assert.deepEqual(model.elementDesigns["linear-shape"].fill, {
      type: "linearGradient",
      from: "#6366f1",
      to: "#22d3ee",
      angle: 120,
    });
  }
});

test("resolveSlideRenderModel resolves rich fill stops, radii, glow, and text fill", () => {
  const d = deck();
  const text = {
    id: "text-gradient",
    kind: "text",
    role: "title",
    box: { x: 0, y: 0, w: 50, h: 20 },
    zIndex: 0,
    content: {
      kind: "text",
      text: "Frontier",
      paragraphs: [{ text: "Frontier" }],
    },
    designOverrides: {
      textStyle: {
        fontSize: 8,
        bold: true,
        italic: false,
        align: "left",
        letterSpacing: 0.2,
        textTransform: "uppercase",
        textFill: {
          type: "linearGradient",
          from: { value: "#ffffff" },
          to: { token: "accent" },
          angle: 100,
          stops: [
            { color: { value: "#ffffff" } },
            { color: { value: "#b9c0ff" }, offset: 40 },
            { color: { token: "accent" } },
          ],
        },
      },
    },
  } as unknown as SlideElement;
  const shape = shapeElement("rich-shape", 1) as any;
  shape.shadow = { x: 0, y: 0.8, blur: 2.4, color: "#000000", opacity: 0.5 };
  shape.designOverrides = {
    radius: { topLeft: 50, topRight: 50, bottomRight: 50, bottomLeft: 8 },
    fill: {
      type: "radialGradient",
      inner: { value: "#14171f" },
      outer: { value: "#050608" },
      cx: 95,
      cy: 10,
      rx: 100,
      ry: 90,
      stops: [
        { color: { value: "#14171f" } },
        { color: { value: "#050608" }, offset: 60 },
      ],
    },
    effect: { kind: "glow", color: "#f5b301", blur: 24, opacity: 0.2 },
  };
  d.slides[0] = {
    ...d.slides[0]!,
    designOverrides: {
      background: {
        type: "radialGradient",
        inner: { value: "#1b1f4d" },
        outer: { value: "#07080f" },
        cx: 80,
        cy: 0,
        rx: 100,
        ry: 90,
        stops: [
          { color: { value: "#1b1f4d" } },
          { color: { value: "#07080f" }, offset: 55 },
        ],
      },
    },
    elements: [text, shape],
  };

  const model = resolveSlideRenderModel(d, d.slides[0]!);

  assert.equal(model.background.type, "radialGradient");
  if (model.background.type === "radialGradient") {
    assert.equal(model.background.rx, 100);
    assert.equal(model.background.ry, 90);
    assert.deepEqual(model.background.stops, [
      { color: "#1b1f4d" },
      { color: "#07080f", offset: 55 },
    ]);
  }

  assert.equal(model.elementDesigns["text-gradient"]?.kind, "text");
  if (model.elementDesigns["text-gradient"]?.kind === "text") {
    assert.equal(
      model.elementDesigns["text-gradient"].textStyle.letterSpacing,
      0.2,
    );
    assert.equal(
      model.elementDesigns["text-gradient"].textStyle.textTransform,
      "uppercase",
    );
    assert.deepEqual(model.elementDesigns["text-gradient"].textFill, {
      type: "linearGradient",
      from: "#ffffff",
      to: model.tokenSet.colors.accent,
      angle: 100,
      stops: [
        { color: "#ffffff" },
        { color: "#b9c0ff", offset: 40 },
        { color: model.tokenSet.colors.accent },
      ],
    });
  }

  assert.equal(model.elementDesigns["rich-shape"]?.kind, "shape");
  if (model.elementDesigns["rich-shape"]?.kind === "shape") {
    assert.deepEqual(model.elementDesigns["rich-shape"].radius, {
      topLeft: 50,
      topRight: 50,
      bottomRight: 50,
      bottomLeft: 8,
    });
    assert.deepEqual(model.elementDesigns["rich-shape"].effect, {
      kind: "glow",
      color: "#f5b301",
      blur: 24,
      opacity: 0.2,
    });
    assert.deepEqual(model.elementDesigns["rich-shape"].fill, {
      type: "radialGradient",
      inner: "#14171f",
      outer: "#050608",
      cx: 95,
      cy: 10,
      rx: 100,
      ry: 90,
      stops: [{ color: "#14171f" }, { color: "#050608", offset: 60 }],
    });
  }
});

test("resolveSlideRenderModel resolves blur shape effects", () => {
  const d = deck();
  const element = shapeElement("blur-shape", 0) as any;
  element.designOverrides = {
    fill: { value: "#a855f7" },
    effect: { kind: "blur", radius: 8 },
  };
  d.slides[0] = { ...d.slides[0]!, elements: [element] };

  const model = resolveSlideRenderModel(d, d.slides[0]!);

  assert.equal(model.elementDesigns["blur-shape"]?.kind, "shape");
  if (model.elementDesigns["blur-shape"]?.kind === "shape") {
    assert.equal(model.elementDesigns["blur-shape"].fill, "#a855f7");
    assert.deepEqual(model.elementDesigns["blur-shape"].effect, {
      kind: "blur",
      radius: 8,
    });
  }
});

test("resolveSlideRenderModel resolves table defaults and overrides", () => {
  const d = deck();
  d.slides[0] = {
    ...d.slides[0]!,
    elements: [tableElement("table-el", 0)],
  };

  const model = resolveSlideRenderModel(d, d.slides[0]!);

  assert.equal(model.elementDesigns["table-el"]?.kind, "table");
  if (model.elementDesigns["table-el"]?.kind === "table") {
    const { tableStyle } = model.elementDesigns["table-el"];
    assert.equal(tableStyle.headerFill, "#123456");
    assert.equal(tableStyle.rowFill, "#eef2ff");
    assert.equal(tableStyle.alternateRowFill, "#eef2ff");
    assert.equal(tableStyle.borderColor, "#abcdef");
    assert.equal(tableStyle.textStyle.color, "#111111");
    assert.equal(tableStyle.textStyle.fontSize, 2.4);
    assert.equal(tableStyle.headerTextStyle.color, "#eeeeee");
    assert.equal(tableStyle.headerTextStyle.weight, 700);
  }
});

test("resolvedFill helpers serialize gradients and representative colors", () => {
  assert.equal(resolvedFillToCss("#ffffff"), "#ffffff");
  assert.equal(resolvedFillRepresentativeColor("#123456"), "#123456");

  const linear = {
    type: "linearGradient" as const,
    from: "#111111",
    to: "#222222",
    angle: 45,
    stops: [{ color: "#111111" }, { color: "#222222", offset: 80 }],
  };
  assert.equal(
    resolvedFillToCss(linear),
    "linear-gradient(45deg, #111111, #222222 80%)",
  );
  assert.equal(resolvedFillRepresentativeColor(linear), "#111111");

  const radial = {
    type: "radialGradient" as const,
    inner: "#f8fafc",
    outer: "#0f172a",
    cx: 25,
    cy: 75,
    rx: 40,
    ry: 50,
  };
  assert.equal(
    resolvedFillToCss(radial),
    "radial-gradient(40% 50% at 25% 75%, #f8fafc, #0f172a)",
  );
  assert.equal(resolvedFillRepresentativeColor(radial), "#0f172a");
});
