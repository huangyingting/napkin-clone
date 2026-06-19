"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { COMMAND_PRIORITY_EDITOR } from "lexical";
import { useEffect } from "react";

import { INSERT_VISUAL_COMMAND } from "@/lib/lexical/commands";
import { $insertBlankVisualAfter } from "@/lib/lexical/insert-visual";

/**
 * Registers the handler for {@link INSERT_VISUAL_COMMAND}: the deterministic,
 * non-AI "Insert Visual" path (Phase 2). On dispatch it delegates to
 * {@link $insertBlankVisualAfter}, which builds a `VisualNode` from
 * `createBlankVisual(kind)` — no network/AI call — inserts it AFTER the target
 * block (mirroring how the AI spark inserts today), and selects it as a
 * `NodeSelection` so the contextual visual controls surface.
 *
 * Everything runs inside a single `editor.update()`, so the new visual
 * serializes into `contentJson` and flows through the existing debounced save →
 * `mirrorVisualNodes`, which derives its `Visual`/`VisualRevision` rows exactly
 * like an AI-generated one. The handler never touches Yjs directly and never
 * persists NodeKeys (`afterNodeKey` is transient, used only within the update).
 */
export function InsertVisualPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      INSERT_VISUAL_COMMAND,
      (payload) => {
        editor.update(() => {
          $insertBlankVisualAfter(payload);
        });
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    );
  }, [editor]);

  return null;
}
