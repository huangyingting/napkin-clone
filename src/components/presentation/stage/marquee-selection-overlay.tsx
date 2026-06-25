"use client";

import type { MarqueeRect } from "@/lib/presentation/marquee-select";
import { STAGE_CHROME_Z_INDEX } from "@/lib/presentation/stage-chrome";

const MARQUEE_THRESHOLD_PCT = 1;

export function MarqueeSelectionOverlay({
  rect,
}: {
  rect: MarqueeRect | null;
}) {
  if (
    !rect ||
    (rect.w < MARQUEE_THRESHOLD_PCT && rect.h < MARQUEE_THRESHOLD_PCT)
  ) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute border border-ds-accent bg-ds-accent/10"
      style={{
        left: `${rect.x}%`,
        top: `${rect.y}%`,
        width: `${rect.w}%`,
        height: `${rect.h}%`,
        zIndex: STAGE_CHROME_Z_INDEX.marquee,
      }}
    />
  );
}
