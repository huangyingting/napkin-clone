import type { SlideElement } from "./deck";

export type ElementPointerDownIntent =
  | "toggle-selection"
  | "select-or-drag"
  | "drag-selected";

export type InlineEditableStageElement = Extract<
  SlideElement,
  { kind: "text" | "shape" }
>;

export function isInlineEditableStageElement(
  element: SlideElement,
): element is InlineEditableStageElement {
  return (
    element.kind === "text" ||
    (element.kind === "shape" && element.shape !== "line")
  );
}

export function elementPointerDownIntent({
  isSelected,
  isAdditive,
}: {
  isSelected: boolean;
  isAdditive: boolean;
}): ElementPointerDownIntent {
  if (isAdditive) return "toggle-selection";
  return isSelected ? "drag-selected" : "select-or-drag";
}

export function shouldEnterInlineTextEditOnClick({
  element,
  mode,
  moved,
  wasPrimarySelected,
  selectedCount,
}: {
  element: SlideElement;
  mode: string;
  moved: boolean;
  wasPrimarySelected: boolean;
  selectedCount: number;
}): boolean {
  return (
    mode === "move" &&
    !moved &&
    wasPrimarySelected &&
    selectedCount === 1 &&
    isInlineEditableStageElement(element)
  );
}

export function shouldClearSelectionOnStagePointerDown({
  activeEditingId,
  isPrimaryButton,
}: {
  activeEditingId: string | null;
  isPrimaryButton: boolean;
}): boolean {
  return activeEditingId !== null && isPrimaryButton;
}
