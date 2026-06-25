import type { SlideElement } from "@/lib/presentation/deck";

export function effectiveSelectedElementId(
  selectedElementId: string | null,
  elements: readonly SlideElement[] | undefined,
): string | null {
  return selectedElementId != null &&
    (elements?.some((el) => el.id === selectedElementId) ?? false)
    ? selectedElementId
    : null;
}

export function effectiveSelectedElementIds(
  selectedElementIds: ReadonlySet<string>,
  elements: readonly SlideElement[] | undefined,
): Set<string> {
  if (!elements || selectedElementIds.size === 0) {
    return new Set<string>();
  }
  const next = new Set<string>();
  for (const el of elements) {
    if (selectedElementIds.has(el.id)) {
      next.add(el.id);
    }
  }
  return next;
}

export function selectedElementIdList(
  primaryId: string | null,
  effectiveIds: ReadonlySet<string>,
): string[] {
  if (!primaryId) return [];
  return effectiveIds.size > 0 ? [...effectiveIds] : [primaryId];
}

export function selectionAfterToggle(
  currentPrimaryId: string | null,
  currentIds: ReadonlySet<string>,
  id: string,
): { primaryId: string | null; ids: Set<string> } {
  const next = new Set(currentIds);
  let primaryId = currentPrimaryId;
  if (next.has(id)) {
    next.delete(id);
    primaryId = primaryId === id ? ([...next][0] ?? null) : primaryId;
  } else {
    next.add(id);
    primaryId = id;
  }
  return { primaryId, ids: next };
}

export function selectionAfterSet(
  currentPrimaryId: string | null,
  currentIds: ReadonlySet<string>,
  ids: readonly string[],
  additive = false,
): { primaryId: string | null; ids: Set<string> } {
  const next = additive ? new Set(currentIds) : new Set<string>();
  for (const id of ids) {
    next.add(id);
  }
  return {
    primaryId:
      currentPrimaryId && next.has(currentPrimaryId)
        ? currentPrimaryId
        : ([...next][0] ?? null),
    ids: next,
  };
}
