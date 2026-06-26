"use client";

import { useCallback, useRef, useState } from "react";
import type { MarqueeState } from "@/lib/presentation/stage-resize";
import type { MarqueeRect } from "@/lib/presentation/marquee-select";

export interface UseStageMarqueeResult {
  marqueeRef: React.MutableRefObject<MarqueeState | null>;
  marqueeRectRef: React.MutableRefObject<MarqueeRect | null>;
  marqueeRect: MarqueeRect | null;
  setMarqueeRect: React.Dispatch<React.SetStateAction<MarqueeRect | null>>;
  beginMarquee: (
    startXPct: number,
    startYPct: number,
    additive: boolean,
  ) => void;
}

/**
 * Manages the rubber-band marquee selection state for the presentation stage.
 *
 * Owns `marqueeRef` (mutable gesture state), `marqueeRectRef` (latest
 * normalized rect for the pointer-up resolution), and the `marqueeRect`
 * render-state that drives the visible selection band. Exposes `beginMarquee`
 * which is called from the stage background pointer-down handler.
 *
 * The drag hook (`useStageDrag`) reads and clears the refs directly during
 * pointer-move and pointer-up so that the marquee update and commit paths run
 * without any additional indirection.
 */
export function useStageMarquee(): UseStageMarqueeResult {
  const marqueeRef = useRef<MarqueeState | null>(null);
  const marqueeRectRef = useRef<MarqueeRect | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);

  const beginMarquee = useCallback(
    (startXPct: number, startYPct: number, additive: boolean) => {
      marqueeRef.current = {
        startXPct,
        startYPct,
        additive,
        moved: false,
      };
      marqueeRectRef.current = { x: startXPct, y: startYPct, w: 0, h: 0 };
    },
    [],
  );

  return {
    marqueeRef,
    marqueeRectRef,
    marqueeRect,
    setMarqueeRect,
    beginMarquee,
  };
}
