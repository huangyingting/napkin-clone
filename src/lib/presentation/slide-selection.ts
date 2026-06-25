import type { SlideElement } from "./deck";

export function effectiveSlideElementId(
  elements: readonly SlideElement[] | undefined,
  selectedElementId: string | null,
): string | null {
  if (!selectedElementId) return null;
  return elements?.some((element) => element.id === selectedElementId)
    ? selectedElementId
    : null;
}

export function effectiveSlideElementIds(
  elements: readonly SlideElement[] | undefined,
  selectedElementIds: ReadonlySet<string>,
): Set<string> {
  if (!elements || selectedElementIds.size === 0) {
    return new Set();
  }
  const next = new Set<string>();
  for (const element of elements) {
    if (selectedElementIds.has(element.id)) {
      next.add(element.id);
    }
  }
  return next;
}

export function slideSelectionIdList(
  primaryId: string | null,
  selectedElementIds: ReadonlySet<string>,
): string[] {
  if (!primaryId) return [];
  return selectedElementIds.size > 0 ? [...selectedElementIds] : [primaryId];
}
