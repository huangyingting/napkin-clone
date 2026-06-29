"use client";

/**
 * vNext public present viewer — renders a `DeckV7` on the
 * `/present/[shareId]` route through `resolveDeckRenderTree` +
 * `SlideCanvasVNext` without any v6 materialisation.
 *
 * Features:
 * - Keyboard navigation (ArrowRight/Space/PageDown → next, ArrowLeft/PageUp → prev)
 * - Click/tap zones + swipe navigation
 * - URL hash deep-linking (`#3` → slide 3, 1-based)
 * - Progress indicator and bar
 * - Auto-hiding HUD
 * - `embed` mode suppresses the top HUD chrome
 */

import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { DeckV7 } from "@/lib/presentation-vnext/schema";
import type { ThemePackageV1 } from "@/lib/presentation-vnext/theme-package-schema";
import { resolveThemePackage } from "@/lib/presentation-vnext/theme-package-registry";
import { fitAspectRatio } from "@/lib/presentation/stage-fit";
import {
  initialPublicHashSlideIndex,
  usePublicSlideHash,
} from "@/components/presentation/runtime/public-hash-plugin";
import {
  PRESENTATION_NAVIGATION_SHORTCUT_IDS,
  usePresentationClickZones,
  usePresentationKeyboardNavigation,
  useSlideBounds,
  useSlideNavigation,
  useSwipeNavigation,
  type PresentationShortcutAction,
} from "@/components/presentation/runtime/navigation";
import { MadeWithBadge } from "@/components/made-with-badge";
import { useDeckV7RenderTree } from "./use-deck-v7-render-tree";
import { SlideCanvasVNext } from "./slide-canvas";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PublicPresentViewerVNextProps {
  deck: DeckV7;
  /** Theme package for rendering. Defaults to the neutral package. */
  themePackage?: ThemePackageV1 | null;
  /** Document title — used for accessibility labelling. */
  title: string;
  /** When true, suppresses the top-bar HUD for chrome-free iframe embedding. */
  embed?: boolean;
  /** When true, shows the "Made with TextIQ" attribution badge. */
  showAttribution?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PublicPresentViewerVNext({
  deck,
  themePackage,
  title,
  embed = false,
  showAttribution = false,
}: PublicPresentViewerVNextProps): JSX.Element {
  // Resolve the theme package from the registry when no explicit package is
  // provided.  This surfaces a diagnostic for unknown package ids rather than
  // silently using neutral.
  const resolved = resolveThemePackage(deck.theme.packageId);
  const pkg = themePackage ?? resolved.pkg;
  const diagnostic = !themePackage ? resolved.diagnostic : undefined;
  useEffect(() => {
    if (diagnostic) {
      console.warn("[PublicPresentViewerVNext]", diagnostic);
    }
  }, [diagnostic]);
  const renderTree = useDeckV7RenderTree(deck, pkg);

  const total = renderTree?.slides.length ?? 0;

  const { currentIndex, goNext, goPrev, goFirst, goLast, progress } =
    useSlideNavigation(total, initialPublicHashSlideIndex(total));
  const { slideAreaRef, slideAreaBounds } = useSlideBounds<HTMLDivElement>();

  usePublicSlideHash(currentIndex);

  const handleShortcut = useCallback(
    (action: PresentationShortcutAction) => {
      switch (action) {
        case "next":
          goNext();
          break;
        case "previous":
          goPrev();
          break;
        case "first":
          goFirst();
          break;
        case "last":
          goLast();
          break;
      }
    },
    [goFirst, goLast, goNext, goPrev],
  );

  usePresentationKeyboardNavigation({
    shortcuts: PRESENTATION_NAVIGATION_SHORTCUT_IDS,
    onShortcut: handleShortcut,
  });

  const swipeHandlers = useSwipeNavigation({
    onNext: goNext,
    onPrevious: goPrev,
  });
  const clickZones = usePresentationClickZones({
    currentIndex,
    total,
    onNext: goNext,
    onPrevious: goPrev,
  });

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
    if (embed) return;
    scheduleHudHide();
    window.addEventListener("mousemove", resetHudTimer);
    window.addEventListener("keydown", resetHudTimer);
    return () => {
      window.removeEventListener("mousemove", resetHudTimer);
      window.removeEventListener("keydown", resetHudTimer);
      if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    };
  }, [embed, resetHudTimer, scheduleHudHide]);

  const canvas = renderTree?.canvas;
  const aspectRatio =
    canvas && canvas.width > 0 && canvas.height > 0
      ? canvas.width / canvas.height
      : 16 / 9;
  const fittedSlideSize = fitAspectRatio(slideAreaBounds, aspectRatio);

  if (!renderTree || total === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-ds-inverse-surface text-ds-inverse-text">
        <p className="text-sm opacity-60">No slides to display.</p>
      </div>
    );
  }

  const currentSlideTree = renderTree.slides[currentIndex];

  if (!currentSlideTree) {
    return (
      <div className="flex h-screen items-center justify-center bg-ds-inverse-surface text-ds-inverse-text">
        <p className="text-sm opacity-60">No slides to display.</p>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label={`Presentation: ${title}`}
      aria-live="polite"
      aria-atomic="true"
      className="relative flex h-screen w-full select-none flex-col overflow-hidden bg-ds-inverse-surface"
      onTouchStart={swipeHandlers.onTouchStart}
      onTouchEnd={swipeHandlers.onTouchEnd}
    >
      {/* Top HUD (suppressed in embed mode) */}
      {!embed && (
        <div
          aria-label="Presentation controls"
          className={`pointer-events-none absolute inset-x-0 top-0 z-raised flex items-center justify-between gap-4 px-4 py-3 transition-opacity duration-300 ${hudVisible ? "opacity-100" : "opacity-0"}`}
        >
          <div className="pointer-events-auto flex items-center gap-3">
            <span
              aria-label={`Slide ${progress.label}`}
              className="rounded-md bg-ds-inverse-surface-muted px-2 py-1 text-xs font-medium tabular-nums text-ds-inverse-muted backdrop-blur-sm"
            >
              {progress.label}
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
                className="h-full rounded-full bg-white/60 transition-all duration-300"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Slide canvas */}
      <div
        ref={slideAreaRef}
        className="relative min-h-0 flex-1 overflow-hidden"
      >
        <div className="flex h-full w-full items-center justify-center">
          <div
            className="overflow-hidden"
            style={{
              width: fittedSlideSize.width,
              height: fittedSlideSize.height,
            }}
          >
            <SlideCanvasVNext slide={currentSlideTree} canvas={canvas} />
          </div>
        </div>

        <button
          type="button"
          {...clickZones.previousZone}
          className="group absolute bottom-0 left-0 top-0 w-1/2 cursor-pointer bg-transparent focus-visible:outline-none disabled:cursor-default"
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
          {...clickZones.nextZone}
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

      {/* Bottom nav bar */}
      <div
        className={`pointer-events-none absolute bottom-4 left-1/2 z-raised flex -translate-x-1/2 items-center gap-3 transition-opacity duration-300 ${!embed && !hudVisible ? "opacity-0" : "opacity-100"}`}
      >
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-ds-inverse-surface-muted px-3 py-2 backdrop-blur-sm">
          <button
            type="button"
            {...clickZones.previousZone}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ds-inverse-muted transition-colors hover:bg-ds-inverse-state-hover hover:text-ds-inverse-text disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-inverse-focus"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <span className="text-xs font-medium tabular-nums text-ds-inverse-subtle">
            {progress.label}
          </span>
          <button
            type="button"
            {...clickZones.nextZone}
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
