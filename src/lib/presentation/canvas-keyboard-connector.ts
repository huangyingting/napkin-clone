/**
 * Pure state machine for keyboard connector authoring on the slide canvas.
 *
 * React wiring supplies the connectable elements and performs mutations; this
 * module decides which target is active and how mode keys transition.
 */

import type { ElementBox } from "./deck-elements";

export interface KeyboardConnectorElement {
  id: string;
  box: ElementBox;
}

export interface KeyboardConnectorMode {
  sourceId: string;
  targetId: string | null;
}

export interface KeyboardConnectorKeyEvent {
  key: string;
  shiftKey: boolean;
}

export type KeyboardConnectorDecision =
  | { type: "none" }
  | { type: "cancel"; sourceId: string }
  | { type: "confirm"; sourceId: string; targetId: string }
  | { type: "target"; mode: KeyboardConnectorMode };

interface Point {
  x: number;
  y: number;
}

export function orderedKeyboardConnectorTargets(
  elements: readonly KeyboardConnectorElement[],
  sourceId: string,
): KeyboardConnectorElement[] {
  const source = elements.find((element) => element.id === sourceId);
  if (!source) return [];
  const sourceCenter = centerOf(source.box);
  return elements
    .filter((element) => element.id !== sourceId)
    .slice()
    .sort((a, b) => {
      const distanceA = squaredDistance(sourceCenter, centerOf(a.box));
      const distanceB = squaredDistance(sourceCenter, centerOf(b.box));
      if (distanceA !== distanceB) return distanceA - distanceB;
      if (a.box.y !== b.box.y) return a.box.y - b.box.y;
      if (a.box.x !== b.box.x) return a.box.x - b.box.x;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

export function startKeyboardConnectorMode(
  elements: readonly KeyboardConnectorElement[],
  sourceId: string,
): KeyboardConnectorMode | null {
  if (!elements.some((element) => element.id === sourceId)) return null;
  const [firstTarget] = orderedKeyboardConnectorTargets(elements, sourceId);
  if (!firstTarget) return null;
  return { sourceId, targetId: firstTarget.id };
}

export function nextKeyboardConnectorTargetId(
  targets: readonly KeyboardConnectorElement[],
  currentTargetId: string | null,
  direction: number,
): string | null {
  if (targets.length === 0) return null;
  const step = direction < 0 ? -1 : 1;
  const currentIndex =
    currentTargetId === null
      ? -1
      : targets.findIndex((target) => target.id === currentTargetId);
  if (currentIndex === -1) {
    return step > 0 ? targets[0].id : targets[targets.length - 1].id;
  }
  const nextIndex = (currentIndex + step + targets.length) % targets.length;
  return targets[nextIndex].id;
}

export function keyboardConnectorDecision(
  mode: KeyboardConnectorMode,
  event: KeyboardConnectorKeyEvent,
  elements: readonly KeyboardConnectorElement[],
): KeyboardConnectorDecision {
  if (event.key === "Escape") {
    return { type: "cancel", sourceId: mode.sourceId };
  }
  if (event.key === "Enter") {
    return mode.targetId
      ? {
          type: "confirm",
          sourceId: mode.sourceId,
          targetId: mode.targetId,
        }
      : { type: "none" };
  }
  const direction = connectorCycleDirection(event);
  if (direction === null) {
    return { type: "none" };
  }
  const targets = orderedKeyboardConnectorTargets(elements, mode.sourceId);
  const targetId = nextKeyboardConnectorTargetId(
    targets,
    mode.targetId,
    direction,
  );
  return targetId
    ? { type: "target", mode: { sourceId: mode.sourceId, targetId } }
    : { type: "none" };
}

function connectorCycleDirection(
  event: KeyboardConnectorKeyEvent,
): -1 | 1 | null {
  if (event.key === "Tab") return event.shiftKey ? -1 : 1;
  if (event.key === "ArrowLeft" || event.key === "ArrowUp") return -1;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") return 1;
  return null;
}

function centerOf(box: ElementBox): Point {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

function squaredDistance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}
