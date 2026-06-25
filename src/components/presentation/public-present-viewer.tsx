"use client";

/**
 * Public, read-only presentation viewer rendered on the `/present/[shareId]`
 * and `/present/[shareId]/embed` routes.
 *
 * Features:
 * - Keyboard navigation: ArrowRight/Down/Space/PageDown → next;
 *   ArrowLeft/Up/PageUp → prev; Home → first; End → last.
 * - Click/tap navigation: left half → prev, right half → next.
 * - Swipe navigation: swipe left → next, swipe right → prev.
 * - URL hash deep-linking: `#3` opens slide 3 (1-based); hash updates on nav.
 * - Progress indicator and progress bar.
 * - `embed` mode: suppresses the top HUD chrome for chrome-free iframe use.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { Deck } from "@/lib/presentation/deck";
import {
  DEFAULT_SCREEN_SIZE,
  fitAspectRatio,
  type Size,
} from "@/lib/presentation/stage-fit";
import { slideAspectRatio } from "@/lib/presentation/slide-format";
import type { Visual } from "@/lib/visual/schema";
import {
  DECK_THEMES,
  SlideCanvas,
} from "@/components/presentation/slide-canvas";
import {
  clampSlideIndex,
  formatProgress,
  hashFromSlideIndex,
  resolveSwipeNavigation,
  slideIndexFromHash,
} from "@/lib/presentation/slide-helpers";
import { MadeWithBadge } from "@/components/made-with-badge";

// ---------------------------------------------------------------------------
// PublicPresentViewer
// ---------------------------------------------------------------------------

export interface PublicPresentViewerProps {
  deck: Deck;
  /**
   * Plain-object map of `visualId → Visual` serialised from the server.
   * Converted to a `ReadonlyMap` on first render.
   */
  visuals: Record<string, Visual>;
  /** Document title — used for accessibility labelling. */
  title: string;
  /** When true, suppresses the top-bar HUD for chrome-free iframe embedding. */
  embed?: boolean;
  /** When true, shows the "Made with TextIQ" attribution badge. */
  showAttribution?: boolean;
}

/**
 * Stateful presentation viewer for publicly shared documents.
 *
 * Accepts a pre-built {@link Deck} and a visual lookup map from the server
 * component so the page renders without any client-side data fetching.
 */
export function PublicPresentViewer({
  deck,
  visuals: visualsRecord,
  title,
  embed = false,
  showAttribution = false,
}: PublicPresentViewerProps): JSX.Element {
  const slides = deck.slides;
  const total = slides.length;

  // Stable Map derived from the plain-object prop.
  // visualsRecord comes from a server component and never changes after mount.
  const visuals = useMemo(
    () => new Map(Object.entries(visualsRecord)) as ReadonlyMap<string, Visual>,
    // intentionally stable — the server prop is serialised once and never mutates
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ---------------------------------------------------------------------------
  // Slide index — initialised from URL hash on mount
  // ---------------------------------------------------------------------------

  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    // During SSR `window` is not available → start at 0 (no hydration content).
    // On the client the initializer runs once and reads the URL hash directly.
    if (typeof window === "undefined") return 0;
    return slideIndexFromHash(window.location.hash, total);
  });
  const [slideAreaBounds, setSlideAreaBounds] =
    useState<Size>(DEFAULT_SCREEN_SIZE);
  const slideAreaRef = useRef<HTMLDivElement>(null);

  // Sync URL hash to the current slide whenever the index changes.
  useEffect(() => {
    window.history.replaceState(null, "", hashFromSlideIndex(currentIndex));
  }, [currentIndex]);

  useEffect(() => {
    const node = slideAreaRef.current;
    if (!node) {
      return;
    }
    const updateBounds = () => {
      const rect = node.getBoundingClientRect();
      setSlideAreaBounds({
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
      });
    };
    updateBounds();
    const observer = new ResizeObserver(updateBounds);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // ---------------------------------------------------------------------------
  // Navigation callbacks
  // ---------------------------------------------------------------------------

  const goNext = useCallback(() => {
    setCurrentIndex((i) => clampSlideIndex(i + 1, total));
  }, [total]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => clampSlideIndex(i - 1, total));
  }, [total]);

  // Keyboard navigation.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev, total]);

  // ---------------------------------------------------------------------------
  // Touch / swipe navigation
  // ---------------------------------------------------------------------------

  const touchStartXRef = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartXRef.current === null) return;
      const dx = e.changedTouches[0].clientX - touchStartXRef.current;
      touchStartXRef.current = null;
      const intent = resolveSwipeNavigation(dx);
      if (intent === "next") goNext();
      else if (intent === "prev") goPrev();
    },
    [goNext, goPrev],
  );

  // ---------------------------------------------------------------------------
  // HUD visibility (auto-hide after inactivity)
  // ---------------------------------------------------------------------------

  const [hudVisible, setHudVisible] = useState(true);
  const hudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHudHide = useCallback(() => {
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    hudTimerRef.current = setTimeout(() => setHudVisible(false), 3000);
  }, []);

  const resetHudTimer = useCallback(() => {
    setHudVisible(true);
    scheduleHudHide();
  }, [scheduleHudHide]);

  useEffect(() => {
    if (embed) return; // embed mode never auto-hides the minimal controls
    scheduleHudHide();
    window.addEventListener("mousemove", resetHudTimer);
    window.addEventListener("keydown", resetHudTimer);
    return () => {
      window.removeEventListener("mousemove", resetHudTimer);
      window.removeEventListener("keydown", resetHudTimer);
      if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    };
  }, [embed, resetHudTimer, scheduleHudHide]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (total === 0 || !slides[0]) {
    return (
      <div className="flex h-screen items-center justify-center bg-ds-inverse-surface text-ds-inverse-text">
        <p className="text-sm opacity-60">No slides to display.</p>
      </div>
    );
  }

  const currentSlide = slides[clampSlideIndex(currentIndex, total)];
  const tc = DECK_THEMES[currentSlide.theme] ?? DECK_THEMES.default;
  const progress = formatProgress(currentIndex, total);
  const progressPct = total > 1 ? (currentIndex / (total - 1)) * 100 : 100;
  const fittedSlideSize = fitAspectRatio(
    slideAreaBounds,
    slideAspectRatio(deck.slideFormat),
  );

  return (
    <div
      role="region"
      aria-label={`Presentation: ${title}`}
      aria-live="polite"
      aria-atomic="true"
      className="relative flex h-screen w-full select-none flex-col overflow-hidden"
      style={{ backgroundColor: tc.bgColor }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* -------------------------------------------------------------------- */}
      {/* Top HUD (suppressed in embed mode)                                   */}
      {/* -------------------------------------------------------------------- */}
      {!embed && (
        <div
          aria-label="Presentation controls"
          className={`pointer-events-none absolute inset-x-0 top-0 z-raised flex items-center justify-between gap-4 px-4 py-3 transition-opacity duration-300 ${hudVisible ? "opacity-100" : "opacity-0"}`}
        >
          {/* Progress indicator + bar */}
          <div className="pointer-events-auto flex items-center gap-3">
            <span
              aria-label={`Slide ${progress}`}
              className="rounded-md bg-ds-inverse-surface-muted px-2 py-1 text-xs font-medium tabular-nums text-ds-inverse-muted backdrop-blur-sm"
            >
              {progress}
            </span>
            <div
              role="progressbar"
              aria-valuenow={currentIndex + 1}
              aria-valuemin={1}
              aria-valuemax={total}
              aria-label="Presentation progress"
              className="h-1 w-28 overflow-hidden rounded-full bg-ds-inverse-border-subtle"
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
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* Slide canvas                                                          */}
      {/* -------------------------------------------------------------------- */}
      <div
        ref={slideAreaRef}
        className="relative min-h-0 flex-1 overflow-hidden"
      >
        <div className="flex h-full w-full items-center justify-center p-4">
          <div
            className="overflow-hidden shadow-ds-overlay"
            style={{
              width: fittedSlideSize.width,
              height: fittedSlideSize.height,
            }}
          >
            <SlideCanvas slide={currentSlide} visuals={visuals} />
          </div>
        </div>

        {/* Left click zone — previous slide */}
        <button
          type="button"
          aria-label="Previous slide"
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="group absolute bottom-0 left-0 top-0 w-1/2 cursor-pointer bg-transparent focus-visible:outline-none disabled:cursor-default"
        >
          <span
            className={`absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-ds-inverse-control p-1.5 text-ds-inverse-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${currentIndex === 0 ? "hidden" : ""}`}
            aria-hidden="true"
          >
            <ChevronLeft size={20} />
          </span>
        </button>

        {/* Right click zone — next slide */}
        <button
          type="button"
          aria-label="Next slide"
          onClick={goNext}
          disabled={currentIndex === total - 1}
          className="group absolute bottom-0 right-0 top-0 w-1/2 cursor-pointer bg-transparent focus-visible:outline-none disabled:cursor-default"
        >
          <span
            className={`absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-ds-inverse-control p-1.5 text-ds-inverse-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${currentIndex === total - 1 ? "hidden" : ""}`}
            aria-hidden="true"
          >
            <ChevronRight size={20} />
          </span>
        </button>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* Bottom nav bar (always visible — minimal chrome even in embed)        */}
      {/* -------------------------------------------------------------------- */}
      <div
        className={`pointer-events-none absolute bottom-4 left-1/2 z-raised flex -translate-x-1/2 items-center gap-3 transition-opacity duration-300 ${!embed && !hudVisible ? "opacity-0" : "opacity-100"}`}
      >
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-ds-inverse-surface-muted px-3 py-2 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Previous slide"
            onClick={goPrev}
            disabled={currentIndex === 0}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ds-inverse-muted transition-colors hover:bg-ds-inverse-state-hover hover:text-ds-inverse-text disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-inverse-focus"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <span className="text-xs font-medium tabular-nums text-ds-inverse-subtle">
            {progress}
          </span>
          <button
            type="button"
            aria-label="Next slide"
            onClick={goNext}
            disabled={currentIndex === total - 1}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ds-inverse-muted transition-colors hover:bg-ds-inverse-state-hover hover:text-ds-inverse-text disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-inverse-focus"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      <MadeWithBadge show={showAttribution} />
    </div>
  );
}
