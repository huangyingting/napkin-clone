"use client";

import { LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import { LexicalCollaboration } from "@lexical/react/LexicalCollaborationContext";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import {
  COLLABORATION_TAG,
  HISTORIC_TAG,
  type EditorState,
  type EditorThemeClasses,
  type Klass,
  type LexicalNode,
} from "lexical";
import { useCallback, useEffect, useRef, useState } from "react";

import { useLexicalCollaboration } from "@/lib/collab/use-lexical-collaboration";

import { saveDocumentLexical } from "./actions";
import { FloatingToolbarPlugin } from "./floating-toolbar";
import { Presence } from "./presence";

const theme: EditorThemeClasses = {
  paragraph: "mb-3 leading-7",
  heading: {
    h1: "mb-3 mt-2 text-3xl font-semibold tracking-tight",
    h2: "mb-3 mt-2 text-2xl font-semibold tracking-tight",
    h3: "mb-2 mt-2 text-xl font-semibold tracking-tight",
  },
  quote: "mb-3 border-l-4 border-zinc-300 pl-4 italic dark:border-zinc-700",
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
}: {
  documentId: string;
  initialStateJson?: string | null;
  userName: string;
}) {
  const collab = useLexicalCollaboration({ room: documentId, userName });

  const [status, setStatus] = useState<SaveStatus>("saved");

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestJsonRef = useRef<string | null>(null);

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
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-end">
            <Presence peers={collab.peers} status={collab.status} />
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
            <ListPlugin />
            <LinkPlugin />
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
      </LexicalComposer>
    </LexicalCollaboration>
  );
}
