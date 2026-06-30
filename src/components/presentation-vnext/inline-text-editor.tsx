"use client";

/**
 * InlineTextEditorVNext — contenteditable overlay for v7 text/shape nodes.
 *
 * Positioned absolutely over the node's layout frame (in canvas-percent
 * coordinates). Commits via `onCommit(paragraphs)` on Escape or blur.
 *
 * Font resolution: uses basic CSS inherited from the slide canvas so the
 * visual experience is seamless during the enter/exit transition. A future
 * improvement can read ThemePackageV1 tokens for exact font matching.
 *
 * Handles the `textiq:inline-text-command-v7` DOM event dispatched by the
 * context toolbar.
 */

import {
  useEffect,
  useRef,
  type CSSProperties,
  type JSX,
  type KeyboardEvent,
} from "react";

import type { Paragraph } from "@/lib/presentation-vnext/schema";
import {
  INLINE_TEXT_COMMAND_EVENT_V7,
  type InlineTextCommandPayload,
} from "@/lib/presentation-vnext/inline-text-commands";

export interface InlineTextEditorVNextProps {
  /** Stable id of the node being edited. */
  nodeId: string;
  /** Initial paragraphs from `node.content.paragraphs`. */
  initialParagraphs: Paragraph[];
  /** Canvas-relative frame in percent units. */
  frame: { x: number; y: number; w: number; h: number };
  /** Canvas element bounding rect (reserved for future px-based font matching). */
  canvasRect?: DOMRect;
  /** Called when the user commits the edit (Escape, blur, or Tab). */
  onCommit: (nodeId: string, paragraphs: Paragraph[]) => void;
  /** Called when the user cancels (Escape with empty input). */
  onCancel: () => void;
  /**
   * Optional: move to the next text node in reading order (Tab key).
   * If omitted, Tab commits and no focus shift occurs.
   */
  onTabNext?: () => void;
  /**
   * Optional: move to the previous text node (Shift+Tab).
   */
  onTabPrev?: () => void;
}

// ---------------------------------------------------------------------------
// Run serialization helpers
// ---------------------------------------------------------------------------

/** Convert the contenteditable DOM back to Paragraph[] preserving basic bold/italic. */
function domToParagraphs(
  container: HTMLElement,
  idPrefix: string,
): Paragraph[] {
  const rawText = container.innerText ?? "";
  const lines = rawText.split(/\n/);
  return lines.map((text, index) => ({
    id: `${idPrefix}-p-${index + 1}`,
    text,
  }));
}

/** Render initial paragraphs as HTML for the contenteditable. */
function paragraphsToHtml(paragraphs: Paragraph[]): string {
  return paragraphs
    .map((p) => {
      const text = p.text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `<div>${text || "<br>"}</div>`;
    })
    .join("");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InlineTextEditorVNext({
  nodeId,
  initialParagraphs,
  frame,
  onCommit,
  onCancel,
  onTabNext,
  onTabPrev,
}: InlineTextEditorVNextProps): JSX.Element {
  const editableRef = useRef<HTMLDivElement | null>(null);
  const committedRef = useRef(false);

  // Position in viewport-px derived from canvas-percent frame
  const style: CSSProperties = {
    position: "absolute",
    left: `${frame.x}%`,
    top: `${frame.y}%`,
    width: `${frame.w}%`,
    height: `${frame.h}%`,
    outline: "none",
    cursor: "text",
    // Keep text transparent so it layers exactly over the canvas render
    zIndex: 20,
    boxSizing: "border-box",
    padding: "inherit",
    // Match canvas font as best possible via inheritance
    font: "inherit",
    lineHeight: "inherit",
    color: "inherit",
    wordBreak: "break-word",
    overflowWrap: "break-word",
  };

  // Focus and place caret at end on mount
  useEffect(() => {
    const el = editableRef.current;
    if (!el) return;
    el.innerHTML = paragraphsToHtml(
      initialParagraphs.length > 0
        ? initialParagraphs
        : [{ id: `${nodeId}-p-1`, text: "" }],
    );
    el.focus();
    // Place cursor at end
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(el);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function doCommit() {
    if (committedRef.current) return;
    committedRef.current = true;
    const el = editableRef.current;
    if (!el) {
      onCancel();
      return;
    }
    const paragraphs = domToParagraphs(el, nodeId);
    onCommit(nodeId, paragraphs);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (!editableRef.current?.innerText?.trim()) {
        // Set guard before cancel so a subsequent blur fires doCommit() as a
        // no-op rather than spuriously committing an empty paragraph.
        committedRef.current = true;
        onCancel();
      } else {
        doCommit();
      }
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      if (event.shiftKey) {
        doCommit();
        onTabPrev?.();
      } else {
        doCommit();
        onTabNext?.();
      }
      return;
    }
  }

  // Listen for toolbar format commands
  useEffect(() => {
    function handleCommand(event: Event) {
      const { command, value } = (
        event as CustomEvent<InlineTextCommandPayload>
      ).detail;
      const el = editableRef.current;
      if (
        !el ||
        (!el.contains(document.activeElement) && document.activeElement !== el)
      )
        return;
      el.focus();
      switch (command) {
        case "bold":
          document.execCommand("bold");
          break;
        case "italic":
          document.execCommand("italic");
          break;
        case "underline":
          document.execCommand("underline");
          break;
        case "strikethrough":
          document.execCommand("strikeThrough");
          break;
        case "align-left":
          document.execCommand("justifyLeft");
          break;
        case "align-center":
          document.execCommand("justifyCenter");
          break;
        case "align-right":
          document.execCommand("justifyRight");
          break;
        case "color":
          if (value) document.execCommand("foreColor", false, value);
          break;
        case "font-size":
          if (value) document.execCommand("fontSize", false, value);
          break;
      }
    }
    document.addEventListener(INLINE_TEXT_COMMAND_EVENT_V7, handleCommand);
    return () =>
      document.removeEventListener(INLINE_TEXT_COMMAND_EVENT_V7, handleCommand);
  }, []);

  return (
    <div
      ref={editableRef}
      contentEditable
      suppressContentEditableWarning
      data-inline-editor-vnext={nodeId}
      role="textbox"
      aria-label="Edit text"
      aria-multiline="true"
      style={style}
      onKeyDown={handleKeyDown}
      onBlur={doCommit}
    />
  );
}
