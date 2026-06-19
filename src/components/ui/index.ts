/**
 * `src/components/ui/` — the shared design-system primitives consumed by the
 * editor's contextual surfaces. All consume the `--ds-*` token layer
 * (owned by Mouse). Additive in Phase 0: not yet swapped into the live editor.
 */
export { Button, IconButton } from "./button";
export type {
  ButtonProps,
  ButtonSize,
  ButtonVariant,
  IconButtonProps,
} from "./button";

export { ColorPicker, DEFAULT_SWATCH_PRESETS } from "./color-picker";
export type { ColorPickerProps } from "./color-picker";

export { Divider } from "./divider";
export type { DividerProps } from "./divider";

export { FloatingSurface } from "./floating-surface";
export type { FloatingSurfaceProps } from "./floating-surface";

export { SegmentedControl } from "./segmented-control";
export type {
  SegmentedControlProps,
  SegmentedOption,
} from "./segmented-control";

export { Surface } from "./surface";
export type { SurfaceProps } from "./surface";

export { Swatch } from "./swatch";
export type { SwatchProps, SwatchSize } from "./swatch";

export { Tooltip } from "./tooltip";
export type { TooltipProps } from "./tooltip";

export {
  cx,
  ELEVATION,
  FOCUS_RING,
  RADIUS,
  SURFACE_BASE,
  type Elevation,
  type Radius,
} from "./tokens";
