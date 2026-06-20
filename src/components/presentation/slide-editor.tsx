"use client";

/**
 * Slide Editor panel.
 *
 * A right-side drawer for editing a presentation {@link Deck}: reorder slides
 * (HTML5 drag-and-drop), add / duplicate / delete, edit titles, bullets, notes
 * and layout inline, and pick a deck theme. Every change flows through the pure
 * `deck-mutations` helpers and is reported via `onDeckChange`; persistence is
 * triggered by the Save button (`onSave`).
 *
 * Read/write only of the deck prop — it never touches Lexical/Yjs state.
 */

import { Copy, GripVertical, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { FOCUS_RING } from "@/components/motion/control-styles";
import type { Deck, DeckTheme, SlideLayout } from "@/lib/presentation/deck";
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
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

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

  return (
    <div
      role="dialog"
      aria-label="Slide editor"
      className="fixed inset-y-0 right-0 z-panel flex w-[420px] max-w-full flex-col border-l border-ds-border-subtle bg-ds-surface-raised shadow-ds-raised dark:bg-zinc-900"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-ds-border-subtle px-4 py-3">
        <h2 className="text-sm font-semibold text-ds-text-primary">
          Slide Editor
        </h2>
        <div className="flex items-center gap-2">
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
      </div>

      {/* Theme selector */}
      <div className="border-b border-ds-border-subtle px-4 py-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ds-text-muted">
          Theme
        </p>
        <div className="flex items-center gap-2">
          {THEME_OPTIONS.map((option) => {
            const active = deck.theme === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleThemeChange(option.value)}
                aria-label={`${option.label} theme`}
                aria-pressed={active}
                title={option.label}
                className={`h-7 w-7 rounded-full border transition-shadow ${
                  active
                    ? "ring-2 ring-ds-focus-ring ring-offset-1 ring-offset-ds-focus-offset"
                    : "border-ds-border-subtle"
                } ${FOCUS_RING}`}
                style={{ backgroundColor: option.color }}
              />
            );
          })}
        </div>
      </div>

      {/* Slide list */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <ul className="flex flex-col gap-1">
          {deck.slides.map((slide, index) => {
            const selected = index === safeSelected;
            const dropTarget = dragOverIndex === index && dragIndex !== index;
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
                className={`flex items-center gap-2 rounded-ds-md border px-2 py-2 transition-colors ${
                  selected
                    ? "border-ds-control bg-ds-state-hover"
                    : "border-transparent hover:bg-ds-state-hover"
                } ${dropTarget ? "border-ds-control" : ""}`}
              >
                <span
                  className="cursor-grab text-ds-text-muted"
                  aria-hidden="true"
                >
                  <GripVertical size={15} />
                </span>
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-ds-text-muted">
                  {index + 1}
                </span>
                <input
                  type="text"
                  value={slide.title}
                  placeholder="Untitled slide"
                  onChange={(event) =>
                    handleTitleChange(index, event.target.value)
                  }
                  onFocus={() => setSelectedIndex(index)}
                  aria-label={`Slide ${index + 1} title`}
                  className={`min-w-0 flex-1 rounded-ds-sm bg-transparent px-1 py-1 text-sm text-ds-text-primary outline-none focus:bg-ds-surface ${FOCUS_RING}`}
                />
                <select
                  value={slide.layout}
                  onChange={(event) =>
                    handleLayoutChange(index, event.target.value as SlideLayout)
                  }
                  aria-label={`Slide ${index + 1} layout`}
                  className={`shrink-0 rounded-ds-sm border border-ds-border-subtle bg-ds-surface px-1 py-1 text-xs text-ds-text-secondary ${FOCUS_RING}`}
                >
                  {LAYOUT_OPTIONS.map((layout) => (
                    <option key={layout} value={layout}>
                      {layout}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => handleDuplicate(index)}
                  aria-label={`Duplicate slide ${index + 1}`}
                  title="Duplicate slide"
                  className={`flex h-7 w-7 items-center justify-center rounded-ds-sm text-ds-text-muted transition-colors hover:bg-ds-state-active hover:text-ds-text-primary ${FOCUS_RING}`}
                >
                  <Copy size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  disabled={deck.slides.length <= 1}
                  aria-label={`Delete slide ${index + 1}`}
                  title="Delete slide"
                  className={`flex h-7 w-7 items-center justify-center rounded-ds-sm text-ds-text-muted transition-colors hover:bg-ds-state-active hover:text-ds-text-primary disabled:opacity-40 ${FOCUS_RING}`}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={handleAdd}
          className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-ds-md border border-dashed border-ds-border-subtle px-3 py-2 text-sm font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
        >
          <Plus size={15} aria-hidden="true" />
          Add slide
        </button>
      </div>

      {/* Selected slide editor */}
      {selectedSlide ? (
        <div className="max-h-[45%] shrink-0 overflow-y-auto border-t border-ds-border-subtle px-4 py-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ds-text-muted">
            Editing slide {safeSelected + 1}
          </p>

          <label className="mb-3 block">
            <span className="mb-1 block text-xs font-medium text-ds-text-secondary">
              Title
            </span>
            <input
              type="text"
              value={selectedSlide.title}
              onChange={(event) =>
                handleTitleChange(safeSelected, event.target.value)
              }
              className={`w-full rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-sm text-ds-text-primary outline-none ${FOCUS_RING}`}
            />
          </label>

          <label className="mb-3 block">
            <span className="mb-1 block text-xs font-medium text-ds-text-secondary">
              Bullets (one per line)
            </span>
            <textarea
              value={selectedSlide.bullets.join("\n")}
              onChange={(event) =>
                handleBulletsChange(safeSelected, event.target.value)
              }
              rows={4}
              className={`w-full resize-y rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-sm text-ds-text-primary outline-none ${FOCUS_RING}`}
            />
          </label>

          <label className="mb-3 block">
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
              rows={3}
              className={`w-full resize-y rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-sm text-ds-text-primary outline-none ${FOCUS_RING}`}
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
        </div>
      ) : null}
    </div>
  );
}
