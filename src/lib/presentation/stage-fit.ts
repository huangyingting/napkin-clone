/**
 * Pure, DOM-free geometry for fitting the slide-editor stage (issue #256).
 *
 * A slide is a fixed-format surface: text is rendered in `cqh` units against a
 * `container-type: size` box, so the stage MUST keep the deck's slide ratio.
 * Sizing the stage to the viewport aspect ratio instead made the stage a tall
 * portrait box on phones (e.g. 358×780 at 390px width), which exploded the
 * cqh-sized text so it overflowed/clipped.
 *
 * {@link fitAspectRatio} letterboxes a target aspect ratio into the available
 * bounds: it returns the largest box of that aspect ratio that fits, limited by
 * height on wide bounds and by width on tall/portrait bounds.
 */

import {
  DEFAULT_SLIDE_FORMAT,
  slideAspectRatio,
  slideFormatConfig,
  type SlideFormat,
} from "./slide-format";

export type Size = { width: number; height: number };

export type Rect = { left: number; top: number; width: number; height: number };

export type StageLayout = {
  /**
   * The slide box, in coordinates of the (padding-excluded) stage content area.
   * The slide is sized from the full stage area so overlay UI such as the
   * inspector cannot alter its fit or vertical letterboxing. When the overlay
   * inspector is open, the already-fitted slide may shift left within available
   * horizontal slack, but its width/height stay fixed.
   */
  slide: Rect;
  /** Size of the scroll-content wrapper; grows past the stage when zoomed in. */
  scrollContentSize: Size;
  /** Whether the slide overflows the stage and the stage must scroll. */
  needsScroll: boolean;
  /**
   * Desktop inspector placement. `top` is relative to the stage's positioned
   * ancestor (it already includes the stage's top padding); `height` matches
   * the slide and is clamped to the visible stage height.
   */
  inspectorPanel: { top: number; height: number };
};

/** The default slide aspect ratio (16:9 — matches LAYOUT_WIDE 13.333"×7.5"). */
export const SLIDE_ASPECT_RATIO = slideAspectRatio(DEFAULT_SLIDE_FORMAT);

/** Fallback size (in the slide's aspect ratio) when bounds are degenerate. */
export const DEFAULT_SCREEN_SIZE: Size = defaultScreenSize();

export function defaultScreenSize(format?: SlideFormat): Size {
  const config = slideFormatConfig(format);
  return { width: config.width, height: config.height };
}

/**
 * Return the largest box with the given `aspectRatio` (width / height) that
 * fits within `bounds`. Wide bounds are height-limited; tall/portrait bounds
 * are width-limited. Degenerate bounds fall back to {@link DEFAULT_SCREEN_SIZE}.
 */
export function fitAspectRatio(bounds: Size, aspectRatio: number): Size {
  if (bounds.width <= 0 || bounds.height <= 0) {
    return DEFAULT_SCREEN_SIZE;
  }

  const boundsAspect = bounds.width / bounds.height;
  if (boundsAspect > aspectRatio) {
    return { width: bounds.height * aspectRatio, height: bounds.height };
  }

  return { width: bounds.width, height: bounds.width / aspectRatio };
}

/**
 * Compute the single source-of-truth layout for the slide-editor stage.
 *
 * Design goals (one frame everything derives from):
 *   - The slide is letterboxed into the full stage bounds, then centered in
 *     that region. Overlay inspector open/close may shift the slide left, but
 *     never resizes it or alters the vertical letterboxing. The floating
 *     toolbar overlays the band above the slide without reserving layout space
 *     for itself.
 *   - The inspector panel's `top`/`height` are pinned to the slide so their
 *     Y-axes and heights match exactly.
 *   - Scroll content only grows past the stage when the (zoomed) slide does not
 *     fit, so 100% view never shows scrollbars.
 *
 * Pure and DOM-free so it can be unit-tested headlessly.
 */
/* node:coverage ignore next 19 */
/* The destructured parameter signature is exercised by layout tests; tsx maps those signature rows as residual. */
export function computeStageLayout({
  stageBounds,
  stagePaddingTop,
  aspectRatio,
  zoom,
  inspectorOpen = false,
  inspectorShiftX = 0,
}: {
  /** Inner stage size (after the stage container's own padding). */
  stageBounds: Size;
  /** The stage container's top padding, to offset the panel's parent origin. */
  stagePaddingTop: number;
  aspectRatio: number;
  zoom: number;
  /** Whether the overlay inspector is open. Does not affect slide sizing. */
  inspectorOpen?: boolean;
  /** Overlay width used only to shift the fitted slide left when possible. */
  inspectorShiftX?: number;
}): StageLayout {
  const width = Math.max(0, stageBounds.width);
  const height = Math.max(0, stageBounds.height);
  const safeZoom = zoom > 0 ? zoom : 1;

  const availWidth = Math.max(1, width);
  const availHeight = Math.max(1, height);

  const fitted = fitAspectRatio(
    { width: availWidth, height: availHeight },
    aspectRatio,
  );
  const slideWidth = fitted.width * safeZoom;
  const slideHeight = fitted.height * safeZoom;

  const leftMargin = Math.max(0, (availWidth - slideWidth) / 2);
  const topMargin = Math.max(0, (availHeight - slideHeight) / 2);
  const slideShift = inspectorOpen
    ? Math.min(leftMargin, Math.max(0, inspectorShiftX) / 2)
    : 0;
  const slideLeft = leftMargin - slideShift;
  const slideTop = topMargin;

  const scrollContentSize = {
    width: Math.max(width, slideLeft + slideWidth + leftMargin),
    height: Math.max(height, slideTop + slideHeight + topMargin),
  };
  const needsScroll =
    scrollContentSize.width > width + 1 ||
    scrollContentSize.height > height + 1;

  return {
    slide: {
      left: slideLeft,
      top: slideTop,
      width: slideWidth,
      height: slideHeight,
    },
    scrollContentSize,
    needsScroll,
    inspectorPanel: {
      top: stagePaddingTop + slideTop,
      height: Math.min(slideHeight, Math.max(0, height - slideTop)),
    },
  };
}

/** Minimum supported stage zoom factor (`1` === 100%). */
export const MIN_ZOOM = 0.25;

/** Maximum supported stage zoom factor (`1` === 100%). */
export const MAX_ZOOM = 2;

/** Discrete zoom presets (percent) offered in the bottom-dock zoom menu. */
export const ZOOM_PERCENT_PRESETS: readonly number[] = [
  25, 50, 75, 100, 125, 150, 175, 200,
];

/**
 * Clamp a stage zoom factor to the supported `[MIN_ZOOM, MAX_ZOOM]` range and
 * round to whole-percent precision so the slider, percent label, and presets
 * stay consistent. Non-finite input falls back to `1` (100%).
 */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) {
    return 1;
  }
  const rounded = Math.round(zoom * 100) / 100;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, rounded));
}

/** Convert a zoom factor (`1` === 100%) to a whole-number percent. */
export function zoomToPercent(zoom: number): number {
  return Math.round(zoom * 100);
}

/** Convert a whole-number percent to a clamped zoom factor. */
export function percentToZoom(percent: number): number {
  return clampZoom(percent / 100);
}
