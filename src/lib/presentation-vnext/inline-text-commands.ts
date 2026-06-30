/**
 * Inline text editor command event for v7.
 *
 * The context toolbar dispatches a `textiq:inline-text-command-v7` custom
 * event on `document`; the active `InlineTextEditorVNext` instance handles it.
 */

export const INLINE_TEXT_COMMAND_EVENT_V7 = "textiq:inline-text-command-v7";

export type InlineTextCommandName =
  | "bold"
  | "italic"
  | "underline"
  | "strikethrough"
  | "bullet-list"
  | "numbered-list"
  | "align-left"
  | "align-center"
  | "align-right"
  | "link"
  | "color"
  | "font-size";

export type InlineTextCommandPayload = {
  command: InlineTextCommandName;
  /** Used by "color", "font-size", and "link" commands. */
  value?: string;
};

/** Dispatch a command to the focused inline text editor. */
export function dispatchInlineTextCommand(
  payload: InlineTextCommandPayload,
): void {
  if (typeof document === "undefined") return;
  document.dispatchEvent(
    new CustomEvent(INLINE_TEXT_COMMAND_EVENT_V7, { detail: payload }),
  );
}
