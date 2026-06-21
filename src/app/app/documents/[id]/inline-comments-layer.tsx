"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { MessageSquare, Send, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";

import { createComment, type CommentThread } from "./comments-actions";
import {
  DOCUMENT_GUTTER_BUTTON_SIZE,
  DOCUMENT_GUTTER_GAP,
  rightGutterButtonLeft,
  rightGutterDotLeft,
  rightGutterPanelLeft,
} from "./document-gutter";

const MAX_ANCHOR_TEXT_LENGTH = 280;
const COMMENT_CARD_WIDTH = 288;

type AnchorPosition = {
  text: string;
  top: number;
  iconLeft: number;
  dotLeft: number;
  cardLeft: number;
};

function normalizeAnchorText(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_ANCHOR_TEXT_LENGTH);
}

function isTextBlock(element: HTMLElement): boolean {
  if (element.closest("[data-visual-chrome],[data-lexical-visual-id]")) {
    return false;
  }
  return normalizeAnchorText(element.textContent ?? "").length > 0;
}

function blockAtY(root: HTMLElement, clientY: number): HTMLElement | null {
  const blocks = Array.from(root.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
  let nearest: { block: HTMLElement; distance: number } | null = null;
  for (const block of blocks) {
    const rect = block.getBoundingClientRect();
    if (clientY >= rect.top && clientY <= rect.bottom) {
      return isTextBlock(block) ? block : null;
    }
    if (!isTextBlock(block)) {
      continue;
    }
    const distance = Math.min(
      Math.abs(clientY - rect.top),
      Math.abs(clientY - rect.bottom),
    );
    if (!nearest || distance < nearest.distance) {
      nearest = { block, distance };
    }
  }
  return nearest && nearest.distance <= 32 ? nearest.block : null;
}

function isInRightCommentGutter(root: HTMLElement, clientX: number): boolean {
  const rootRect = root.getBoundingClientRect();
  const buttonLeft = rightGutterButtonLeft(rootRect);
  if (buttonLeft === null || buttonLeft < rootRect.right) {
    return false;
  }
  return (
    clientX >= rootRect.right &&
    clientX <= buttonLeft + DOCUMENT_GUTTER_BUTTON_SIZE + DOCUMENT_GUTTER_GAP
  );
}

function positionForBlock(
  block: HTMLElement,
  root: HTMLElement,
): AnchorPosition | null {
  const text = normalizeAnchorText(block.textContent ?? "");
  if (!text) return null;
  const blockRect = block.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  const iconLeft = rightGutterButtonLeft(rootRect);
  const dotLeft = rightGutterDotLeft(rootRect);
  if (iconLeft === null || dotLeft === null) {
    return null;
  }
  return {
    text,
    top: blockRect.top + blockRect.height / 2,
    iconLeft,
    dotLeft,
    cardLeft: rightGutterPanelLeft(rootRect, COMMENT_CARD_WIDTH),
  };
}

function threadsByTextAnchor(
  threads: CommentThread[],
): Map<string, CommentThread[]> {
  const map = new Map<string, CommentThread[]>();
  for (const thread of threads) {
    if (thread.anchorType !== "text" || !thread.anchorText) {
      continue;
    }
    const key = normalizeAnchorText(thread.anchorText);
    const current = map.get(key) ?? [];
    current.push(thread);
    map.set(key, current);
  }
  return map;
}

export function InlineCommentsLayer({
  documentId,
  initialComments,
}: {
  documentId: string;
  initialComments: CommentThread[];
}) {
  const [editor] = useLexicalComposerContext();
  const [threads, setThreads] = useState(initialComments);
  const [hoverAnchor, setHoverAnchor] = useState<AnchorPosition | null>(null);
  const [activeAnchor, setActiveAnchor] = useState<AnchorPosition | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const byAnchor = useMemo(() => threadsByTextAnchor(threads), [threads]);

  const computeCommentDots = useCallback(() => {
    const root = editor.getRootElement();
    if (!root) {
      return [] as Array<AnchorPosition & { count: number }>;
    }
    const seen = new Set<string>();
    const dots: Array<AnchorPosition & { count: number }> = [];
    for (const child of Array.from(root.children)) {
      if (!(child instanceof HTMLElement) || !isTextBlock(child)) {
        continue;
      }
      const position = positionForBlock(child, root);
      if (!position || seen.has(position.text)) {
        continue;
      }
      const count = (byAnchor.get(position.text) ?? []).filter(
        (thread) => !thread.resolved,
      ).length;
      if (count > 0) {
        seen.add(position.text);
        dots.push({ ...position, count });
      }
    }
    return dots;
  }, [byAnchor, editor]);

  const [commentDots, setCommentDots] = useState<
    Array<AnchorPosition & { count: number }>
  >([]);

  const refreshPositions = useCallback(() => {
    setCommentDots(computeCommentDots());
  }, [computeCommentDots]);

  useEffect(() => {
    const frame = requestAnimationFrame(refreshPositions);
    return () => cancelAnimationFrame(frame);
  }, [refreshPositions, threads]);

  useEffect(() => {
    let cleanupRoot: (() => void) | null = null;

    const onScrollOrResize = () => {
      setHoverAnchor(null);
      setActiveAnchor(null);
      setBody("");
      setError(null);
      refreshPositions();
    };

    const detachRoot = () => {
      cleanupRoot?.();
      cleanupRoot = null;
    };

    const unregisterRoot = editor.registerRootListener((root, prevRoot) => {
      if (prevRoot !== null) {
        detachRoot();
      }
      if (root === null) {
        return;
      }

      const onMouseMove = (event: MouseEvent) => {
        if (activeAnchor) return;
        if (!isInRightCommentGutter(root, event.clientX)) {
          setHoverAnchor(null);
          return;
        }
        const block = blockAtY(root, event.clientY);
        setHoverAnchor(block ? positionForBlock(block, root) : null);
      };
      window.addEventListener("mousemove", onMouseMove);
      const frame = requestAnimationFrame(refreshPositions);
      cleanupRoot = () => {
        cancelAnimationFrame(frame);
        window.removeEventListener("mousemove", onMouseMove);
      };
    });

    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      unregisterRoot();
      detachRoot();
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [activeAnchor, editor, refreshPositions]);

  const submit = useCallback(() => {
    const anchor = activeAnchor;
    const trimmed = body.trim();
    if (!anchor || !trimmed) return;
    setError(null);
    startTransition(async () => {
      try {
        const next = await createComment(documentId, {
          body: trimmed,
          anchorType: "text",
          anchorText: anchor.text,
        });
        setThreads(next);
        setBody("");
        setActiveAnchor(null);
        setHoverAnchor(null);
      } catch {
        setError("Couldn't post your comment. Please try again.");
      }
    });
  }, [activeAnchor, body, documentId]);

  const activeThreads = activeAnchor
    ? (byAnchor.get(activeAnchor.text) ?? [])
    : [];
  const iconAnchor = activeAnchor ?? hoverAnchor;

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-raised">
      {commentDots.map((dot) => (
        <button
          key={dot.text}
          type="button"
          aria-label={`${dot.count} comment${dot.count === 1 ? "" : "s"}`}
          onClick={() => setActiveAnchor(dot)}
          className="pointer-events-auto absolute flex h-3 w-3 -translate-y-1/2 items-center justify-center rounded-full bg-ds-warning shadow-sm ring-2 ring-ds-surface-raised"
          style={{ top: dot.top, left: dot.dotLeft }}
        >
          <span className="sr-only">Open comments</span>
        </button>
      ))}

      {iconAnchor ? (
        <button
          type="button"
          aria-label="Add comment to this paragraph"
          onClick={() => setActiveAnchor(iconAnchor)}
          className="pointer-events-auto absolute flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-ds-border-subtle bg-ds-surface-overlay text-ds-text-muted shadow-sm transition hover:text-ds-text-primary"
          style={{
            top: iconAnchor.top,
            left: iconAnchor.iconLeft,
          }}
        >
          <MessageSquare aria-hidden="true" className="h-5 w-5" />
        </button>
      ) : null}

      {activeAnchor ? (
        <div
          className="pointer-events-auto absolute w-72 -translate-y-2 rounded-xl border border-ds-border-subtle bg-ds-surface-overlay p-3 shadow-ds-popover"
          style={{
            top: activeAnchor.top,
            left: activeAnchor.cardLeft,
          }}
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="line-clamp-2 text-xs font-medium text-ds-text-secondary">
              {activeAnchor.text}
            </p>
            <button
              type="button"
              aria-label="Close inline comment"
              onClick={() => {
                setActiveAnchor(null);
                setBody("");
                setError(null);
              }}
              className="shrink-0 rounded-md p-1 text-ds-text-muted transition hover:bg-ds-state-hover hover:text-ds-text-primary"
            >
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>

          {activeThreads.length > 0 ? (
            <ul className="mb-2 max-h-32 space-y-1.5 overflow-y-auto border-l-2 border-ds-warning pl-2">
              {activeThreads.map((thread) => (
                <li key={thread.id} className="text-xs">
                  <span className="font-medium text-ds-text-primary">
                    {thread.author.name}
                  </span>
                  <p className="whitespace-pre-wrap text-ds-text-secondary">
                    {thread.body}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}

          <textarea
            aria-label="Inline comment"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={3}
            placeholder="Add a few words here"
            className="w-full resize-none rounded-md border border-ds-border-subtle bg-ds-surface-raised px-2 py-1.5 text-sm text-ds-text-primary outline-none placeholder:text-ds-text-muted focus:border-ds-border-strong"
            autoFocus
          />
          {error ? (
            <p role="alert" className="mt-1 text-xs text-ds-danger-text">
              {error}
            </p>
          ) : null}
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveAnchor(null);
                setBody("");
                setError(null);
              }}
              className="rounded-full border border-ds-border-subtle px-3 py-1 text-xs font-medium text-ds-text-muted transition hover:bg-ds-state-hover hover:text-ds-text-primary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={isPending || body.trim().length === 0}
              className="inline-flex items-center gap-1 rounded-full bg-ds-control px-3 py-1 text-xs font-medium text-ds-control-text transition hover:bg-ds-control-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send aria-hidden="true" className="h-3 w-3" />
              Comment
            </button>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
