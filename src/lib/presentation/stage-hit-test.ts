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
  score: number;
  reason: HitTestReason;
}

export interface TextHitGeometry {
  contentBoxes: readonly ElementBox[];
}

export type HitTestReason =
  | "text-content"
  | "text-near"
  | "text-frame"
  | "line-stroke"
  | "connector-stroke"
  | "shape-edge"
  | "shape-interior"
  | "box-interior";

export interface HitTestOptions {
  fittedBoxes?: ReadonlyMap<string, ElementBox>;
  stageAspect?: number;
  includeLocked?: boolean;
  lineThresholdPct?: number;
  selectedElementIds?: ReadonlySet<string>;
  textHitGeometry?: ReadonlyMap<string, TextHitGeometry>;
}

const DEFAULT_LINE_THRESHOLD_PCT = 1.5;
const TEXT_NEAR_PADDING_PCT = 2.5;
const SHAPE_EDGE_THRESHOLD_PCT = 1.4;
const MIN_TEXT_HIT_W_PCT = 4;
const MIN_TEXT_HIT_H_PCT = 3;

const SCORE = {
  textContent: 100,
  textNear: 78,
  textFrame: 8,
  lineStroke: 106,
  connectorStroke: 106,
  shapeEdge: 112,
  smallShapeInterior: 104,
  mediumShapeInterior: 88,
  largeShapeInterior: 58,
  coveringShapeInterior: 24,
  boxInterior: 68,
  placeholderInterior: 42,
  selectedBonus: 88,
  maxZIndexBonus: 8,
} as const;

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

function inflateBox(box: ElementBox, amount: number): ElementBox {
  return {
    x: box.x - amount,
    y: box.y - amount,
    w: box.w + amount * 2,
    h: box.h + amount * 2,
  };
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

function textContentBoxes(
  element: Extract<SlideElement, { kind: "text" | "bullets" }>,
  box: ElementBox,
  stageAspect: number,
  textHitGeometry: ReadonlyMap<string, TextHitGeometry> | undefined,
): readonly ElementBox[] {
  const measured = textHitGeometry?.get(element.id)?.contentBoxes;
  if (measured && measured.length > 0) return measured;
  return [textVisibleBox(element, box, stageAspect)];
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

function distanceToBoxEdge(
  point: PointPct,
  box: ElementBox,
  stageAspect: number,
): number {
  const left = Math.abs(point.x - box.x) * stageAspect;
  const right = Math.abs(point.x - (box.x + box.w)) * stageAspect;
  const top = Math.abs(point.y - box.y);
  const bottom = Math.abs(point.y - (box.y + box.h));
  return Math.min(left, right, top, bottom);
}

function shapeInteriorScore(box: ElementBox): number {
  const area = box.w * box.h;
  if (area <= 450) return SCORE.smallShapeInterior;
  if (area <= 1600) return SCORE.mediumShapeInterior;
  if (area <= 3600) return SCORE.largeShapeInterior;
  return SCORE.coveringShapeInterior;
}

function zIndexBonus(element: SlideElement): number {
  return Math.max(0, Math.min(SCORE.maxZIndexBonus, element.zIndex * 0.1));
}

function withBonuses(
  baseScore: number,
  element: SlideElement,
  selectedElementIds: ReadonlySet<string> | undefined,
): number {
  return (
    baseScore +
    zIndexBonus(element) +
    (selectedElementIds?.has(element.id) ? SCORE.selectedBonus : 0)
  );
}

function hitTestElement(
  point: PointPct,
  element: SlideElement,
  elements: readonly SlideElement[],
  fittedBoxes: ReadonlyMap<string, ElementBox> | undefined,
  stageAspect: number,
  lineThresholdPct: number,
  selectedElementIds: ReadonlySet<string> | undefined,
  textHitGeometry: ReadonlyMap<string, TextHitGeometry> | undefined,
): Omit<HitTestCandidate, "box" | "element"> | null {
  const box = resolveBox(element, fittedBoxes);
  const localPoint = rotatePointAroundCenter(
    point,
    box,
    element.rotation ?? 0,
    stageAspect,
  );

  switch (element.kind) {
    case "text":
    case "bullets": {
      const contentBoxes = textContentBoxes(
        element,
        box,
        stageAspect,
        textHitGeometry,
      );
      if (
        contentBoxes.some((contentBox) => pointInBox(localPoint, contentBox))
      ) {
        return {
          score: withBonuses(SCORE.textContent, element, selectedElementIds),
          reason: "text-content",
        };
      }
      if (
        contentBoxes.some((contentBox) =>
          pointInBox(localPoint, inflateBox(contentBox, TEXT_NEAR_PADDING_PCT)),
        )
      ) {
        return {
          score: withBonuses(SCORE.textNear, element, selectedElementIds),
          reason: "text-near",
        };
      }
      if (pointInElementBox(point, element, box, stageAspect)) {
        return {
          score: withBonuses(SCORE.textFrame, element, selectedElementIds),
          reason: "text-frame",
        };
      }
      return null;
    }
    case "shape": {
      if (element.shape === "line") {
        const endpoints = resolveLineEndpoints(
          element,
          elements,
          (candidate) => resolveBox(candidate, fittedBoxes),
          stageAspect,
        );
        if (
          distanceToSegment(
            point,
            endpoints.start,
            endpoints.end,
            stageAspect,
          ) > lineThresholdPct
        ) {
          return null;
        }
        return {
          score: withBonuses(SCORE.lineStroke, element, selectedElementIds),
          reason: "line-stroke",
        };
      }
      if (!pointInElementBox(point, element, box, stageAspect)) return null;
      if (element.shape === "ellipse") {
        const dx = (localPoint.x - (box.x + box.w / 2)) / (box.w / 2);
        const dy = (localPoint.y - (box.y + box.h / 2)) / (box.h / 2);
        if (dx * dx + dy * dy > 1) return null;
      }
      if (element.shape === "triangle") {
        if (!pointInTriangle(localPoint, box)) return null;
      }
      const edgeHit =
        distanceToBoxEdge(localPoint, box, stageAspect) <=
        SHAPE_EDGE_THRESHOLD_PCT;
      return {
        score: withBonuses(
          edgeHit ? SCORE.shapeEdge : shapeInteriorScore(box),
          element,
          selectedElementIds,
        ),
        reason: edgeHit ? "shape-edge" : "shape-interior",
      };
    }
    case "connector": {
      const endpoints = resolveConnectorElementPoints(
        element,
        elements,
        (candidate) => resolveBox(candidate, fittedBoxes),
      );
      if (
        distanceToSegment(point, endpoints.start, endpoints.end, stageAspect) >
        lineThresholdPct
      ) {
        return null;
      }
      return {
        score: withBonuses(SCORE.connectorStroke, element, selectedElementIds),
        reason: "connector-stroke",
      };
    }
    default:
      if (!pointInElementBox(point, element, box, stageAspect)) return null;
      return {
        score: withBonuses(
          element.kind === "placeholder"
            ? SCORE.placeholderInterior
            : SCORE.boxInterior,
          element,
          selectedElementIds,
        ),
        reason: "box-interior",
      };
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
    .map((candidate) => {
      const hit = hitTestElement(
        point,
        candidate.element,
        elements,
        options.fittedBoxes,
        stageAspect,
        lineThresholdPct,
        options.selectedElementIds,
        options.textHitGeometry,
      );
      return hit ? { ...candidate, ...hit } : null;
    })
    .filter((candidate): candidate is HitTestCandidate & { index: number } =>
      Boolean(candidate),
    )
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.element.zIndex - a.element.zIndex ||
        b.index - a.index,
    )
    .map(({ element, box, score, reason }) => ({
      element,
      box,
      score,
      reason,
    }));
}
