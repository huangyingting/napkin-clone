import { forwardRef, type HTMLAttributes } from "react";

import {
  cx,
  ELEVATION,
  RADIUS,
  SURFACE_BASE,
  type Elevation,
  type Radius,
} from "./tokens";

export type SurfaceProps = HTMLAttributes<HTMLDivElement> & {
  /** Elevation token (`--ds-shadow-*`). Defaults to `flat`. */
  elevation?: Elevation;
  /** Radius token (`--ds-radius-*`). Defaults to `lg`. */
  radius?: Radius;
  /** Render a 1px border using `--ds-border-subtle`. Defaults to `true`. */
  bordered?: boolean;
};

/**
 * The base surface shell every panel/popover composes from current `--ds-*`
 * tokens. It is a plain styled container — positioning and motion live in
 * {@link FloatingSurface}.
 */
export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(
  function Surface(
    { elevation = "flat", radius = "lg", bordered = true, className, ...rest },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className={cx(
          SURFACE_BASE,
          bordered && "border",
          RADIUS[radius],
          ELEVATION[elevation],
          className,
        )}
        {...rest}
      />
    );
  },
);
