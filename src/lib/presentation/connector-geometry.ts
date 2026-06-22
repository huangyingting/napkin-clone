import type {
  ConnectorAnchor,
  ConnectorElement,
  ConnectorElementEndpoint,
  ConnectorEndpoint,
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
    if (element.kind === "connector") continue;
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

// ---------------------------------------------------------------------------
// ConnectorElement helpers
// ---------------------------------------------------------------------------

/**
 * Returns `true` when `ep` is a {@link ConnectorFreePoint} (has `x`/`y` fields).
 * Narrows the type to `ConnectorFreePoint` for TypeScript.
 */
export function isFreePoint(
  ep: ConnectorElementEndpoint,
): ep is import("./deck").ConnectorFreePoint {
  return "x" in ep && "y" in ep;
}

/**
 * Resolves a {@link ConnectorElementEndpoint} to a slide-percentage point.
 *
 * - Free points (`{x, y}`) are returned directly.
 * - Bound endpoints (`{elementId, anchor}`) are resolved through the element
 *   lookup and the anchor geometry on the resolved box.
 * - Returns `{ x: 50, y: 50 }` as a safe fallback when a bound target is missing.
 */
export function resolveConnectorElementEndpoint(
  ep: ConnectorElementEndpoint,
  elements: readonly SlideElement[],
  resolveBox: ConnectorBoxResolver,
): PointPct {
  if (isFreePoint(ep)) return { x: ep.x, y: ep.y };
  const element = elements.find((item) => item.id === ep.elementId);
  if (!element) return { x: 50, y: 50 };
  return anchorPoint(resolveBox(element), ep.anchor);
}

/**
 * Resolves both endpoints of a {@link ConnectorElement} to percentage points,
 * returning `{ start, end }` ready for geometry calculations.
 */
export function resolveConnectorElementEndpoints(
  element: ConnectorElement,
  elements: readonly SlideElement[],
  resolveBox: ConnectorBoxResolver,
): { start: PointPct; end: PointPct } {
  return {
    start: resolveConnectorElementEndpoint(element.start, elements, resolveBox),
    end: resolveConnectorElementEndpoint(element.end, elements, resolveBox),
  };
}
