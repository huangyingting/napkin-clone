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
import { useCallback, useEffect, useRef, useState } from "react";

import { useLexicalCollaboration } from "@/lib/collab/use-lexical-collaboration";

import { saveDocumentLexical } from "./actions";
import { BlockInsertMenuPlugin } from "./block-insert-menu";
import { BlockSparkPlugin } from "./block-spark";
import type { CommentThread } from "./comments-actions";
import { CommentsPanel, type AnchorNode } from "./comments-panel";
import { FloatingToolbarPlugin } from "./floating-toolbar";
import { Presence } from "./presence";
import { ShareButton } from "./share-button";
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
 * Minimal Lexical rich-text editor shell bound to a document with real-time
 * collaboration. Content lives in a shared Yjs document synced over the collab
 * websocket server; the `CollaborationPlugin` bootstraps it from the serialized
 * `initialStateJson` (the DB is the durable source of truth — the collab server
 * holds no persistent state). Local edits are persisted via the debounced
 * `saveDocumentLexical` action; remote/CRDT merges do not re-save (only the
 * originator writes). Later stories build blocks, the "+"/"/" menus, the
 * floating toolbar, and visual decorator nodes on top of this.
 */
export function LexicalEditor({
  documentId,
  initialStateJson = null,
  userName,
  currentUserId,
  initialComments = [],
  initialIsShared = false,
  initialShareId = null,
}: {
  documentId: string;
  initialStateJson?: string | null;
  userName: string;
  currentUserId: string;
  initialComments?: CommentThread[];
  initialIsShared?: boolean;
  initialShareId?: string | null;
}) {
  const collab = useLexicalCollaboration({ room: documentId, userName });

  const [status, setStatus] = useState<SaveStatus>("saved");

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestJsonRef = useRef<string | null>(null);

  // Comment anchoring state. `selectionRef` holds the last non-empty selected
  // text (text anchors); `anchorNode` holds the visual element a `VisualCard`
  // reported as selected (visual anchors). Both store plain strings/ids, never
  // Lexical node keys.
  const editorRef = useRef<LexicalEditorInstance | null>(null);
  const selectionRef = useRef<string>("");
  const [anchorNode, setAnchorNode] = useState<AnchorNode | null>(null);

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

  return (
    <LexicalCollaboration>
      <LexicalComposer initialConfig={initialConfig}>
        <VisualAnchorProvider value={{ setVisualAnchor: setAnchorNode }}>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Presence peers={collab.peers} status={collab.status} />
              <ShareButton
                id={documentId}
                initialIsShared={initialIsShared}
                initialShareId={initialShareId}
              />
              <CommentsPanel
                documentId={documentId}
                currentUserId={currentUserId}
                initialComments={initialComments}
                getTextSelection={getTextSelection}
                anchorNode={anchorNode}
              />
            </div>
            <div className="relative rounded-2xl border border-black/[.06] bg-white p-6 dark:border-white/[.08] dark:bg-zinc-950">
              <RichTextPlugin
                contentEditable={
                  <ContentEditable
                    aria-label="Document body"
                    className="min-h-[16rem] text-base text-zinc-900 outline-none dark:text-zinc-100"
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
              <EditableGate editable={collab.ready} />
              <CaptureSelectionPlugin
                editorRef={editorRef}
                selectionRef={selectionRef}
              />
              <ListPlugin />
              <LinkPlugin />
              <HorizontalRulePlugin />
              <BlockInsertMenuPlugin />
              <BlockSparkPlugin />
              <FloatingToolbarPlugin />
              <OnChangePlugin
                onChange={handleChange}
                ignoreSelectionChange
                ignoreHistoryMergeTagChange
              />
            </div>
            <div
              role="status"
              aria-live="polite"
              className="text-xs text-zinc-500 dark:text-zinc-400"
            >
              {STATUS_LABEL[status]}
            </div>
          </div>
        </VisualAnchorProvider>
      </LexicalComposer>
    </LexicalCollaboration>
  );
}
