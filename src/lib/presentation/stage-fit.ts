/**
 * Pure, DOM-free geometry for fitting the slide-editor stage (issue #256).
 *
 * A slide is a fixed 16:9 surface: text is rendered in `cqh` units against a
 * `container-type: size` box, so the stage MUST keep the slide's aspect ratio.
 * Sizing the stage to the viewport aspect ratio instead made the stage a tall
 * portrait box on phones (e.g. 358×780 at 390px width), which exploded the
 * cqh-sized text so it overflowed/clipped.
 *
 * {@link fitAspectRatio} letterboxes a target aspect ratio into the available
 * bounds: it returns the largest box of that aspect ratio that fits, limited by
 * height on wide bounds and by width on tall/portrait bounds.
 */

export type Size = { width: number; height: number };

/** The fixed slide aspect ratio (16:9 — matches LAYOUT_WIDE 13.333"×7.5"). */
export const SLIDE_ASPECT_RATIO = 16 / 9;

/** Fallback size (in the slide's aspect ratio) when bounds are degenerate. */
export const DEFAULT_SCREEN_SIZE: Size = { width: 16, height: 9 };

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
