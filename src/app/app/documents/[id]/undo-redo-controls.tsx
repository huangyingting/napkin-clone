"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_LOW,
  REDO_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import { Redo2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { IconButton, Tooltip } from "@/components/ui";

/**
 * Detects whether the current platform is macOS/iOS (SSR-safe).
 * Duplicated from `floating-text-toolbar.tsx` — kept local to avoid coupling.
 */
function useIsMac(): boolean {
  return useMemo(() => {
    if (typeof navigator === "undefined") {
      return false;
    }
    const platform =
      (navigator as Navigator & { userAgentData?: { platform?: string } })
        .userAgentData?.platform ??
      navigator.platform ??
      navigator.userAgent;
    return /mac|iphone|ipad|ipod/i.test(platform);
  }, []);
}

/**
 * Discoverable Undo / Redo buttons that surface the Yjs UndoManager already
 * wired by {@link CollaborationPlugin} via `useYjsHistory`.
 *
 * • Registers `CAN_UNDO_COMMAND` / `CAN_REDO_COMMAND` listeners (low priority,
 *   non-consuming) so the button disabled state mirrors the live undo/redo stack.
 * • Dispatches `UNDO_COMMAND` / `REDO_COMMAND` on click — the registered handler
 *   in `useYjsHistory` calls `undoManager.undo()` / `undoManager.redo()`, which
 *   reverts both text edits and visual edits (the `__visual` property of
 *   `VisualNode` is synced to Yjs via `syncPropertiesFromLexical`, so it lives
 *   inside the tracked transaction origin and the UndoManager captures it).
 * • Must be rendered inside a `LexicalComposer`.
 * • In degraded local-only mode the Yjs binding is still active and local edits
 *   are still tracked, so undo works as expected; buttons are simply disabled
 *   until there is history to undo/redo (i.e. until `CAN_UNDO_COMMAND` fires).
 */
export function UndoRedoControls({ editable }: { editable: boolean }) {
  const [editor] = useLexicalComposerContext();
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const isMac = useIsMac();

  useEffect(() => {
    const unregisterUndo = editor.registerCommand(
      CAN_UNDO_COMMAND,
      (payload: boolean) => {
        setCanUndo(payload);
        return false; // don't consume — let other handlers see it
      },
      COMMAND_PRIORITY_LOW,
    );
    const unregisterRedo = editor.registerCommand(
      CAN_REDO_COMMAND,
      (payload: boolean) => {
        setCanRedo(payload);
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
    return () => {
      unregisterUndo();
      unregisterRedo();
    };
  }, [editor]);

  const undoShortcut = isMac ? "⌘Z" : "Ctrl+Z";
  const redoShortcut = isMac ? "⌘⇧Z" : "Ctrl+Shift+Z";

  return (
    <div role="group" aria-label="Undo and redo" className="flex items-center">
      <Tooltip label={`Undo (${undoShortcut})`} side="bottom">
        <IconButton
          aria-label={`Undo (${undoShortcut})`}
          size="sm"
          variant="plain"
          disabled={!editable || !canUndo}
          onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
        >
          <Undo2 aria-hidden className="h-3.5 w-3.5" />
        </IconButton>
      </Tooltip>
      <Tooltip label={`Redo (${redoShortcut})`} side="bottom">
        <IconButton
          aria-label={`Redo (${redoShortcut})`}
          size="sm"
          variant="plain"
          disabled={!editable || !canRedo}
          onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
        >
          <Redo2 aria-hidden className="h-3.5 w-3.5" />
        </IconButton>
      </Tooltip>
    </div>
  );
}
