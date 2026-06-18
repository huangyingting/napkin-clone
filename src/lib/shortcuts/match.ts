/**
 * Pure, framework-free helpers for matching keyboard shortcuts and deciding
 * when a shortcut should be ignored because the user is typing.
 *
 * Keeping this logic out of the React hook makes it unit-testable with
 * `node --test` (no DOM required) and keeps the matching rules in one place.
 */

/** The subset of a `KeyboardEvent` the matchers need. */
export type KeyEventLike = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

/**
 * Whether an element (by tag name / contentEditable) is a text-entry target
 * where bare-key shortcuts must be ignored so typing is never hijacked.
 */
export function isEditableTagName(
  tagName: string | undefined | null,
  isContentEditable: boolean,
): boolean {
  if (isContentEditable) {
    return true;
  }
  if (!tagName) {
    return false;
  }
  const tag = tagName.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** `?` (Shift+/) with no command modifier — opens the shortcuts help dialog. */
export function isHelpShortcut(event: KeyEventLike): boolean {
  return event.key === "?" && !event.ctrlKey && !event.metaKey && !event.altKey;
}

/** A bare `n` — creates a new document from the dashboard. */
export function isNewDocumentShortcut(event: KeyEventLike): boolean {
  return (
    (event.key === "n" || event.key === "N") &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey
  );
}

/** `Ctrl+E` / `⌘+E` — toggles the editor's Write/Preview view. */
export function isTogglePreviewShortcut(event: KeyEventLike): boolean {
  return (
    (event.key === "e" || event.key === "E") &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey
  );
}
