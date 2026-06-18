"use client";

import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  combineSaveStatus,
  useCollaboration,
  useDebouncedSave,
  useYText,
} from "@/lib/collab/use-collaboration";
import {
  applyBlockType,
  blockText,
  parseMarkdown,
  type BlockType,
  type MarkdownBlock,
} from "@/lib/markdown";
import { VisualRenderer } from "@/components/visual/visual-renderer";
import {
  safeParseVisual,
  type Visual,
  type VisualKind,
} from "@/lib/visual/schema";

import {
  attachVisual,
  detachVisual,
  saveDocumentContent,
  saveDocumentTitle,
} from "./actions";
import { CommentsPanel } from "./comments-panel";
import type { CommentThread } from "./comments-actions";
import { InlineVisualEditor } from "./inline-visual-editor";
import { BlockContent } from "./markdown-preview";
import { Presence } from "./presence";
import { ShareButton } from "./share-button";

type SaveStatus = "saved" | "pending" | "saving";

const STATUS_LABEL: Record<SaveStatus, string> = {
  saved: "All changes saved",
  pending: "Unsaved changes…",
  saving: "Saving…",
};

const KIND_LABEL: Record<VisualKind, string> = {
  flowchart: "Flowchart",
  mindmap: "Mind map",
  list: "List",
  chart: "Chart",
  concept: "Concept",
  timeline: "Timeline",
  cycle: "Cycle",
  comparison: "Comparison",
  funnel: "Funnel",
};

type GenStatus = "idle" | "loading";
type VisualSaveState = "idle" | "saving" | "saved" | "error";

const VISUAL_SAVE_LABEL: Record<VisualSaveState, string | null> = {
  idle: null,
  saving: "Saving visual…",
  saved: "Visual saved",
  error: "Couldn't save visual",
};

/**
 * Sentinel key for the document-level visual (anchor `null`) in the
 * `selectedVisualKey` state. Block-anchored visuals use their `block.id`, which
 * never collides with this null-byte-prefixed string.
 */
const DOC_VISUAL_KEY = "\u0000doc-visual";

function messageFrom(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error: unknown }).error;
    if (typeof error === "string") {
      return error;
    }
  }
  return fallback;
}

function candidatesFrom(payload: unknown): unknown[] {
  if (payload && typeof payload === "object" && "candidates" in payload) {
    const candidates = (payload as { candidates: unknown }).candidates;
    if (Array.isArray(candidates)) {
      return candidates;
    }
  }
  return [];
}

function thumbButtonClass(active: boolean): string {
  return [
    "flex flex-col gap-1 overflow-hidden rounded-lg border bg-white p-1.5 text-left transition dark:bg-zinc-950",
    active
      ? "border-zinc-900 ring-2 ring-zinc-900/20 dark:border-white dark:ring-white/30"
      : "border-black/[.08] hover:border-black/20 dark:border-white/[.10] dark:hover:border-white/25",
  ].join(" ");
}

const TOOLBAR_BUTTONS: { type: BlockType; label: string; aria: string }[] = [
  { type: "h1", label: "H1", aria: "Heading 1" },
  { type: "h2", label: "H2", aria: "Heading 2" },
  { type: "h3", label: "H3", aria: "Heading 3" },
  { type: "bullet", label: "• List", aria: "Bullet list" },
  { type: "paragraph", label: "Text", aria: "Paragraph" },
];

const toolbarButtonClass =
  "rounded-md px-2.5 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";

function sparkButtonClass(visible: boolean, active: boolean): string {
  return [
    "flex h-7 w-7 items-center justify-center rounded-md border border-black/[.08] bg-white text-zinc-500 shadow-sm transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[.12] dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-white/30 dark:hover:text-zinc-100 dark:focus-visible:ring-zinc-500",
    visible
      ? "pointer-events-auto translate-x-0 opacity-100"
      : "pointer-events-none -translate-x-1 opacity-0",
    active
      ? "border-zinc-300 text-zinc-900 dark:border-white/30 dark:text-zinc-100"
      : "hover:border-zinc-300 hover:text-zinc-900",
  ].join(" ");
}

function blockWrapperClass(active: boolean, editable: boolean): string {
  return [
    "group relative rounded-xl py-3 pr-4 pl-12 transition-colors",
    active
      ? "bg-zinc-100/80 dark:bg-zinc-900/50"
      : "hover:bg-black/[.025] dark:hover:bg-white/[.03]",
    editable
      ? "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300/80 dark:focus-visible:ring-zinc-700/80"
      : "",
  ].join(" ");
}

/**
 * Content-first, single-canvas document editor.
 *
 * Replaces the Write/Preview tabs + always-on right visual panel with one
 * centered, blog-width column: the title at the top and the body below. Writing
 * flows through the same collaboration + autosave path as the legacy editor
 * (`useCollaboration`/`useYText` + `saveDocumentContent`/`saveDocumentTitle`),
 * editing stays gated until collaboration is ready, and the save-status
 * indicator plus the existing presence/share/comments controls live in a
 * compact top bar.
 *
 * Inline visuals (US-002) render in document order within the same column: the
 * document-level visual (anchor `null`) gets its own slot, and each
 * block-anchored visual renders beneath its source block in a
 * `[data-block-visual]` card via `VisualRenderer` (the existing inline pattern).
 * Subsequent stories layer per-paragraph sparks, floating toolbars, and
 * animations onto this scaffold.
 */
export function ContentEditor({
  id,
  initialTitle,
  initialContent,
  initialVisual,
  initialBlockVisuals,
  initialIsShared,
  initialShareId,
  canEdit = true,
  workspaceName,
  userName = "Anonymous",
  currentUserId,
  initialComments,
}: {
  id: string;
  initialTitle: string;
  initialContent: string;
  initialVisual: Visual | null;
  initialBlockVisuals: Record<string, Visual>;
  initialIsShared: boolean;
  initialShareId: string | null;
  canEdit?: boolean;
  workspaceName?: string;
  userName?: string;
  currentUserId: string;
  initialComments: CommentThread[];
}) {
  const collab = useCollaboration({ room: id, userName });
  const { ycontent, ytitle, status, ready, peers, localOrigin, seed } = collab;

  // Editing is enabled only with permission AND once collaboration is ready
  // (synced, or a degraded local-only fallback), so we never edit before the
  // room is seeded from the database.
  const editable = canEdit && ready;

  // The block whose gutter spark is "active": its generation picker is open.
  // Only one picker is open at a time (US-005).
  const [openSparkId, setOpenSparkId] = useState<string | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);

  // Generation flow state for the currently-open block (US-005).
  const [genStatus, setGenStatus] = useState<GenStatus>("idle");
  const [genError, setGenError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Visual[]>([]);
  const [visualSaveState, setVisualSaveState] =
    useState<VisualSaveState>("idle");
  // The chosen visual per block id, rendered inline beneath its source block.
  // Seeded once from the persisted block-anchored visuals and then updated as
  // the user generates/selects visuals this session.
  const [blockVisuals, setBlockVisuals] = useState<Record<string, Visual>>(
    () => initialBlockVisuals,
  );
  // The document-level visual (anchor `null`), seeded once from the persisted
  // value and kept in state so contextual edits (US-007) re-render it live.
  const [docVisual, setDocVisual] = useState<Visual | null>(
    () => initialVisual,
  );
  // Which inline visual (if any) is selected for contextual editing (US-007):
  // `DOC_VISUAL_KEY` for the document visual or a `block.id` for a block visual.
  // Only one visual's editing tools are open at a time.
  const [selectedVisualKey, setSelectedVisualKey] = useState<string | null>(
    null,
  );

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);

  // Last non-empty text selection, used to anchor a comment to selected text.
  const lastSelection = useRef<string>("");

  const captureSelection = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    const selected = textarea.value
      .slice(textarea.selectionStart, textarea.selectionEnd)
      .trim();
    if (selected) {
      lastSelection.current = selected;
    }
  }, []);

  const getTextSelection = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      const selected = textarea.value
        .slice(textarea.selectionStart, textarea.selectionEnd)
        .trim();
      if (selected) {
        return selected;
      }
    }
    return lastSelection.current || null;
  }, []);

  const titleSaver = useDebouncedSave(
    (value: string) => saveDocumentTitle(id, value),
    initialTitle,
  );
  const contentSaver = useDebouncedSave(
    (value: string) => saveDocumentContent(id, value),
    initialContent,
  );

  const title = useYText(ytitle, {
    initial: initialTitle,
    ready,
    editable,
    localOrigin,
    elementRef: titleInputRef,
    onLocalChange: titleSaver.schedule,
  });
  const content = useYText(ycontent, {
    initial: initialContent,
    ready,
    editable,
    localOrigin,
    elementRef: textareaRef,
    onLocalChange: contentSaver.schedule,
  });

  // Seed shared state from the database once collaboration is ready.
  useEffect(() => {
    if (ready) {
      seed({
        content: initialContent,
        title: initialTitle,
        visual: initialVisual ? JSON.stringify(initialVisual) : null,
      });
    }
  }, [ready, seed, initialContent, initialTitle, initialVisual]);

  // Grow the body to fit its content so the column reads top-to-bottom like a
  // blog (the page scrolls, not the textarea).
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [content.value]);

  const saveStatus = combineSaveStatus(titleSaver.status, contentSaver.status);

  // Apply a block type (heading / bullet list / paragraph) to the line(s)
  // spanned by the current selection or caret. The edit flows through the same
  // collaborative `content.onChange` path as typing, so it syncs and autosaves.
  const applyType = useCallback(
    (type: BlockType) => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }
      const result = applyBlockType(
        content.value,
        textarea.selectionStart,
        textarea.selectionEnd,
        type,
      );
      pendingSelection.current = {
        start: result.selectionStart,
        end: result.selectionEnd,
      };
      content.onChange(result.value);
    },
    [content],
  );

  // Restore the caret/selection after a toolbar edit re-renders the textarea so
  // the user keeps editing exactly where they were.
  useEffect(() => {
    const selection = pendingSelection.current;
    if (selection && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(selection.start, selection.end);
      pendingSelection.current = null;
    }
  });

  // Close the open generation picker, clearing its transient candidate/error
  // state (the already-saved inline visual is kept).
  const closePicker = useCallback(() => {
    setOpenSparkId(null);
    setCandidates([]);
    setGenError(null);
    setVisualSaveState("idle");
  }, []);

  // Open an inline visual's contextual editing tools (US-007). Editing and the
  // generation picker are mutually exclusive, so opening one closes the other.
  const selectVisual = useCallback(
    (key: string) => {
      closePicker();
      setSelectedVisualKey(key);
    },
    [closePicker],
  );

  const deselectVisual = useCallback(() => {
    setSelectedVisualKey(null);
  }, []);

  // Send a single block's text to `/api/generate` and show the returned
  // candidate visuals inline near the block. Errors are non-blocking and
  // retryable; the open picker stays open so the user can retry or pick.
  const generateFor = useCallback(async (block: MarkdownBlock) => {
    const text = blockText(block).trim();
    if (text.length === 0) {
      return;
    }
    // Opening the generation picker exits any active editing session.
    setSelectedVisualKey(null);
    setOpenSparkId(block.id);
    setGenStatus("loading");
    setGenError(null);
    setCandidates([]);
    setVisualSaveState("idle");
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setGenError(
          messageFrom(
            payload,
            "We couldn't generate a visual. Please try again.",
          ),
        );
        return;
      }

      const valid: Visual[] = [];
      for (const item of candidatesFrom(payload)) {
        const result = safeParseVisual(item);
        if (result.success) {
          valid.push(result.data);
        }
      }

      if (valid.length === 0) {
        setGenError("No usable visuals came back. Please try again.");
        return;
      }

      setCandidates(valid);
    } catch {
      setGenError(
        "Couldn't reach the generator. Check your connection and try again.",
      );
    } finally {
      setGenStatus("idle");
    }
  }, []);

  // Persist a chosen candidate as this block's visual and render it inline
  // beneath the block. The optimistic update is restored on save failure.
  const choose = useCallback(
    async (blockId: string, visual: Visual) => {
      const previous = blockVisuals[blockId];
      setBlockVisuals((prev) => ({ ...prev, [blockId]: visual }));
      setVisualSaveState("saving");
      try {
        await attachVisual(id, visual, blockId);
        setVisualSaveState("saved");
      } catch {
        setVisualSaveState("error");
        setBlockVisuals((prev) => {
          const next = { ...prev };
          if (previous) {
            next[blockId] = previous;
          } else {
            delete next[blockId];
          }
          return next;
        });
      }
    },
    [id, blockVisuals],
  );

  // Remove a block's visual: optimistically drop only this block's card (others
  // are untouched), close its picker if open, and persist via `detachVisual`.
  // Restore the card on failure so the user can retry (US-006).
  const removeVisual = useCallback(
    async (blockId: string) => {
      const previous = blockVisuals[blockId];
      if (!previous) {
        return;
      }
      setBlockVisuals((prev) => {
        const next = { ...prev };
        delete next[blockId];
        return next;
      });
      if (openSparkId === blockId) {
        closePicker();
      }
      try {
        await detachVisual(id, blockId);
      } catch {
        setBlockVisuals((prev) => ({ ...prev, [blockId]: previous }));
      }
    },
    [id, blockVisuals, openSparkId, closePicker],
  );

  // Toggle a block's spark: open + generate when closed, close when open.
  const toggleSpark = useCallback(
    (block: MarkdownBlock) => {
      if (openSparkId === block.id) {
        closePicker();
      } else {
        void generateFor(block);
      }
    },
    [openSparkId, closePicker, generateFor],
  );

  // Parse the live content into ordered blocks so each block-anchored visual can
  // render beneath its source block (US-002). Block ids are derived from the
  // content, matching the keys the server computed for `initialBlockVisuals`.
  const blocks = parseMarkdown(content.value);
  const hasCanvasFlow = docVisual !== null || blocks.length > 0;

  return (
    <main className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-black/[.06] bg-white/80 px-4 py-3 backdrop-blur sm:px-6 dark:border-white/[.08] dark:bg-black/40">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Link
            href="/app"
            className="w-fit shrink-0 text-xs font-medium text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← Back to documents
          </Link>
          {workspaceName && (
            <>
              <span className="text-xs text-zinc-300 dark:text-zinc-600">
                ·
              </span>
              <span className="min-w-0 truncate text-xs text-zinc-500 dark:text-zinc-400">
                {workspaceName}
              </span>
            </>
          )}
          {!canEdit && (
            <>
              <span className="text-xs text-zinc-300 dark:text-zinc-600">
                ·
              </span>
              <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                Read-only
              </span>
            </>
          )}
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <Presence peers={peers} status={status} />
          <ShareButton
            id={id}
            initialIsShared={initialIsShared}
            initialShareId={initialShareId}
          />
          <CommentsPanel
            documentId={id}
            currentUserId={currentUserId}
            initialComments={initialComments}
            getTextSelection={getTextSelection}
            anchorNode={null}
          />
          <span
            role="status"
            aria-live="polite"
            className="min-w-0 truncate text-xs text-zinc-500 dark:text-zinc-400"
          >
            {STATUS_LABEL[saveStatus]}
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-6 py-10 sm:py-14">
          <input
            ref={titleInputRef}
            aria-label="Document title"
            value={title.value}
            onChange={(event) => title.onChange(event.target.value)}
            onBlur={titleSaver.flush}
            placeholder="Untitled"
            disabled={!editable}
            className="w-full rounded-md bg-transparent text-3xl font-bold tracking-tight text-zinc-900 outline-none placeholder:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-60 sm:text-4xl dark:text-zinc-50 dark:placeholder:text-zinc-700"
          />

          {canEdit ? (
            <div
              role="toolbar"
              aria-label="Text formatting"
              className="mt-6 flex flex-wrap items-center gap-1 rounded-lg border border-black/[.06] bg-white/70 p-1 dark:border-white/[.08] dark:bg-zinc-900/50"
            >
              {TOOLBAR_BUTTONS.map((button) => (
                <button
                  key={button.type}
                  type="button"
                  aria-label={button.aria}
                  title={button.aria}
                  // Keep the textarea focused/selected when clicking the toolbar.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyType(button.type)}
                  className={toolbarButtonClass}
                  disabled={!editable}
                >
                  {button.label}
                </button>
              ))}
            </div>
          ) : null}

          <textarea
            ref={textareaRef}
            aria-label="Document text"
            value={content.value}
            onChange={(event) => content.onChange(event.target.value)}
            onSelect={captureSelection}
            onBlur={contentSaver.flush}
            spellCheck
            disabled={!editable}
            rows={1}
            placeholder="Start writing…"
            className={`${canEdit ? "mt-4" : "mt-6"} block w-full resize-none overflow-hidden bg-transparent text-[15px] leading-7 text-zinc-800 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-200 dark:placeholder:text-zinc-600`}
          />

          {hasCanvasFlow ? (
            <section
              aria-label="Document canvas"
              className="mt-10 flex flex-col gap-6 border-t border-black/[.06] pt-8 dark:border-white/[.08]"
            >
              {docVisual ? (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    Document visual
                  </span>
                  {editable && selectedVisualKey === DOC_VISUAL_KEY ? (
                    <InlineVisualEditor
                      documentId={id}
                      anchorBlockId={null}
                      text={content.value}
                      visual={docVisual}
                      onChange={setDocVisual}
                      onClose={deselectVisual}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={
                        editable
                          ? () => selectVisual(DOC_VISUAL_KEY)
                          : undefined
                      }
                      aria-label={editable ? "Edit document visual" : undefined}
                      disabled={!editable}
                      className={`block w-full overflow-hidden rounded-xl border border-black/[.06] bg-white text-left transition dark:border-white/[.08] dark:bg-zinc-950 ${
                        editable
                          ? "cursor-pointer hover:border-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:hover:border-white/25"
                          : "cursor-default"
                      }`}
                    >
                      <VisualRenderer
                        visual={docVisual}
                        className="h-auto w-full"
                      />
                    </button>
                  )}
                </div>
              ) : null}

              {blocks.map((block) => {
                const visual = blockVisuals[block.id];
                const open = openSparkId === block.id;
                const active = activeBlockId === block.id || open;
                const showSpark = editable && active;
                return (
                  <div
                    key={block.id}
                    className={blockWrapperClass(active, editable)}
                    tabIndex={editable ? 0 : undefined}
                    onMouseEnter={
                      editable ? () => setActiveBlockId(block.id) : undefined
                    }
                    onMouseLeave={
                      editable
                        ? () =>
                            setActiveBlockId((current) =>
                              current === block.id ? null : current,
                            )
                        : undefined
                    }
                    onFocusCapture={
                      editable ? () => setActiveBlockId(block.id) : undefined
                    }
                    onBlurCapture={
                      editable
                        ? (event) => {
                            const nextTarget = event.relatedTarget;
                            if (
                              !nextTarget ||
                              !event.currentTarget.contains(nextTarget)
                            ) {
                              setActiveBlockId((current) =>
                                current === block.id ? null : current,
                              );
                            }
                          }
                        : undefined
                    }
                  >
                    {editable ? (
                      <div className="absolute top-3 left-2 flex items-center">
                        <button
                          type="button"
                          data-block-id={block.id}
                          aria-label="Generate visual for this block"
                          aria-expanded={open}
                          title="Generate visual for this block"
                          disabled={genStatus === "loading" && !open}
                          onClick={() => toggleSpark(block)}
                          className={sparkButtonClass(showSpark, open)}
                        >
                          <Sparkles
                            aria-hidden="true"
                            className="h-3.5 w-3.5"
                          />
                        </button>
                      </div>
                    ) : null}

                    <div className="flex flex-col gap-3">
                      <BlockContent block={block} />
                      {visual ? (
                        <div
                          data-block-visual={block.id}
                          className="rounded-xl border border-black/[.06] bg-white p-3 dark:border-white/[.08] dark:bg-zinc-950"
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                              {KIND_LABEL[visual.type]}
                            </span>
                            {editable ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => void generateFor(block)}
                                  aria-label="Replace this block's visual"
                                  className="rounded-md px-2 py-1 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                                >
                                  Replace
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void removeVisual(block.id)}
                                  aria-label="Remove this block's visual"
                                  className="rounded-md px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 dark:text-red-400 dark:hover:bg-red-950/40"
                                >
                                  Remove
                                </button>
                              </div>
                            ) : null}
                          </div>
                          {editable && selectedVisualKey === block.id ? (
                            <InlineVisualEditor
                              documentId={id}
                              anchorBlockId={block.id}
                              text={blockText(block)}
                              visual={visual}
                              onChange={(next) =>
                                setBlockVisuals((prev) => ({
                                  ...prev,
                                  [block.id]: next,
                                }))
                              }
                              onClose={deselectVisual}
                            />
                          ) : editable ? (
                            <button
                              type="button"
                              onClick={() => selectVisual(block.id)}
                              aria-label="Edit this block's visual"
                              className="block w-full overflow-hidden rounded-lg border border-black/[.06] bg-white text-left transition hover:border-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-white/[.08] dark:bg-zinc-950 dark:hover:border-white/25"
                            >
                              <VisualRenderer
                                visual={visual}
                                className="h-auto w-full"
                              />
                            </button>
                          ) : (
                            <div className="overflow-hidden rounded-lg border border-black/[.06] bg-white dark:border-white/[.08] dark:bg-zinc-950">
                              <VisualRenderer
                                visual={visual}
                                className="h-auto w-full"
                              />
                            </div>
                          )}
                        </div>
                      ) : null}

                      {open ? (
                        <div className="rounded-xl border border-black/[.08] bg-zinc-50/80 p-3 dark:border-white/[.10] dark:bg-zinc-900/40">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                                Visual for this block
                              </span>
                              {VISUAL_SAVE_LABEL[visualSaveState] ? (
                                <span
                                  role="status"
                                  aria-live="polite"
                                  className={
                                    visualSaveState === "error"
                                      ? "text-xs text-red-600 dark:text-red-400"
                                      : "text-xs text-zinc-400 dark:text-zinc-500"
                                  }
                                >
                                  {VISUAL_SAVE_LABEL[visualSaveState]}
                                </span>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              onClick={closePicker}
                              aria-label="Close visual picker"
                              className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-200/60 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                            >
                              <X aria-hidden="true" className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {genStatus === "loading" ? (
                            <div
                              role="status"
                              aria-live="polite"
                              className="flex items-center gap-2 py-4 text-sm text-zinc-500 dark:text-zinc-400"
                            >
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
                              Generating a visual…
                            </div>
                          ) : genError ? (
                            <div
                              role="alert"
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
                            >
                              <span className="min-w-0">{genError}</span>
                              <button
                                type="button"
                                onClick={() => void generateFor(block)}
                                className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold underline-offset-2 transition hover:underline"
                              >
                                Try again
                              </button>
                            </div>
                          ) : candidates.length > 0 ? (
                            <>
                              <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                                Choose a visual
                              </p>
                              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {candidates.map((candidate, index) => {
                                  const selected = visual === candidate;
                                  return (
                                    <li key={index}>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void choose(block.id, candidate)
                                        }
                                        aria-pressed={selected}
                                        aria-label={`Select ${KIND_LABEL[candidate.type]} option ${index + 1}`}
                                        className={thumbButtonClass(selected)}
                                      >
                                        <span className="aspect-[4/3] w-full overflow-hidden rounded-md bg-white dark:bg-zinc-950">
                                          <VisualRenderer
                                            visual={candidate}
                                            className="h-full w-full"
                                          />
                                        </span>
                                        <span className="px-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                                          {candidate.title ??
                                            KIND_LABEL[candidate.type]}
                                        </span>
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
