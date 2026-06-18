"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  combineSaveStatus,
  useCollaboration,
  useDebouncedSave,
  useYText,
} from "@/lib/collab/use-collaboration";
import { applyBlockType, type BlockType } from "@/lib/markdown";
import type { Visual } from "@/lib/visual/schema";

import { saveDocumentContent, saveDocumentTitle } from "./actions";
import { BlockVisualGenerator } from "./block-visual-generator";
import { CommentsPanel, type AnchorNode } from "./comments-panel";
import type { CommentThread } from "./comments-actions";
import { Presence } from "./presence";
import { ShareButton } from "./share-button";
import { VisualPanel } from "./visual-panel";

type SaveStatus = "saved" | "pending" | "saving";

const STATUS_LABEL: Record<SaveStatus, string> = {
  saved: "All changes saved",
  pending: "Unsaved changes…",
  saving: "Saving…",
};

const TOOLBAR_BUTTONS: { type: BlockType; label: string; aria: string }[] = [
  { type: "h1", label: "H1", aria: "Heading 1" },
  { type: "h2", label: "H2", aria: "Heading 2" },
  { type: "bullet", label: "• List", aria: "Bullet list" },
  { type: "paragraph", label: "Text", aria: "Paragraph" },
];

const toolbarButtonClass =
  "rounded-md px-2.5 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";

function tabClass(active: boolean) {
  return [
    "rounded-md px-3 py-1 text-xs font-medium transition",
    active
      ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
      : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
  ].join(" ");
}

export function DocumentEditor({
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
  const { ycontent, ytitle, ystate, status, ready, peers, localOrigin, seed } =
    collab;

  // Editing is enabled only with permission AND once collaboration is ready
  // (synced, or a degraded local-only fallback), so we never edit before the
  // room is seeded from the database.
  const editable = canEdit && ready;

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);

  // Last non-empty text selection, used to anchor a comment to selected text.
  const lastSelection = useRef<string>("");
  const [anchorNode, setAnchorNode] = useState<AnchorNode | null>(null);

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

  const [tab, setTab] = useState<"write" | "preview">("write");

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

  const saveStatus = combineSaveStatus(titleSaver.status, contentSaver.status);

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

  // Restore the caret/selection after a toolbar edit re-renders the textarea.
  useEffect(() => {
    const selection = pendingSelection.current;
    if (selection && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(selection.start, selection.end);
      pendingSelection.current = null;
    }
  });

  return (
    <main className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <div className="flex flex-col gap-3 border-b border-black/[.06] bg-white/80 px-6 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between dark:border-white/[.08] dark:bg-black/40">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <Link
              href="/app"
              className="w-fit text-xs font-medium text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              ← Back to documents
            </Link>
            {workspaceName && (
              <>
                <span className="text-xs text-zinc-300 dark:text-zinc-600">
                  ·
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {workspaceName}
                </span>
              </>
            )}
            {!canEdit && (
              <>
                <span className="text-xs text-zinc-300 dark:text-zinc-600">
                  ·
                </span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  Read-only
                </span>
              </>
            )}
          </div>
          <input
            ref={titleInputRef}
            aria-label="Document title"
            value={title.value}
            onChange={(event) => title.onChange(event.target.value)}
            onBlur={titleSaver.flush}
            placeholder="Untitled"
            disabled={!editable}
            className="w-full rounded-md bg-transparent text-xl font-semibold tracking-tight text-zinc-900 outline-none placeholder:text-zinc-400 focus:bg-zinc-100/60 focus:px-2 disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-50 dark:placeholder:text-zinc-600 dark:focus:bg-zinc-800/60"
          />
        </div>
        <div className="flex items-center gap-3">
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
            anchorNode={anchorNode}
          />
          <span
            role="status"
            aria-live="polite"
            className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400"
          >
            {STATUS_LABEL[saveStatus]}
          </span>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-px bg-black/[.06] lg:grid-cols-2 dark:bg-white/[.08]">
        <section className="flex min-h-[60vh] flex-col bg-white dark:bg-zinc-950">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[.06] px-4 py-2 dark:border-white/[.08]">
            <div className="flex items-center gap-1">
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
                  disabled={!editable || tab !== "write"}
                >
                  {button.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setTab("write")}
                className={tabClass(tab === "write")}
              >
                Write
              </button>
              <button
                type="button"
                onClick={() => setTab("preview")}
                className={tabClass(tab === "preview")}
              >
                Preview
              </button>
            </div>
          </div>

          {tab === "write" ? (
            <textarea
              ref={textareaRef}
              aria-label="Document text"
              value={content.value}
              onChange={(event) => content.onChange(event.target.value)}
              onSelect={captureSelection}
              onBlur={contentSaver.flush}
              spellCheck
              disabled={!editable}
              placeholder={
                "Write or paste your text here.\n\n# Use headings\n- and bullet lists\n\nGenerate a visual from it on the right."
              }
              className="w-full flex-1 resize-none bg-transparent p-6 font-mono text-sm leading-relaxed text-zinc-800 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-200 dark:placeholder:text-zinc-600"
            />
          ) : (
            <div className="flex-1 overflow-auto p-6">
              <BlockVisualGenerator
                documentId={id}
                source={content.value}
                editable={editable}
                initialVisuals={initialBlockVisuals}
              />
            </div>
          )}
        </section>

        <VisualPanel
          documentId={id}
          text={content.value}
          initialVisual={initialVisual}
          canEdit={canEdit}
          ready={ready}
          visualMap={ystate}
          localOrigin={localOrigin}
          onAnchorNodeChange={setAnchorNode}
        />
      </div>
    </main>
  );
}
