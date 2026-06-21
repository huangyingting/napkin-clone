"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  Send,
  UserRound,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { createPortal } from "react-dom";

import { GUTTER_BUTTON } from "@/components/motion/control-styles";
import { Button, IconButton } from "@/components/ui";
import { cx, FIELD_CONTROL, RADIUS } from "@/components/ui/tokens";

import { createComment, type CommentThread } from "./comments-actions";
import {
  DOCUMENT_GUTTER_BUTTON_SIZE,
  DOCUMENT_GUTTER_GAP,
  rightGutterButtonLeft,
} from "./document-gutter";

const MAX_ANCHOR_TEXT_LENGTH = 280;
const COMMENT_CARD_WIDTH = 240;
const COMMENT_CARD_VIEWPORT_BLOCK_GAP = 10;
const COMMENT_CARD_VIEWPORT_INLINE_GAP = 36;

type AnchorPosition = {
  text: string;
  top: number;
  iconLeft: number;
  markerLeft: number;
};

type CommentCardPosition = {
  anchorText: string;
  top: number;
  left: number;
  maxHeight: number;
};

function subscribeToHydrationStore(): () => void {
  return () => {};
}

function getClientSnapshot(): boolean {
  return true;
}

function getServerSnapshot(): boolean {
  return false;
}

function normalizeAnchorText(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_ANCHOR_TEXT_LENGTH);
}

function isVisualBlock(element: HTMLElement): boolean {
  return (
    element.closest("[data-visual-chrome],[data-lexical-visual-id]") !== null ||
    element.querySelector("[data-visual-chrome],[data-lexical-visual-id]") !==
      null
  );
}

function isTextBlock(element: HTMLElement): boolean {
  if (isVisualBlock(element)) {
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
  if (iconLeft === null) {
    return null;
  }
  return {
    text,
    top: blockRect.top + blockRect.height / 2,
    iconLeft,
    markerLeft: iconLeft,
  };
}

function preferredRightSideCardLeft(anchor: AnchorPosition): number {
  return anchor.iconLeft + DOCUMENT_GUTTER_BUTTON_SIZE + DOCUMENT_GUTTER_GAP;
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
  const canUsePortal = useSyncExternalStore(
    subscribeToHydrationStore,
    getClientSnapshot,
    getServerSnapshot,
  );
  const [threads, setThreads] = useState(initialComments);
  const [hoverAnchor, setHoverAnchor] = useState<AnchorPosition | null>(null);
  const [activeAnchor, setActiveAnchor] = useState<AnchorPosition | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cardPosition, setCardPosition] = useState<CommentCardPosition | null>(
    null,
  );
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [isPending, startTransition] = useTransition();

  const byAnchor = useMemo(() => threadsByTextAnchor(threads), [threads]);

  const closeDialog = useCallback(() => {
    setActiveAnchor(null);
    setBody("");
    setError(null);
  }, []);

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

    const onScrollOrResize = (event: Event) => {
      const card = cardRef.current;
      if (
        event.type === "scroll" &&
        card !== null &&
        event.target instanceof Node &&
        card.contains(event.target)
      ) {
        return;
      }
      setHoverAnchor(null);
      closeDialog();
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
  }, [activeAnchor, closeDialog, editor, refreshPositions]);

  useEffect(() => {
    if (!activeAnchor) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      closeDialog();
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [activeAnchor, closeDialog]);

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
  const visibleHoverAnchor =
    hoverAnchor &&
    (byAnchor.get(hoverAnchor.text) ?? []).some((thread) => !thread.resolved)
      ? null
      : hoverAnchor;
  const iconAnchor = activeAnchor ?? visibleHoverAnchor;

  useLayoutEffect(() => {
    if (!activeAnchor) {
      return;
    }

    const card = cardRef.current;
    const maxHeight = Math.max(
      180,
      window.innerHeight - COMMENT_CARD_VIEWPORT_BLOCK_GAP * 2,
    );

    const updateCardPosition = () => {
      const maxWidth = Math.max(
        180,
        window.innerWidth - COMMENT_CARD_VIEWPORT_INLINE_GAP * 2,
      );
      const measuredWidth = Math.min(card?.offsetWidth ?? 0, maxWidth);
      const cardWidth = measuredWidth > 0 ? measuredWidth : COMMENT_CARD_WIDTH;
      const measuredHeight = Math.min(card?.offsetHeight ?? 0, maxHeight);
      const cardHeight = measuredHeight > 0 ? measuredHeight : 240;
      const preferredTop = activeAnchor.top - COMMENT_CARD_VIEWPORT_BLOCK_GAP;
      const preferredLeft = preferredRightSideCardLeft(activeAnchor);
      const maxLeft = Math.max(
        COMMENT_CARD_VIEWPORT_INLINE_GAP,
        window.innerWidth - cardWidth - COMMENT_CARD_VIEWPORT_INLINE_GAP,
      );
      const nextLeft = Math.min(
        Math.max(preferredLeft, COMMENT_CARD_VIEWPORT_INLINE_GAP),
        maxLeft,
      );
      const maxTop = Math.max(
        COMMENT_CARD_VIEWPORT_BLOCK_GAP,
        window.innerHeight - cardHeight - COMMENT_CARD_VIEWPORT_BLOCK_GAP,
      );
      const nextTop = Math.min(
        Math.max(preferredTop, COMMENT_CARD_VIEWPORT_BLOCK_GAP),
        maxTop,
      );

      setCardPosition((current) =>
        current?.anchorText === activeAnchor.text &&
        Math.abs(current.top - nextTop) < 0.5 &&
        Math.abs(current.left - nextLeft) < 0.5 &&
        current.maxHeight === maxHeight
          ? current
          : {
              anchorText: activeAnchor.text,
              top: nextTop,
              left: nextLeft,
              maxHeight,
            },
      );
    };

    updateCardPosition();

    if (!card) {
      return;
    }

    const observer = new ResizeObserver(updateCardPosition);
    observer.observe(card);
    return () => observer.disconnect();
  }, [activeAnchor, activeThreads.length, body, error]);

  const measuredCardPosition =
    cardPosition?.anchorText === activeAnchor?.text ? cardPosition : null;

  if (!canUsePortal) {
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
          className={cx(
            "pointer-events-auto absolute -translate-y-1/2",
            GUTTER_BUTTON,
          )}
          style={{ top: dot.top, left: dot.markerLeft }}
        >
          <MessagesSquare aria-hidden="true" className="h-5 w-5" />
          {dot.count > 1 ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-ds-warning px-1 text-[10px] font-semibold leading-none text-ds-surface-base ring-1 ring-ds-surface-base">
              {dot.count > 9 ? "9+" : dot.count}
            </span>
          ) : null}
          <span className="sr-only">Open comments</span>
        </button>
      ))}

      {iconAnchor ? (
        <button
          type="button"
          aria-label="Add comment to this paragraph"
          onClick={() => setActiveAnchor(iconAnchor)}
          className={cx(
            "pointer-events-auto absolute -translate-y-1/2",
            GUTTER_BUTTON,
          )}
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
          ref={cardRef}
          className={cx(
            "pointer-events-auto absolute flex w-[15rem] max-w-[calc(100vw-4.5rem)] flex-col overflow-hidden border border-ds-border-subtle bg-ds-surface-overlay text-ds-text-primary",
            RADIUS.lg,
          )}
          style={{
            top:
              measuredCardPosition?.top ??
              activeAnchor.top - COMMENT_CARD_VIEWPORT_BLOCK_GAP,
            left:
              measuredCardPosition?.left ??
              preferredRightSideCardLeft(activeAnchor),
            maxHeight: measuredCardPosition
              ? `${measuredCardPosition.maxHeight}px`
              : `calc(100vh - ${COMMENT_CARD_VIEWPORT_BLOCK_GAP * 2}px)`,
          }}
        >
          <div className="shrink-0 border-b border-ds-border-subtle bg-ds-surface-raised/70 px-2 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-ds-border-subtle bg-ds-surface-overlay text-ds-text-muted">
                  <MessagesSquare aria-hidden="true" className="h-3 w-3" />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-ds-text-primary">
                    Comment
                  </div>
                  {activeThreads.length > 0 ? (
                    <div className="text-[10px] font-medium leading-3 text-ds-text-muted">
                      {activeThreads.length} open
                    </div>
                  ) : null}
                </div>
              </div>
              <IconButton
                aria-label="Close inline comment"
                size="sm"
                onClick={closeDialog}
                className="shrink-0"
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden px-2 py-2">
            {activeThreads.length > 0 ? (
              <ul className="mb-2 max-h-40 space-y-1.5 overflow-y-auto pr-1">
                {activeThreads.map((thread) => (
                  <li
                    key={thread.id}
                    className="flex gap-2 rounded-md bg-ds-surface-raised px-2 py-1.5 text-xs"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ds-surface-overlay text-ds-text-muted ring-1 ring-ds-border-subtle">
                      <UserRound aria-hidden="true" className="h-3 w-3" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-ds-text-primary">
                        {thread.author.name}
                      </span>
                      <p className="mt-0.5 whitespace-pre-wrap leading-5 text-ds-text-secondary">
                        {thread.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="rounded-md bg-ds-surface-base p-1.5">
              <div className="mb-1 flex items-center gap-1.5 px-0.5 text-[11px] font-semibold text-ds-text-muted">
                <MessageCircle aria-hidden="true" className="h-3 w-3" />
                Reply
              </div>
              <textarea
                aria-label="Inline comment"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={2}
                placeholder="Add a few words here"
                className={cx(
                  "min-h-16 w-full resize-none px-2 py-1.5",
                  FIELD_CONTROL,
                )}
                autoFocus
              />
            </div>
            {error ? (
              <p role="alert" className="mt-2 text-xs text-ds-danger-text">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 justify-end gap-1.5 border-t border-ds-border-subtle bg-ds-surface-raised/60 px-2 py-1.5">
            <Button size="sm" variant="plain" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="solid"
              leadingIcon={<Send aria-hidden="true" className="h-3.5 w-3.5" />}
              onClick={submit}
              disabled={isPending || body.trim().length === 0}
            >
              Comment
            </Button>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
