"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type TouchEvent,
} from "react";

import {
  clampSlideIndex,
  presentationProgress,
  resolveSwipeNavigation,
} from "@/lib/presentation/slide-helpers";
import { matchesShortcut } from "@/lib/shortcuts/catalog";
import { isEditableTagName } from "@/lib/shortcuts/match";
import { DEFAULT_SCREEN_SIZE, type Size } from "@/lib/presentation/stage-fit";

export type {
  PresentationShortcutAction,
  PresentationShortcutIdMap,
  PresentationShortcutRow,
} from "@/components/presentation/runtime/navigation-constants";
export { PRESENTATION_NAVIGATION_SHORTCUT_IDS } from "@/components/presentation/runtime/navigation-constants";
import type {
  PresentationShortcutAction,
  PresentationShortcutIdMap,
} from "@/components/presentation/runtime/navigation-constants";

export function useSlideNavigation(total: number, initialIndex = 0) {
  const [currentIndex, setCurrentIndex] = useState(() =>
    clampSlideIndex(initialIndex, total),
  );

  const goToSlide = useCallback(
    (index: number) => {
      setCurrentIndex(clampSlideIndex(index, total));
    },
    [total],
  );
  const goNext = useCallback(() => {
    setCurrentIndex((index) => clampSlideIndex(index + 1, total));
  }, [total]);
  const goPrev = useCallback(() => {
    setCurrentIndex((index) => clampSlideIndex(index - 1, total));
  }, [total]);
  const goFirst = useCallback(() => setCurrentIndex(0), []);
  const goLast = useCallback(() => {
    setCurrentIndex(Math.max(0, total - 1));
  }, [total]);
  const progress = useMemo(
    () => presentationProgress(currentIndex, total),
    [currentIndex, total],
  );

  return {
    currentIndex: clampSlideIndex(currentIndex, total),
    setCurrentIndex,
    goToSlide,
    goNext,
    goPrev,
    goFirst,
    goLast,
    progress,
  };
}

export function useSlideBounds<T extends HTMLElement>(): {
  slideAreaRef: RefObject<T | null>;
  slideAreaBounds: Size;
} {
  const slideAreaRef = useRef<T>(null);
  const [slideAreaBounds, setSlideAreaBounds] =
    useState<Size>(DEFAULT_SCREEN_SIZE);

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

  return { slideAreaRef, slideAreaBounds };
}

export function useSwipeNavigation({
  onNext,
  onPrevious,
}: {
  onNext: () => void;
  onPrevious: () => void;
}): {
  onTouchStart: (event: TouchEvent) => void;
  onTouchEnd: (event: TouchEvent) => void;
} {
  const touchStartXRef = useRef<number | null>(null);

  const onTouchStart = useCallback((event: TouchEvent) => {
    touchStartXRef.current = event.touches[0].clientX;
  }, []);

  const onTouchEnd = useCallback(
    (event: TouchEvent) => {
      if (touchStartXRef.current === null) return;
      const dx = event.changedTouches[0].clientX - touchStartXRef.current;
      touchStartXRef.current = null;
      const intent = resolveSwipeNavigation(dx);
      if (intent === "next") onNext();
      else if (intent === "prev") onPrevious();
    },
    [onNext, onPrevious],
  );

  return { onTouchStart, onTouchEnd };
}

export function usePresentationClickZones({
  currentIndex,
  total,
  onNext,
  onPrevious,
}: {
  currentIndex: number;
  total: number;
  onNext: () => void;
  onPrevious: () => void;
}) {
  return {
    previousZone: {
      "aria-label": "Previous slide",
      disabled: currentIndex === 0,
      onClick: onPrevious,
    },
    nextZone: {
      "aria-label": "Next slide",
      disabled: currentIndex === total - 1,
      onClick: onNext,
    },
  };
}

export function usePresentationKeyboardNavigation({
  shortcuts,
  onShortcut,
}: {
  shortcuts: PresentationShortcutIdMap;
  onShortcut: (
    action: PresentationShortcutAction,
    event: KeyboardEvent,
  ) => boolean | void;
}): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        isEditableTagName(target?.tagName, target?.isContentEditable ?? false)
      ) {
        return;
      }

      for (const [action, id] of Object.entries(shortcuts)) {
        if (matchesShortcut(id, event)) {
          const handled = onShortcut(
            action as PresentationShortcutAction,
            event,
          );
          if (handled === false) {
            return;
          }
          event.preventDefault();
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onShortcut, shortcuts]);
}
