import {
  normalizeBulletItems,
  type ElementBox,
  type SlideElement,
} from "./deck";
import {
  resolveConnectorElementPoints,
  resolveLineEndpoints,
  type PointPct,
} from "./connector-geometry";

export interface HitTestCandidate {
  element: SlideElement;
  box: ElementBox;
}

export interface HitTestOptions {
  fittedBoxes?: ReadonlyMap<string, ElementBox>;
  stageAspect?: number;
  includeLocked?: boolean;
  lineThresholdPct?: number;
}

const DEFAULT_LINE_THRESHOLD_PCT = 1.5;
const MIN_TEXT_HIT_W_PCT = 4;
const MIN_TEXT_HIT_H_PCT = 3;

function resolveBox(
  element: SlideElement,
  fittedBoxes?: ReadonlyMap<string, ElementBox>,
): ElementBox {
  return fittedBoxes?.get(element.id) ?? element.box;
}

function pointInBox(point: PointPct, box: ElementBox): boolean {
  return (
    point.x >= box.x &&
    point.x <= box.x + box.w &&
    point.y >= box.y &&
    point.y <= box.y + box.h
  );
}

function rotatePointAroundCenter(
  point: PointPct,
  box: ElementBox,
  rotationDeg: number,
  stageAspect: number,
): PointPct {
  if (!rotationDeg) return point;
  const center = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  const angle = (-rotationDeg * Math.PI) / 180;
  const dx = (point.x - center.x) * stageAspect;
  const dy = point.y - center.y;
  const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
  const localY = dx * Math.sin(angle) + dy * Math.cos(angle);
  return {
    x: center.x + localX / stageAspect,
    y: center.y + localY,
  };
}

function pointInElementBox(
  point: PointPct,
  element: SlideElement,
  box: ElementBox,
  stageAspect: number,
): boolean {
  return pointInBox(
    rotatePointAroundCenter(point, box, element.rotation ?? 0, stageAspect),
    box,
  );
}

function textLines(element: SlideElement): string[] {
  if (element.kind === "text") {
    const lines = element.text.split(/\r?\n/).filter((line) => line.trim());
    return lines.length > 0 ? lines : [element.text];
  }
  if (element.kind === "bullets") {
    const items = normalizeBulletItems(element)
      .map((item) => item.text)
      .filter((line) => line.trim());
    return items.length > 0 ? items : element.bullets;
  }
  return [];
}

function textVisibleBox(
  element: Extract<SlideElement, { kind: "text" | "bullets" }>,
  box: ElementBox,
  stageAspect: number,
): ElementBox {
  const lines = textLines(element).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return box;

  const lineHeight =
    element.style.lineHeight ?? (element.kind === "bullets" ? 1.2 : 1.15);
  const fontSize = element.style.fontSize;
  const maxChars = Math.max(...lines.map((line) => line.length));
  const estimatedTextWidth =
    (maxChars * fontSize * 0.56) / Math.max(0.1, stageAspect) +
    (element.kind === "bullets" ? 5 : 2);
  const estimatedTextHeight = lines.length * fontSize * lineHeight + 2;
  const w = Math.min(box.w, Math.max(MIN_TEXT_HIT_W_PCT, estimatedTextWidth));
  const h = Math.min(box.h, Math.max(MIN_TEXT_HIT_H_PCT, estimatedTextHeight));

  let x = box.x;
  if (element.style.align === "center") {
    x = box.x + (box.w - w) / 2;
  } else if (element.style.align === "right") {
    x = box.x + box.w - w;
  }

  let y = box.y + (box.h - h) / 2;
  if (element.style.verticalAlign === "top") {
    y = box.y;
  } else if (element.style.verticalAlign === "bottom") {
    y = box.y + box.h - h;
  }

  return { x, y, w, h };
}

function distanceToSegment(
  point: PointPct,
  start: PointPct,
  end: PointPct,
  stageAspect: number,
): number {
  const px = point.x * stageAspect;
  const py = point.y;
  const ax = start.x * stageAspect;
  const ay = start.y;
  const bx = end.x * stageAspect;
  const by = end.y;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function pointInTriangle(point: PointPct, box: ElementBox): boolean {
  const top = { x: box.x + box.w / 2, y: box.y };
  const left = { x: box.x, y: box.y + box.h };
  const right = { x: box.x + box.w, y: box.y + box.h };
  const area = (a: PointPct, b: PointPct, c: PointPct) =>
    Math.abs((a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)) / 2);
  const full = area(top, left, right);
  const sum =
    area(point, left, right) + area(top, point, right) + area(top, left, point);
  return Math.abs(sum - full) < 0.01;
}

function pointHitsElement(
  point: PointPct,
  element: SlideElement,
  elements: readonly SlideElement[],
  fittedBoxes: ReadonlyMap<string, ElementBox> | undefined,
  stageAspect: number,
  lineThresholdPct: number,
): boolean {
  const box = resolveBox(element, fittedBoxes);
  const localPoint = rotatePointAroundCenter(
    point,
    box,
    element.rotation ?? 0,
    stageAspect,
  );

  switch (element.kind) {
    case "text":
    case "bullets":
      return pointInBox(localPoint, textVisibleBox(element, box, stageAspect));
    case "shape": {
      if (element.shape === "line") {
        const endpoints = resolveLineEndpoints(
          element,
          elements,
          (candidate) => resolveBox(candidate, fittedBoxes),
          stageAspect,
        );
        return (
          distanceToSegment(
            point,
            endpoints.start,
            endpoints.end,
            stageAspect,
          ) <= lineThresholdPct
        );
      }
      if (!pointInElementBox(point, element, box, stageAspect)) return false;
      if (element.shape === "ellipse") {
        const dx = (localPoint.x - (box.x + box.w / 2)) / (box.w / 2);
        const dy = (localPoint.y - (box.y + box.h / 2)) / (box.h / 2);
        return dx * dx + dy * dy <= 1;
      }
      if (element.shape === "triangle") {
        return pointInTriangle(localPoint, box);
      }
      return true;
    }
    case "connector": {
      const endpoints = resolveConnectorElementPoints(
        element,
        elements,
        (candidate) => resolveBox(candidate, fittedBoxes),
      );
      return (
        distanceToSegment(point, endpoints.start, endpoints.end, stageAspect) <=
        lineThresholdPct
      );
    }
    default:
      return pointInElementBox(point, element, box, stageAspect);
  }
}

export function hitTestSlideElements(
  point: PointPct,
  elements: readonly SlideElement[],
  options: HitTestOptions = {},
): HitTestCandidate[] {
  const stageAspect = options.stageAspect ?? 1;
  const lineThresholdPct =
    options.lineThresholdPct ?? DEFAULT_LINE_THRESHOLD_PCT;
  return elements
    .map((element, index) => ({
      element,
      index,
      box: resolveBox(element, options.fittedBoxes),
    }))
    .filter(({ element }) => !element.hidden)
    .filter(({ element }) => options.includeLocked || !element.locked)
    .filter(({ element }) =>
      pointHitsElement(
        point,
        element,
        elements,
        options.fittedBoxes,
        stageAspect,
        lineThresholdPct,
      ),
    )
    .sort((a, b) => b.element.zIndex - a.element.zIndex || b.index - a.index)
    .map(({ element, box }) => ({ element, box }));
}
