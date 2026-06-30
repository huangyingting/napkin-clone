"use client";

import { useEffect } from "react";

import {
  hashFromSlideIndex,
  slideIndexFromHash,
} from "@/lib/presentation/slide-helpers";

export function initialPublicHashSlideIndex(total: number): number {
  if (typeof window === "undefined") return 0;
  return slideIndexFromHash(window.location.hash, total);
}

export function usePublicSlideHash(currentIndex: number): void {
  useEffect(() => {
    window.history.replaceState(null, "", hashFromSlideIndex(currentIndex));
  }, [currentIndex]);
}
