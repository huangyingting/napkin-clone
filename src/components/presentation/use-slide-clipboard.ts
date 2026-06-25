"use client";

import { useCallback, useRef } from "react";

import type { Deck, SlideElement } from "@/lib/presentation/deck";
import {
  cloneElementsForClipboard,
  pasteClipboardElementsIntoDeck,
} from "@/lib/presentation/slide-clipboard";

export function useSlideClipboard() {
  const clipboardRef = useRef<SlideElement[] | null>(null);
  const pasteCountRef = useRef(0);

  const copyElementsToClipboard = useCallback(
    (sourceDeck: Deck, slideIndex: number, ids: readonly string[]) => {
      const slideEls = sourceDeck.slides[slideIndex]?.elements ?? [];
      const copied = cloneElementsForClipboard(slideEls, ids);
      if (copied.length === 0) return false;
      clipboardRef.current = copied;
      pasteCountRef.current = 0;
      return true;
    },
    [],
  );

  const pasteClipboardElements = useCallback(
    (sourceDeck: Deck, slideIndex: number) => {
      const pasted = pasteClipboardElementsIntoDeck(
        sourceDeck,
        slideIndex,
        clipboardRef.current,
        pasteCountRef.current,
      );
      if (!pasted) return null;
      pasteCountRef.current = pasted.nextPasteCount;
      return { deck: pasted.deck, newIds: pasted.newIds };
    },
    [],
  );

  return { copyElementsToClipboard, pasteClipboardElements };
}
