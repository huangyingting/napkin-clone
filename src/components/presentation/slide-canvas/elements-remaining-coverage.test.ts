import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type {
  ConnectorElement,
  ImageElement,
  ShapeElement,
  SlideElement,
  TableElement,
  TextElement,
  VisualElement,
} from "@/lib/presentation/deck";
import type {
  ResolvedElementDesign,
  ResolvedSlideCanvas,
} from "@/lib/presentation/slide-render-model";
import type {
  ResolvedTextStyle,
  SlideThemeColors,
} from "@/lib/presentation/style-cascade";
import { DEFAULT_STYLE, type Visual } from "@/lib/visual/schema";

import { ConnectorElementView } from "./connector-elements";
import { ElementsSlideLayout } from "./elements-slide-layout";
import { ImageElementView } from "./media-elements";
import { ShapeElementView } from "./shape-elements";
import { TableElementView } from "./table-elements";
import { TextElementView } from "./text-elements";
import { VisualElementView } from "./visual-elements";

const canvas: ResolvedSlideCanvas = {
  format: "16:9",
  width: 1600,
  height: 900,
  pptxWidthIn: 13.333,
  pptxHeightIn: 7.5,
};

const themeColors: SlideThemeColors = {
  bgColor: "#ffffff",
  titleColor: "#0f172a",
  bodyColor: "#334155",
  accentColor: "#2563eb",
  mutedColor: "#64748b",
};

const textStyle: ResolvedTextStyle = {
  color: "#0f172a",
  fontSize: 5,
  fontFamily: "Inter",
  weight: 700,
  italic: true,
  underline: true,
  align: "center",
  lineHeight: 1.4,
  paragraphSpacing: 0.5,
  letterSpacing: 0.02,
  textTransform: "uppercase",
  role: "body",
  origin: {
    fontFamily: "element",
    fontSize: "element",
    color: "element",
    weight: "element",
    italic: "element",
    underline: "element",
    align: "element",
    lineHeight: "element",
    paragraphSpacing: "element",
    letterSpacing: "element",
    textTransform: "element",
  },
};

function base(
  id: string,
  zIndex: number,
): Pick<SlideElement, "id" | "box" | "zIndex"> {
  return {
    id,
    box: { x: 10 + zIndex, y: 8 + zIndex, w: 24, h: 14 },
    zIndex,
  };
}

function textElement(overrides: Partial<TextElement> = {}): TextElement {
  return {
    ...base("text-remaining", 1),
    kind: "text",
    content: {
      kind: "text",
      text: "Fallback",
      fitMode: "shrink-to-fit",
      bulletGap: 0.8,
      bulletIndent: 2,
      paragraphs: [
        { text: "First", listType: "number", indent: 0 },
        { text: "Nested", listType: "bullet", indent: 1 },
        {
          text: "Deep",
          listType: "bullet",
          indent: 2,
          runs: [{ text: "Deep" }],
        },
      ],
    },
    ...overrides,
  };
}

function shapeElement(
  id: string,
  shape: ShapeElement["content"]["shape"],
  zIndex: number,
): ShapeElement {
  return {
    ...base(id, zIndex),
    kind: "shape",
    content: {
      kind: "shape",
      shape,
      text: shape === "line" ? "" : `${shape} label`,
      textRuns: [{ text: `${shape} run`, bold: true }],
    },
    designOverrides: { textStyle: { fontSize: 4, bold: true, align: "right" } },
  };
}

function imageElement(
  id: string,
  src: string | undefined,
  zIndex: number,
): ImageElement {
  return {
    ...base(id, zIndex),
    kind: "image",
    content: {
      kind: "image",
      src,
      alt: `${id} alt`,
      crop: { top: 0.1, right: 0.2, bottom: 0.1, left: 0.05 },
    },
  };
}

function tableElement(): TableElement {
  return {
    ...base("table-remaining", 20),
    kind: "table",
    content: {
      kind: "table",
      caption: "Quarterly results",
      header: true,
      columns: [
        { id: "name", label: "Name", width: 2 },
        { id: "value", label: "Value", width: 1 },
      ],
      rows: [
        {
          id: "r1",
          cells: [{ text: "Alpha" }, { text: "100", runs: [{ text: "100" }] }],
        },
        { id: "r2", cells: [{ text: "" }, { text: "200" }] },
      ],
    },
  };
}

function connectorElement(routing: "elbow" | "straight"): ConnectorElement {
  return {
    ...base(`connector-${routing}`, 30),
    kind: "connector",
    opacity: 0.5,
    content: {
      kind: "connector",
      routing,
      start: { x: 5, y: 10 },
      end: { x: 80, y: 75 },
    },
  };
}

function visualElement(): VisualElement {
  return {
    ...base("visual-remaining", 40),
    kind: "visual",
    content: { kind: "visual", visualId: "visual-1", alt: "Coverage visual" },
  };
}

const visual: Visual = {
  version: 1,
  type: "flowchart",
  title: "Coverage visual",
  width: 400,
  height: 240,
  style: DEFAULT_STYLE,
  nodes: [{ id: "n1", label: "Node", x: 80, y: 80 }],
  edges: [],
};

test("slide canvas element views render text, shape, media, table, connector, visual, and layout branches", () => {
  const shapeDesigns: ResolvedElementDesign[] = [
    {
      kind: "shape",
      fill: {
        type: "linearGradient",
        angle: 45,
        stops: [
          { color: "#ffffff", offset: 0 },
          { color: "#93c5fd", offset: 100 },
        ],
        from: "#ffffff",
        to: "#93c5fd",
      },
      stroke: { color: "#1d4ed8", width: 0.4 },
      radius: { topLeft: 1, topRight: 2, bottomRight: 3, bottomLeft: 4 },
      effect: { kind: "glass", intensity: "medium" },
      textStyle,
    },
    {
      kind: "shape",
      fill: { type: "radialGradient", inner: "#fef3c7", outer: "#f59e0b" },
      effect: { kind: "glow", color: "#f59e0b", blur: 3, opacity: 0.7 },
      textStyle,
    },
    {
      kind: "shape",
      fill: "#bfdbfe",
      effect: { kind: "blur", radius: 2 },
      textStyle,
    },
  ];

  const elements: SlideElement[] = [
    textElement(),
    shapeElement("circle", "circle", 2),
    shapeElement("line", "line", 3),
    shapeElement("ellipse", "ellipse", 4),
    shapeElement("triangle", "triangle", 5),
    shapeElement("diamond", "diamond", 6),
    shapeElement("rect", "rect", 7),
    imageElement("empty-image", "", 8),
    imageElement("filled-image", "https://example.test/image.png", 9),
    tableElement(),
    connectorElement("elbow"),
    connectorElement("straight"),
    visualElement(),
  ];
  const visuals = new Map([["visual-1", visual]]);
  const html = renderToStaticMarkup(
    createElement(
      Fragment,
      null,
      createElement(TextElementView, {
        element: elements[0] as TextElement,
        tc: themeColors,
        accent: "#ef4444",
        resolvedDesign: {
          kind: "text",
          textStyle,
          textFill: { type: "linearGradient", from: "#111827", to: "#2563eb" },
        } as Extract<ResolvedElementDesign, { kind: "text" }>,
      }),
      createElement(TextElementView, {
        element: textElement({
          id: "plain-text",
          content: {
            kind: "text",
            text: "Plain body",
            paragraphs: [{ text: "Plain body" }],
          },
          designOverrides: { textStyle: { verticalAlign: "bottom" } },
        }),
        tc: themeColors,
      }),
      createElement(ShapeElementView, {
        element: elements[1] as ShapeElement,
        elements,
        canvas,
        resolvedDesign: shapeDesigns[0] as Extract<
          ResolvedElementDesign,
          { kind: "shape" }
        >,
      }),
      createElement(ShapeElementView, {
        element: elements[2] as ShapeElement,
        elements,
        canvas,
        resolvedDesign: {
          kind: "shape",
          fill: "#e0f2fe",
          stroke: { color: "#0369a1", width: 0.5 },
        } as Extract<ResolvedElementDesign, { kind: "shape" }>,
      }),
      createElement(ShapeElementView, {
        element: elements[3] as ShapeElement,
        elements,
        canvas,
        resolvedDesign: shapeDesigns[2] as Extract<
          ResolvedElementDesign,
          { kind: "shape" }
        >,
      }),
      createElement(ShapeElementView, {
        element: elements[4] as ShapeElement,
        elements,
        canvas,
        resolvedDesign: shapeDesigns[1] as Extract<
          ResolvedElementDesign,
          { kind: "shape" }
        >,
      }),
      createElement(ShapeElementView, {
        element: elements[5] as ShapeElement,
        elements,
        canvas,
        resolvedDesign: shapeDesigns[0] as Extract<
          ResolvedElementDesign,
          { kind: "shape" }
        >,
      }),
      createElement(ImageElementView, {
        element: elements[7] as ImageElement,
        editable: true,
        resolvedDesign: { kind: "image", maskShape: "rounded", radius: 16 },
      }),
      createElement(ImageElementView, {
        element: elements[8] as ImageElement,
        resolvedDesign: {
          kind: "image",
          fitMode: "cover",
          maskShape: "diamond",
        },
      }),
      createElement(TableElementView, {
        element: elements[9] as TableElement,
        resolvedDesign: {
          kind: "table",
          tableStyle: {
            headerFill: "#111827",
            rowFill: "#ffffff",
            alternateRowFill: "#f8fafc",
            borderColor: "#cbd5e1",
            borderWidth: 0.2,
            textStyle,
            headerTextStyle: { ...textStyle, color: "#ffffff" },
          },
        } as Extract<ResolvedElementDesign, { kind: "table" }>,
      }),
      createElement(ConnectorElementView, {
        element: elements[10] as ConnectorElement,
        elements,
        resolvedDesign: {
          kind: "connector",
          stroke: { color: "#0f172a", width: 0.6 },
          arrowStart: "filled",
          arrowEnd: "none",
          dash: true,
        } as Extract<ResolvedElementDesign, { kind: "connector" }>,
      }),
      createElement(ConnectorElementView, {
        element: elements[11] as ConnectorElement,
        elements,
        resolvedDesign: {
          kind: "connector",
          stroke: { color: "#0f172a", width: 0.6 },
          arrowStart: "none",
          arrowEnd: "filled",
          dash: false,
        } as Extract<ResolvedElementDesign, { kind: "connector" }>,
      }),
      createElement(VisualElementView, {
        element: elements[12] as VisualElement,
        visuals,
        resolvedDesign: { kind: "visual", styleThemeId: "accent" },
      }),
      createElement(VisualElementView, {
        element: { ...visualElement(), id: "missing-visual" },
        visuals: new Map<string, Visual>(),
      }),
      createElement(ElementsSlideLayout, {
        visuals,
        editable: true,
        hiddenElementIds: new Set(["hidden-by-set"]),
        renderModel: {
          canvas,
          slide: {
            id: "slide",
            index: 0,
            title: "Slide",
            notes: "",
            elements,
          },
          themeColors,
          tokenSet: {} as never,
          background: {
            type: "radialGradient",
            inner: "#ffffff",
            outer: "#dbeafe",
            stops: [{ color: "#ffffff", offset: 0 }],
          },
          accent: "#2563eb",
          masterBackgroundElements: [shapeElement("master-bg", "rect", 0)],
          slideElements: [
            ...elements,
            { ...shapeElement("hidden-by-set", "rect", 41), hidden: false },
            { ...shapeElement("hidden", "rect", 42), hidden: true },
          ],
          masterForegroundElements: [shapeElement("master-fg", "rect", 99)],
          renderedElements: elements,
          elementDesigns: {
            "text-remaining": { kind: "text", textStyle },
            circle: shapeDesigns[0],
            "filled-image": { kind: "image", fitMode: "cover" },
            "connector-elbow": {
              kind: "connector",
              stroke: { color: "#0f172a", width: 0.6 },
              arrowStart: "none",
              arrowEnd: "arrow",
              dash: true,
            },
            "table-remaining": {
              kind: "table",
              tableStyle: {
                headerFill: "#111827",
                rowFill: "#ffffff",
                alternateRowFill: "#f8fafc",
                borderColor: "#cbd5e1",
                borderWidth: 0.2,
                textStyle,
                headerTextStyle: { ...textStyle, color: "#ffffff" },
              },
            },
          },
        },
      }),
    ),
  );

  assert.match(html, /First/);
  assert.match(html, /Add image/);
  assert.match(html, /Quarterly results/);
  assert.match(html, /Coverage visual/);
  assert.match(html, /marker/);
});
