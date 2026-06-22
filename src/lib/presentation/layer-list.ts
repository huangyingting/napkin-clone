/**
 * Pure helpers for the slide layer/object list (issue #331).
 *
 * No DOM, no React — fully testable under `node --test`.
 */

import type { ConnectorElement, SlideElement } from "./deck";
import { elementAccessibleName } from "./element-accessible-name";

/**
 * Filters `elements` to those whose accessible name contains `query`
 * (case-insensitive). Returns the original array reference when `query` is
 * blank so callers can skip a re-render.
 */
export function filterElementsByName(
  elements: readonly SlideElement[],
  query: string,
): readonly SlideElement[] {
  const trimmed = query.trim();
  if (!trimmed) return elements;
  const lower = trimmed.toLowerCase();
  return elements.filter((element) =>
    elementAccessibleName(element, elements).toLowerCase().includes(lower),
  );
}

/**
 * Returns the human-readable start and end target names for a connector.
 * When an endpoint is bound to an element in `allElements`, the accessible
 * name of that element is returned; otherwise `"(free point)"` is used.
 */
export function getConnectorTargetNames(
  connector: ConnectorElement,
  allElements: readonly SlideElement[],
): { start: string; end: string } {
  function resolveEndpoint(point: ConnectorElement["start"]): string {
    if (!("elementId" in point)) return "(free point)";
    const target = allElements.find((el) => el.id === point.elementId);
    return target ? elementAccessibleName(target) : "(free point)";
  }

  return {
    start: resolveEndpoint(connector.start),
    end: resolveEndpoint(connector.end),
  };
}
