"use client";

/**
 * Slide Comment Panel and Pins (Epic #380 / Issue #420).
 *
 * Provides two exports:
 *
 *  - `SlideCommentPins` — renders clickable pin buttons on the slide canvas at
 *    the anchor geometry coordinates. Each pin represents one unresolved
 *    thread on the current slide. Element-anchored comments without geometry
 *    are rendered at the element's computed center (passed in via elementCenters).
 *
 *  - `SlideCommentPanel` — a side panel (or overlay) listing all comment
 *    threads anchored to the current slide. Shows resolved/unresolved state,
 *    supports adding a new slide-level comment, and provides a "resolve" toggle.
 *
 * Both components receive `threads: CommentThread[]` pre-filtered to the
 * current slide (filtered by `slideAnchor.slideId` before being passed in).
 * The parent is responsible for filtering.
 *
 * ## keyboard / focus
 * - Pin buttons are keyboard-focusable (`type="button"`).
 * - Escape closes the open thread panel.
 * - The comment input autofocuses when the panel is opened.
 *
 * ## Element attachment
 * When an element is moved the pin stays at `anchorGeometry` (percent
 * coordinates relative to the slide canvas). The pin follows geometry, not
 * DOM position, so element moves never break pin placement. If `anchorGeometry`
 * is null and an `elementCenters` map is provided, the pin is rendered at the
 * element's center as a fallback.
 */

import {
  Check,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  Send,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button, IconButton } from "@/components/ui";
import { cx, FIELD_CONTROL, RADIUS } from "@/components/ui/tokens";
import { GUTTER_BUTTON } from "@/components/ui/tokens";

import {
  createComment,
  setCommentResolved,
  type CommentThread,
} from "./comments-actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A percent-coordinate point for a pin. */
export type PinPosition = { x: number; y: number };

/** Caller-provided mapping from element ID → center in slide-percent coords. */
export type ElementCenterMap = ReadonlyMap<string, PinPosition>;

// ---------------------------------------------------------------------------
// Pin position helpers
// ---------------------------------------------------------------------------

/** Resolves the pin position for a thread. Returns null when unresolvable. */
function resolvePinPosition(
  thread: CommentThread,
  elementCenters?: ElementCenterMap,
): PinPosition | null {
  const anchor = thread.slideAnchor;
  if (!anchor) return null;

  // Prefer stored geometry.
  if (anchor.anchorGeometry) {
    return { x: anchor.anchorGeometry.x, y: anchor.anchorGeometry.y };
  }

  // Fall back to element center.
  if (anchor.elementId && elementCenters) {
    return elementCenters.get(anchor.elementId) ?? null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// SlideCommentPins
// ---------------------------------------------------------------------------

export interface SlideCommentPinsProps {
  /** Threads already filtered to the current slide (slideAnchor.slideId matches). */
  threads: CommentThread[];
  /** Width of the slide canvas container in pixels (used for percent → px). */
  canvasWidth: number;
  /** Height of the slide canvas container in pixels. */
  canvasHeight: number;
  /** Optional element center map for element-anchored comments without geometry. */
  elementCenters?: ElementCenterMap;
  /** Called when a pin is clicked, with the thread IDs grouped at that pin. */
  onPinClick: (threads: CommentThread[]) => void;
}

/**
 * Renders small comment-pin buttons overlaid on the slide canvas.
 * Positioned using `position: absolute` within a relative container.
 */
export function SlideCommentPins({
  threads,
  canvasWidth,
  canvasHeight,
  elementCenters,
  onPinClick,
}: SlideCommentPinsProps) {
  // Group threads by their resolved pin position (percent coords serialized).
  const pinGroups = new Map<string, CommentThread[]>();
  const pinPositions = new Map<string, PinPosition>();

  for (const thread of threads) {
    const pos = resolvePinPosition(thread, elementCenters);
    if (!pos) continue;
    const key = `${pos.x.toFixed(1)},${pos.y.toFixed(1)}`;
    const group = pinGroups.get(key) ?? [];
    group.push(thread);
    pinGroups.set(key, group);
    pinPositions.set(key, pos);
  }

  return (
    <>
      {Array.from(pinGroups.entries()).map(([key, group]) => {
        const pos = pinPositions.get(key)!;
        const unresolvedCount = group.filter((t) => !t.resolved).length;
        const left = (pos.x / 100) * canvasWidth;
        const top = (pos.y / 100) * canvasHeight;

        return (
          <button
            key={key}
            type="button"
            aria-label={`${unresolvedCount > 0 ? unresolvedCount : group.length} comment${group.length === 1 ? "" : "s"} at this location`}
            onClick={() => onPinClick(group)}
            className={cx(
              "absolute -translate-x-1/2 -translate-y-1/2",
              GUTTER_BUTTON,
              unresolvedCount === 0 ? "opacity-50" : "opacity-100",
            )}
            style={{ left, top }}
          >
            {unresolvedCount > 0 ? (
              <MessagesSquare aria-hidden="true" className="h-4 w-4" />
            ) : (
              <Check aria-hidden="true" className="h-4 w-4" />
            )}
            {unresolvedCount > 1 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-ds-warning px-1 text-[10px] font-semibold leading-none text-ds-surface-base ring-1 ring-ds-surface-base">
                {unresolvedCount > 9 ? "9+" : unresolvedCount}
              </span>
            )}
          </button>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// SlideCommentPanel
// ---------------------------------------------------------------------------

export interface SlideCommentPanelProps {
  documentId: string;
  slideId: string;
  /** All threads for the document; the panel filters to the current slide. */
  allThreads: CommentThread[];
  /** Whether to show resolved threads. Defaults to false. */
  showResolved?: boolean;
  /** Called when the thread list is updated (e.g. after create/resolve). */
  onThreadsChange: (threads: CommentThread[]) => void;
  onClose: () => void;
}

/**
 * A panel listing comment threads anchored to the current slide.
 * Provides an input to create a new slide-level comment and toggles to
 * resolve/unresolve existing threads.
 */
export function SlideCommentPanel({
  documentId,
  slideId,
  allThreads,
  showResolved = false,
  onThreadsChange,
  onClose,
}: SlideCommentPanelProps) {
  const slideThreads = allThreads.filter(
    (t) => t.slideAnchor?.slideId === slideId,
  );
  const visibleThreads = showResolved
    ? slideThreads
    : slideThreads.filter((t) => !t.resolved);

  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Autofocus on mount.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Escape key closes the panel.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onClose]);

  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      try {
        const next = await createComment(documentId, {
          body: trimmed,
          slideId,
        });
        onThreadsChange(next);
        setBody("");
      } catch {
        setError("Couldn't post your comment. Please try again.");
      }
    });
  };

  const toggleResolved = (threadId: string, resolved: boolean) => {
    startTransition(async () => {
      try {
        const next = await setCommentResolved(threadId, resolved);
        onThreadsChange(next);
      } catch {
        setError("Couldn't update comment. Please try again.");
      }
    });
  };

  return (
    <div
      className={cx(
        "flex w-[15rem] flex-col overflow-hidden border border-ds-border-subtle bg-ds-surface-overlay text-ds-text-primary",
        RADIUS.lg,
      )}
    >
      {/* Header */}
      <div className="shrink-0 border-b border-ds-border-subtle bg-ds-surface-raised/70 px-2 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-ds-border-subtle bg-ds-surface-overlay text-ds-text-muted">
              <MessagesSquare aria-hidden="true" className="h-3 w-3" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-ds-text-primary">
                Slide Comments
              </div>
              {visibleThreads.length > 0 && (
                <div className="text-[10px] font-medium leading-3 text-ds-text-muted">
                  {visibleThreads.length} thread
                  {visibleThreads.length === 1 ? "" : "s"}
                </div>
              )}
            </div>
          </div>
          <IconButton
            aria-label="Close slide comment panel"
            size="sm"
            onClick={onClose}
            className="shrink-0"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>

      {/* Thread list */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {visibleThreads.length > 0 ? (
          <ul className="mb-2 space-y-2">
            {visibleThreads.map((thread) => (
              <li
                key={thread.id}
                className="rounded-md border border-ds-border-subtle bg-ds-surface-raised px-2 py-2 text-xs"
              >
                <div className="flex items-start gap-2">
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
                  <button
                    type="button"
                    aria-label={
                      thread.resolved ? "Unresolve thread" : "Resolve thread"
                    }
                    title={thread.resolved ? "Unresolve" : "Resolve"}
                    onClick={() => toggleResolved(thread.id, !thread.resolved)}
                    className={cx(
                      "shrink-0 rounded p-0.5",
                      thread.resolved
                        ? "text-ds-success-text"
                        : "text-ds-text-muted hover:text-ds-text-secondary",
                    )}
                  >
                    <Check aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Replies */}
                {thread.replies.length > 0 && (
                  <ul className="mt-1.5 ml-7 space-y-1">
                    {thread.replies.map((reply) => (
                      <li key={reply.id} className="text-ds-text-secondary">
                        <span className="font-medium text-ds-text-primary">
                          {reply.author.name}
                        </span>{" "}
                        {reply.body}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex items-center gap-1.5 py-2 text-xs text-ds-text-muted">
            <MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />
            No comments on this slide yet.
          </div>
        )}

        {/* New comment input */}
        <div className="rounded-md bg-ds-surface-base p-1.5">
          <div className="mb-1 flex items-center gap-1.5 px-0.5 text-[11px] font-semibold text-ds-text-muted">
            <MessageCircle aria-hidden="true" className="h-3 w-3" />
            Add comment
          </div>
          <textarea
            ref={textareaRef}
            aria-label="New slide comment"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="Comment on this slide…"
            className={cx(
              "min-h-16 w-full resize-none px-2 py-1.5",
              FIELD_CONTROL,
            )}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
          />
        </div>

        {error && (
          <p role="alert" className="mt-2 text-xs text-ds-danger-text">
            {error}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="flex shrink-0 justify-end gap-1.5 border-t border-ds-border-subtle bg-ds-surface-raised/60 px-2 py-1.5">
        <Button size="sm" variant="plain" onClick={onClose}>
          Close
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
  );
}
