"use client";

/**
 * In-app Present mode — fullscreen slide navigation with presenter view.
 *
 * Renders a {@link Deck} (from {@link buildDeckFromBlocks}) one slide at a
 * time in a fullscreen overlay. Features:
 *
 * - Keyboard + click navigation: ArrowRight/Down/Space/PageDown → next;
 *   ArrowLeft/Up/PageUp → prev; Home → first; End → last; Esc → exit.
 * - Progress indicator ("3 / 12") and a progress bar.
 * - Presenter view: toggle (P key or button) shows speaker notes and a
 *   next-slide preview below the main canvas.
 * - Renders title, section, content, media, and blank slide layouts.
 * - Visual slides rendered via {@link VisualRenderer}.
 * - Fullscreen API with graceful degradation.
 */

import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { createPortal } from "react-dom";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  LayoutPanelTop,
} from "lucide-react";

import type { Deck, Slide } from "@/lib/presentation/deck";
import type { Visual } from "@/lib/visual/schema";
import {
  DECK_THEMES,
  SlideCanvas,
} from "@/components/presentation/slide-canvas";
import {
  clampSlideIndex,
  formatProgress,
} from "@/lib/presentation/slide-helpers";
import { FOCUS_RING } from "@/components/motion/control-styles";

// ---------------------------------------------------------------------------
// Presenter notes panel
// ---------------------------------------------------------------------------

function PresenterPanel({
  currentSlide,
  nextSlide,
  visuals,
}: {
  currentSlide: Slide;
  nextSlide: Slide | undefined;
  visuals: ReadonlyMap<string, Visual>;
}): JSX.Element {
  return (
    <div className="flex h-full min-h-0 gap-4 overflow-hidden bg-zinc-950 px-6 py-4">
      {/* Notes */}
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Speaker notes
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
          {currentSlide.notes ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
              {currentSlide.notes}
            </p>
          ) : (
            <p className="text-sm italic text-zinc-600">No speaker notes.</p>
          )}
        </div>
      </div>

      {/* Next slide preview */}
      {nextSlide && (
        <div className="flex w-56 flex-shrink-0 flex-col">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Next
          </p>
          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-zinc-800">
            <div className="h-full w-full scale-100 overflow-hidden">
              <SlideCanvas slide={nextSlide} visuals={visuals} preview />
            </div>
          </div>
          {nextSlide.title && (
            <p className="mt-1.5 truncate text-xs text-zinc-500">
              {nextSlide.title}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HUD controls (progress, nav buttons, presenter toggle, fullscreen, close)
// ---------------------------------------------------------------------------

function HudButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/40 text-white/80 transition-colors hover:bg-black/60 hover:text-white ${FOCUS_RING}`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// PresentMode
// ---------------------------------------------------------------------------

export interface PresentModeProps {
  deck: Deck;
  /** Mapping of visualId → Visual for rendering visual slide content. */
  visuals: ReadonlyMap<string, Visual>;
  /** Called when the user exits presentation mode. */
  onClose: () => void;
}

/**
 * Full-screen presentation surface that renders {@link Deck} slides one at a
 * time. Mounts into a React portal over the entire viewport.
 *
 * Navigation:
 * - **Next**: ArrowRight, ArrowDown, Space, PageDown, or click the right half
 * - **Prev**: ArrowLeft, ArrowUp, PageUp, or click the left half
 * - **First**: Home
 * - **Last**: End
 * - **Exit**: Esc (also exits fullscreen)
 * - **Presenter toggle**: P key or toolbar button
 */
export function PresentMode({
  deck,
  visuals,
  onClose,
}: PresentModeProps): JSX.Element {
  const slides = deck.slides;
  const total = slides.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [presenterView, setPresenterView] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const hudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentSlide = slides[clampSlideIndex(currentIndex, total)];
  const nextSlide =
    currentIndex + 1 < total ? slides[currentIndex + 1] : undefined;
  const progress = formatProgress(currentIndex, total);
  const progressPct = total > 1 ? (currentIndex / (total - 1)) * 100 : 100;

  const goNext = useCallback(() => {
    setCurrentIndex((i) => clampSlideIndex(i + 1, total));
  }, [total]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => clampSlideIndex(i - 1, total));
  }, [total]);

  const handleClose = useCallback(async () => {
    // Await the fullscreen exit before unmounting so the browser finishes the
    // transition while the overlay is still mounted — otherwise the last painted
    // frame can linger as a stray dark band after the overlay is gone.
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // Fullscreen API not supported / already exiting — ignore.
      }
    }
    onClose();
  }, [onClose]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        const el = containerRef.current ?? document.documentElement;
        await el.requestFullscreen();
      }
    } catch {
      // Fullscreen API not supported — degrade gracefully.
    }
  }, []);

  // Track fullscreen state changes (user may press Esc to exit native fullscreen).
  useEffect(() => {
    const handler = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Auto-enter fullscreen on mount (best-effort).
  useEffect(() => {
    void toggleFullscreen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lock body scroll while presenting so the page underneath can't peek through
  // or shift; restore the previous value on unmount.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // Keyboard navigation.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if a form element has focus (let the user type in notes etc.)
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case " ":
        case "PageDown":
          e.preventDefault();
          goNext();
          break;
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
          e.preventDefault();
          goPrev();
          break;
        case "Home":
          e.preventDefault();
          setCurrentIndex(0);
          break;
        case "End":
          e.preventDefault();
          setCurrentIndex(total - 1);
          break;
        case "Escape":
          // Native fullscreen exits itself; we just close the overlay.
          handleClose();
          break;
        case "p":
        case "P":
          e.preventDefault();
          setPresenterView((v) => !v);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev, handleClose, total]);

  // Fade HUD after 3 s of inactivity; show again on any pointer move / key.
  const scheduleHudHide = useCallback(() => {
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    hudTimerRef.current = setTimeout(() => setHudVisible(false), 3000);
  }, []);

  const resetHudTimer = useCallback(() => {
    setHudVisible(true);
    scheduleHudHide();
  }, [scheduleHudHide]);

  useEffect(() => {
    scheduleHudHide();
    window.addEventListener("mousemove", resetHudTimer);
    window.addEventListener("keydown", resetHudTimer);
    return () => {
      window.removeEventListener("mousemove", resetHudTimer);
      window.removeEventListener("keydown", resetHudTimer);
      if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    };
  }, [resetHudTimer, scheduleHudHide]);

  if (!currentSlide) {
    return (
      <div className="fixed inset-0 z-modal flex items-center justify-center bg-black text-white">
        <p>No slides to present.</p>
        <button type="button" onClick={onClose} className="ml-4 underline">
          Close
        </button>
      </div>
    );
  }

  const tc = DECK_THEMES[currentSlide.theme] ?? DECK_THEMES.default;

  const overlay = (
    <div
      ref={containerRef}
      role="region"
      aria-label="Presentation"
      aria-live="polite"
      aria-atomic="true"
      className="fixed inset-0 z-modal flex flex-col select-none outline-none"
      style={{ backgroundColor: tc.bgColor }}
      tabIndex={-1}
    >
      {/* ------------------------------------------------------------------ */}
      {/* HUD — top bar (progress + controls)                                  */}
      {/* ------------------------------------------------------------------ */}
      <div
        aria-label="Presentation controls"
        className={`pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-4 px-4 py-3 transition-opacity duration-300 ${hudVisible ? "opacity-100" : "opacity-0"}`}
      >
        {/* Left: slide count + progress bar */}
        <div className="pointer-events-auto flex items-center gap-3">
          <span
            aria-label={`Slide ${progress}`}
            className="rounded-md bg-black/50 px-2 py-1 text-xs font-medium tabular-nums text-white/80 backdrop-blur-sm"
          >
            {progress}
          </span>
          {/* Horizontal progress bar */}
          <div
            role="progressbar"
            aria-valuenow={currentIndex + 1}
            aria-valuemin={1}
            aria-valuemax={total}
            aria-label="Presentation progress"
            className="h-1 w-28 overflow-hidden rounded-full bg-white/20"
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${progressPct}%`,
                backgroundColor: tc.accentColor,
              }}
            />
          </div>
        </div>

        {/* Right: presenter toggle, fullscreen, close */}
        <div className="pointer-events-auto flex items-center gap-2">
          <HudButton
            label={
              presenterView ? "Hide presenter view" : "Show presenter view"
            }
            onClick={() => setPresenterView((v) => !v)}
          >
            <LayoutPanelTop size={14} aria-hidden="true" />
          </HudButton>
          <HudButton
            label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            onClick={() => void toggleFullscreen()}
          >
            {isFullscreen ? (
              <Minimize2 size={14} aria-hidden="true" />
            ) : (
              <Maximize2 size={14} aria-hidden="true" />
            )}
          </HudButton>
          <HudButton label="Exit presentation" onClick={handleClose}>
            <X size={14} aria-hidden="true" />
          </HudButton>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Main slide area + left/right click zones for navigation              */}
      {/* ------------------------------------------------------------------ */}
      <div
        className={`relative min-h-0 flex-1 overflow-hidden ${presenterView ? "basis-[65%]" : ""}`}
      >
        {/* Slide content */}
        <div className="h-full w-full">
          <SlideCanvas slide={currentSlide} visuals={visuals} />
        </div>

        {/* Left click zone — previous */}
        <button
          type="button"
          aria-label="Previous slide"
          onClick={goPrev}
          disabled={currentIndex === 0}
          className={`group absolute bottom-0 left-0 top-0 w-1/2 cursor-pointer bg-transparent ${FOCUS_RING} disabled:cursor-default`}
        >
          <span
            className={`absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white/70 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${currentIndex === 0 ? "hidden" : ""}`}
            aria-hidden="true"
          >
            <ChevronLeft size={20} />
          </span>
        </button>

        {/* Right click zone — next */}
        <button
          type="button"
          aria-label="Next slide"
          onClick={goNext}
          disabled={currentIndex === total - 1}
          className={`group absolute bottom-0 right-0 top-0 w-1/2 cursor-pointer bg-transparent ${FOCUS_RING} disabled:cursor-default`}
        >
          <span
            className={`absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white/70 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${currentIndex === total - 1 ? "hidden" : ""}`}
            aria-hidden="true"
          >
            <ChevronRight size={20} />
          </span>
        </button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Presenter panel (notes + next-slide preview)                         */}
      {/* ------------------------------------------------------------------ */}
      {presenterView && (
        <div
          className="flex-shrink-0 border-t border-white/10"
          style={{ height: "35%" }}
        >
          <PresenterPanel
            currentSlide={currentSlide}
            nextSlide={nextSlide}
            visuals={visuals}
          />
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Bottom HUD — prev/next arrow buttons                                 */}
      {/* ------------------------------------------------------------------ */}
      <div
        className={`pointer-events-none absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 transition-opacity duration-300 ${hudVisible ? "opacity-100" : "opacity-0"}`}
      >
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-black/50 px-3 py-2 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Previous slide"
            onClick={goPrev}
            disabled={currentIndex === 0}
            className={`flex h-7 w-7 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 ${FOCUS_RING}`}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <span className="text-xs font-medium tabular-nums text-white/60">
            {progress}
          </span>
          <button
            type="button"
            aria-label="Next slide"
            onClick={goNext}
            disabled={currentIndex === total - 1}
            className={`flex h-7 w-7 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 ${FOCUS_RING}`}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Screen-reader-only slide title announcement */}
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {currentSlide.title
          ? `Slide ${currentIndex + 1} of ${total}: ${currentSlide.title}`
          : `Slide ${currentIndex + 1} of ${total}`}
      </div>
    </div>
  );

  // Portal to <body> so the fixed overlay escapes the editor's stacking/transform
  // context — this is what prevents a stray dark band lingering after exit.
  return typeof document !== "undefined"
    ? createPortal(overlay, document.body)
    : overlay;
}
