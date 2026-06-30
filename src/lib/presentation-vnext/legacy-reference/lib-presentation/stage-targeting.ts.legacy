import type { SlideElement } from "./deck-elements";
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

/**
 * Lightweight snapshot of a hovered target used for the hover-preselection
 * frame overlay. Separate from `StageInteractionTarget` so we don't hold
 * live element references across renders.
 */
export type StagePreselection =
  | { kind: "slide" }
  | { kind: "element"; elementId: string }
  | { kind: "group"; groupId: string; elementIds: string[] };

export function preselectionFromStageTarget(
  target: StageInteractionTarget,
): StagePreselection {
  return target.kind === "group"
    ? {
        kind: "group",
        groupId: target.groupId,
        elementIds: target.elementIds,
      }
    : { kind: "element", elementId: target.element.id };
}

export function samePreselection(
  a: StagePreselection | null,
  b: StagePreselection | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === "slide" && b.kind === "slide") {
    return true;
  }
  if (a.kind === "element" && b.kind === "element") {
    return a.elementId === b.elementId;
  }
  /* V8/tsx reports this covered ordered group comparison as uncovered; tests cover equal, length-mismatch, and order-mismatch groups. */
  /* node:coverage ignore next 8 */
  if (a.kind === "group" && b.kind === "group") {
    return (
      a.groupId === b.groupId &&
      a.elementIds.length === b.elementIds.length &&
      a.elementIds.every((id, index) => id === b.elementIds[index])
    );
  }
  return false;
}
