export type MenuCommandNavigationKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

export const MENU_COMMAND_ITEM_SELECTOR =
  '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';

function isMenuCommandDisabled(item: HTMLElement): boolean {
  return (
    item.hasAttribute("disabled") ||
    item.getAttribute("aria-disabled") === "true"
  );
}

function isMenuCommandElement(value: EventTarget | null): value is HTMLElement {
  return Boolean(
    value &&
    typeof (value as { focus?: unknown }).focus === "function" &&
    typeof (value as { getAttribute?: unknown }).getAttribute === "function",
  );
}

export function getMenuCommandItems(
  container: ParentNode | null | undefined,
): HTMLElement[] {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLElement>(MENU_COMMAND_ITEM_SELECTOR),
  ).filter((item) => !isMenuCommandDisabled(item));
}

export function isMenuCommandNavigationKey(
  key: string,
): key is MenuCommandNavigationKey {
  return (
    key === "ArrowDown" || key === "ArrowUp" || key === "Home" || key === "End"
  );
}

export function getNextMenuCommandIndex(
  key: MenuCommandNavigationKey,
  currentIndex: number,
  itemCount: number,
): number {
  if (itemCount <= 0) return -1;
  if (key === "Home") return 0;
  if (key === "End") return itemCount - 1;
  if (key === "ArrowDown") {
    return currentIndex < 0 ? 0 : (currentIndex + 1) % itemCount;
  }
  return currentIndex < 0
    ? itemCount - 1
    : (currentIndex - 1 + itemCount) % itemCount;
}

export function focusFirstMenuCommand(
  container: ParentNode | null | undefined,
): boolean {
  const first = getMenuCommandItems(container)[0];
  first?.focus();
  return first !== undefined;
}

export function moveMenuCommandFocus({
  container,
  key,
  currentTarget,
}: {
  container: ParentNode | null | undefined;
  key: MenuCommandNavigationKey;
  currentTarget: EventTarget | null;
}): boolean {
  const items = getMenuCommandItems(container);
  if (items.length === 0) return false;
  const target = isMenuCommandElement(currentTarget)
    ? currentTarget
    : typeof document === "undefined"
      ? null
      : (document.activeElement as HTMLElement | null);
  const currentIndex = target ? items.indexOf(target) : -1;
  const nextIndex = getNextMenuCommandIndex(key, currentIndex, items.length);
  if (nextIndex < 0) return false;
  items[nextIndex]?.focus();
  return true;
}
