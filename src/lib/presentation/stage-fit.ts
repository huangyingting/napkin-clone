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

/** Minimum supported stage zoom factor (`1` === 100%). */
export const MIN_ZOOM = 0.25;

/** Maximum supported stage zoom factor (`1` === 100%). */
export const MAX_ZOOM = 3;

/** Discrete zoom presets (percent) offered in the bottom-dock zoom menu. */
export const ZOOM_PERCENT_PRESETS: readonly number[] = [
  50, 75, 100, 125, 150, 200, 300,
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
