"use client";

import { useRef, useState } from "react";

import type { MarqueeRect } from "@/lib/presentation/marquee-select";

export function useStageMarqueeSelection<TMarqueeState>() {
  const marqueeRef = useRef<TMarqueeState | null>(null);
  const marqueeRectRef = useRef<MarqueeRect | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);

  return { marqueeRef, marqueeRectRef, marqueeRect, setMarqueeRect };
}
