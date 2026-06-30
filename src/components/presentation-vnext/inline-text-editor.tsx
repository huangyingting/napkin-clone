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

import type { Paragraph, TextRun } from "@/lib/presentation-vnext/schema";
import {
  INLINE_TEXT_COMMAND_EVENT_V7,
  type InlineTextCommandPayload,
} from "@/lib/presentation-vnext/inline-text-commands";
import { STAGE_CHROME_Z_INDEX } from "@/lib/presentation-vnext/stage-chrome";
import {
  mergeRunsV7,
  shouldStoreRunsV7,
} from "@/lib/presentation-vnext/rich-text";

export interface InlineTextEditorVNextProps {
  /** Stable id of the node being edited. */
  nodeId: string;
  /** Initial paragraphs from `node.content.paragraphs`. */
  initialParagraphs: Paragraph[];
  /** Canvas-relative frame in percent units. */
  frame: { x: number; y: number; w: number; h: number };
  /** Canvas element bounding rect (reserved for future px-based font matching). */
  canvasRect?: DOMRect;
  /** Resolved canvas text CSS for the node being edited. */
  textStyle?: CSSProperties;
  /** When true, grow the editor and returned frame to fit edited text. */
  autoHeight?: boolean;
  /** Called when the user commits the edit (Escape, blur, or Tab). */
  onCommit: (
    nodeId: string,
    paragraphs: Paragraph[],
    nextFrame?: { x: number; y: number; w: number; h: number },
  ) => void;
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

type InlineRunStyle = Omit<TextRun, "text">;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function styleFromElement(
  element: HTMLElement,
  inherited: InlineRunStyle,
): InlineRunStyle {
  const tagName = element.tagName.toLowerCase();
  const next: InlineRunStyle = { ...inherited };
  if (tagName === "b" || tagName === "strong") next.bold = true;
  if (tagName === "i" || tagName === "em") next.italic = true;
  if (tagName === "u") next.underline = true;
  if (tagName === "s" || tagName === "strike" || tagName === "del") {
    next.strikethrough = true;
  }
  if (tagName === "a") next.link = element.getAttribute("href") ?? undefined;

  const fontWeight = element.style.fontWeight;
  if (fontWeight === "bold" || Number(fontWeight) >= 600) next.bold = true;
  if (element.style.fontStyle === "italic") next.italic = true;
  if (element.style.textDecorationLine.includes("underline")) {
    next.underline = true;
  }
  if (element.style.textDecorationLine.includes("line-through")) {
    next.strikethrough = true;
  }

  const color = element.style.color || element.getAttribute("color");
  const fontSize = element.style.fontSize;
  if (color || fontSize) {
    next.localStyle = { ...next.localStyle };
    if (color) next.localStyle.color = color;
    if (fontSize.endsWith("pt")) {
      next.localStyle.fontSizePt = Number.parseFloat(fontSize);
    } else if (fontSize.endsWith("px")) {
      next.localStyle.fontSizePt = Number.parseFloat(fontSize) * 0.75;
    }
  }
  return next;
}

function collectRuns(node: Node, inherited: InlineRunStyle = {}): TextRun[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    return text.length > 0 ? [{ text, ...inherited }] : [];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [];
  const element = node as HTMLElement;
  if (element.tagName.toLowerCase() === "br") return [{ text: "\n" }];
  const style = styleFromElement(element, inherited);
  return Array.from(element.childNodes).flatMap((child) =>
    collectRuns(child, style),
  );
}

function serializeParagraphNode(
  node: Node,
  fallbackId: string,
  listKind?: "bullet" | "number",
  listIndent?: number,
): Paragraph {
  const runs = mergeRunsV7(collectRuns(node)).filter(
    (run) => run.text !== "\n",
  );
  const text = runs.map((run) => run.text).join("");
  return {
    id: fallbackId,
    text,
    ...(shouldStoreRunsV7(runs) ? { runs } : {}),
    ...(listKind
      ? {
          list: {
            kind: listKind,
            ...(listIndent && listIndent > 0 ? { indent: listIndent } : {}),
          },
        }
      : {}),
  };
}

function editableParagraphNodes(
  container: HTMLElement,
): { node: Node; listKind?: "bullet" | "number"; listIndent?: number }[] {
  const nodes: {
    node: Node;
    listKind?: "bullet" | "number";
    listIndent?: number;
  }[] = [];
  for (const child of Array.from(container.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      if ((child.textContent ?? "").length > 0) nodes.push({ node: child });
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const element = child as HTMLElement;
    const tagName = element.tagName.toLowerCase();
    if (tagName === "ul" || tagName === "ol") {
      const listKind = tagName === "ol" ? "number" : "bullet";
      for (const item of Array.from(element.children)) {
        if (item.tagName.toLowerCase() === "li") {
          nodes.push({
            node: item,
            listKind,
            listIndent: listIndentFromElement(item as HTMLElement),
          });
        }
      }
    } else if (tagName === "li") {
      const listKind =
        element.parentElement?.tagName.toLowerCase() === "ol"
          ? "number"
          : "bullet";
      nodes.push({
        node: element,
        listKind,
        listIndent: listIndentFromElement(element),
      });
    } else if (
      element.dataset.listKind === "bullet" ||
      element.dataset.listKind === "number"
    ) {
      nodes.push({
        node: element,
        listKind: element.dataset.listKind,
        listIndent: listIndentFromElement(element),
      });
    } else {
      nodes.push({ node: element });
    }
  }
  return nodes;
}

function listIndentFromElement(element: HTMLElement): number | undefined {
  const raw = element.dataset.listIndent;
  const indent = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(indent) && indent > 0 ? indent : undefined;
}

/** Convert the contenteditable DOM back to Paragraph[] preserving basic runs. */
function domToParagraphs(
  container: HTMLElement,
  idPrefix: string,
  initialParagraphs: Paragraph[],
): Paragraph[] {
  const paragraphNodes = editableParagraphNodes(container);
  const nodes =
    paragraphNodes.length > 0
      ? paragraphNodes
      : [{ node: document.createTextNode("") }];
  return nodes.map(({ node, listKind, listIndent }, index) =>
    serializeParagraphNode(
      node,
      initialParagraphs[index]?.id ?? `${idPrefix}-p-${index + 1}`,
      listKind,
      listIndent,
    ),
  );
}

function runToHtml(run: TextRun): string {
  const styles: string[] = [];
  if (run.bold) styles.push("font-weight:700");
  if (run.italic) styles.push("font-style:italic");
  if (run.underline || run.strikethrough) {
    styles.push(
      `text-decoration:${[
        run.underline ? "underline" : undefined,
        run.strikethrough ? "line-through" : undefined,
      ]
        .filter(Boolean)
        .join(" ")}`,
    );
  }
  if (typeof run.localStyle?.color === "string") {
    styles.push(`color:${run.localStyle.color}`);
  }
  if (typeof run.localStyle?.fontSizePt === "number") {
    styles.push(`font-size:${run.localStyle.fontSizePt}pt`);
  }
  const styleAttr = styles.length > 0 ? ` style="${styles.join(";")}"` : "";
  return `<span${styleAttr}>${escapeHtml(run.text)}</span>`;
}

/** Render initial paragraphs as HTML for the contenteditable. */
function paragraphsToHtml(paragraphs: Paragraph[]): string {
  return paragraphs
    .map((p) => {
      const text = p.runs?.length
        ? p.runs.map(runToHtml).join("")
        : escapeHtml(p.text);
      if (!p.list) return `<div>${text || "<br>"}</div>`;
      const indent = p.list.indent ?? 0;
      const indentAttr = indent > 0 ? ` data-list-indent="${indent}"` : "";
      const indentStyle =
        indent > 0 ? ` style="padding-left:${indent * 1.5}em"` : "";
      return `<div data-list-kind="${p.list.kind}"${indentAttr}${indentStyle}>${text || "<br>"}</div>`;
    })
    .join("");
}

function rangeInside(container: HTMLElement): Range | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const start = range.startContainer;
  const end = range.endContainer;
  if (!container.contains(start) || !container.contains(end)) return null;
  return range;
}

function restoreSelection(node: Node): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
}

function wrapRange(
  container: HTMLElement,
  configure: (element: HTMLElement) => void,
  tagName = "span",
): void {
  const range = rangeInside(container);
  if (!range || range.collapsed) return;
  const wrapper = document.createElement(tagName);
  configure(wrapper);
  const fragment = range.extractContents();
  wrapper.appendChild(fragment);
  range.insertNode(wrapper);
  restoreSelection(wrapper);
}

function unwrapElement(element: HTMLElement) {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }
  parent.removeChild(element);
}

function unlinkRange(container: HTMLElement) {
  const range = rangeInside(container);
  if (!range) return;
  const anchors = new Set<HTMLAnchorElement>();
  const addClosestAnchor = (node: Node | null) => {
    const element =
      node instanceof Element ? node : (node?.parentElement ?? null);
    const anchor = element?.closest("a");
    if (anchor instanceof HTMLAnchorElement && container.contains(anchor)) {
      anchors.add(anchor);
    }
  };
  const selection = window.getSelection();
  addClosestAnchor(selection?.anchorNode ?? null);
  addClosestAnchor(selection?.focusNode ?? null);
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      if (!(node instanceof HTMLAnchorElement)) return NodeFilter.FILTER_SKIP;
      return range.intersectsNode(node)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP;
    },
  });
  let current = walker.nextNode();
  while (current) {
    if (current instanceof HTMLAnchorElement) anchors.add(current);
    current = walker.nextNode();
  }
  anchors.forEach(unwrapElement);
}

function blockForRange(container: HTMLElement, range: Range): HTMLElement {
  const node =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as HTMLElement)
      : range.startContainer.parentElement;
  return node?.closest("p,div,li") ?? container;
}

function applyBlockAlign(
  container: HTMLElement,
  align: "left" | "center" | "right",
) {
  const range = rangeInside(container);
  if (!range) return;
  blockForRange(container, range).style.textAlign = align;
}

function toggleList(container: HTMLElement, kind: "bullet" | "number") {
  const range = rangeInside(container);
  if (!range) return;
  const block = blockForRange(container, range);
  const currentList = block.closest("ul,ol");
  const targetTag = kind === "number" ? "ol" : "ul";
  if (currentList) {
    if (currentList.tagName.toLowerCase() === targetTag) {
      const replacement = document.createDocumentFragment();
      for (const item of Array.from(currentList.children)) {
        const div = document.createElement("div");
        div.innerHTML = item.innerHTML || "<br>";
        replacement.appendChild(div);
      }
      currentList.replaceWith(replacement);
    } else {
      const nextList = document.createElement(targetTag);
      nextList.innerHTML = currentList.innerHTML;
      currentList.replaceWith(nextList);
      restoreSelection(nextList);
    }
    return;
  }
  const list = document.createElement(targetTag);
  const item = document.createElement("li");
  item.innerHTML = block.innerHTML || "<br>";
  list.appendChild(item);
  block.replaceWith(list);
  restoreSelection(item);
}

function adjustListIndent(container: HTMLElement, direction: 1 | -1) {
  const range = rangeInside(container);
  if (!range) return;
  const block = blockForRange(container, range);
  const listItem = block.closest("li") as HTMLElement | null;
  const editableBlock = listItem ?? block;
  const listKind =
    editableBlock.dataset.listKind ??
    (listItem
      ? listItem.parentElement?.tagName.toLowerCase() === "ol"
        ? "number"
        : "bullet"
      : undefined);
  if (listKind !== "bullet" && listKind !== "number") return;
  const current = listIndentFromElement(editableBlock) ?? 0;
  const next = Math.max(0, Math.min(6, current + direction));
  if (next > 0) {
    editableBlock.dataset.listIndent = String(next);
    editableBlock.style.paddingLeft = `${next * 1.5}em`;
  } else {
    delete editableBlock.dataset.listIndent;
    editableBlock.style.paddingLeft = "";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InlineTextEditorVNext({
  nodeId,
  initialParagraphs,
  frame,
  canvasRect,
  textStyle,
  autoHeight = false,
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
    zIndex: STAGE_CHROME_Z_INDEX.inlineEditor,
    boxSizing: "border-box",
    padding: "inherit",
    // Match canvas font as best possible via inheritance
    font: "inherit",
    lineHeight: "inherit",
    color: "inherit",
    ...textStyle,
    wordBreak: "break-word",
    overflowWrap: "break-word",
  };

  function autoHeightFrame():
    | { x: number; y: number; w: number; h: number }
    | undefined {
    const el = editableRef.current;
    if (!autoHeight || !el || !canvasRect || canvasRect.height <= 0) {
      return undefined;
    }
    const heightPct = Math.min(
      100 - frame.y,
      Math.max(frame.h, (el.scrollHeight / canvasRect.height) * 100),
    );
    if (Math.abs(heightPct - frame.h) < 0.1) return undefined;
    return { ...frame, h: heightPct };
  }

  function syncAutoHeight() {
    const nextFrame = autoHeightFrame();
    if (nextFrame && editableRef.current) {
      editableRef.current.style.height = `${nextFrame.h}%`;
    }
  }

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
    const paragraphs = domToParagraphs(el, nodeId, initialParagraphs);
    onCommit(nodeId, paragraphs, autoHeightFrame());
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
          wrapRange(el, (span) => {
            span.style.fontWeight = "700";
          });
          break;
        case "italic":
          wrapRange(el, (span) => {
            span.style.fontStyle = "italic";
          });
          break;
        case "underline":
          wrapRange(el, (span) => {
            span.style.textDecoration = "underline";
          });
          break;
        case "strikethrough":
          wrapRange(el, (span) => {
            span.style.textDecoration = "line-through";
          });
          break;
        case "bullet-list":
          toggleList(el, "bullet");
          break;
        case "numbered-list":
          toggleList(el, "number");
          break;
        case "indent-list":
          adjustListIndent(el, 1);
          break;
        case "outdent-list":
          adjustListIndent(el, -1);
          break;
        case "link":
          if (value) {
            wrapRange(
              el,
              (anchor) => {
                anchor.setAttribute("href", value);
              },
              "a",
            );
          }
          break;
        case "unlink":
          unlinkRange(el);
          break;
        case "align-left":
          applyBlockAlign(el, "left");
          break;
        case "align-center":
          applyBlockAlign(el, "center");
          break;
        case "align-right":
          applyBlockAlign(el, "right");
          break;
        case "color":
          if (value) {
            wrapRange(el, (span) => {
              span.style.color = value;
            });
          }
          break;
        case "font-size":
          if (value) {
            wrapRange(el, (span) => {
              span.style.fontSize = value;
            });
          }
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
      onInput={syncAutoHeight}
      onKeyDown={handleKeyDown}
      onBlur={doCommit}
    />
  );
}
