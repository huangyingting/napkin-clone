import {
  normalizeBulletItems,
  type ElementBox,
  type SlideElement,
  type TextRun,
} from "./deck";
import type { TextHitGeometry } from "./stage-hit-test";
import { runsToHtml } from "./rich-text-html";

type TextHitElement = Extract<SlideElement, { kind: "text" | "bullets" }>;

interface MeasureTextHitGeometryOptions {
  elements: readonly SlideElement[];
  fittedBoxes: ReadonlyMap<string, ElementBox>;
  stageWidthPx: number;
  stageHeightPx: number;
}

interface PxRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

let textHitGeometryHost: HTMLDivElement | null = null;

function getTextHitGeometryHost(): HTMLDivElement | null {
  if (typeof document === "undefined") return null;
  if (textHitGeometryHost?.isConnected) return textHitGeometryHost;
  const host = document.createElement("div");
  Object.assign(host.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    visibility: "hidden",
    pointerEvents: "none",
    zIndex: "-1",
    overflow: "visible",
  });
  document.body.appendChild(host);
  textHitGeometryHost = host;
  return host;
}

function applyCommonTextStyle(
  node: HTMLElement,
  element: TextHitElement,
  stageHeightPx: number,
) {
  const style = node.style;
  style.boxSizing = "border-box";
  style.color = "black";
  style.fontSize = `${Math.max(1, (element.style.fontSize / 100) * stageHeightPx)}px`;
  style.fontWeight = element.style.bold ? "700" : "400";
  style.fontStyle = element.style.italic ? "italic" : "normal";
  style.textAlign = element.style.align;
  style.lineHeight = String(
    element.style.lineHeight ?? (element.kind === "bullets" ? 1.2 : 1.15),
  );
  style.margin = "0";
  style.padding = "0";
  style.overflow = "visible";
  style.overflowWrap = "break-word";
  style.wordBreak = "normal";
  style.whiteSpace = element.kind === "text" ? "pre-wrap" : "normal";
  style.textDecoration = element.style.underline ? "underline" : "";
  if (element.style.fontFamily) style.fontFamily = element.style.fontFamily;
}

function fillInline(
  node: HTMLElement,
  runs: readonly TextRun[] | undefined,
  fallback: string,
) {
  if (runs && runs.length > 0) node.innerHTML = runsToHtml(runs, fallback);
  else node.textContent = fallback || "\u00a0";
}

function createOuterNode(
  element: TextHitElement,
  box: ElementBox,
  stageWidthPx: number,
  stageHeightPx: number,
): HTMLElement {
  const outer = document.createElement(element.kind === "text" ? "div" : "ul");
  applyCommonTextStyle(outer, element, stageHeightPx);
  outer.style.display = "flex";
  outer.style.flexDirection = "column";
  outer.style.justifyContent =
    element.style.verticalAlign === "top"
      ? "flex-start"
      : element.style.verticalAlign === "bottom"
        ? "flex-end"
        : "center";
  outer.style.width = `${Math.max(1, (box.w / 100) * stageWidthPx)}px`;
  outer.style.height = `${Math.max(1, (box.h / 100) * stageHeightPx)}px`;
  outer.style.overflow = "hidden";
  return outer;
}

function createTextNode(element: Extract<TextHitElement, { kind: "text" }>) {
  const inner = document.createElement("div");
  inner.dataset.textHitContent = "true";
  inner.style.width = "100%";
  inner.style.whiteSpace = "pre-wrap";
  inner.style.overflowWrap = "break-word";
  inner.style.wordBreak = "normal";
  if (element.style.paragraphSpacing) {
    inner.style.marginBottom = `${element.style.paragraphSpacing}cqh`;
  }
  fillInline(inner, element.runs, element.text || "\u00a0");
  return inner;
}

function createBulletsNodes(
  element: Extract<TextHitElement, { kind: "bullets" }>,
) {
  const items = normalizeBulletItems(element);
  const rows = items.length > 0 ? items : [{ text: "\u00a0" }];
  return rows.map((item) => {
    const row = document.createElement("li");
    row.style.display = "flex";
    row.style.alignItems = "flex-start";
    row.style.gap = "0.5em";
    row.style.paddingLeft = item.indent ? `${item.indent * 1.5}em` : "";

    const marker = document.createElement("span");
    marker.style.flexShrink = "0";
    marker.style.minWidth = item.listType === "number" ? "1.2em" : "0.8em";
    marker.textContent = item.listType === "number" ? "1." : "";

    const text = document.createElement("span");
    text.dataset.textHitContent = "true";
    text.style.minWidth = "0";
    text.style.overflowWrap = "break-word";
    text.style.wordBreak = "normal";
    fillInline(text, item.runs, item.text || "\u00a0");

    row.append(marker, text);
    return row;
  });
}

function rectsForNode(node: HTMLElement): DOMRect[] {
  const range = document.createRange();
  range.selectNodeContents(node);
  const rects = Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 0.5 && rect.height > 0.5,
  );
  range.detach();
  if (rects.length > 0) return rects;
  const fallback = node.getBoundingClientRect();
  return fallback.width > 0.5 && fallback.height > 0.5 ? [fallback] : [];
}

function mergeLineRects(rects: readonly DOMRect[]): PxRect[] {
  const lines: PxRect[] = [];
  for (const rect of [...rects].sort(
    (a, b) => a.top - b.top || a.left - b.left,
  )) {
    const centerY = rect.top + rect.height / 2;
    const line = lines.find((candidate) => {
      const candidateCenter = (candidate.top + candidate.bottom) / 2;
      return (
        Math.abs(candidateCenter - centerY) <= Math.max(2, rect.height * 0.45)
      );
    });
    if (line) {
      line.left = Math.min(line.left, rect.left);
      line.top = Math.min(line.top, rect.top);
      line.right = Math.max(line.right, rect.right);
      line.bottom = Math.max(line.bottom, rect.bottom);
    } else {
      lines.push({
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      });
    }
  }
  return lines;
}

function clampMeasuredBox(
  box: ElementBox,
  bounds: ElementBox,
): ElementBox | null {
  const x1 = Math.max(bounds.x, box.x);
  const y1 = Math.max(bounds.y, box.y);
  const x2 = Math.min(bounds.x + bounds.w, box.x + box.w);
  const y2 = Math.min(bounds.y + bounds.h, box.y + box.h);
  const w = x2 - x1;
  const h = y2 - y1;
  return w > 0.05 && h > 0.05 ? { x: x1, y: y1, w, h } : null;
}

function toSlideBox(
  rect: PxRect,
  outerRect: DOMRect,
  bounds: ElementBox,
  stageWidthPx: number,
  stageHeightPx: number,
): ElementBox | null {
  const raw = {
    x: bounds.x + ((rect.left - outerRect.left) / stageWidthPx) * 100,
    y: bounds.y + ((rect.top - outerRect.top) / stageHeightPx) * 100,
    w: ((rect.right - rect.left) / stageWidthPx) * 100,
    h: ((rect.bottom - rect.top) / stageHeightPx) * 100,
  };
  return clampMeasuredBox(raw, bounds);
}

function measureElement(
  element: TextHitElement,
  box: ElementBox,
  stageWidthPx: number,
  stageHeightPx: number,
): TextHitGeometry | null {
  const host = getTextHitGeometryHost();
  if (!host || stageWidthPx <= 0 || stageHeightPx <= 0) return null;

  const outer = createOuterNode(element, box, stageWidthPx, stageHeightPx);
  if (element.kind === "text") {
    outer.appendChild(createTextNode(element));
  } else {
    outer.style.gap = element.bulletGap
      ? `${(element.bulletGap / 100) * stageHeightPx}px`
      : "0.6em";
    outer.style.listStyle = "none";
    outer.style.margin = "0";
    if (element.bulletIndent) {
      outer.style.paddingLeft = `${(element.bulletIndent / 100) * stageWidthPx}px`;
    }
    outer.append(...createBulletsNodes(element));
  }

  host.replaceChildren(outer);
  const outerRect = outer.getBoundingClientRect();
  const contentNodes = Array.from(
    outer.querySelectorAll<HTMLElement>("[data-text-hit-content]"),
  );
  const contentRects = contentNodes.flatMap((node) => rectsForNode(node));
  const contentBoxes = mergeLineRects(contentRects)
    .map((rect) =>
      toSlideBox(rect, outerRect, box, stageWidthPx, stageHeightPx),
    )
    .filter((measuredBox): measuredBox is ElementBox => measuredBox !== null);
  host.replaceChildren();

  return contentBoxes.length > 0 ? { contentBoxes } : null;
}

export function measureTextHitGeometry({
  elements,
  fittedBoxes,
  stageWidthPx,
  stageHeightPx,
}: MeasureTextHitGeometryOptions): Map<string, TextHitGeometry> {
  const measured = new Map<string, TextHitGeometry>();
  if (typeof document === "undefined") return measured;

  for (const element of elements) {
    if (element.hidden) continue;
    if (element.kind !== "text" && element.kind !== "bullets") continue;
    const box = fittedBoxes.get(element.id) ?? element.box;
    const geometry = measureElement(element, box, stageWidthPx, stageHeightPx);
    if (geometry) measured.set(element.id, geometry);
  }

  return measured;
}
