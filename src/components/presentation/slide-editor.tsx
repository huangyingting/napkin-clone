"use client";

/**
 * Slide Editor — a full-page presentation editing surface.
 *
 * Opens over the whole viewport (portaled to `document.body`, `z-modal`) with a
 * three-pane layout: a thumbnail rail (reorder via HTML5 drag-and-drop, add /
 * duplicate / delete), a large live stage that renders the selected slide with
 * the shared {@link SlideCanvas}, and an inspector for editing the slide's
 * title, bullets, notes and layout. A theme picker lives in the top bar; arrow
 * keys page between slides (unless a field is focused), Escape closes.
 *
 * Every change flows through the pure `deck-mutations` helpers and is reported
 * via `onDeckChange`; persistence is triggered by the Save button (`onSave`).
 *
 * Read/write only of the deck prop — it never touches Lexical/Yjs state.
 */

import {
  ChevronLeft,
  ChevronRight,
  Copy,
  GripVertical,
  LayoutPanelLeft,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { FOCUS_RING } from "@/components/motion/control-styles";
import { SlideCanvas } from "@/components/presentation/slide-canvas";
import { Tooltip } from "@/components/ui";
import type { Deck, DeckTheme, SlideLayout } from "@/lib/presentation/deck";
import type { Visual } from "@/lib/visual/schema";
import {
  addSlide,
  duplicateSlide,
  removeSlide,
  reorderSlides,
  setDeckTheme,
  updateSlide,
} from "@/lib/presentation/deck-mutations";

interface SlideEditorProps {
  deck: Deck;
  visuals: ReadonlyMap<string, Visual>;
  onDeckChange: (deck: Deck) => void;
  onClose: () => void;
  onSave: (deck: Deck) => Promise<void>;
  isSaving?: boolean;
}

const THEME_OPTIONS: { value: DeckTheme; label: string; color: string }[] = [
  { value: "indigo", label: "Indigo", color: "#818cf8" },
  { value: "ocean", label: "Ocean", color: "#38bdf8" },
  { value: "forest", label: "Forest", color: "#4ade80" },
  { value: "sunset", label: "Sunset", color: "#fb923c" },
  { value: "grape", label: "Grape", color: "#c084fc" },
  { value: "default", label: "Default", color: "#a1a1aa" },
];

const LAYOUT_OPTIONS: SlideLayout[] = [
  "title",
  "section",
  "content",
  "media",
  "blank",
];

export function SlideEditor({
  deck,
  visuals,
  onDeckChange,
  onClose,
  onSave,
  isSaving = false,
}: SlideEditorProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Keep the selection within bounds as slides are added/removed.
  const safeSelected = Math.min(selectedIndex, deck.slides.length - 1);
  const selectedSlide = deck.slides[safeSelected];

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      // Arrow keys page through slides, but never while the user is typing in a
      // field (so editing a title/bullet isn't hijacked).
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (typing) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setSelectedIndex((i) => Math.max(0, i - 1));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setSelectedIndex((i) => Math.min(deck.slides.length - 1, i + 1));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, deck.slides.length]);

  const handleThemeChange = useCallback(
    (theme: DeckTheme) => {
      onDeckChange(setDeckTheme(deck, theme));
    },
    [deck, onDeckChange],
  );

  const handleAdd = useCallback(() => {
    const next = addSlide(deck, deck.slides.length - 1);
    onDeckChange(next);
    setSelectedIndex(next.slides.length - 1);
  }, [deck, onDeckChange]);

  const handleDuplicate = useCallback(
    (index: number) => {
      onDeckChange(duplicateSlide(deck, index));
      setSelectedIndex(index + 1);
    },
    [deck, onDeckChange],
  );

  const handleRemove = useCallback(
    (index: number) => {
      onDeckChange(removeSlide(deck, index));
      setSelectedIndex((current) =>
        Math.max(0, Math.min(current, deck.slides.length - 2)),
      );
    },
    [deck, onDeckChange],
  );

  const handleTitleChange = useCallback(
    (index: number, title: string) => {
      onDeckChange(updateSlide(deck, index, { title }));
    },
    [deck, onDeckChange],
  );

  const handleLayoutChange = useCallback(
    (index: number, layout: SlideLayout) => {
      onDeckChange(updateSlide(deck, index, { layout }));
    },
    [deck, onDeckChange],
  );

  const handleBulletsChange = useCallback(
    (index: number, value: string) => {
      const bullets = value
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      onDeckChange(updateSlide(deck, index, { bullets }));
    },
    [deck, onDeckChange],
  );

  const handleNotesChange = useCallback(
    (index: number, notes: string) => {
      onDeckChange(updateSlide(deck, index, { notes }));
    },
    [deck, onDeckChange],
  );

  const handleDrop = useCallback(
    (toIndex: number) => {
      if (dragIndex !== null && dragIndex !== toIndex) {
        onDeckChange(reorderSlides(deck, dragIndex, toIndex));
        setSelectedIndex(toIndex);
      }
      setDragIndex(null);
      setDragOverIndex(null);
    },
    [deck, dragIndex, onDeckChange],
  );

  const handleSave = useCallback(() => {
    void onSave(deck);
  }, [deck, onSave]);

  const goPrev = useCallback(() => {
    setSelectedIndex((i) => Math.max(0, i - 1));
  }, []);

  const goNext = useCallback(() => {
    setSelectedIndex((i) => Math.min(deck.slides.length - 1, i + 1));
  }, [deck.slides.length]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Slide editor"
      className="fixed inset-0 z-modal flex flex-col bg-ds-surface-base"
    >
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between gap-3 border-b border-ds-border-subtle px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <LayoutPanelLeft
            size={18}
            aria-hidden="true"
            className="shrink-0 text-ds-text-secondary"
          />
          <h2 className="text-sm font-semibold text-ds-text-primary">
            Slide editor
          </h2>
          <span className="text-xs text-ds-text-muted">
            {deck.slides.length} {deck.slides.length === 1 ? "slide" : "slides"}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Theme swatches */}
          <div className="hidden items-center gap-1.5 sm:flex">
            {THEME_OPTIONS.map((option) => {
              const active = deck.theme === option.value;
              return (
                <Tooltip key={option.value} label={option.label} side="bottom">
                  <button
                    type="button"
                    onClick={() => handleThemeChange(option.value)}
                    aria-label={`${option.label} theme`}
                    aria-pressed={active}
                    className={`h-6 w-6 rounded-full border transition-shadow ${
                      active
                        ? "ring-2 ring-ds-focus-ring ring-offset-1 ring-offset-ds-focus-offset"
                        : "border-ds-border-subtle"
                    } ${FOCUS_RING}`}
                    style={{ backgroundColor: option.color }}
                  />
                </Tooltip>
              );
            })}
          </div>

          <div
            className="hidden h-5 w-px bg-ds-border-subtle sm:block"
            aria-hidden="true"
          />

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className={`flex h-8 items-center rounded-ds-md bg-ds-control px-3 text-sm font-medium text-ds-control-text transition-colors hover:bg-ds-control-hover disabled:opacity-60 ${FOCUS_RING}`}
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close slide editor"
            className={`flex h-8 w-8 items-center justify-center rounded-ds-md border border-ds-border-subtle text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* ── Body: thumbnail rail · stage · inspector ────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* Slide thumbnail rail */}
        <aside className="flex w-56 shrink-0 flex-col border-r border-ds-border-subtle">
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <ul className="flex flex-col gap-2">
              {deck.slides.map((slide, index) => {
                const selected = index === safeSelected;
                const dropTarget =
                  dragOverIndex === index && dragIndex !== index;
                return (
                  <li
                    key={index}
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragOverIndex(index);
                    }}
                    onDragEnd={() => {
                      setDragIndex(null);
                      setDragOverIndex(null);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      handleDrop(index);
                    }}
                    className="group"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedIndex(index)}
                      aria-label={`Slide ${index + 1}`}
                      aria-current={selected}
                      className={`flex w-full items-center gap-2 rounded-ds-md border p-1.5 text-left transition-colors ${
                        selected
                          ? "border-ds-control bg-ds-state-hover"
                          : "border-transparent hover:bg-ds-state-hover"
                      } ${dropTarget ? "border-ds-control" : ""} ${FOCUS_RING}`}
                    >
                      <span className="flex w-4 shrink-0 flex-col items-center gap-1 text-xs tabular-nums text-ds-text-muted">
                        {index + 1}
                        <GripVertical
                          size={12}
                          aria-hidden="true"
                          className="cursor-grab opacity-0 transition-opacity group-hover:opacity-100"
                        />
                      </span>
                      <span className="pointer-events-none block aspect-video min-w-0 flex-1 overflow-hidden rounded-ds-sm border border-ds-border-subtle">
                        <SlideCanvas slide={slide} visuals={visuals} preview />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <button
              type="button"
              onClick={handleAdd}
              className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-ds-md border border-dashed border-ds-border-subtle px-3 py-2 text-sm font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
            >
              <Plus size={15} aria-hidden="true" />
              Add slide
            </button>
          </div>
        </aside>

        {/* Stage — large live preview of the selected slide */}
        <main className="flex min-w-0 flex-1 flex-col bg-ds-surface-sunken">
          <div className="flex min-h-0 flex-1 items-center justify-center p-6 sm:p-10">
            <div className="aspect-video w-full max-w-4xl overflow-hidden rounded-xl shadow-ds-overlay ring-1 ring-ds-border-subtle">
              {selectedSlide ? (
                <SlideCanvas slide={selectedSlide} visuals={visuals} />
              ) : null}
            </div>
          </div>

          {/* Slide navigation */}
          <div className="flex items-center justify-center gap-4 border-t border-ds-border-subtle px-4 py-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={safeSelected <= 0}
              aria-label="Previous slide"
              className={`flex h-8 w-8 items-center justify-center rounded-ds-md text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary disabled:opacity-40 ${FOCUS_RING}`}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <span className="text-xs tabular-nums text-ds-text-secondary">
              Slide {safeSelected + 1} of {deck.slides.length}
            </span>
            <button
              type="button"
              onClick={goNext}
              disabled={safeSelected >= deck.slides.length - 1}
              aria-label="Next slide"
              className={`flex h-8 w-8 items-center justify-center rounded-ds-md text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary disabled:opacity-40 ${FOCUS_RING}`}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        </main>

        {/* Inspector — edit the selected slide */}
        {selectedSlide ? (
          <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-ds-border-subtle">
            <div className="flex items-center justify-between border-b border-ds-border-subtle px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-ds-text-muted">
                Editing slide {safeSelected + 1}
              </p>
              <div className="flex items-center gap-1">
                <Tooltip label="Duplicate slide" side="bottom">
                  <button
                    type="button"
                    onClick={() => handleDuplicate(safeSelected)}
                    aria-label="Duplicate slide"
                    className={`flex h-7 w-7 items-center justify-center rounded-ds-sm text-ds-text-muted transition-colors hover:bg-ds-state-active hover:text-ds-text-primary ${FOCUS_RING}`}
                  >
                    <Copy size={14} aria-hidden="true" />
                  </button>
                </Tooltip>
                <Tooltip label="Delete slide" side="bottom">
                  <button
                    type="button"
                    onClick={() => handleRemove(safeSelected)}
                    disabled={deck.slides.length <= 1}
                    aria-label="Delete slide"
                    className={`flex h-7 w-7 items-center justify-center rounded-ds-sm text-ds-text-muted transition-colors hover:bg-ds-state-active hover:text-ds-text-primary disabled:opacity-40 ${FOCUS_RING}`}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </Tooltip>
              </div>
            </div>

            <div className="flex flex-col gap-4 px-4 py-4">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ds-text-secondary">
                  Title
                </span>
                <input
                  type="text"
                  value={selectedSlide.title}
                  onChange={(event) =>
                    handleTitleChange(safeSelected, event.target.value)
                  }
                  placeholder="Untitled slide"
                  className={`w-full rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-sm text-ds-text-primary outline-none ${FOCUS_RING}`}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ds-text-secondary">
                  Layout
                </span>
                <select
                  value={selectedSlide.layout}
                  onChange={(event) =>
                    handleLayoutChange(
                      safeSelected,
                      event.target.value as SlideLayout,
                    )
                  }
                  className={`w-full rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-sm text-ds-text-primary outline-none ${FOCUS_RING}`}
                >
                  {LAYOUT_OPTIONS.map((layout) => (
                    <option key={layout} value={layout}>
                      {layout}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ds-text-secondary">
                  Bullets (one per line)
                </span>
                <textarea
                  value={selectedSlide.bullets.join("\n")}
                  onChange={(event) =>
                    handleBulletsChange(safeSelected, event.target.value)
                  }
                  rows={5}
                  className={`w-full resize-y rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-sm text-ds-text-primary outline-none ${FOCUS_RING}`}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ds-text-secondary">
                  Notes
                </span>
                <p className="mb-1.5 text-xs text-ds-text-muted">
                  Tip: add a{" "}
                  <code className="rounded bg-ds-surface px-1 font-mono text-ds-text-secondary">
                    &gt; blockquote
                  </code>{" "}
                  in the document for speaker notes.
                </p>
                <textarea
                  value={selectedSlide.notes}
                  onChange={(event) =>
                    handleNotesChange(safeSelected, event.target.value)
                  }
                  rows={4}
                  className={`w-full resize-y rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-sm text-ds-text-primary outline-none ${FOCUS_RING}`}
                />
              </label>
            </div>
          </aside>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
