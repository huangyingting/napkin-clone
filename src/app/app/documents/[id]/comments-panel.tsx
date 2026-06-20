"use client";

import { useCallback, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import {
  createComment,
  listComments,
  setCommentResolved,
  type CommentAnchorType,
  type CommentNode,
  type CommentThread,
} from "./comments-actions";

/** A node currently selected in the visual canvas, used as a comment anchor. */
export type AnchorNode = { id: string; label: string };

type DraftAnchor = {
  type: CommentAnchorType;
  text: string;
  nodeId?: string;
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function authorLabel(author: CommentNode["author"], currentUserId: string) {
  return author.id === currentUserId ? `${author.name} (you)` : author.name;
}

function AnchorChip({
  type,
  text,
  onClear,
}: {
  type: CommentAnchorType;
  text: string;
  onClear?: () => void;
}) {
  const prefix = type === "text" ? "On text" : "On element";
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-ds-accent-border bg-ds-accent-surface px-2 py-0.5 text-[11px] text-ds-accent-text">
      <span className="font-medium">{prefix}:</span>
      <span className="truncate">{text}</span>
      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear anchor"
          className="ml-0.5 shrink-0 rounded-full px-1 leading-none hover:bg-ds-state-hover"
        >
          ×
        </button>
      ) : null}
    </span>
  );
}

function Thread({
  thread,
  currentUserId,
  disabled,
  onReply,
  onToggleResolved,
}: {
  thread: CommentThread;
  currentUserId: string;
  disabled: boolean;
  onReply: (threadId: string, body: string) => Promise<void>;
  onToggleResolved: (threadId: string, resolved: boolean) => Promise<void>;
}) {
  const [reply, setReply] = useState("");
  const [showReply, setShowReply] = useState(false);

  const submitReply = async () => {
    const body = reply.trim();
    if (!body) {
      return;
    }
    await onReply(thread.id, body);
    setReply("");
    setShowReply(false);
  };

  return (
    <li
      className={[
        "rounded-lg border p-3",
        thread.resolved
          ? "border-ds-border-subtle bg-ds-surface-sunken"
          : "border-ds-border-subtle bg-ds-surface-raised",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center gap-2">
        {thread.anchorType ? (
          <AnchorChip type={thread.anchorType} text={thread.anchorText ?? ""} />
        ) : null}
        {thread.resolved ? (
          <span className="rounded-full bg-ds-success-surface px-2 py-0.5 text-[11px] font-medium text-ds-success-text">
            Resolved
          </span>
        ) : null}
      </div>

      <div className="mt-1.5 flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-semibold text-ds-text-primary">
          {authorLabel(thread.author, currentUserId)}
        </span>
        <time className="shrink-0 text-[11px] text-ds-text-muted">
          {formatTime(thread.createdAt)}
        </time>
      </div>
      <p className="mt-0.5 text-sm whitespace-pre-wrap text-ds-text-secondary">
        {thread.body}
      </p>

      {thread.replies.length > 0 ? (
        <ul className="mt-2 space-y-2 border-l-2 border-ds-border-subtle pl-3">
          {thread.replies.map((reply) => (
            <li key={reply.id}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-xs font-semibold text-ds-text-primary">
                  {authorLabel(reply.author, currentUserId)}
                </span>
                <time className="shrink-0 text-[10px] text-ds-text-muted">
                  {formatTime(reply.createdAt)}
                </time>
              </div>
              <p className="mt-0.5 text-xs whitespace-pre-wrap text-ds-text-secondary">
                {reply.body}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setShowReply((value) => !value)}
          disabled={disabled}
          className="text-xs font-medium text-ds-text-muted transition hover:text-ds-text-primary disabled:opacity-50"
        >
          Reply
        </button>
        <button
          type="button"
          onClick={() => onToggleResolved(thread.id, !thread.resolved)}
          disabled={disabled}
          aria-label={
            thread.resolved ? "Reopen comment thread" : "Resolve comment thread"
          }
          className="text-xs font-medium text-ds-text-muted transition hover:text-ds-text-primary disabled:opacity-50"
        >
          {thread.resolved ? "Reopen" : "Resolve"}
        </button>
      </div>

      {showReply ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            aria-label="Reply"
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            rows={2}
            placeholder="Write a reply…"
            className="w-full resize-none rounded-md border border-ds-border-subtle bg-ds-surface-raised px-2 py-1.5 text-sm text-ds-text-primary outline-none focus:border-ds-border-strong"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={submitReply}
              disabled={disabled || reply.trim().length === 0}
              className="rounded-full bg-ds-control px-3 py-1 text-xs font-medium text-ds-control-text transition hover:bg-ds-control-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reply
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/**
 * Inline comments side panel. Renders a header toggle (with an unresolved-count
 * badge) and a non-modal right drawer that lists comment threads and lets the
 * user attach a new comment to the current text selection or selected visual
 * element, reply, and resolve/reopen. All mutations go through owner/member
 * scoped server actions and re-read server truth, so every collaborator's
 * comments stay visible.
 */
export function CommentsPanel({
  documentId,
  currentUserId,
  initialComments,
  getTextSelection,
  anchorNode,
}: {
  documentId: string;
  currentUserId: string;
  initialComments: CommentThread[];
  getTextSelection: () => string | null;
  anchorNode: AnchorNode | null;
}) {
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<CommentThread[]>(initialComments);
  const [body, setBody] = useState("");
  const [anchor, setAnchor] = useState<DraftAnchor | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const unresolvedCount = threads.filter((thread) => !thread.resolved).length;
  const [showResolved, setShowResolved] = useState(false);
  const visibleThreads = showResolved
    ? threads
    : threads.filter((thread) => !thread.resolved);

  const refresh = useCallback(() => {
    setError(null);
    startTransition(async () => {
      try {
        setThreads(await listComments(documentId));
      } catch {
        setError("Couldn't load comments. Please try again.");
      }
    });
  }, [documentId]);

  const toggleOpen = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    refresh();
  };

  const attachTextSelection = () => {
    setHint(null);
    const selection = getTextSelection();
    if (selection) {
      setAnchor({ type: "text", text: selection });
    } else {
      setHint("Select some text in the editor first.");
    }
  };

  const attachSelectedElement = () => {
    setHint(null);
    if (anchorNode) {
      setAnchor({
        type: "visual",
        text: anchorNode.label || "element",
        nodeId: anchorNode.id,
      });
    }
  };

  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed) {
      return;
    }
    setError(null);
    const payloadAnchor = anchor;
    startTransition(async () => {
      try {
        const next = await createComment(documentId, {
          body: trimmed,
          anchorType: payloadAnchor?.type ?? null,
          anchorText: payloadAnchor?.text ?? null,
          anchorNodeId: payloadAnchor?.nodeId ?? null,
        });
        setThreads(next);
        setBody("");
        setAnchor(null);
      } catch {
        setError("Couldn't post your comment. Please try again.");
      }
    });
  };

  const reply = useCallback(
    async (threadId: string, replyBody: string) => {
      setError(null);
      try {
        const next = await createComment(documentId, {
          body: replyBody,
          parentId: threadId,
        });
        setThreads(next);
      } catch {
        setError("Couldn't post your reply. Please try again.");
      }
    },
    [documentId],
  );

  const toggleResolved = useCallback(
    async (threadId: string, resolved: boolean) => {
      setError(null);
      try {
        setThreads(await setCommentResolved(threadId, resolved));
      } catch {
        setError("Couldn't update the comment. Please try again.");
      }
    },
    [],
  );

  return (
    <>
      <button
        type="button"
        onClick={toggleOpen}
        aria-label="Comments"
        aria-expanded={open}
        className="relative inline-flex items-center gap-1.5 rounded-full border border-ds-border-subtle px-4 py-2 text-sm font-medium text-ds-text-secondary transition hover:bg-ds-state-hover hover:text-ds-text-primary"
      >
        Comments
        {unresolvedCount > 0 ? (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ds-control px-1 text-[11px] font-semibold text-ds-control-text">
            {unresolvedCount}
          </span>
        ) : null}
      </button>

      {open
        ? createPortal(
            <aside
              role="dialog"
              aria-label="Comments"
              className="fixed inset-y-0 right-0 z-panel flex w-full max-w-md flex-col border-l border-ds-border-subtle bg-ds-surface-overlay shadow-ds-popover"
            >
              <div className="flex items-center justify-between border-b border-ds-border-subtle px-4 py-3">
                <h2 className="text-sm font-semibold text-ds-text-primary">
                  Comments
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={refresh}
                    disabled={isPending}
                    aria-label="Refresh comments"
                    className="rounded-md px-2 py-1 text-xs font-medium text-ds-text-muted transition hover:bg-ds-state-hover hover:text-ds-text-primary disabled:opacity-50"
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close comments"
                    className="rounded-md px-2 py-1 text-sm text-ds-text-muted transition hover:bg-ds-state-hover hover:text-ds-text-primary"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2 border-b border-ds-border-subtle px-4 py-3">
                {anchor ? (
                  <div>
                    <AnchorChip
                      type={anchor.type}
                      text={anchor.text}
                      onClear={() => setAnchor(null)}
                    />
                  </div>
                ) : null}
                <textarea
                  aria-label="New comment"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={3}
                  placeholder="Add a comment…"
                  className="w-full resize-none rounded-md border border-ds-border-subtle bg-ds-surface-raised px-2.5 py-2 text-sm text-ds-text-primary outline-none focus:border-ds-border-strong"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={attachTextSelection}
                    aria-label="Attach text selection"
                    className="rounded-full border border-ds-border-subtle px-2.5 py-1 text-xs font-medium text-ds-text-secondary transition hover:border-ds-border-strong hover:text-ds-text-primary"
                  >
                    Attach text selection
                  </button>
                  {anchorNode ? (
                    <button
                      type="button"
                      onClick={attachSelectedElement}
                      aria-label="Attach selected element"
                      className="rounded-full border border-ds-border-subtle px-2.5 py-1 text-xs font-medium text-ds-text-secondary transition hover:border-ds-border-strong hover:text-ds-text-primary"
                    >
                      Attach “{anchorNode.label || "element"}”
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={submit}
                    disabled={isPending || body.trim().length === 0}
                    aria-label="Add comment"
                    className="ml-auto rounded-full bg-ds-control px-3.5 py-1.5 text-xs font-medium text-ds-control-text transition hover:bg-ds-control-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Comment
                  </button>
                </div>
                {hint ? (
                  <p className="text-xs text-ds-warning-text">{hint}</p>
                ) : null}
                {error ? (
                  <p role="alert" className="text-xs text-ds-danger-text">
                    {error}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center justify-between px-4 py-2">
                <span className="text-xs text-ds-text-muted">
                  {threads.length} {threads.length === 1 ? "thread" : "threads"}
                </span>
                <label className="flex items-center gap-1.5 text-xs text-ds-text-muted">
                  <input
                    type="checkbox"
                    checked={showResolved}
                    onChange={(event) => setShowResolved(event.target.checked)}
                    className="h-3.5 w-3.5 rounded border-ds-border-strong accent-ds-accent"
                  />
                  Show resolved
                </label>
              </div>

              <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
                {visibleThreads.length === 0 ? (
                  <p className="mt-6 text-center text-sm text-ds-text-muted">
                    {threads.length === 0
                      ? "No comments yet. Select text or an element, then add one."
                      : "No open comments."}
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {visibleThreads.map((thread) => (
                      <Thread
                        key={thread.id}
                        thread={thread}
                        currentUserId={currentUserId}
                        disabled={isPending}
                        onReply={reply}
                        onToggleResolved={toggleResolved}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </aside>,
            document.body,
          )
        : null}
    </>
  );
}
