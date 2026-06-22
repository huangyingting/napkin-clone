"use client";

/**
 * In-app Present mode — fullscreen slide navigation with presenter tools.
 *
 * Renders a {@link Deck} (from {@link buildDeckFromBlocks}) one slide at a
 * time in a fullscreen overlay. Features:
 *
 * - Keyboard + click navigation: ArrowRight/Down/Space/PageDown → next;
 *   ArrowLeft/Up/PageUp → prev; Home → first; End → last; Esc → close / exit.
 * - Presenter tools: keyboard help (`?`), speaker notes (`N`), slide overview
 *   (`O`), timer (`T`), laser pointer (`L`), and fullscreen (`F`).
 * - Progress indicator ("3 / 12") and a progress bar.
 * - Presenter panel: current-slide speaker notes with next-slide preview.
 * - Visual slides rendered via {@link VisualRenderer}.
 * - Fullscreen API with vendor-prefixed fallbacks and a visible F11 hint.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type JSX,
  type ReactNode,
  type TouchEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Grid3x3,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";

import { FOCUS_RING } from "@/components/motion/control-styles";
import {
  DECK_THEMES,
  SlideCanvas,
} from "@/components/presentation/slide-canvas";
import type { Deck, Slide } from "@/lib/presentation/deck";
import {
  clampSlideIndex,
  formatProgress,
  resolveSwipeNavigation,
} from "@/lib/presentation/slide-helpers";
import { slideAspectRatio } from "@/lib/presentation/slide-format";
import {
  DEFAULT_SCREEN_SIZE,
  fitAspectRatio,
  type Size,
} from "@/lib/presentation/stage-fit";
import { isEditableTagName, isHelpShortcut } from "@/lib/shortcuts/match";
import type { Visual } from "@/lib/visual/schema";

type PresentShortcut = {
  keys: string[];
  description: string;
};

const PRESENT_MODE_SHORTCUTS: PresentShortcut[] = [
  { keys: ["→", "↓", "Space", "PgDn"], description: "Next slide" },
  { keys: ["←", "↑", "PgUp"], description: "Previous slide" },
  { keys: ["Home"], description: "First slide" },
  { keys: ["End"], description: "Last slide" },
  { keys: ["F"], description: "Toggle fullscreen" },
  { keys: ["Esc"], description: "Close overlay or exit presentation" },
  { keys: ["?"], description: "Toggle keyboard help" },
  { keys: ["N"], description: "Toggle speaker notes" },
  { keys: ["O"], description: "Toggle slide overview" },
  { keys: ["T"], description: "Toggle presenter timer" },
  { keys: ["L"], description: "Toggle laser pointer" },
];

type LegacyFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  mozRequestFullScreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};

type LegacyFullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  mozCancelFullScreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
};

function getFullscreenElement(doc: Document): Element | null {
  const legacyDoc = doc as LegacyFullscreenDocument;
  return (
    doc.fullscreenElement ??
    legacyDoc.webkitFullscreenElement ??
    legacyDoc.mozFullScreenElement ??
    legacyDoc.msFullscreenElement ??
    null
  );
}

async function requestBrowserFullscreen(): Promise<boolean> {
  const root = document.documentElement as LegacyFullscreenElement;

  try {
    if (root.requestFullscreen) {
      await root.requestFullscreen();
      return true;
    }
    if (root.webkitRequestFullscreen) {
      await Promise.resolve(root.webkitRequestFullscreen());
      return true;
    }
    if (root.mozRequestFullScreen) {
      await Promise.resolve(root.mozRequestFullScreen());
      return true;
    }
    if (root.msRequestFullscreen) {
      await Promise.resolve(root.msRequestFullscreen());
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

async function exitBrowserFullscreen(): Promise<boolean> {
  const legacyDoc = document as LegacyFullscreenDocument;

  try {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
      return true;
    }
    if (legacyDoc.webkitExitFullscreen) {
      await Promise.resolve(legacyDoc.webkitExitFullscreen());
      return true;
    }
    if (legacyDoc.mozCancelFullScreen) {
      await Promise.resolve(legacyDoc.mozCancelFullScreen());
      return true;
    }
    if (legacyDoc.msExitFullscreen) {
      await Promise.resolve(legacyDoc.msExitFullscreen());
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

function formatElapsedTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function ShortcutKeys({ keys }: { keys: string[] }): JSX.Element {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {keys.map((key, index) => (
        <kbd
          key={`${key}-${index}`}
          className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-ds-inverse-border-subtle bg-ds-inverse-control px-1.5 text-xs font-medium text-ds-inverse-text"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

function KeyboardHelpOverlay({
  onClose,
}: {
  onClose: () => void;
}): JSX.Element {
  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="present-mode-shortcuts-title"
        className="w-full max-w-3xl rounded-2xl border border-ds-inverse-border-subtle bg-ds-inverse-surface p-6 text-ds-inverse-text shadow-ds-overlay backdrop-blur-sm"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="present-mode-shortcuts-title"
              className="text-lg font-semibold"
            >
              Keyboard shortcuts
            </h2>
            <p className="mt-1 text-sm text-ds-inverse-muted">
              Presenter tools stay in-app only and never appear in the public
              viewer.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close keyboard shortcuts"
            onClick={onClose}
            className={`flex h-8 w-8 items-center justify-center rounded-full text-ds-inverse-muted transition-colors hover:bg-ds-inverse-control-hover hover:text-ds-inverse-text ${FOCUS_RING}`}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {PRESENT_MODE_SHORTCUTS.map((shortcut) => (
            <li
              key={shortcut.description}
              className="flex items-center justify-between gap-4 rounded-xl border border-ds-inverse-border-subtle bg-ds-inverse-control px-4 py-3"
            >
              <span className="text-sm text-ds-inverse-text">
                {shortcut.description}
              </span>
              <ShortcutKeys keys={shortcut.keys} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PresenterTimer({
  elapsedSeconds,
}: {
  elapsedSeconds: number;
}): JSX.Element {
  const formatted = formatElapsedTime(elapsedSeconds);
  return (
    <span
      aria-label={`Elapsed time ${formatted}`}
      className="rounded-md border border-ds-inverse-border-subtle bg-ds-inverse-surface-muted px-2 py-1 text-xs font-medium tabular-nums text-ds-inverse-text backdrop-blur-sm"
    >
      <span className="mr-1 text-ds-inverse-muted">Timer</span>
      {formatted}
    </span>
  );
}

function SlideOverviewPanel({
  slides,
  visuals,
  slideFormat,
  currentIndex,
  onJump,
  onClose,
}: {
  slides: Slide[];
  visuals: ReadonlyMap<string, Visual>;
  slideFormat: Deck["slideFormat"];
  currentIndex: number;
  onJump: (index: number) => void;
  onClose: () => void;
}): JSX.Element {
  const aspectRatio = slideAspectRatio(slideFormat);

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="present-mode-overview-title"
        className="flex max-h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-ds-inverse-border-subtle bg-ds-inverse-surface p-6 text-ds-inverse-text shadow-ds-overlay backdrop-blur-sm"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="present-mode-overview-title"
              className="text-lg font-semibold"
            >
              Slide overview
            </h2>
            <p className="mt-1 text-sm text-ds-inverse-muted">
              Click any slide to jump there.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close slide overview"
            onClick={onClose}
            className={`flex h-8 w-8 items-center justify-center rounded-full text-ds-inverse-muted transition-colors hover:bg-ds-inverse-control-hover hover:text-ds-inverse-text ${FOCUS_RING}`}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-6 overflow-y-auto pr-1">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {slides.map((slide, index) => {
              const isCurrent = index === currentIndex;
              const slideLabel =
                slide.title.trim() || `Untitled slide ${index + 1}`;
              const accent = (DECK_THEMES[slide.theme] ?? DECK_THEMES.default)
                .accentColor;
              return (
                <button
                  key={slide.id}
                  type="button"
                  aria-current={isCurrent ? "true" : undefined}
                  aria-label={`Jump to slide ${index + 1}${slide.title ? `, ${slide.title}` : ""}`}
                  onClick={() => onJump(index)}
                  className={`flex flex-col gap-3 rounded-xl border p-3 text-left transition-colors hover:border-ds-inverse-text hover:text-ds-inverse-text ${FOCUS_RING} ${
                    isCurrent
                      ? "border-ds-inverse-text bg-ds-inverse-control"
                      : "border-ds-inverse-border-subtle bg-ds-inverse-control"
                  }`}
                  style={
                    isCurrent ? { boxShadow: `0 0 0 1px ${accent}` } : undefined
                  }
                >
                  <div
                    className="overflow-hidden rounded-lg border border-ds-inverse-border-subtle bg-ds-inverse-surface"
                    style={{ aspectRatio }}
                  >
                    <SlideCanvas slide={slide} visuals={visuals} preview />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold uppercase tracking-widest text-ds-inverse-muted">
                        Slide {index + 1}
                      </span>
                      {isCurrent ? (
                        <span className="text-xs font-medium text-ds-inverse-text">
                          Current
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate text-sm font-medium text-ds-inverse-text">
                      {slideLabel}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function PresenterPanel({
  currentSlide,
  currentIndex,
  total,
  nextSlide,
  visuals,
  slideFormat,
}: {
  currentSlide: Slide;
  currentIndex: number;
  total: number;
  nextSlide: Slide | undefined;
  visuals: ReadonlyMap<string, Visual>;
  slideFormat: Deck["slideFormat"];
}): JSX.Element {
  const previewAspectRatio = slideAspectRatio(slideFormat);
  const slideLabel = currentSlide.title.trim() || `Slide ${currentIndex + 1}`;

  return (
    <div className="flex h-full min-h-0 gap-4 overflow-hidden bg-ds-stage px-6 py-4">
      <div className="flex min-w-0 flex-[1.4] flex-col">
        <p className="text-xs font-semibold uppercase tracking-widest text-ds-stage-muted">
          Current slide notes
        </p>
        <div className="mt-2 flex min-h-0 flex-1 flex-col rounded-lg border border-ds-stage-border bg-ds-stage-panel-muted p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-ds-stage-muted">
            Slide {currentIndex + 1} of {total}
          </p>
          <h2 className="mt-2 text-lg font-semibold text-ds-stage-text">
            {slideLabel}
          </h2>
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
            {currentSlide.notes ? (
              <p className="whitespace-pre-wrap text-base leading-7 text-ds-stage-text">
                {currentSlide.notes}
              </p>
            ) : (
              <p className="text-sm italic text-ds-stage-muted">
                No speaker notes for this slide.
              </p>
            )}
          </div>
        </div>
      </div>

      {nextSlide && (
        <div className="flex w-64 flex-shrink-0 flex-col">
          <p className="text-xs font-semibold uppercase tracking-widest text-ds-stage-muted">
            Up next
          </p>
          <div
            className="mt-2 min-h-0 flex-1 overflow-hidden rounded-lg border border-ds-stage-border"
            style={{ aspectRatio: previewAspectRatio }}
          >
            <div className="h-full w-full overflow-hidden">
              <SlideCanvas slide={nextSlide} visuals={visuals} preview />
            </div>
          </div>
          <p className="mt-2 truncate text-sm text-ds-stage-muted">
            {nextSlide.title.trim() || `Slide ${currentIndex + 2}`}
          </p>
        </div>
      )}
    </div>
  );
}

function HudButton({
  label,
  onClick,
  children,
  active,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${FOCUS_RING} ${
        active
          ? "border-ds-inverse-text bg-ds-inverse-control-hover text-ds-inverse-text"
          : "border-ds-inverse-border-subtle bg-ds-inverse-control text-ds-inverse-muted hover:bg-ds-inverse-control-hover hover:text-ds-inverse-text"
      }`}
    >
      {children}
    </button>
  );
}

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
 * - **First / Last**: Home / End
 * - **Exit**: Esc (also exits fullscreen)
 * - **Fullscreen**: F key or toolbar button
 * - **Speaker notes**: N key or toolbar button
 * - **Slide overview**: O key or toolbar button
 * - **Timer**: T key or toolbar button
 * - **Laser pointer**: L key or toolbar button
 * - **Keyboard help**: ? key or toolbar button
 */
export function PresentMode({
  deck,
  visuals,
  onClose,
}: PresentModeProps): JSX.Element {
  const slides = deck.slides;
  const total = slides.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [notesVisible, setNotesVisible] = useState(false);
  const [keyboardHelpOpen, setKeyboardHelpOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const [laserActive, setLaserActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenHintVisible, setFullscreenHintVisible] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);
  const [slideAreaBounds, setSlideAreaBounds] =
    useState<Size>(DEFAULT_SCREEN_SIZE);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [laserPosition, setLaserPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const slideAreaRef = useRef<HTMLDivElement>(null);
  const hudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presentationStartedAtRef = useRef<number | null>(null);
  const touchStartXRef = useRef<number | null>(null);

  const currentSlide = slides[clampSlideIndex(currentIndex, total)];
  const nextSlide =
    currentIndex + 1 < total ? slides[currentIndex + 1] : undefined;
  const progress = formatProgress(currentIndex, total);
  const progressPct = total > 1 ? (currentIndex / (total - 1)) * 100 : 100;
  const activeSlideAspectRatio = slideAspectRatio(deck.slideFormat);
  const fittedSlideSize = fitAspectRatio(
    slideAreaBounds,
    activeSlideAspectRatio,
  );
  const topHudVisible =
    hudVisible ||
    keyboardHelpOpen ||
    overviewOpen ||
    showTimer ||
    fullscreenHintVisible;
  const bottomHudVisible = hudVisible || keyboardHelpOpen || overviewOpen;

  const goNext = useCallback(() => {
    setCurrentIndex((index) => clampSlideIndex(index + 1, total));
  }, [total]);

  const goPrev = useCallback(() => {
    setCurrentIndex((index) => clampSlideIndex(index - 1, total));
  }, [total]);

  const handleTouchStart = useCallback((event: TouchEvent) => {
    touchStartXRef.current = event.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(
    (event: TouchEvent) => {
      if (touchStartXRef.current === null) return;
      const dx = event.changedTouches[0].clientX - touchStartXRef.current;
      touchStartXRef.current = null;
      const intent = resolveSwipeNavigation(dx);
      if (intent === "next") goNext();
      else if (intent === "prev") goPrev();
    },
    [goNext, goPrev],
  );

  const handleClose = useCallback(async () => {
    if (getFullscreenElement(document)) {
      await exitBrowserFullscreen();
    }
    onClose();
  }, [onClose]);

  const enterFullscreen = useCallback(async () => {
    const succeeded = await requestBrowserFullscreen();
    setFullscreenHintVisible(!succeeded);
    return succeeded;
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (getFullscreenElement(document)) {
      await exitBrowserFullscreen();
      setFullscreenHintVisible(false);
      return;
    }
    await enterFullscreen();
  }, [enterFullscreen]);

  useEffect(() => {
    const updateFullscreenState = () => {
      const active = !!getFullscreenElement(document);
      setIsFullscreen(active);
      if (active) {
        setFullscreenHintVisible(false);
      }
    };

    updateFullscreenState();
    const events = [
      "fullscreenchange",
      "webkitfullscreenchange",
      "mozfullscreenchange",
      "MSFullscreenChange",
    ];
    for (const eventName of events) {
      document.addEventListener(eventName, updateFullscreenState);
    }
    return () => {
      for (const eventName of events) {
        document.removeEventListener(eventName, updateFullscreenState);
      }
    };
  }, []);

  useEffect(() => {
    presentationStartedAtRef.current = Date.now();
    containerRef.current?.focus();

    let cancelled = false;
    const autoEnterFullscreen = async () => {
      const succeeded = await requestBrowserFullscreen();
      if (!cancelled) {
        setFullscreenHintVisible(!succeeded);
      }
    };

    void autoEnterFullscreen();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      root.style.overflow = previousRootOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

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

  useEffect(() => {
    const startedAt = presentationStartedAtRef.current ?? Date.now();
    presentationStartedAtRef.current = startedAt;
    const intervalId = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!laserActive) return;

    const handleMouseMove = (event: MouseEvent) => {
      setLaserPosition({ x: event.clientX, y: event.clientY });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [laserActive]);

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

  const closeKeyboardHelp = useCallback(() => {
    setKeyboardHelpOpen(false);
    resetHudTimer();
  }, [resetHudTimer]);

  const closeOverview = useCallback(() => {
    setOverviewOpen(false);
    resetHudTimer();
  }, [resetHudTimer]);

  const toggleKeyboardHelp = useCallback(() => {
    setOverviewOpen(false);
    setKeyboardHelpOpen((open) => !open);
    resetHudTimer();
  }, [resetHudTimer]);

  const toggleNotes = useCallback(() => {
    setNotesVisible((visible) => !visible);
    resetHudTimer();
  }, [resetHudTimer]);

  const toggleOverview = useCallback(() => {
    setKeyboardHelpOpen(false);
    setOverviewOpen((open) => !open);
    resetHudTimer();
  }, [resetHudTimer]);

  const toggleTimer = useCallback(() => {
    setShowTimer((visible) => !visible);
    resetHudTimer();
  }, [resetHudTimer]);

  const toggleLaser = useCallback(() => {
    setLaserActive((active) => {
      const next = !active;
      if (next) {
        setLaserPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });
      }
      return next;
    });
    resetHudTimer();
  }, [resetHudTimer]);

  const handleJumpToSlide = useCallback(
    (index: number) => {
      setCurrentIndex(clampSlideIndex(index, total));
      closeOverview();
    },
    [closeOverview, total],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        isEditableTagName(target?.tagName, target?.isContentEditable ?? false)
      ) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        if (keyboardHelpOpen) {
          closeKeyboardHelp();
          return;
        }
        if (overviewOpen) {
          closeOverview();
          return;
        }
        void handleClose();
        return;
      }

      if (isHelpShortcut(event)) {
        event.preventDefault();
        toggleKeyboardHelp();
        return;
      }

      if (keyboardHelpOpen) {
        return;
      }

      if (overviewOpen) {
        if (event.key === "o" || event.key === "O") {
          event.preventDefault();
          closeOverview();
        }
        return;
      }

      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
        case " ":
        case "PageDown":
          event.preventDefault();
          goNext();
          break;
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
          event.preventDefault();
          goPrev();
          break;
        case "Home":
          event.preventDefault();
          setCurrentIndex(0);
          break;
        case "End":
          event.preventDefault();
          setCurrentIndex(Math.max(0, total - 1));
          break;
        case "f":
        case "F":
          event.preventDefault();
          void toggleFullscreen();
          break;
        case "n":
        case "N":
          event.preventDefault();
          toggleNotes();
          break;
        case "o":
        case "O":
          event.preventDefault();
          toggleOverview();
          break;
        case "t":
        case "T":
          event.preventDefault();
          toggleTimer();
          break;
        case "l":
        case "L":
          event.preventDefault();
          toggleLaser();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    closeKeyboardHelp,
    closeOverview,
    goNext,
    goPrev,
    handleClose,
    keyboardHelpOpen,
    overviewOpen,
    toggleKeyboardHelp,
    toggleLaser,
    toggleNotes,
    toggleFullscreen,
    toggleOverview,
    toggleTimer,
    total,
  ]);

  if (!currentSlide) {
    return (
      <div className="fixed inset-0 z-modal flex items-center justify-center bg-ds-inverse-surface text-ds-inverse-text">
        <p>No slides to present.</p>
        <button
          type="button"
          onClick={() => void handleClose()}
          className="ml-4 underline"
        >
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
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div
        aria-label="Presentation controls"
        className={`pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 px-4 py-3 transition-opacity duration-300 ${topHudVisible ? "opacity-100" : "opacity-0"}`}
      >
        <div className="pointer-events-auto flex flex-wrap items-center gap-3">
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
          {showTimer ? (
            <PresenterTimer elapsedSeconds={elapsedSeconds} />
          ) : null}
          {fullscreenHintVisible ? (
            <span className="rounded-md border border-amber-400/40 bg-ds-inverse-surface-muted px-2 py-1 text-xs font-medium text-ds-inverse-text backdrop-blur-sm">
              Fullscreen unavailable — press F11
            </span>
          ) : null}
        </div>

        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <HudButton
            label={
              keyboardHelpOpen
                ? "Hide keyboard shortcuts"
                : "Show keyboard shortcuts"
            }
            active={keyboardHelpOpen}
            onClick={toggleKeyboardHelp}
          >
            <span className="text-sm font-semibold leading-none">?</span>
          </HudButton>
          <HudButton
            label={notesVisible ? "Hide speaker notes" : "Show speaker notes"}
            active={notesVisible}
            onClick={toggleNotes}
          >
            <FileText size={14} aria-hidden="true" />
          </HudButton>
          <HudButton
            label={overviewOpen ? "Hide slide overview" : "Show slide overview"}
            active={overviewOpen}
            onClick={toggleOverview}
          >
            <Grid3x3 size={14} aria-hidden="true" />
          </HudButton>
          <HudButton
            label={showTimer ? "Hide presenter timer" : "Show presenter timer"}
            active={showTimer}
            onClick={toggleTimer}
          >
            <span className="text-[11px] font-semibold leading-none">T</span>
          </HudButton>
          <HudButton
            label={
              laserActive ? "Disable laser pointer" : "Enable laser pointer"
            }
            active={laserActive}
            onClick={toggleLaser}
          >
            <span
              aria-hidden="true"
              className={`block h-2.5 w-2.5 rounded-full ${
                laserActive
                  ? "bg-red-400 shadow-[0_0_0_4px_rgba(248,113,113,0.25)]"
                  : "border border-current"
              }`}
            />
          </HudButton>
          <HudButton
            label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            active={isFullscreen}
            onClick={() => {
              resetHudTimer();
              void toggleFullscreen();
            }}
          >
            {isFullscreen ? (
              <Minimize2 size={14} aria-hidden="true" />
            ) : (
              <Maximize2 size={14} aria-hidden="true" />
            )}
          </HudButton>
          <HudButton
            label="Exit presentation"
            onClick={() => {
              resetHudTimer();
              void handleClose();
            }}
          >
            <X size={14} aria-hidden="true" />
          </HudButton>
        </div>
      </div>

      <div
        ref={slideAreaRef}
        className={`relative min-h-0 flex-1 overflow-hidden ${notesVisible ? "basis-[65%]" : ""}`}
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

        <button
          type="button"
          aria-label="Previous slide"
          onClick={goPrev}
          disabled={currentIndex === 0}
          className={`group absolute bottom-0 left-0 top-0 w-1/2 cursor-pointer bg-transparent ${FOCUS_RING} disabled:cursor-default`}
        >
          <span
            className={`absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-ds-inverse-control p-1.5 text-ds-inverse-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${currentIndex === 0 ? "hidden" : ""}`}
            aria-hidden="true"
          >
            <ChevronLeft size={20} />
          </span>
        </button>

        <button
          type="button"
          aria-label="Next slide"
          onClick={goNext}
          disabled={currentIndex === total - 1}
          className={`group absolute bottom-0 right-0 top-0 w-1/2 cursor-pointer bg-transparent ${FOCUS_RING} disabled:cursor-default`}
        >
          <span
            className={`absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-ds-inverse-control p-1.5 text-ds-inverse-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${currentIndex === total - 1 ? "hidden" : ""}`}
            aria-hidden="true"
          >
            <ChevronRight size={20} />
          </span>
        </button>
      </div>

      {notesVisible && (
        <div
          className="flex-shrink-0 border-t border-ds-inverse-border-subtle"
          style={{ height: "35%" }}
        >
          <PresenterPanel
            currentSlide={currentSlide}
            currentIndex={currentIndex}
            total={total}
            nextSlide={nextSlide}
            visuals={visuals}
            slideFormat={deck.slideFormat}
          />
        </div>
      )}

      <div
        className={`pointer-events-none absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 transition-opacity duration-300 ${bottomHudVisible ? "opacity-100" : "opacity-0"}`}
      >
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-ds-inverse-surface-muted px-3 py-2 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Previous slide"
            onClick={goPrev}
            disabled={currentIndex === 0}
            className={`flex h-7 w-7 items-center justify-center rounded-lg text-ds-inverse-muted transition-colors hover:bg-ds-inverse-state-hover hover:text-ds-inverse-text disabled:opacity-30 ${FOCUS_RING}`}
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
            className={`flex h-7 w-7 items-center justify-center rounded-lg text-ds-inverse-muted transition-colors hover:bg-ds-inverse-state-hover hover:text-ds-inverse-text disabled:opacity-30 ${FOCUS_RING}`}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {laserActive && laserPosition ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-20 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 shadow-[0_0_0_6px_rgba(239,68,68,0.25)]"
          style={{ left: laserPosition.x, top: laserPosition.y }}
        />
      ) : null}

      {overviewOpen ? (
        <SlideOverviewPanel
          slides={slides}
          visuals={visuals}
          slideFormat={deck.slideFormat}
          currentIndex={currentIndex}
          onJump={handleJumpToSlide}
          onClose={closeOverview}
        />
      ) : null}

      {keyboardHelpOpen ? (
        <KeyboardHelpOverlay onClose={closeKeyboardHelp} />
      ) : null}

      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {currentSlide.title
          ? `Slide ${currentIndex + 1} of ${total}: ${currentSlide.title}`
          : `Slide ${currentIndex + 1} of ${total}`}
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(overlay, document.body)
    : overlay;
}
