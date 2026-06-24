import type { SlideElement } from "./deck";
import type { HitTestCandidate } from "./stage-hit-test";

export type StageInteractionTarget =
  | {
      kind: "element";
      element: SlideElement;
      elementIds: [string];
      groupId: null;
    }
  | {
      kind: "group";
      element: SlideElement;
      elementIds: string[];
      groupId: string;
    };

export interface StageTargetingOptions {
  groupEditingId?: string | null;
}

function elementGroupId(element: SlideElement): string | null {
  return (element as { groupId?: string }).groupId ?? null;
}

export function groupedElementIds(
  elements: readonly SlideElement[],
  groupId: string,
): string[] {
  return elements
    .filter((element) => elementGroupId(element) === groupId)
    .map((element) => element.id);
}

export function resolveStageElementTarget(
  element: SlideElement,
  elements: readonly SlideElement[],
  options: StageTargetingOptions = {},
): StageInteractionTarget {
  const groupId = elementGroupId(element);
  if (groupId && groupId !== options.groupEditingId) {
    const elementIds = groupedElementIds(elements, groupId);
    if (elementIds.length > 1) {
      return {
        kind: "group",
        element,
        elementIds,
        groupId,
      };
    }
  }
  return {
    kind: "element",
    element,
    elementIds: [element.id],
    groupId: null,
  };
}

export function resolveStageHitTarget(
  hit: HitTestCandidate | null | undefined,
  elements: readonly SlideElement[],
  options: StageTargetingOptions = {},
): StageInteractionTarget | null {
  if (!hit) return null;
  return resolveStageElementTarget(hit.element, elements, options);
}

export function isStageTargetSelected(
  target: StageInteractionTarget,
  selectedElementIds: ReadonlySet<string>,
): boolean {
  return target.elementIds.every((id) => selectedElementIds.has(id));
}
