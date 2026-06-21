/**
 * Shared, pure anchored-positioning helper for floating editor surfaces.
 *
 * DOM-free and framework-free: it takes plain rects / numbers and returns
 * `{ top, left, placement }` so it can be unit-tested headlessly and reused by
 * any float (the floating text toolbar, the visual context popover, …).
 *
 * Behaviour (mirrors the popular "flip / shift" pattern):
 *   - AUTO-FLIP — when the preferred side lacks room for the float, flip to the
 *     opposite side (only when the opposite side actually has more room).
 *   - SHIFT / CLAMP — along the cross-axis, keep the float within the viewport
 *     padding so it never spills off a viewport edge.
 *   - COLLISION AVOIDANCE — the main-axis coordinate is pinned to the resolved
 *     side (never clamped across the anchor), so the float never covers the
 *     anchor rect, even when neither side has full room.
 */

/** A plain rectangle snapshot (compatible with a frozen `DOMRect`). */
export type AnchorRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

/** The measured size of the floating element. */
type FloatSize = {
  width: number;
  height: number;
};

/** The size of the viewport the float must stay within. */
type ViewportSize = {
  width: number;
  height: number;
};

/** Which side of the anchor the float prefers to sit on. */
type Placement = "top" | "bottom" | "left" | "right";

export type AnchoredPositionInput = {
  /** Rect of the anchor (e.g. the text selection or the visual card). */
  anchor: AnchorRect;
  /** Measured size of the floating element. */
  float: FloatSize;
  /** Viewport bounds (typically `{ window.innerWidth, window.innerHeight }`). */
  viewport: ViewportSize;
  /** Preferred side. Defaults to `"top"`. */
  placement?: Placement;
  /** Gap (px) between the anchor edge and the float. Defaults to `8`. */
  gap?: number;
  /** Minimum inset (px) from the viewport edges. Defaults to `8`. */
  padding?: number;
};

export type AnchoredPosition = {
  /** Top coordinate (px) in viewport space. */
  top: number;
  /** Left coordinate (px) in viewport space. */
  left: number;
  /** The side the float was actually placed on (after any flip). */
  placement: Placement;
};

const OPPOSITE: Record<Placement, Placement> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

function isVertical(placement: Placement): boolean {
  return placement === "top" || placement === "bottom";
}

/** Clamp `value` into the inclusive `[min, max]` range. */
function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    // The float is larger than the available span — pin to the start edge.
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

/**
 * Available space (px) between the anchor and the viewport edge on `placement`'s
 * side, after accounting for the viewport padding.
 */
function spaceOn(
  placement: Placement,
  anchor: AnchorRect,
  viewport: ViewportSize,
  padding: number,
): number {
  switch (placement) {
    case "top":
      return anchor.top - padding;
    case "bottom":
      return viewport.height - anchor.bottom - padding;
    case "left":
      return anchor.left - padding;
    case "right":
      return viewport.width - anchor.right - padding;
  }
}

/**
 * Resolve the final side: keep the preferred side when it fits; otherwise flip
 * to the opposite side when that side has more room.
 */
function resolvePlacement(
  preferred: Placement,
  required: number,
  anchor: AnchorRect,
  viewport: ViewportSize,
  padding: number,
): Placement {
  const preferredSpace = spaceOn(preferred, anchor, viewport, padding);
  if (preferredSpace >= required) {
    return preferred;
  }
  const opposite = OPPOSITE[preferred];
  const oppositeSpace = spaceOn(opposite, anchor, viewport, padding);
  return oppositeSpace > preferredSpace ? opposite : preferred;
}

/**
 * Compute the position of a floating element anchored to a rect, with auto-flip,
 * cross-axis shift/clamp and anchor-collision avoidance. Pure: no DOM, no React.
 */
export function computeAnchoredPosition({
  anchor,
  float,
  viewport,
  placement = "top",
  gap = 8,
  padding = 8,
}: AnchoredPositionInput): AnchoredPosition {
  const vertical = isVertical(placement);
  const required = (vertical ? float.height : float.width) + gap;
  const resolved = resolvePlacement(
    placement,
    required,
    anchor,
    viewport,
    padding,
  );

  if (isVertical(resolved)) {
    // Main axis (vertical): pinned to the resolved side so it never overlaps
    // the anchor.
    const top =
      resolved === "top"
        ? anchor.top - gap - float.height
        : anchor.bottom + gap;
    // Cross axis (horizontal): centre over the anchor, then clamp to viewport.
    const centeredLeft = anchor.left + anchor.width / 2 - float.width / 2;
    const left = clamp(
      centeredLeft,
      padding,
      viewport.width - float.width - padding,
    );
    return { top, left, placement: resolved };
  }

  // Main axis (horizontal): pinned to the resolved side.
  const left =
    resolved === "left" ? anchor.left - gap - float.width : anchor.right + gap;
  // Cross axis (vertical): centre over the anchor, then clamp to viewport.
  const centeredTop = anchor.top + anchor.height / 2 - float.height / 2;
  const top = clamp(
    centeredTop,
    padding,
    viewport.height - float.height - padding,
  );
  return { top, left, placement: resolved };
}
