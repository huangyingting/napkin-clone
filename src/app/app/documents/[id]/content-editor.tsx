"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";

import {
  combineSaveStatus,
  useCollaboration,
  useDebouncedSave,
  useYText,
} from "@/lib/collab/use-collaboration";
import { parseMarkdown } from "@/lib/markdown";
import { VisualRenderer } from "@/components/visual/visual-renderer";
import type { Visual } from "@/lib/visual/schema";

import { saveDocumentContent, saveDocumentTitle } from "./actions";
import { CommentsPanel } from "./comments-panel";
import type { CommentThread } from "./comments-actions";
import { BlockContent } from "./markdown-preview";
import { Presence } from "./presence";
import { ShareButton } from "./share-button";

type SaveStatus = "saved" | "pending" | "saving";

const STATUS_LABEL: Record<SaveStatus, string> = {
  saved: "All changes saved",
  pending: "Unsaved changes…",
  saving: "Saving…",
};

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

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

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

  // Parse the live content into ordered blocks so each block-anchored visual can
  // render beneath its source block (US-002). Block ids are derived from the
  // content, matching the keys the server computed for `initialBlockVisuals`.
  const blocks = parseMarkdown(content.value);
  const hasInlineVisuals =
    initialVisual !== null ||
    blocks.some((block) => initialBlockVisuals[block.id] !== undefined);

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
            className="mt-6 block w-full resize-none overflow-hidden bg-transparent text-[15px] leading-7 text-zinc-800 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-200 dark:placeholder:text-zinc-600"
          />

          {hasInlineVisuals ? (
            <section
              aria-label="Document visuals"
              className="mt-10 flex flex-col gap-6 border-t border-black/[.06] pt-8 dark:border-white/[.08]"
            >
              {initialVisual ? (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    Document visual
                  </span>
                  <div className="overflow-hidden rounded-xl border border-black/[.06] bg-white dark:border-white/[.08] dark:bg-zinc-950">
                    <VisualRenderer
                      visual={initialVisual}
                      className="h-auto w-full"
                    />
                  </div>
                </div>
              ) : null}

              {blocks.map((block) => {
                const visual = initialBlockVisuals[block.id];
                if (!visual) {
                  return null;
                }
                return (
                  <div key={block.id} className="flex flex-col gap-3">
                    <BlockContent block={block} />
                    <div
                      data-block-visual={block.id}
                      className="overflow-hidden rounded-xl border border-black/[.06] bg-white dark:border-white/[.08] dark:bg-zinc-950"
                    >
                      <VisualRenderer
                        visual={visual}
                        className="h-auto w-full"
                      />
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
