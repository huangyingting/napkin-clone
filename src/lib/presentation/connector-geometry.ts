import type {
  ConnectorAnchor,
  ConnectorElement,
  ConnectorEndpoint,
  ConnectorPoint,
  ElementBox,
  ShapeElement,
  SlideElement,
} from "./deck";

export interface PointPct {
  x: number;
  y: number;
}

export type ConnectorBoxResolver = (element: SlideElement) => ElementBox;

export const CONNECTOR_ANCHORS: readonly ConnectorAnchor[] = [
  "center",
  "top",
  "bottom",
  "left",
  "right",
];

export function anchorPoint(
  box: ElementBox,
  anchor: ConnectorAnchor,
): PointPct {
  switch (anchor) {
    case "top":
      return { x: box.x + box.w / 2, y: box.y };
    case "bottom":
      return { x: box.x + box.w / 2, y: box.y + box.h };
    case "left":
      return { x: box.x, y: box.y + box.h / 2 };
    case "right":
      return { x: box.x + box.w, y: box.y + box.h / 2 };
    case "center":
    default:
      return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  }
}

export function lineEndpoints(
  box: ElementBox,
  rotation: number | undefined,
  stageAspect: number,
): { start: PointPct; end: PointPct } {
  const angle = ((rotation ?? 0) * Math.PI) / 180;
  const centerX = box.x + box.w / 2;
  const centerY = box.y + box.h / 2;
  const dx = (Math.cos(angle) * box.w) / 2;
  const dy = (Math.sin(angle) * box.w * stageAspect) / 2;
  return {
    start: { x: centerX - dx, y: centerY - dy },
    end: { x: centerX + dx, y: centerY + dy },
  };
}

export function resolveConnectorEndpoint(
  endpoint: ConnectorEndpoint | undefined,
  elements: readonly SlideElement[],
  resolveBox: ConnectorBoxResolver,
): PointPct | null {
  if (!endpoint) return null;
  const element = elements.find((item) => item.id === endpoint.elementId);
  if (!element) return null;
  return anchorPoint(resolveBox(element), endpoint.anchor);
}

export function resolveLineEndpoints(
  element: ShapeElement,
  elements: readonly SlideElement[],
  resolveBox: ConnectorBoxResolver,
  stageAspect: number,
): { start: PointPct; end: PointPct } {
  const base = lineEndpoints(element.box, element.rotation, stageAspect);
  if (element.shape !== "line") return base;
  return {
    start:
      resolveConnectorEndpoint(
        element.connector?.start,
        elements,
        resolveBox,
      ) ?? base.start,
    end:
      resolveConnectorEndpoint(element.connector?.end, elements, resolveBox) ??
      base.end,
  };
}

export function lineBoxFromEndpoints(
  start: PointPct,
  end: PointPct,
  heightPct: number,
  stageAspect: number,
): { box: ElementBox; rotation?: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const width = Math.max(1, Math.sqrt(dx * dx + (dy / stageAspect) ** 2));
  const rotation = (Math.atan2(dy / stageAspect, dx) * 180) / Math.PI;
  const normalizedRotation = Math.round(rotation);
  return {
    box: {
      x: (start.x + end.x) / 2 - width / 2,
      y: (start.y + end.y) / 2 - heightPct / 2,
      w: width,
      h: heightPct,
    },
    ...(normalizedRotation === 0 ? {} : { rotation: normalizedRotation }),
  };
}

export function snapLineEndpoint(
  point: PointPct,
  lineId: string,
  elements: readonly SlideElement[],
  resolveBox: ConnectorBoxResolver,
  stageAspect: number,
  thresholdPct = 5,
): { point: PointPct; binding?: ConnectorEndpoint } {
  let bestPoint = point;
  let bestBinding: ConnectorEndpoint | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const element of elements) {
    if (element.id === lineId) continue;
    if (element.kind === "shape" && element.shape === "line") continue;
    const box = resolveBox(element);
    for (const anchor of CONNECTOR_ANCHORS) {
      const anchorPosition = anchorPoint(box, anchor);
      const dx = (anchorPosition.x - point.x) * stageAspect;
      const dy = anchorPosition.y - point.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < bestDistance && distance <= thresholdPct) {
        bestDistance = distance;
        bestPoint = anchorPosition;
        bestBinding = { elementId: element.id, anchor };
      }
    }
  }
  return { point: bestPoint, ...(bestBinding ? { binding: bestBinding } : {}) };
}

/**
 * Resolves the start and end {@link PointPct} for a {@link ConnectorElement}.
 *
 * Each endpoint is either a free slide-percentage coordinate or a bound anchor
 * on another slide element. When a bound endpoint references a missing element
 * the fallback is the element's box center (if found) or the origin.
 */
export function resolveConnectorElementPoints(
  element: ConnectorElement,
  elements: readonly SlideElement[],
  resolveBox: ConnectorBoxResolver,
): { start: PointPct; end: PointPct } {
  function resolve(point: ConnectorPoint): PointPct {
    if ("elementId" in point) {
      const resolved = resolveConnectorEndpoint(
        point as ConnectorEndpoint,
        elements,
        resolveBox,
      );
      if (resolved) return resolved;
      const target = elements.find(
        (el) => el.id === (point as ConnectorEndpoint).elementId,
      );
      if (target) {
        const box = resolveBox(target);
        return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
      }
      return { x: 0, y: 0 };
    }
    return point as PointPct;
  }
  return { start: resolve(element.start), end: resolve(element.end) };
}
