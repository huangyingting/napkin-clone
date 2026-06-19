"use client";

import { LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import { LexicalCollaboration } from "@lexical/react/LexicalCollaborationContext";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import { HorizontalRulePlugin } from "@lexical/react/LexicalHorizontalRulePlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  COLLABORATION_TAG,
  HISTORIC_TAG,
  type EditorState,
  type EditorThemeClasses,
  type Klass,
  type LexicalEditor as LexicalEditorInstance,
  type LexicalNode,
} from "lexical";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useLexicalCollaboration } from "@/lib/collab/use-lexical-collaboration";
import { useDebouncedSave, useYText } from "@/lib/collab/use-collaboration";
import { readingTimeMinutes, wordCount } from "@/lib/document-stats";
import { EditorContextProvider } from "@/lib/lexical/editor-context";

import { saveDocumentLexical, saveDocumentTitle } from "./actions";
import { BlockSparkPlugin } from "./block-spark";
import type { CommentThread } from "./comments-actions";
import { CommentsPanel, type AnchorNode } from "./comments-panel";
import { DocumentExportButton } from "@/components/editor/document-export-button";
import { PageBreakIndicator } from "@/components/editor/page-break-indicator";
import { VisualSvgRegistryProvider } from "@/components/editor/visual-svg-registry";
import { FloatingTextToolbar } from "./floating-text-toolbar";
import { ImportPlugin } from "./import-plugin";
import { InsertMenuPlugin } from "./insert-menu";
import { InsertVisualPlugin } from "./insert-visual-plugin";
import { Presence } from "./presence";
import { ShareButton } from "./share-button";
import { TagControl } from "./tag-control";
import type { DocumentTag } from "./tags-actions";
import { VisualAnchorProvider } from "./visual-anchor-context";
import { VisualNode } from "./visual-node";

const theme: EditorThemeClasses = {
  paragraph: "mb-3 leading-7",
  heading: {
    h1: "mb-3 mt-2 text-3xl font-semibold tracking-tight",
    h2: "mb-3 mt-2 text-2xl font-semibold tracking-tight",
    h3: "mb-2 mt-2 text-xl font-semibold tracking-tight",
  },
  quote: "mb-3 border-l-4 border-zinc-300 pl-4 italic dark:border-zinc-700",
  hr: "my-6 border-0 border-t border-zinc-200 dark:border-zinc-800",
  visual: "my-2",
  link: "text-indigo-600 underline underline-offset-2 dark:text-indigo-400",
  list: {
    ul: "mb-3 ml-6 list-disc",
    ol: "mb-3 ml-6 list-decimal",
    listitem: "leading-7",
  },
  text: {
    bold: "font-semibold",
    italic: "italic",
    underline: "underline",
    strikethrough: "line-through",
    code: "rounded-ds-sm border border-ds-border-subtle bg-ds-surface-sunken px-1 py-0.5 font-mono text-[0.9em] text-ds-text-secondary",
  },
};

// Nodes the editor can render/parse. Headings and lists are required so that a
// document migrated from Markdown (US-004) round-trips through Lexical's
// `parseEditorState`.
const NODES: Array<Klass<LexicalNode>> = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  HorizontalRuleNode,
  VisualNode,
];

function onError(error: Error) {
  console.error(error);
}

type SaveStatus = "saved" | "pending" | "saving" | "error";

const STATUS_LABEL: Record<SaveStatus, string> = {
  saved: "All changes saved",
  pending: "Unsaved changes…",
  saving: "Saving…",
  error: "Couldn't save changes",
};

// How long to wait after the last keystroke before persisting.
const SAVE_DEBOUNCE_MS = 800;

/**
 * Mirrors the collaboration ready-gate onto the Lexical editor: editing stays
 * disabled until the room has synced (or the degraded fallback fires), so no one
 * types before the shared document is bootstrapped from the database.
 */
function EditableGate({ editable }: { editable: boolean }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editor.setEditable(editable);
  }, [editor, editable]);
  return null;
}

/**
 * Seeds the editor from the database when collaboration is unavailable.
 *
 * Content normally arrives via the `CollaborationPlugin`, which bootstraps the
 * shared Yjs document from `initialStateJson` — but only on the provider's
 * `sync` event. When the collab server can't be reached (e.g. the websocket port
 * isn't forwarded) the room degrades to local-only mode and that `sync` event
 * never fires, leaving the editor blank even though the database holds content.
 * Since the database is the durable source of truth, this fallback parses the
 * serialized state and loads it directly so the document is never empty. It runs
 * once, only while degraded and unsynced, and only if the editor is still empty.
 */
function LocalFallbackSeedPlugin({
  initialStateJson,
  degraded,
  synced,
}: {
  initialStateJson: string | null;
  degraded: boolean;
  synced: boolean;
}) {
  const [editor] = useLexicalComposerContext();
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || synced || !degraded || !initialStateJson) {
      return;
    }
    const isEmpty = editor
      .getEditorState()
      .read(
        () =>
          $getRoot().getTextContent() === "" &&
          $getRoot().getChildrenSize() <= 1,
      );
    if (!isEmpty) {
      seededRef.current = true;
      return;
    }
    seededRef.current = true;
    try {
      const parsed = editor.parseEditorState(initialStateJson);
      editor.setEditorState(parsed, { tag: HISTORIC_TAG });
    } catch (error) {
      console.error("Failed to seed editor from database fallback", error);
    }
  }, [editor, initialStateJson, degraded, synced]);
  return null;
}

/**
 * Captures the live editor instance and the last non-empty text selection so the
 * comments panel can anchor a comment to selected text. Per US-017 we store the
 * selected text *string* (matching the existing `anchorText` model), not Lexical
 * node keys/offsets, which aren't stable across sessions.
 */
function CaptureSelectionPlugin({
  editorRef,
  selectionRef,
}: {
  editorRef: React.MutableRefObject<LexicalEditorInstance | null>;
  selectionRef: React.MutableRefObject<string>;
}) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editorRef.current = editor;
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection) && !selection.isCollapsed()) {
          const text = selection.getTextContent().trim();
          if (text) {
            selectionRef.current = text;
          }
        }
      });
    });
  }, [editor, editorRef, selectionRef]);
  return null;
}

/**
 * Reports the document's live plain-text content (across local *and* remote
 * edits) so the editor can show reading time and word count (US-024). Uses the
 * editor's text content directly and fires on every update, so the stats stay in
 * sync as collaborators type.
 */
function DocumentStatsPlugin({ onText }: { onText: (text: string) => void }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    const read = (state: EditorState) => {
      state.read(() => {
        onText($getRoot().getTextContent());
      });
    };
    read(editor.getEditorState());
    return editor.registerUpdateListener(({ editorState }) => {
      read(editorState);
    });
  }, [editor, onText]);
  return null;
}

/**
 * The document editor: a Lexical block editor bound to a document with real-time
 * collaboration. Content lives in a shared Yjs document synced over the collab
 * websocket server; the `CollaborationPlugin` bootstraps it from the serialized
 * `initialStateJson` (the DB is the durable source of truth — the collab server
 * holds no persistent state). Local edits are persisted via the debounced
 * `saveDocumentLexical` action; remote/CRDT merges do not re-save (only the
 * originator writes). The title is a separate collaborative, autosaved input.
 * It renders the full document chrome (back link, workspace, read-only badge,
 * presence, sharing, comments) and hosts the "+"/"/" insert menus, the floating
 * format toolbar, the per-block visual spark, and inline visual cards. This
 * replaced the legacy textarea/tab editor (US-018).
 */
export function LexicalEditor({
  documentId,
  initialTitle,
  initialStateJson = null,
  userName,
  currentUserId,
  canEdit = true,
  workspaceName,
  initialComments = [],
  initialIsShared = false,
  initialShareId = null,
  initialSlug = null,
  initialTags = [],
  allTags = [],
}: {
  documentId: string;
  initialTitle: string;
  initialStateJson?: string | null;
  userName: string;
  currentUserId: string;
  canEdit?: boolean;
  workspaceName?: string;
  initialComments?: CommentThread[];
  initialIsShared?: boolean;
  initialShareId?: string | null;
  initialSlug?: string | null;
  initialTags?: DocumentTag[];
  allTags?: DocumentTag[];
}) {
  const collab = useLexicalCollaboration({ room: documentId, userName });

  // Editing is enabled only with permission AND once collaboration is ready
  // (synced, or a degraded local-only fallback), so no one edits before the
  // shared document is bootstrapped from the database.
  const editable = canEdit && collab.ready;

  const [status, setStatus] = useState<SaveStatus>("saved");

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestJsonRef = useRef<string | null>(null);

  // Ref for the editor content area — used by PageBreakIndicator.
  const contentAreaRef = useRef<HTMLDivElement | null>(null);
  // Page break indicators are shown by default at A4 size and can be toggled off.
  const [showPageBreaks, setShowPageBreaks] = useState(false);

  // Collaborative, autosaved document title (parity with the old editor). The
  // body is bound by `@lexical/yjs`; the title is a separate shared text bound
  // via `useYText` and persisted with a debounced save.
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const titleSaver = useDebouncedSave(
    (value: string) => saveDocumentTitle(documentId, value),
    initialTitle,
  );
  const title = useYText(collab.ytitle, {
    initial: initialTitle,
    ready: collab.ready,
    editable,
    localOrigin: collab.localOrigin,
    elementRef: titleInputRef,
    onLocalChange: titleSaver.schedule,
  });

  // Seed the title into the shared room from the database once ready.
  useEffect(() => {
    if (collab.ready) {
      collab.seedTitle(initialTitle);
    }
  }, [collab, initialTitle]);

  // Comment anchoring state. `selectionRef` holds the last non-empty selected
  // text (text anchors); `anchorNode` holds the visual element a `VisualCard`
  // reported as selected (visual anchors). Both store plain strings/ids, never
  // Lexical node keys.
  const editorRef = useRef<LexicalEditorInstance | null>(null);
  const selectionRef = useRef<string>("");
  const [anchorNode, setAnchorNode] = useState<AnchorNode | null>(null);

  // Stable context value so a consuming `VisualCard` doesn't re-run its
  // anchor-reporting effect on every render (that effect performs a setState and
  // would otherwise loop). `setAnchorNode` is referentially stable across renders.
  const visualAnchorValue = useMemo(
    () => ({ setVisualAnchor: setAnchorNode }),
    [setAnchorNode],
  );

  // Live document text, for reading time / word count (US-024). Updated on every
  // editor change (local and remote) by `DocumentStatsPlugin`.
  const [statsText, setStatsText] = useState("");
  const handleStatsText = useCallback((text: string) => setStatsText(text), []);
  const words = wordCount(statsText);
  const minutes = readingTimeMinutes(statsText);

  const getTextSelection = useCallback(() => {
    const editor = editorRef.current;
    let current = "";
    if (editor) {
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection) && !selection.isCollapsed()) {
          current = selection.getTextContent().trim();
        }
      });
    }
    return current || selectionRef.current || null;
  }, []);

  const save = useCallback(async () => {
    const json = latestJsonRef.current;
    if (json === null) {
      return;
    }
    setStatus("saving");
    try {
      await saveDocumentLexical(documentId, json);
      // Only flip to "saved" if nothing newer was queued while saving.
      if (latestJsonRef.current === json) {
        setStatus("saved");
      }
    } catch (error) {
      console.error(error);
      setStatus("error");
    }
  }, [documentId]);

  const handleChange = useCallback(
    (editorState: EditorState, _editor: unknown, tags: Set<string>) => {
      // Remote CRDT merges (and collaborative undo) are tagged; only the client
      // that made a local edit persists it to the database (US-003).
      if (tags.has(COLLABORATION_TAG) || tags.has(HISTORIC_TAG)) {
        return;
      }
      latestJsonRef.current = JSON.stringify(editorState.toJSON());
      setStatus("pending");
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        void save();
      }, SAVE_DEBOUNCE_MS);
    },
    [save],
  );

  // Clear any pending debounce timer on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const initialConfig = {
    namespace: "NapkinLexicalEditor",
    theme,
    nodes: NODES,
    onError,
    // Collaboration provides the document state (bootstrapped from the DB), and
    // editing is gated until the room is ready.
    editorState: null,
    editable: false,
  };

  // Combined save indicator across the title (debounced) and body (Lexical)
  // saves: error wins, then saving, then pending, else saved.
  const saveStatus: SaveStatus =
    status === "error"
      ? "error"
      : status === "saving" || titleSaver.status === "saving"
        ? "saving"
        : status === "pending" || titleSaver.status === "pending"
          ? "pending"
          : "saved";

  return (
    <main className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <LexicalCollaboration>
        <LexicalComposer initialConfig={initialConfig}>
          <VisualSvgRegistryProvider>
            <VisualAnchorProvider value={visualAnchorValue}>
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
                  <TagControl
                    documentId={documentId}
                    initialTags={initialTags}
                    allTags={allTags}
                    editable={canEdit}
                  />
                </div>
                <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
                  <Presence peers={collab.peers} status={collab.status} />
                  {canEdit && <ImportPlugin />}
                  <button
                    type="button"
                    title={
                      showPageBreaks
                        ? "Hide page-break indicators"
                        : "Show page-break indicators (A4)"
                    }
                    aria-label={
                      showPageBreaks
                        ? "Hide page-break indicators"
                        : "Show page-break indicators"
                    }
                    aria-pressed={showPageBreaks}
                    onClick={() => setShowPageBreaks((v) => !v)}
                    className={[
                      "flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition",
                      showPageBreaks
                        ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                        : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200",
                    ].join(" ")}
                  >
                    <svg
                      viewBox="0 0 16 16"
                      aria-hidden="true"
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    >
                      <path d="M2 5h12M2 11h12" />
                    </svg>
                    Pages
                  </button>
                  <DocumentExportButton documentTitle={title.value} />
                  <ShareButton
                    id={documentId}
                    initialIsShared={initialIsShared}
                    initialShareId={initialShareId}
                    initialSlug={initialSlug}
                  />
                  <CommentsPanel
                    documentId={documentId}
                    currentUserId={currentUserId}
                    initialComments={initialComments}
                    getTextSelection={getTextSelection}
                    anchorNode={anchorNode}
                  />
                  <span
                    aria-label="Document statistics"
                    className="min-w-0 shrink truncate text-xs text-zinc-500 dark:text-zinc-400"
                  >
                    {minutes} min read · {words}{" "}
                    {words === 1 ? "word" : "words"}
                  </span>
                  <span
                    role="status"
                    aria-live="polite"
                    className="min-w-0 truncate text-xs text-zinc-500 dark:text-zinc-400"
                  >
                    {STATUS_LABEL[saveStatus]}
                  </span>
                </div>
              </div>

              <div className="flex flex-1 justify-center px-6 py-8">
                <div className="w-full max-w-3xl">
                  <div
                    ref={contentAreaRef}
                    className="relative rounded-2xl border border-black/[.06] bg-white p-6 dark:border-white/[.08] dark:bg-zinc-950"
                  >
                    {showPageBreaks && (
                      <PageBreakIndicator
                        contentRef={contentAreaRef}
                        pageSize="a4"
                      />
                    )}
                    <EditorContextProvider>
                      <RichTextPlugin
                        contentEditable={
                          <ContentEditable
                            aria-label="Document body"
                            className="ghost-prose min-h-[16rem] outline-none"
                          />
                        }
                        placeholder={
                          <div className="pointer-events-none absolute left-6 top-6 text-base text-zinc-400 dark:text-zinc-500">
                            {collab.ready ? "Start writing…" : "Connecting…"}
                          </div>
                        }
                        ErrorBoundary={LexicalErrorBoundary}
                      />
                      <CollaborationPlugin
                        id={documentId}
                        providerFactory={collab.providerFactory}
                        shouldBootstrap
                        initialEditorState={initialStateJson ?? null}
                        username={userName}
                        cursorColor={collab.cursorColor}
                      />
                      <EditableGate editable={editable} />
                      <LocalFallbackSeedPlugin
                        initialStateJson={initialStateJson}
                        degraded={collab.degraded}
                        synced={collab.synced}
                      />
                      <CaptureSelectionPlugin
                        editorRef={editorRef}
                        selectionRef={selectionRef}
                      />
                      <DocumentStatsPlugin onText={handleStatsText} />
                      <ListPlugin />
                      <LinkPlugin />
                      <HorizontalRulePlugin />
                      <InsertMenuPlugin />
                      <BlockSparkPlugin />
                      <InsertVisualPlugin />
                      <FloatingTextToolbar />
                      <OnChangePlugin
                        onChange={handleChange}
                        ignoreSelectionChange
                        ignoreHistoryMergeTagChange
                      />
                    </EditorContextProvider>
                  </div>
                </div>
              </div>
            </VisualAnchorProvider>
          </VisualSvgRegistryProvider>
        </LexicalComposer>
      </LexicalCollaboration>
    </main>
  );
}
