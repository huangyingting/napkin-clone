"use client";

import { useCallback, useEffect, useRef, type CSSProperties } from "react";

import type {
  Paragraph,
  SlideElement,
  TextElementStyle,
} from "@/lib/presentation/deck";
import { normalizeTextParagraphs } from "@/lib/presentation/deck";
import type { ElementPatch } from "@/lib/presentation/deck-mutations";
import {
  mergeRuns,
  runsToHtml,
  serializeRichText,
  shouldStoreRuns,
  splitRunsIntoLines,
} from "@/lib/presentation/rich-text-html";
import {
  AUTO_FIT_PADDING_PCT,
  clampBox,
} from "@/lib/presentation/stage-resize";
import {
  isAutoHeight,
  type TextLikeElement,
} from "@/lib/presentation/text-element-fit";
import { SLIDE_TEXT_FONT_SIZE } from "@/lib/presentation/text-defaults";
import { resolveElementFontCss } from "@/lib/presentation/slide-fonts";

export const INLINE_TEXT_COMMAND_EVENT = "textiq:inline-text-command";

export type InlineTextCommandPayload =
  | { command: "bold" | "italic" | "underline" }
  | { command: "color"; value: string }
  | { command: "fontSize"; value: number }
  | { command: "align"; value: "left" | "center" | "right" }
  | { command: "list"; value: "bullet" | "number" | undefined }
  | { command: "indent"; delta: -1 | 1 };

export type InlineTextCommandDetail = InlineTextCommandPayload & {
  elementId: string;
};

function defaultShapeTextStyle(): TextElementStyle {
  return {
    fontSize: SLIDE_TEXT_FONT_SIZE.text,
    bold: false,
    italic: false,
    align: "center" as const,
  };
}

// ---------------------------------------------------------------------------
// Inline text editor — a transparent `contentEditable` overlay that renders the
// element's rich-text runs in place, so entering edit mode is WYSIWYG (no style
// jump) and per-run bold / italic / color / link formatting is preserved on
// every keystroke instead of being flattened to plain text.
// ---------------------------------------------------------------------------

/**
 * Cross-browser caret range from a viewport point. Chrome / Safari expose
 * `caretRangeFromPoint`; Firefox uses the standard `caretPositionFromPoint`.
 * Returns `null` when neither is available or the point hits nothing.
 */
function caretRangeFromPoint(x: number, y: number): Range | null {
  if (typeof document.caretRangeFromPoint === "function") {
    return document.caretRangeFromPoint(x, y);
  }
  const docWithCaret = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
  };
  const pos = docWithCaret.caretPositionFromPoint?.(x, y);
  if (!pos) return null;
  const range = document.createRange();
  range.setStart(pos.offsetNode, pos.offset);
  range.collapse(true);
  return range;
}

export function InlineTextEditor({
  element,
  color,
  accent,
  stageHeight,
  caretClient,
  onChange,
  onCommit,
}: {
  element: Extract<SlideElement, { kind: "text" | "shape" }>;
  color: string;
  accent: string;
  stageHeight: number;
  caretClient: { x: number; y: number } | null;
  onChange: (patch: ElementPatch) => void;
  onCommit: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Snapshot the element kind once so the live keystroke handler never depends
  // on the (changing) element prop — the DOM is the source of truth while the
  // overlay is mounted and its innerHTML is set exactly once below.
  const kind = element.kind;
  const isListText =
    element.kind === "text" &&
    normalizeTextParagraphs(element).some(
      (paragraph) => paragraph.listType !== undefined,
    );
  // Snapshot the open-caret point once (mount only) so later renders never move
  // the caret while the user types.
  const caretRef = useRef(caretClient);

  // Per-item indent / listType metadata for bullets (#335).
  // Seeded from the element on mount, updated via Tab/Shift+Tab.
  const itemMetaRef = useRef<
    Array<{ indent: number; listType: "bullet" | "number" }>
  >([]);
  const dirtyRef = useRef(false);

  const currentLineIndex = useCallback(() => {
    const node = ref.current;
    const sel = window.getSelection();
    if (!node || !sel || sel.rangeCount === 0) return -1;
    let cursor: Node | null = sel.getRangeAt(0).startContainer;
    while (cursor && cursor.parentNode !== node) {
      cursor = cursor.parentNode;
    }
    if (!cursor) return -1;
    return Array.from(node.children).indexOf(cursor as Element);
  }, []);

  const applySelectionSpanStyle = useCallback(
    (style: Partial<CSSStyleDeclaration>) => {
      const node = ref.current;
      const selection = window.getSelection();
      if (!node || !selection || selection.rangeCount === 0) return false;
      const range = selection.getRangeAt(0);
      if (range.collapsed || !node.contains(range.commonAncestorContainer)) {
        return false;
      }
      const span = document.createElement("span");
      Object.assign(span.style, style);
      span.append(range.extractContents());
      range.insertNode(span);
      selection.removeAllRanges();
      const nextRange = document.createRange();
      nextRange.selectNodeContents(span);
      selection.addRange(nextRange);
      return true;
    },
    [],
  );

  const emitChange = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    // Auto-height mode: grow the box to fit the live content so a multi-line
    // edit expands the frame instead of clipping. Fixed-box and shrink-to-fit
    // keep the stored height; content is clipped or scaled by the renderer
    // (#333). Shapes never auto-grow (they have no fitMode).
    const autoH = kind !== "shape" && isAutoHeight(element as TextLikeElement);
    const box = autoH
      ? clampBox({
          ...element.box,
          h: Math.max(
            element.box.h,
            (node.scrollHeight / stageHeight) * 100 + AUTO_FIT_PADDING_PCT * 2,
          ),
        })
      : element.box;
    const { text, runs } = serializeRichText(node);
    if (kind === "text") {
      if (isListText) {
        const lines = splitRunsIntoLines(runs)
          .map((line) => ({
            text: line.text.replace(/\s+$/, ""),
            runs: mergeRuns(line.runs),
          }))
          .filter((line) => line.text.length > 0);
        const meta = itemMetaRef.current;
        const paragraphs: Paragraph[] = lines.map((line, i) => ({
          text: line.text,
          ...(shouldStoreRuns(line.runs) ? { runs: line.runs } : {}),
          indent: meta[i]?.indent ?? 0,
          listType: meta[i]?.listType ?? "bullet",
        }));
        onChange({
          text: lines.map((line) => line.text).join("\n"),
          runs: undefined,
          paragraphs,
          ...(autoH ? { box } : {}),
        });
        return;
      }
      onChange({
        text,
        runs: shouldStoreRuns(runs) ? runs : undefined,
        paragraphs: [
          {
            text,
            ...(shouldStoreRuns(runs) ? { runs } : {}),
          },
        ],
        ...(autoH ? { box } : {}),
      });
      return;
    }
    if (kind === "shape") {
      const trimmed = text.trim();
      onChange({
        text: trimmed.length > 0 ? text : undefined,
        textRuns:
          trimmed.length > 0 && shouldStoreRuns(runs) ? runs : undefined,
        textStyle: element.textStyle ?? defaultShapeTextStyle(),
      });
      return;
    }
  }, [kind, isListText, onChange, stageHeight, element]);

  const commit = useCallback(() => {
    if (dirtyRef.current) {
      emitChange();
    }
    onCommit();
  }, [emitChange, onCommit]);

  useEffect(() => {
    function onInlineTextCommand(event: Event) {
      const detail = (event as CustomEvent<InlineTextCommandDetail>).detail;
      if (!detail || detail.elementId !== element.id) return;
      const node = ref.current;
      if (!node) return;
      const selection = window.getSelection();
      if (
        !selection ||
        selection.rangeCount === 0 ||
        !selection.anchorNode ||
        !node.contains(selection.anchorNode)
      ) {
        node.focus();
      }

      if (detail.command === "bold") document.execCommand("bold");
      else if (detail.command === "italic") document.execCommand("italic");
      else if (detail.command === "underline") {
        document.execCommand("underline");
      } else if (detail.command === "color") {
        document.execCommand("foreColor", false, detail.value);
      } else if (detail.command === "fontSize") {
        applySelectionSpanStyle({ fontSize: `${detail.value}cqh` });
      } else if (detail.command === "align") {
        const command =
          detail.value === "center"
            ? "justifyCenter"
            : detail.value === "right"
              ? "justifyRight"
              : "justifyLeft";
        document.execCommand(command);
      } else if (isListText && detail.command === "list") {
        const lineIdx = currentLineIndex();
        if (lineIdx >= 0) {
          const meta = itemMetaRef.current;
          const current = meta[lineIdx] ?? { indent: 0, listType: "bullet" };
          meta[lineIdx] = {
            ...current,
            listType: detail.value ?? current.listType,
          };
        }
      } else if (isListText && detail.command === "indent") {
        const lineIdx = currentLineIndex();
        if (lineIdx >= 0) {
          const meta = itemMetaRef.current;
          const current = meta[lineIdx] ?? { indent: 0, listType: "bullet" };
          meta[lineIdx] = {
            ...current,
            indent: Math.max(0, Math.min(5, current.indent + detail.delta)),
          };
        }
      }
      dirtyRef.current = true;
      emitChange();
    }

    window.addEventListener(INLINE_TEXT_COMMAND_EVENT, onInlineTextCommand);
    return () =>
      window.removeEventListener(
        INLINE_TEXT_COMMAND_EVENT,
        onInlineTextCommand,
      );
  }, [
    applySelectionSpanStyle,
    currentLineIndex,
    element.id,
    emitChange,
    isListText,
  ]);

  // Seed the editable surface with the rendered runs, then place the caret: at
  // the click point for a single-click open, otherwise select all (double-click
  // / keyboard). Bullets are seeded as one `<div>` per line so each is a block
  // the marker CSS can attach to and so Enter creates a new bullet. Runs only on
  // mount; deck updates flow out (never back into the DOM) so the caret is never
  // disturbed mid-edit.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (kind === "text" && !isListText) {
      node.innerHTML = runsToHtml(element.runs, element.text);
    } else if (kind === "shape") {
      node.innerHTML = runsToHtml(element.textRuns, element.text ?? "");
    } else {
      // Seed indent metadata from authoritative items (#335).
      const seedItems =
        element.kind === "text" ? normalizeTextParagraphs(element) : [];
      itemMetaRef.current = seedItems.map((it) => ({
        indent: it.indent ?? 0,
        listType: it.listType ?? "bullet",
      }));
      node.innerHTML =
        seedItems.length > 0
          ? seedItems
              .map((item) => `<div>${runsToHtml(item.runs, item.text)}</div>`)
              .join("")
          : "<div><br></div>";
    }
    node.focus();
    const selection = window.getSelection();
    if (selection) {
      const caret = caretRef.current;
      const pointRange = caret ? caretRangeFromPoint(caret.x, caret.y) : null;
      if (pointRange && node.contains(pointRange.startContainer)) {
        pointRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(pointRange);
      } else {
        const range = document.createRange();
        range.selectNodeContents(node);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
    // Mount-only: intentionally not re-seeding on element changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style =
    kind === "shape"
      ? (element.textStyle ?? defaultShapeTextStyle())
      : element.style;
  const fontSizePx = (style.fontSize / 100) * stageHeight;

  // Mirror the static text element styles exactly
  // so entering edit mode is visually identical — no size / weight / line-height
  // jump. Vertical centering lives on the wrapper (below) to keep the editable
  // surface a plain block, which keeps caret / Enter behaviour predictable.
  const editableStyle = {
    width: "100%",
    color,
    fontSize: `${fontSizePx}px`,
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? "italic" : "normal",
    textAlign: style.align,
    lineHeight: isListText ? 1.2 : 1.15,
    wordBreak: "break-word",
    ...(style.underline ? { textDecoration: "underline" } : {}),
    ...(resolveElementFontCss(style.fontId)
      ? { fontFamily: resolveElementFontCss(style.fontId) }
      : {}),
  } as CSSProperties & Record<string, string>;
  if (isListText) {
    editableStyle["--ds-bullet-accent"] = accent;
  }

  return (
    <div
      className="absolute inset-0 flex flex-col justify-center overflow-hidden"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => {
        // A click in the padding around the text should still focus the editor
        // rather than do nothing.
        if (event.target === event.currentTarget) {
          event.preventDefault();
          ref.current?.focus();
        }
      }}
    >
      <div
        ref={ref}
        role="textbox"
        aria-label={
          isListText
            ? "Edit bullets"
            : kind === "shape"
              ? "Edit shape text"
              : "Edit text"
        }
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        className={`outline-none${isListText ? " ds-inline-bullets" : ""}`}
        style={editableStyle}
        onInput={() => {
          dirtyRef.current = true;
          emitChange();
        }}
        onBlur={commit}
        onPaste={(event) => {
          // Paste as plain text so external rich markup never leaks into the
          // runs; formatting stays under the editor's own controls.
          event.preventDefault();
          const text = event.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
          dirtyRef.current = true;
          emitChange();
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            commit();
            return;
          }
          // Tab / Shift+Tab in bullet editing: change indent of current item (#335).
          if (isListText && event.key === "Tab") {
            event.preventDefault();
            const lineIdx = currentLineIndex();
            if (lineIdx >= 0) {
              const meta = itemMetaRef.current;
              if (!meta[lineIdx]) {
                meta[lineIdx] = { indent: 0, listType: "bullet" };
              }
              const cur = meta[lineIdx].indent;
              meta[lineIdx] = {
                ...meta[lineIdx],
                indent: event.shiftKey
                  ? Math.max(0, cur - 1)
                  : Math.min(5, cur + 1),
              };
              dirtyRef.current = true;
              emitChange();
            }
            return;
          }
          // Inline bold / italic shortcuts; re-serialize so the runs persist.
          if ((event.metaKey || event.ctrlKey) && !event.altKey) {
            const key = event.key.toLowerCase();
            if (key === "b" || key === "i") {
              event.preventDefault();
              document.execCommand(key === "b" ? "bold" : "italic");
              dirtyRef.current = true;
              emitChange();
            }
          }
        }}
      />
    </div>
  );
}
