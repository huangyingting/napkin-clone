"use client";

import { useEffect, useRef } from "react";

import { isEditableTagName } from "./match";

/**
 * Whether the event target is a text-entry element, so bare-key shortcuts are
 * ignored while the user is typing.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return isEditableTagName(target.tagName, target.isContentEditable);
}

/**
 * Registers a global `keydown` handler for keyboard shortcuts.
 *
 * - The handler is kept in a ref (updated in an effect, never during render) so
 *   the listener does not churn on every render and never sees a stale closure.
 * - When `allowInInput` is false (the default), events originating from a
 *   text-entry element are ignored so typing is never hijacked. Modifier-based
 *   shortcuts that are meant to work while typing (e.g. Ctrl/⌘+E) pass
 *   `allowInInput: true`.
 * - Setting `enabled: false` registers nothing (e.g. to scope a bare-key
 *   shortcut to a single mounted instance).
 */
export function useKeyboardShortcut(
  handler: (event: KeyboardEvent) => void,
  options: { enabled?: boolean; allowInInput?: boolean } = {},
): void {
  const { enabled = true, allowInInput = false } = options;
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!allowInInput && isEditableTarget(event.target)) {
        return;
      }
      handlerRef.current(event);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled, allowInInput]);
}
