"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNodeByKey } from "lexical";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

import { useCardMotion } from "@/components/motion/reveal";
import { FOCUS_RING } from "@/components/motion/control-styles";
import { VisualRenderer } from "@/components/visual/visual-renderer";
import { safeParseVisual, type Visual } from "@/lib/visual/schema";

import { useRegisterVisualSvg } from "@/components/editor/visual-svg-registry";

import { useVisualAnchor } from "./visual-anchor-context";
import { VisualContextPopover } from "./visual-context-popover";
import { VisualEditor } from "./visual-editor";
import { $isVisualNode } from "./visual-node";

/**
 * Interactive card for a {@link Visual} embedded in the Lexical editor (US-012).
 * Read-only by default; clicking it (when the editor is editable) opens the
 * contextual {@link VisualContextPopover} plus the in-card {@link VisualEditor}
 * — the single Phase-3 editing surface (type / theme / refine / typography /
 * per-element overrides).
 *
 * Visibility is local React state, not a Lexical `NodeSelection`. Under
 * real-time collaboration the `@lexical/yjs` binding discards programmatic
 * decorator `NodeSelection`s on commit (a decorator selection has no Yjs
 * relative-position representation, so it resets to null), which is why the
 * selection-driven popover never surfaced. Local state is the single source of
 * truth for visibility: click-away is scoped to the editor root (clicking other
 * document content — or another visual — closes this one, giving
 * single-active-visual semantics) and Escape / × close via the popover surface.
 *
 * Every edit writes back via `node.setVisual` inside an `editor.update`, a local
 * edit that persists through the debounced Lexical save (US-003) and the
 * mirrored `Visual` row (US-011). No NodeKey is ever persisted.
 */
export function VisualCard({
  nodeKey,
  visual,
  visualId,
}: {
  nodeKey: string;
  visual: Visual;
  visualId: string;
}) {
  const [editor] = useLexicalComposerContext();

  const rootRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<SVGSVGElement | null>(null);

  // Register this card's SVG getter in the document-level export registry so
  // the whole-document export can include every visual in reading order.
  useRegisterVisualSvg(visualId, () => rendererRef.current);

  const [editable, setEditable] = useState(() => editor.isEditable());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  // Whether this card's editing controls are open. Local state (not a Lexical
  // NodeSelection) so it survives collaborative updates — see the component doc.
  const [open, setOpen] = useState(false);

  const cardMotion = useCardMotion();

  const showControls = open && editable;

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
    return editor.registerEditableListener((value) => {
      setEditable(value);
      // Never leave stale editing UI open when the card becomes non-editable
      // (read-only access, or collaboration not yet ready).
      if (!value) {
        setOpen(false);
      }
    });
  }, [editor]);

  // Click-away + single-active-visual: a pointer-down inside the editor but
  // outside this card closes the controls. Scoped to the editor root so clicks
  // on the portaled popover and its nested pickers (which render outside the
  // editable root) keep the controls open; Escape and × close via the popover.
  useEffect(() => {
    if (!showControls) {
      return;
    }
    const root = editor.getRootElement();
    if (!root) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };
    root.addEventListener("mousedown", onPointerDown);
    return () => root.removeEventListener("mousedown", onPointerDown);
  }, [showControls, editor]);

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

  // Opens this card's editing controls. Visibility is local state; the
  // editor-root click-away above closes any other open visual, giving
  // single-active-visual semantics without a (collab-stripped) NodeSelection.
  const selectVisual = useCallback(() => {
    setOpen(true);
  }, []);

  // Closes the controls (Escape / × / click-away).
  const closeControls = useCallback(() => {
    setOpen(false);
  }, []);

  // Parse once per `visual` identity. An unmemoized parse returns a fresh object
  // (and `nodes` array) every render, which would make every downstream consumer
  // that depends on it (the anchor-reporting effect here, the popover's
  // `selectedNode`/reposition effect) re-run on every render and loop with their
  // own setState calls.
  const parsed = useMemo(() => safeParseVisual(visual), [visual]);
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
          // Prevent the button from grabbing focus from the editor on click
          // (avoids a focus flash as it unmounts into the editing controls)
          // while still firing `onClick`; keyboard activation is unaffected.
          onMouseDown={(event) => event.preventDefault()}
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
          <VisualRenderer ref={rendererRef} visual={data} className="block h-auto w-full" />
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
