/**
 * Migration helper that converts a legacy `ShapeElement` with `shape: "line"`
 * into a first-class {@link ConnectorElement}.
 *
 * Usage:
 * ```ts
 * import { normalizeConnector } from "@/lib/presentation/connector-normalize";
 *
 * if (el.kind === "shape" && el.shape === "line") {
 *   const connector = normalizeConnector(el);
 *   // replace el with connector in the deck
 * }
 * ```
 *
 * The helper is pure — it never mutates its input.
 */

import type {
  ConnectorBoundEndpoint,
  ConnectorElement,
  ConnectorElementEndpoint,
  ConnectorFreePoint,
  ShapeElement,
} from "./deck";
import { lineEndpoints } from "./connector-geometry";

/** Default stage aspect ratio used when none is supplied. */
const DEFAULT_STAGE_ASPECT = 16 / 9;

/**
 * Converts a legacy line `ShapeElement` into a first-class `ConnectorElement`.
 *
 * - The start/end **positions** are derived from the shape's bounding box and
 *   rotation (the same geometry used by the canvas renderer).
 * - Existing `connector.start` / `connector.end` **bindings** are promoted to
 *   `ConnectorBoundEndpoint`s; unbound sides become `ConnectorFreePoint`s.
 * - The stroke is preserved from `el.stroke`; if absent, `el.color` is used as
 *   the stroke color with a default width of `0.4 cqmin`.
 * - All `BaseElement` fields (`id`, `box`, `zIndex`, `opacity`, `rotation`,
 *   `shadow`, `locked`, `groupId`) are forwarded verbatim.
 *
 * @param el          The `ShapeElement` to convert. Must have `shape: "line"`.
 * @param stageAspect Width/height ratio of the slide stage (default 16/9).
 */
export function normalizeConnector(
  el: ShapeElement & { shape: "line" },
  stageAspect = DEFAULT_STAGE_ASPECT,
): ConnectorElement {
  const base = lineEndpoints(el.box, el.rotation, stageAspect);

  const start: ConnectorElementEndpoint = el.connector?.start
    ? ({
        elementId: el.connector.start.elementId,
        anchor: el.connector.start.anchor,
      } satisfies ConnectorBoundEndpoint)
    : ({ x: base.start.x, y: base.start.y } satisfies ConnectorFreePoint);

  const end: ConnectorElementEndpoint = el.connector?.end
    ? ({
        elementId: el.connector.end.elementId,
        anchor: el.connector.end.anchor,
      } satisfies ConnectorBoundEndpoint)
    : ({ x: base.end.x, y: base.end.y } satisfies ConnectorFreePoint);

  return {
    id: el.id,
    kind: "connector",
    box: el.box,
    zIndex: el.zIndex,
    ...(el.opacity !== undefined ? { opacity: el.opacity } : {}),
    ...(el.rotation !== undefined ? { rotation: el.rotation } : {}),
    ...(el.shadow !== undefined ? { shadow: el.shadow } : {}),
    ...(el.locked !== undefined ? { locked: el.locked } : {}),
    ...(el.groupId !== undefined ? { groupId: el.groupId } : {}),
    start,
    end,
    routing: "straight",
    stroke: el.stroke ?? { color: el.color, width: 0.4 },
  };
}
