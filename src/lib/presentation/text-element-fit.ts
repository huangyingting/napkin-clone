import {
  normalizeTextParagraphs,
  type ElementBox,
  type TextElement,
  type TextRun,
} from "./deck";
import { runsToHtml } from "./rich-text-html";
import { resolveElementFontCss } from "./slide-fonts";

export type TextBoxFitAnchor = "top-left" | "center" | "preserve-text-position";

export type TextLikeElement = Omit<TextElement, "zIndex"> & { zIndex?: number };

function elementTextStyle(
  element: TextLikeElement,
): Partial<import("./deck").TextElementStyle> | undefined {
  return (
    element.designOverrides?.textStyle ?? {
      fontSize: 4,
      bold: false,
      italic: false,
      align: "left",
    }
  );
}

export interface TextResizeMeasurer {
  measureHeightPct: (
    element: TextLikeElement,
    widthPct: number,
    fontSizePct: number,
  ) => number;
  measureMinWidthPct: (element: TextLikeElement, fontSizePct: number) => number;
  measureMaxWidthPct: (element: TextLikeElement, fontSizePct: number) => number;
}

let textMeasureHost: HTMLDivElement | null = null;

function getTextMeasureHost(): HTMLDivElement | null {
  if (typeof document === "undefined") return null;
  if (textMeasureHost?.isConnected) return textMeasureHost;
  const host = document.createElement("div");
  Object.assign(host.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    visibility: "hidden",
    pointerEvents: "none",
    zIndex: "-1",
    width: "auto",
    height: "auto",
    overflow: "visible",
  });
  document.body.appendChild(host);
  textMeasureHost = host;
  return host;
}

function applyMeasuredTextStyle(
  node: HTMLElement,
  element: TextLikeElement,
  fontSizePx: number,
  lineHeight: number,
  mode: "height" | "minWidth" | "maxWidth",
) {
  const style = node.style;
  const textStyle = elementTextStyle(element);
  style.boxSizing = "border-box";
  style.color = "black";
  style.fontSize = `${fontSizePx}px`;
  style.fontWeight = textStyle?.bold ? "700" : "400";
  style.fontStyle = textStyle?.italic ? "italic" : "normal";
  style.textAlign = textStyle?.align ?? "left";
  style.lineHeight = String(lineHeight);
  style.margin = "0";
  style.padding = "0";
  style.whiteSpace =
    hasListParagraphs(element) && mode === "maxWidth" ? "nowrap" : "pre-wrap";
  style.overflow = "visible";
  style.overflowWrap = mode === "height" ? "break-word" : "normal";
  style.wordBreak = "normal";
  style.textDecoration = textStyle?.underline ? "underline" : "";
  const fontCss = resolveElementFontCss(textStyle?.fontId);
  if (fontCss) style.fontFamily = fontCss;
}

function fillMeasuredInline(
  node: HTMLElement,
  runs: readonly TextRun[] | undefined,
  fallback: string,
) {
  if (runs && runs.length > 0) node.innerHTML = runsToHtml(runs, fallback);
  else node.textContent = fallback || "\u00a0";
}

function createMeasuredTextNode(
  element: TextLikeElement,
  fontSizePx: number,
  widthPx: number | null,
  mode: "height" | "minWidth" | "maxWidth",
): HTMLElement {
  const paragraphs = normalizeTextParagraphs(element);
  if (!hasListParagraphs(element)) {
    const node = document.createElement("div");
    applyMeasuredTextStyle(node, element, fontSizePx, 1.15, mode);
    node.style.display = "block";
    node.style.width =
      widthPx == null
        ? mode === "maxWidth"
          ? "max-content"
          : "min-content"
        : `${widthPx}px`;
    node.style.height = "auto";
    for (const paragraph of paragraphs) {
      const line = document.createElement("div");
      fillMeasuredInline(line, paragraph.runs, paragraph.text || "\u00a0");
      node.appendChild(line);
    }
    return node;
  }

  const list = document.createElement("ul");
  applyMeasuredTextStyle(list, element, fontSizePx, 1.2, mode);
  list.style.display = "flex";
  list.style.flexDirection = "column";
  list.style.justifyContent = "center";
  list.style.gap = "0.6em";
  list.style.listStyle = "none";
  list.style.width =
    widthPx == null
      ? mode === "maxWidth"
        ? "max-content"
        : "min-content"
      : `${widthPx}px`;
  list.style.height = "auto";
  const rows = paragraphs.length > 0 ? paragraphs : [{ text: "" }];
  rows.forEach((paragraph) => {
    const item = document.createElement("li");
    item.style.display = "flex";
    item.style.alignItems = "flex-start";
    item.style.gap = "0.5em";
    const marker = document.createElement("span");
    marker.style.marginTop = "0.45em";
    marker.style.height = "0.35em";
    marker.style.width = "0.35em";
    marker.style.flexShrink = "0";
    const text = document.createElement("span");
    text.style.minWidth =
      mode === "minWidth"
        ? "min-content"
        : mode === "maxWidth"
          ? "max-content"
          : "0";
    text.style.overflowWrap = mode === "height" ? "break-word" : "normal";
    text.style.wordBreak = "normal";
    fillMeasuredInline(text, paragraph.runs, paragraph.text || "\u00a0");
    item.append(marker, text);
    list.appendChild(item);
  });
  return list;
}

export function createTextResizeMeasurer(
  stageWidthPx: number,
  stageHeightPx: number,
): TextResizeMeasurer {
  const measure = (
    element: TextLikeElement,
    fontSizePct: number,
    widthPct: number | null,
    mode: "height" | "minWidth" | "maxWidth",
  ): number => {
    const host = getTextMeasureHost();
    if (!host || stageWidthPx <= 0 || stageHeightPx <= 0) return 0;
    const fontSizePx = Math.max(1, (fontSizePct / 100) * stageHeightPx);
    const widthPx =
      widthPct == null ? null : Math.max(1, (widthPct / 100) * stageWidthPx);
    const node = createMeasuredTextNode(element, fontSizePx, widthPx, mode);
    host.replaceChildren(node);
    const rect = node.getBoundingClientRect();
    const measuredHeightPx = Math.max(rect.height, node.scrollHeight);
    host.replaceChildren();
    return mode === "height"
      ? ((measuredHeightPx + 2) / stageHeightPx) * 100
      : ((rect.width + 1) / stageWidthPx) * 100;
  };
  return {
    measureHeightPct: (element, widthPct, fontSizePct) =>
      measure(element, fontSizePct, widthPct, "height"),
    measureMinWidthPct: (element, fontSizePct) =>
      measure(element, fontSizePct, null, "minWidth"),
    measureMaxWidthPct: (element, fontSizePct) =>
      measure(element, fontSizePct, null, "maxWidth"),
  };
}

const AUTO_FIT_PADDING_PCT = 1.2;

function hasListParagraphs(element: TextLikeElement): boolean {
  return normalizeTextParagraphs(element).some(
    (paragraph) => paragraph.listType !== undefined,
  );
}

export function textFitPaddingPct(
  element: TextLikeElement,
  fontSizePct: number = elementTextStyle(element)?.fontSize ?? 4,
): number {
  // Bullets carry marker rows, flex gaps, and larger descender-heavy line boxes;
  // a little font-relative slack keeps newly inserted lists from clipping the
  // top/bottom when rendered with `overflow: hidden` on the slide canvas.
  const fontSlack = hasListParagraphs(element) ? fontSizePct * 0.35 : 0;
  return AUTO_FIT_PADDING_PCT * 2 + fontSlack;
}

/**
 * Returns `true` when the element should auto-grow its box to fit content.
 * Absent `fitMode` is treated as `"auto-height"`.
 */
export function isAutoHeight(element: TextLikeElement): boolean {
  return !element.content.fitMode || element.content.fitMode === "auto-height";
}

/**
 * Binary-searches for the largest font size (≤ local textStyle.fontSize) that
 * makes the content fit within `boxHeightPct` (including padding slack).
 *
 * Returns the original font size unchanged when the content already fits.
 * Never returns a value below `minFontSizePct` (default 1 % of slide height).
 */
export function shrinkFontSizeToFit(
  element: TextLikeElement,
  boxWidthPct: number,
  boxHeightPct: number,
  measurer: TextResizeMeasurer,
  minFontSizePct: number = 1,
): number {
  const maxFontSizePct = elementTextStyle(element)?.fontSize ?? 4;
  const padding = textFitPaddingPct(element, maxFontSizePct);
  const targetHeightPct = Math.max(0, boxHeightPct - padding);

  // Fast path: already fits at the declared font size.
  const fullHeight = measurer.measureHeightPct(
    element,
    boxWidthPct,
    maxFontSizePct,
  );
  if (fullHeight <= targetHeightPct) return maxFontSizePct;

  // Binary search: find the largest font size in [min, max] that fits.
  let lo = Math.max(minFontSizePct, 0.1);
  let hi = maxFontSizePct;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    const h = measurer.measureHeightPct(element, boxWidthPct, mid);
    if (h <= targetHeightPct) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return Math.max(minFontSizePct, lo);
}

export function fitNewTextElementBox(
  element: TextLikeElement,
  box: ElementBox,
  measurer: TextResizeMeasurer,
  anchor: TextBoxFitAnchor = "top-left",
): ElementBox {
  const style = elementTextStyle(element);
  const fontSize = style?.fontSize ?? 4;
  const maxWidth = Math.max(4, Math.min(box.w, 100));
  const minWidth = Math.min(
    maxWidth,
    measurer.measureMinWidthPct(element, fontSize),
  );
  const maxContentWidth = measurer.measureMaxWidthPct(element, fontSize);
  const width = Math.max(minWidth, Math.min(maxWidth, maxContentWidth));
  const height = Math.min(
    100,
    measurer.measureHeightPct(element, width, fontSize) +
      textFitPaddingPct(element),
  );
  let x = box.x;
  let y = box.y;
  if (anchor === "center") {
    x = box.x + box.w / 2 - width / 2;
    y = box.y + box.h / 2 - height / 2;
  } else if (anchor === "preserve-text-position") {
    if (style?.align === "center") {
      x = box.x + box.w / 2 - width / 2;
    } else if (style?.align === "right") {
      x = box.x + box.w - width;
    }
    if (style?.verticalAlign === "top") {
      y = box.y;
    } else if (style?.verticalAlign === "bottom") {
      y = box.y + box.h - height;
    } else {
      y = box.y + box.h / 2 - height / 2;
    }
  }
  return {
    x: Math.max(0, Math.min(100 - width, x)),
    y: Math.max(0, Math.min(100 - height, y)),
    w: width,
    h: height,
  };
}

export function fitTextElementToContent<T extends TextLikeElement>(
  element: T,
  measurer: TextResizeMeasurer,
  anchor: TextBoxFitAnchor = "top-left",
): T {
  return {
    ...element,
    box: fitNewTextElementBox(element, element.box, measurer, anchor),
  };
}
