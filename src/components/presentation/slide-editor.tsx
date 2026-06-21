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
  GripVertical,
  Image as ImageIcon,
  LayoutPanelLeft,
  List,
  Plus,
  Shapes,
  Type,
  Wand2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { FOCUS_RING } from "@/components/motion/control-styles";
import {
  DECK_THEMES,
  SlideCanvas,
} from "@/components/presentation/slide-canvas";
import {
  SlideInspector,
  type AddElementKind,
} from "@/components/presentation/slide-inspector";
import { SlideStageEditor } from "@/components/presentation/slide-stage-editor";
import { Tooltip } from "@/components/ui";
import {
  makeElementId,
  type Deck,
  type DeckTheme,
  type SlideElement,
  type SlideLayout,
} from "@/lib/presentation/deck";
import type { Visual } from "@/lib/visual/schema";
import {
  addElement,
  addSlide,
  bringElementToFront,
  duplicateSlide,
  materializeSlide,
  removeElement,
  removeSlide,
  reorderSlides,
  sendElementToBack,
  setDeckTheme,
  setSlideAccent,
  setSlideBackground,
  updateElement,
  updateSlide,
  type DistributiveOmit,
  type ElementPatch,
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

type Size = { width: number; height: number };

const DEFAULT_SCREEN_SIZE: Size = { width: 16, height: 9 };

function getViewportSize(): Size {
  if (typeof window === "undefined") {
    return DEFAULT_SCREEN_SIZE;
  }
  return {
    width: Math.max(1, window.innerWidth),
    height: Math.max(1, window.innerHeight),
  };
}

function fitAspectRatio(bounds: Size, aspectRatio: number): Size {
  if (bounds.width <= 0 || bounds.height <= 0) {
    return DEFAULT_SCREEN_SIZE;
  }

  const boundsAspect = bounds.width / bounds.height;
  if (boundsAspect > aspectRatio) {
    return { width: bounds.height * aspectRatio, height: bounds.height };
  }

  return { width: bounds.width, height: bounds.width / aspectRatio };
}

/** Builds a freshly-positioned element for the "Add" buttons. */
function buildDefaultElement(
  kind: AddElementKind,
  accent: string,
  id: string,
): DistributiveOmit<SlideElement, "id" | "zIndex"> & { id: string } {
  switch (kind) {
    case "text":
      return {
        id,
        kind: "text",
        role: "body",
        text: "New text",
        box: { x: 20, y: 40, w: 60, h: 16 },
        style: { fontSize: 5, bold: false, italic: false, align: "left" },
      };
    case "bullets":
      return {
        id,
        kind: "bullets",
        bullets: ["First point", "Second point"],
        box: { x: 14, y: 28, w: 72, h: 48 },
        style: { fontSize: 4.5, bold: false, italic: false, align: "left" },
      };
    case "image":
      return {
        id,
        kind: "image",
        src: "",
        alt: "",
        box: { x: 25, y: 22, w: 50, h: 56 },
      };
    case "shape":
      return {
        id,
        kind: "shape",
        shape: "rect",
        color: accent,
        box: { x: 30, y: 34, w: 40, h: 32 },
      };
  }
}

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
  const [viewportSize, setViewportSize] = useState<Size>(getViewportSize);
  const [stageBounds, setStageBounds] = useState<Size>(DEFAULT_SCREEN_SIZE);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(
    null,
  );
  const stageRef = useRef<HTMLDivElement>(null);

  // Keep the selection within bounds as slides are added/removed.
  const safeSelected = Math.min(selectedIndex, deck.slides.length - 1);
  const selectedSlide = deck.slides[safeSelected];
  const selectedTheme = selectedSlide
    ? (DECK_THEMES[selectedSlide.theme] ?? DECK_THEMES.default)
    : DECK_THEMES.default;
  // A selection is only valid while its element exists on the active slide, so
  // switching slides (or deleting an element) implicitly clears it — no effect
  // needed.
  const effectiveSelectedElementId =
    selectedElementId != null &&
    (selectedSlide?.elements?.some((el) => el.id === selectedElementId) ??
      false)
      ? selectedElementId
      : null;
  const viewportAspectRatio = viewportSize.width / viewportSize.height;
  const fittedStageSize = fitAspectRatio(stageBounds, viewportAspectRatio);

  useEffect(() => {
    function onResize() {
      setViewportSize(getViewportSize());
    }

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) {
      return;
    }

    const updateBounds = () => {
      const rect = node.getBoundingClientRect();
      setStageBounds({
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
      });
    };

    updateBounds();
    const observer = new ResizeObserver(updateBounds);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (event.key === "Escape") {
        event.preventDefault();
        if (effectiveSelectedElementId) {
          setSelectedElementId(null);
        } else {
          onClose();
        }
        return;
      }

      if (typing) {
        return;
      }

      // With an element selected, arrow keys nudge it and Delete removes it.
      const slide = deck.slides[safeSelected];
      const selected =
        effectiveSelectedElementId && slide?.elements
          ? slide.elements.find((el) => el.id === effectiveSelectedElementId)
          : undefined;

      if (selected) {
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          onDeckChange(removeElement(deck, safeSelected, selected.id));
          setSelectedElementId(null);
          return;
        }
        const step = event.shiftKey ? 5 : 1;
        let dx = 0;
        let dy = 0;
        if (event.key === "ArrowLeft") dx = -step;
        else if (event.key === "ArrowRight") dx = step;
        else if (event.key === "ArrowUp") dy = -step;
        else if (event.key === "ArrowDown") dy = step;
        if (dx !== 0 || dy !== 0) {
          event.preventDefault();
          const { w, h } = selected.box;
          const x = Math.max(0, Math.min(100 - w, selected.box.x + dx));
          const y = Math.max(0, Math.min(100 - h, selected.box.y + dy));
          onDeckChange(
            updateElement(deck, safeSelected, selected.id, {
              box: { ...selected.box, x, y },
            }),
          );
          return;
        }
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
  }, [onClose, deck, safeSelected, effectiveSelectedElementId, onDeckChange]);

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

  const accentForSelected = selectedSlide?.accent ?? selectedTheme.accentColor;

  const handleUpdateElement = useCallback(
    (id: string, patch: ElementPatch) => {
      onDeckChange(updateElement(deck, safeSelected, id, patch));
    },
    [deck, onDeckChange, safeSelected],
  );

  const handleRemoveElement = useCallback(
    (id: string) => {
      onDeckChange(removeElement(deck, safeSelected, id));
      setSelectedElementId((current) => (current === id ? null : current));
    },
    [deck, onDeckChange, safeSelected],
  );

  const handleBringToFront = useCallback(
    (id: string) => {
      onDeckChange(bringElementToFront(deck, safeSelected, id));
    },
    [deck, onDeckChange, safeSelected],
  );

  const handleSendToBack = useCallback(
    (id: string) => {
      onDeckChange(sendElementToBack(deck, safeSelected, id));
    },
    [deck, onDeckChange, safeSelected],
  );

  const handleMaterialize = useCallback(() => {
    onDeckChange(materializeSlide(deck, safeSelected));
  }, [deck, onDeckChange, safeSelected]);

  const handleAddElement = useCallback(
    (kind: AddElementKind) => {
      const id = makeElementId();
      const element = buildDefaultElement(kind, accentForSelected, id);
      onDeckChange(addElement(deck, safeSelected, element));
      setSelectedElementId(id);
    },
    [accentForSelected, deck, onDeckChange, safeSelected],
  );

  const handleBackgroundChange = useCallback(
    (color: string | undefined) => {
      onDeckChange(setSlideBackground(deck, safeSelected, color));
    },
    [deck, onDeckChange, safeSelected],
  );

  const handleAccentChange = useCallback(
    (color: string | undefined) => {
      onDeckChange(setSlideAccent(deck, safeSelected, color));
    },
    [deck, onDeckChange, safeSelected],
  );

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
        <main
          className="flex min-w-0 flex-1 flex-col"
          style={{ backgroundColor: selectedTheme.bgColor }}
        >
          {/* On-stage element toolbar */}
          {selectedSlide ? (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-ds-border-subtle bg-ds-surface-base px-3 py-2">
              {selectedSlide.elements && selectedSlide.elements.length > 0 ? (
                <>
                  <span className="mr-0.5 text-xs font-medium text-ds-text-muted">
                    Add
                  </span>
                  <StageAddButton
                    icon={<Type size={14} aria-hidden="true" />}
                    label="Text"
                    onClick={() => handleAddElement("text")}
                  />
                  <StageAddButton
                    icon={<List size={14} aria-hidden="true" />}
                    label="Bullets"
                    onClick={() => handleAddElement("bullets")}
                  />
                  <StageAddButton
                    icon={<ImageIcon size={14} aria-hidden="true" />}
                    label="Image"
                    onClick={() => handleAddElement("image")}
                  />
                  <StageAddButton
                    icon={<Shapes size={14} aria-hidden="true" />}
                    label="Shape"
                    onClick={() => handleAddElement("shape")}
                  />
                  <div
                    className="mx-1 hidden h-5 w-px bg-ds-border-subtle sm:block"
                    aria-hidden="true"
                  />
                  <span className="hidden text-xs text-ds-text-muted lg:inline">
                    Double-click text to edit · drag to move · handles to resize
                  </span>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleMaterialize}
                    className={`flex items-center gap-1.5 rounded-ds-md bg-ds-control px-3 py-1.5 text-sm font-medium text-ds-control-text transition-colors hover:bg-ds-control-hover ${FOCUS_RING}`}
                  >
                    <Wand2 size={14} aria-hidden="true" />
                    Customize layout
                  </button>
                  <span className="text-xs text-ds-text-muted">
                    Unlock drag-and-drop text, images, and shapes on this slide.
                  </span>
                </>
              )}
            </div>
          ) : null}

          <div
            ref={stageRef}
            className="flex min-h-0 flex-1 items-center justify-center p-4 sm:p-6"
          >
            {selectedSlide ? (
              <SlideStageEditor
                slide={selectedSlide}
                visuals={visuals}
                width={fittedStageSize.width}
                height={fittedStageSize.height}
                selectedElementId={effectiveSelectedElementId}
                onSelectElement={setSelectedElementId}
                onUpdateElement={handleUpdateElement}
                onRemoveElement={handleRemoveElement}
                onBringToFront={handleBringToFront}
                onSendToBack={handleSendToBack}
              />
            ) : null}
          </div>

          {/* Slide navigation */}
          <div className="flex items-center justify-center gap-4 border-t border-ds-border-subtle bg-ds-surface-base px-4 py-2">
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
          <SlideInspector
            slide={selectedSlide}
            slideIndex={safeSelected}
            visuals={visuals}
            selectedElementId={effectiveSelectedElementId}
            onSelectElement={setSelectedElementId}
            canDelete={deck.slides.length > 1}
            onDuplicateSlide={() => handleDuplicate(safeSelected)}
            onRemoveSlide={() => handleRemove(safeSelected)}
            onTitleChange={(title) => handleTitleChange(safeSelected, title)}
            onLayoutChange={(layout) =>
              handleLayoutChange(safeSelected, layout)
            }
            onBulletsChange={(value) =>
              handleBulletsChange(safeSelected, value)
            }
            onMaterialize={handleMaterialize}
            onAddElement={handleAddElement}
            onUpdateElement={handleUpdateElement}
            onRemoveElement={handleRemoveElement}
            onBringToFront={handleBringToFront}
            onSendToBack={handleSendToBack}
            onBackgroundChange={handleBackgroundChange}
            onAccentChange={handleAccentChange}
            onNotesChange={(notes) => handleNotesChange(safeSelected, notes)}
          />
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function StageAddButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 rounded-ds-sm border border-ds-border-subtle bg-ds-surface-raised px-2 py-1 text-xs font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
    >
      {icon}
      {label}
    </button>
  );
}
