"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createNodeSelection, $getNodeByKey, $setSelection } from "lexical";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

import { useCardMotion } from "@/components/motion/reveal";
import { FOCUS_RING } from "@/components/motion/control-styles";
import { VisualRenderer } from "@/components/visual/visual-renderer";
import { useEditorContext } from "@/lib/lexical/editor-context";
import { safeParseVisual, type Visual } from "@/lib/visual/schema";

import { useVisualAnchor } from "./visual-anchor-context";
import { VisualContextPopover } from "./visual-context-popover";
import { VisualEditor } from "./visual-editor";
import { $isVisualNode } from "./visual-node";

/**
 * Interactive card for a {@link Visual} embedded in the Lexical editor (US-012).
 * Read-only by default; clicking it (when the editor is editable) selects the
 * underlying {@link VisualNode} as a Lexical `NodeSelection`. The shared
 * {@link useEditorContext} snapshot then reports `kind === 'visual'` for this
 * node, which surfaces the contextual {@link VisualContextPopover} anchored to
 * the card — the single Phase-3 editing surface (type / theme / refine /
 * typography / per-element overrides), replacing the old inline popover and its
 * ad-hoc outside-click state machine.
 *
 * Every edit writes back via `node.setVisual` inside an `editor.update`, a local
 * edit that persists through the debounced Lexical save (US-003) and the
 * mirrored `Visual` row (US-011). Selection state lives entirely in the editor
 * (NodeSelection) — never Yjs, never a persisted NodeKey.
 */
export function VisualCard({
  nodeKey,
  visual,
}: {
  nodeKey: string;
  visual: Visual;
}) {
  const [editor] = useLexicalComposerContext();
  const ctx = useEditorContext();

  const rootRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<SVGSVGElement | null>(null);

  const [editable, setEditable] = useState(() => editor.isEditable());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const cardMotion = useCardMotion();

  // This card is "selected" when the editor's NodeSelection targets its node.
  const isSelected =
    ctx.kind === "visual" && ctx.selectedVisualNodeKey === nodeKey;
  const showControls = isSelected && editable;

  // Report the selected visual element up to the editor chrome so a comment can
  // be anchored to it (US-017). We store the node id + label, not a Lexical key.
  const visualAnchor = useVisualAnchor();
  const reportedAnchorRef = useRef(false);
  useEffect(() => {
    if (!visualAnchor) {
      return;
    }
    if (showControls && selectedNodeId) {
      const node = visual.nodes.find((item) => item.id === selectedNodeId);
      visualAnchor.setVisualAnchor({
        id: selectedNodeId,
        label: node?.label?.trim() || "element",
      });
      reportedAnchorRef.current = true;
    } else if (reportedAnchorRef.current) {
      visualAnchor.setVisualAnchor(null);
      reportedAnchorRef.current = false;
    }
  }, [visualAnchor, showControls, selectedNodeId, visual.nodes]);

  useEffect(() => {
    return editor.registerEditableListener((value) => setEditable(value));
  }, [editor]);

  // Writes a new payload back to the node. This is a local edit, so the editor's
  // OnChangePlugin debounce-saves it into `contentJson` (US-003) and the save
  // action mirrors it to the `Visual` row (US-011).
  const updateVisual = useCallback(
    (next: Visual) => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if ($isVisualNode(node)) {
          node.setVisual(next);
        }
      });
    },
    [editor, nodeKey],
  );

  // Removes this visual block from the document (US-013).
  const removeVisual = useCallback(() => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isVisualNode(node)) {
        node.remove();
      }
    });
  }, [editor, nodeKey]);

  // Selects the node so EditorContext reports `kind === 'visual'` and the
  // popover surfaces. (The insert path already does this for new visuals.)
  const selectVisual = useCallback(() => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (!$isVisualNode(node)) {
        return;
      }
      const selection = $createNodeSelection();
      selection.add(nodeKey);
      $setSelection(selection);
    });
  }, [editor, nodeKey]);

  // Closes the controls by clearing the selection (Escape / × / click-away).
  const closeControls = useCallback(() => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isVisualNode(node)) {
        $setSelection(null);
      }
    });
  }, [editor, nodeKey]);

  const parsed = safeParseVisual(visual);
  if (!parsed.success) {
    return (
      <div
        role="img"
        aria-label="Unavailable visual"
        className="my-4 rounded-2xl border border-dashed border-[var(--ds-border,rgba(0,0,0,0.12))] bg-[var(--ds-surface-sunken,#f4f4f5)] p-6 text-center text-sm text-[var(--ds-text-muted,#6f7d83)]"
      >
        This visual could not be displayed.
      </div>
    );
  }

  const data = parsed.data;

  const cardClass = [
    "overflow-hidden rounded-2xl border bg-[var(--ds-surface,#ffffff)] p-2 transition",
    showControls
      ? "border-[var(--ds-accent,#6366f1)] ring-2 ring-[var(--ds-accent,#6366f1)]/20"
      : "border-[var(--ds-border,rgba(0,0,0,0.06))]",
  ].join(" ");

  return (
    <motion.div
      ref={rootRef}
      data-visual-chrome
      className="relative my-4"
      initial={cardMotion.initial}
      animate={cardMotion.animate}
      transition={cardMotion.transition}
    >
      {showControls ? (
        <div className={cardClass}>
          <VisualEditor
            visual={data}
            onChange={updateVisual}
            onSelectNode={setSelectedNodeId}
            rendererRef={rendererRef}
            canEdit
          />
        </div>
      ) : editable ? (
        <button
          type="button"
          aria-label="Edit visual"
          onClick={selectVisual}
          className={`${cardClass} block w-full cursor-pointer text-left hover:border-[var(--ds-border-strong,rgba(0,0,0,0.2))] ${FOCUS_RING}`}
        >
          <VisualRenderer
            ref={rendererRef}
            visual={data}
            className="pointer-events-none block h-auto w-full"
          />
        </button>
      ) : (
        <div className={cardClass}>
          <VisualRenderer visual={data} className="block h-auto w-full" />
        </div>
      )}

      {showControls ? (
        <VisualContextPopover
          visual={data}
          selectedNodeId={selectedNodeId}
          onChange={updateVisual}
          onRemove={removeVisual}
          onClose={closeControls}
          getSvgElement={() => rendererRef.current}
          anchorRef={rootRef}
        />
      ) : null}
    </motion.div>
  );
}
