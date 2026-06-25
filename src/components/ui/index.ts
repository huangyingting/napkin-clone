/**
 * `src/components/ui/` — the shared design-system primitives consumed by the
 * editor's contextual surfaces. All consume the `--ds-*` token layer.
 */
export { Button, IconButton } from "./button";

export {
  FieldRow,
  IconActionCluster,
  PanelSurface,
  PopoverSection,
  StatusPill,
  ToolbarButton,
} from "./chrome";
export type {
  FieldRowProps,
  IconActionClusterProps,
  PanelSurfaceProps,
  PopoverSectionProps,
  StatusPillProps,
  StatusPillTone,
  ToolbarButtonProps,
  ToolbarButtonShape,
  ToolbarButtonSize,
  ToolbarButtonTone,
} from "./chrome";

export { ColorPicker, DEFAULT_SWATCH_PRESETS } from "./color-picker";

export { Divider } from "./divider";

export { Dialog } from "./dialog";

export { FloatingSurface } from "./floating-surface";

export { SegmentedControl } from "./segmented-control";
export type { SegmentedOption } from "./segmented-control";

export { Surface } from "./surface";

export { Swatch } from "./swatch";
export type { SwatchSize } from "./swatch";

export { Tooltip } from "./tooltip";

export { Popover } from "./popover";

export {
  cx,
  CONTROL_TRANSITION,
  EMPTY_STATE_CHROME,
  FIELD_CONTROL,
  FOCUS_RING,
  GUTTER_BUTTON,
  MENU_CHROME,
  MENU_ITEM,
  PANEL_CHROME,
  TOOLBAR_BUTTON_CHROME,
} from "./tokens";
