import {
  shortcutById,
  shortcutDisplayLabel,
  type ShortcutId,
} from "@/lib/shortcuts/catalog";

export type ActionDescriptor<TContext = void> = {
  id: string;
  label: string;
  description?: string;
  shortcutId?: ShortcutId;
  tooltip?: string;
  disabledReason?: string;
  run?: (context: TContext) => void;
};

export function actionTooltip(
  descriptor: Pick<ActionDescriptor, "description" | "label" | "tooltip">,
): string {
  return descriptor.tooltip ?? descriptor.description ?? descriptor.label;
}

export function actionAriaKeyShortcuts(
  descriptor: Pick<ActionDescriptor, "shortcutId">,
): string | undefined {
  return descriptor.shortcutId
    ? shortcutById(descriptor.shortcutId).canonical
    : undefined;
}

export function actionShortcutLabel(
  descriptor: Pick<ActionDescriptor, "shortcutId">,
  opts: { isMac?: boolean } = {},
): string | undefined {
  return descriptor.shortcutId
    ? shortcutDisplayLabel(shortcutById(descriptor.shortcutId), opts)
    : undefined;
}
