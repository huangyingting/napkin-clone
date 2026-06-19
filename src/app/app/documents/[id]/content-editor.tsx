"use client";

import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type * as Y from "yjs";

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
import { CommentsPanel, type AnchorNode } from "./comments-panel";
import type { CommentThread } from "./comments-actions";
import {
  CONTROL_FOCUS_RING,
  CONTROL_PRESS,
  CONTROL_TRANSITION,
} from "./control-styles";
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

/**
 * Onboarding hint dismissal (US-010).
 *
 * The spark hint is a one-time, dismissible helper. We persist its dismissal in
 * `localStorage` and expose it through a `useSyncExternalStore` so the read is
 * SSR-safe (the server snapshot is always "not dismissed", avoiding a hydration
 * mismatch) without ever calling `setState` inside an effect (which the
 * `react-hooks/set-state-in-effect` rule forbids).
 */
const SPARK_HINT_KEY = "napkin:spark-hint-dismissed";
const sparkHintListeners = new Set<() => void>();

function readSparkHintDismissed(): boolean {
  try {
    return window.localStorage.getItem(SPARK_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

function dismissSparkHint(): void {
  try {
    window.localStorage.setItem(SPARK_HINT_KEY, "1");
  } catch {
    // Storage may be unavailable (private mode); the in-memory notify below
    // still hides the hint for the current session.
  }
  for (const listener of sparkHintListeners) {
    listener();
  }
}

function subscribeSparkHint(onChange: () => void): () => void {
  sparkHintListeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === SPARK_HINT_KEY) {
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    sparkHintListeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function useSparkHintDismissed(): boolean {
  return useSyncExternalStore(
    subscribeSparkHint,
    readSparkHintDismissed,
    () => false,
  );
}

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

const toolbarButtonClass = [
  "rounded-full px-2.5 py-1 text-xs font-medium text-zinc-600",
  CONTROL_TRANSITION,
  CONTROL_PRESS,
  "hover:bg-zinc-100 hover:text-zinc-900 active:bg-zinc-200 active:text-zinc-900",
  CONTROL_FOCUS_RING,
  "disabled:cursor-not-allowed disabled:opacity-50",
  "dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 dark:active:bg-zinc-700",
].join(" ");

// Floating selection/format toolbar: a fixed, bottom-center pill that floats in
// while the body text has focus and slides out when focus leaves the editing
// surface (US-008). It overlays content (fixed → no layout shift) and stays
// mounted so it can animate in/out (US-011).
function formatToolbarClass(visible: boolean): string {
  return [
    "fixed inset-x-0 bottom-6 z-30 mx-auto flex w-fit max-w-[calc(100vw-1rem)] flex-wrap items-center justify-center gap-1 rounded-full border border-black/[.08] bg-white/95 p-1 shadow-lg backdrop-blur transition duration-150 motion-reduce:transition-none dark:border-white/[.12] dark:bg-zinc-900/95",
    visible
      ? "pointer-events-auto translate-y-0 opacity-100"
      : "pointer-events-none translate-y-2 opacity-0",
  ].join(" ");
}

function sparkButtonClass(visible: boolean, active: boolean): string {
  return [
    "flex h-7 w-7 items-center justify-center rounded-md border border-black/[.08] bg-white text-zinc-500 shadow-sm",
    CONTROL_TRANSITION,
    CONTROL_PRESS,
    CONTROL_FOCUS_RING,
    "active:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50",
    "dark:border-white/[.12] dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-white/30 dark:hover:text-zinc-100 dark:active:bg-zinc-800",
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

// Exit-animation duration (ms) for a removed inline visual; must match
// `.napkin-visual-out` in globals.css so the card unmounts as the fade completes.
const VISUAL_EXIT_MS = 180;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// Mount/unmount animation class for an inline visual card (US-012). A session
// added visual fades/scales in; a removing one fades/scales out (and is made
// inert) until it unmounts. Under reduced motion the classes resolve to no rule,
// so there is no motion. Initially-loaded visuals get no enter animation.
function visualMountClass(exiting: boolean, entering: boolean): string {
  if (exiting) {
    return "napkin-visual-out pointer-events-none";
  }
  if (entering) {
    return "napkin-visual-in";
  }
  return "";
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
  const { ycontent, ytitle, ystate, status, ready, peers, localOrigin, seed } =
    collab;

  // Editing is enabled only with permission AND once collaboration is ready
  // (synced, or a degraded local-only fallback), so we never edit before the
  // room is seeded from the database.
  const editable = canEdit && ready;

  // The block whose gutter spark is "active": its generation picker is open.
  // Only one picker is open at a time (US-005).
  const [openSparkId, setOpenSparkId] = useState<string | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);

  // Whether the floating selection/format toolbar is shown. It floats in while
  // the body textarea has focus and is dismissed when focus leaves it (US-008).
  const [formatToolbarOpen, setFormatToolbarOpen] = useState(false);

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
  // The selected node of the currently-edited inline visual (if any), so a
  // comment can be anchored to a specific visual element (US-014). Persists
  // after the editing tools close (so the comments drawer can still attach it);
  // replaced when another visual is opened or cleared from the comments panel.
  const [anchorNode, setAnchorNode] = useState<AnchorNode | null>(null);

  // The block whose inline visual is animating out before unmounting (US-012).
  // The card stays rendered (its entry is kept in `blockVisuals`) until the exit
  // animation finishes, then it is dropped.
  const [exitingBlockId, setExitingBlockId] = useState<string | null>(null);

  // Block ids that already had a persisted visual on first load. Their cards
  // should NOT play the enter animation (only session-added visuals animate in).
  // Held in lazy state (read during render) rather than a ref.
  const [initialBlockIds] = useState<Set<string>>(
    () => new Set(Object.keys(initialBlockVisuals)),
  );
  // Pending exit-finalize timers, keyed by block id, so a failed removal can
  // cancel the scheduled unmount and restore the card.
  const exitTimers = useRef<Map<string, number>>(new Map());

  // Whether the user has dismissed the one-time spark onboarding hint (US-010).
  const sparkHintDismissed = useSparkHintDismissed();

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

  // Publish the document-level visual to the shared collaboration state so other
  // editors see edits live (US-014, matching the legacy editor's behavior).
  // Tagged with `localOrigin` so our own observer ignores it, avoiding a
  // feedback loop. Block-anchored visuals are not synced (parity with legacy).
  const pushDocVisual = useCallback(
    (visual: Visual | null) => {
      const json = visual ? JSON.stringify(visual) : null;
      const doc = ystate.doc;
      const apply = () => {
        if (json === null) {
          if (ystate.has("visual")) {
            ystate.delete("visual");
          }
        } else if (ystate.get("visual") !== json) {
          ystate.set("visual", json);
        }
      };
      if (doc) {
        doc.transact(apply, localOrigin);
      } else {
        apply();
      }
    },
    [ystate, localOrigin],
  );

  // Mirror remote document-level visual changes (from other collaborators) into
  // the inline canvas. Our own writes carry `localOrigin` and are ignored.
  useEffect(() => {
    const observer = (event: Y.YMapEvent<unknown>, tr: Y.Transaction) => {
      if (!event.keysChanged.has("visual") || tr.origin === localOrigin) {
        return;
      }
      const raw = ystate.get("visual");
      if (typeof raw !== "string") {
        setDocVisual(null);
        return;
      }
      try {
        const result = safeParseVisual(JSON.parse(raw));
        if (result.success) {
          setDocVisual(result.data);
        }
      } catch {
        // Ignore malformed remote payloads.
      }
    };
    ystate.observe(observer);
    return () => ystate.unobserve(observer);
  }, [ystate, localOrigin]);

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

  // Clear any pending visual exit-animation timers on unmount so they can't fire
  // a state update after the editor is gone.
  useEffect(() => {
    const timers = exitTimers.current;
    return () => {
      for (const timer of timers.values()) {
        window.clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

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
  // Clear any stale comment anchor; the newly-mounted editor reports its own.
  const selectVisual = useCallback(
    (key: string) => {
      closePicker();
      setSelectedVisualKey(key);
      setAnchorNode(null);
    },
    [closePicker],
  );

  const deselectVisual = useCallback(() => {
    setSelectedVisualKey(null);
    // Keep `anchorNode` so the just-selected element stays available to anchor a
    // comment even after the editor closes (the editing popover dismisses on the
    // same outside click that opens the comments drawer). It is replaced when a
    // different visual is opened or cleared from the comments panel.
  }, []);

  // Update the document-level visual locally and publish it to collaborators so
  // visual edits sync across browsers (US-014). The persistence to the database
  // is handled by the InlineVisualEditor's debounced `attachVisual` path.
  const handleDocVisualChange = useCallback(
    (next: Visual) => {
      setDocVisual(next);
      pushDocVisual(next);
    },
    [pushDocVisual],
  );

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

  // Remove a block's visual (US-006) with an exit animation (US-012). The card
  // is animated out first: we mark the block as exiting (swapping the card to the
  // fade-out class) but keep it in `blockVisuals` so it stays mounted, then drop
  // it once the animation finishes. The deletion is persisted in parallel; on
  // failure we cancel the pending unmount and restore the card so the user can
  // retry. Under reduced motion the finalize delay is 0 (no motion, immediate).
  const finalizeRemoval = useCallback((blockId: string) => {
    exitTimers.current.delete(blockId);
    setBlockVisuals((prev) => {
      if (!(blockId in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[blockId];
      return next;
    });
    setExitingBlockId((current) => (current === blockId ? null : current));
  }, []);

  const removeVisual = useCallback(
    async (blockId: string) => {
      const previous = blockVisuals[blockId];
      if (!previous) {
        return;
      }
      if (openSparkId === blockId) {
        closePicker();
      }

      // Start the exit animation; the card stays mounted until it completes.
      setExitingBlockId(blockId);
      const delay = prefersReducedMotion() ? 0 : VISUAL_EXIT_MS;
      const existingTimer = exitTimers.current.get(blockId);
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer);
      }
      const timer = window.setTimeout(() => finalizeRemoval(blockId), delay);
      exitTimers.current.set(blockId, timer);

      try {
        await detachVisual(id, blockId);
      } catch {
        // Cancel the scheduled unmount and restore the card to retry.
        const pending = exitTimers.current.get(blockId);
        if (pending !== undefined) {
          window.clearTimeout(pending);
          exitTimers.current.delete(blockId);
        }
        setExitingBlockId((current) => (current === blockId ? null : current));
        setBlockVisuals((prev) => ({ ...prev, [blockId]: previous }));
      }
    },
    [id, blockVisuals, openSparkId, closePicker, finalizeRemoval],
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

  // US-010 onboarding hints. The empty-state placeholder prompts a writer to
  // start; once there is prose, a one-line dismissible helper teaches the
  // hover-to-generate spark interaction. They are mutually exclusive and both
  // sit in normal flow below the body so they never overlap content.
  const isEmptyDoc = content.value.trim().length === 0;
  const showEmptyStateHint = canEdit && isEmptyDoc;
  const showSparkHint = editable && blocks.length > 0 && !sparkHintDismissed;

  return (
    <main className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 bg-zinc-50/80 px-4 py-2.5 backdrop-blur sm:px-6 dark:bg-black/50">
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
        {/* US-009: one compact, unobtrusive mini-toolbar grouping the
            always-needed actions (save status, presence, share, comments) into a
            single pill so the canvas stays content-first. flex-wrap + max-w-full
            keeps it from causing horizontal overflow at 375/768/1280. */}
        <div
          role="toolbar"
          aria-label="Document actions"
          className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-x-2 gap-y-1 rounded-full border border-black/[.06] bg-white/70 px-2.5 py-1 shadow-sm dark:border-white/[.08] dark:bg-zinc-900/60"
        >
          <span
            role="status"
            aria-live="polite"
            className="min-w-0 truncate px-1 text-xs text-zinc-500 dark:text-zinc-400"
          >
            {STATUS_LABEL[saveStatus]}
          </span>
          <span
            aria-hidden="true"
            className="hidden h-4 w-px bg-black/[.08] sm:block dark:bg-white/[.12]"
          />
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
            onFocus={() => setFormatToolbarOpen(true)}
            onBlur={() => {
              contentSaver.flush();
              setFormatToolbarOpen(false);
            }}
            spellCheck
            disabled={!editable}
            rows={1}
            placeholder="Start writing…"
            className={`mt-6 block w-full resize-none overflow-hidden bg-transparent text-[15px] leading-7 text-zinc-800 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-200 dark:placeholder:text-zinc-600`}
          />

          {/* US-010: gentle onboarding hints. Both sit in normal flow beneath
              the body so they are non-blocking and never overlap content. The
              empty-state placeholder invites writing; the dismissible spark hint
              teaches the hover-to-generate interaction once prose exists. */}
          {showEmptyStateHint ? (
            <div className="mt-8 rounded-xl border border-dashed border-black/[.10] px-5 py-6 dark:border-white/[.12]">
              <p className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                <Sparkles aria-hidden="true" className="h-4 w-4" />
                Start writing your document
              </p>
              <p className="mt-1.5 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                Write naturally — one idea per paragraph. Hover any paragraph
                and click the spark to turn it into a visual.
              </p>
            </div>
          ) : showSparkHint ? (
            <div
              role="note"
              className="mt-8 flex items-center gap-2 rounded-lg border border-black/[.06] bg-white/60 px-3 py-2 text-xs text-zinc-600 dark:border-white/[.08] dark:bg-zinc-900/40 dark:text-zinc-300"
            >
              <Sparkles
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500"
              />
              <span className="min-w-0 flex-1">
                Hover any paragraph and click the spark to generate a visual for
                it.
              </span>
              <button
                type="button"
                onClick={dismissSparkHint}
                aria-label="Dismiss hint"
                className="shrink-0 rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}

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
                      onChange={handleDocVisualChange}
                      onSelectNode={setAnchorNode}
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
                // US-012: animate the card in only when added this session, and
                // out while it is being removed.
                const exiting = exitingBlockId === block.id;
                const entering = !initialBlockIds.has(block.id);
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
                            className={`h-3.5 w-3.5${
                              open && genStatus === "loading"
                                ? " animate-pulse motion-reduce:animate-none"
                                : ""
                            }`}
                          />
                        </button>
                      </div>
                    ) : null}

                    <div className="flex flex-col gap-3">
                      <BlockContent block={block} />
                      {visual ? (
                        <div
                          data-block-visual={block.id}
                          className={`rounded-xl border border-black/[.06] bg-white p-3 dark:border-white/[.08] dark:bg-zinc-950 ${visualMountClass(exiting, entering)}`}
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
                              onSelectNode={setAnchorNode}
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
                            <div role="status" aria-live="polite">
                              <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                                <Sparkles
                                  aria-hidden="true"
                                  className="h-4 w-4 animate-pulse text-zinc-400 motion-reduce:animate-none dark:text-zinc-500"
                                />
                                Generating a visual…
                              </div>
                              {/* Subtle pulsing skeletons where the candidate
                                  thumbnails will appear — the inline "thinking"
                                  indicator (US-012, CSS only, reduced-motion
                                  aware via motion-reduce:animate-none). */}
                              <div
                                aria-hidden="true"
                                className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3"
                              >
                                {[0, 1, 2].map((skeleton) => (
                                  <span
                                    key={skeleton}
                                    className="aspect-[4/3] w-full animate-pulse rounded-md bg-zinc-200/70 motion-reduce:animate-none dark:bg-zinc-800/60"
                                    style={{
                                      animationDelay: `${skeleton * 150}ms`,
                                    }}
                                  />
                                ))}
                              </div>
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

      {canEdit ? (
        <div
          role="toolbar"
          aria-label="Text formatting"
          aria-hidden={!formatToolbarOpen}
          // Keep the textarea focused/selected when pressing a toolbar button.
          onPointerDown={(event) => event.preventDefault()}
          className={formatToolbarClass(formatToolbarOpen)}
        >
          {TOOLBAR_BUTTONS.map((button) => (
            <button
              key={button.type}
              type="button"
              aria-label={button.aria}
              title={button.aria}
              tabIndex={formatToolbarOpen ? 0 : -1}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => applyType(button.type)}
              className={toolbarButtonClass}
              disabled={!editable}
            >
              {button.label}
            </button>
          ))}
        </div>
      ) : null}
    </main>
  );
}
