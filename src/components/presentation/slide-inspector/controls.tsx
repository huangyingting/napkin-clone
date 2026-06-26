"use client";

export { TextPanel } from "./text-panel";
export { EffectsPanel } from "./effects-panel";
export { ElementArrangeControl, MultiSelectTools } from "./arrange-panel";
export { ElementEditor } from "./media-panel";
export { ColorOverride } from "./slide-panel";
export { SourceSummary } from "./source-panel";

// Re-export sub-components that were previously public — kept for any consumer
// that may import them from this barrel.
export {
  RichTextBox,
  IMAGE_FIT_MODE_OPTIONS,
  IMAGE_MASK_OPTIONS,
  ImageFitModeControl,
  ImageMaskControl,
  ImageCropControl,
  ARROW_OPTIONS,
  ConnectorElementEditor,
  VisualElementEditor,
  FontFamilyControl,
} from "./media-panel";
export {
  FIT_MODE_OPTIONS,
  FitModeControl,
  VERTICAL_ALIGN_OPTIONS,
  VerticalAlignControl,
  LINE_HEIGHT_OPTIONS,
  LineHeightControl,
  ParagraphSpacingControl,
  BulletGapControl,
  BulletIndentControl,
  ListTypeControl,
  NumberField,
  FONT_FAMILIES,
} from "./primitives";
export {
  TEXT_ROLE_OPTIONS,
  RoleSelectControl,
  OverrideHeader,
  FontSizeControl,
  InheritedFontControl,
  InheritedColorControl,
} from "./text-panel";
export { ElementEffectsControl, ElementOpacityControl } from "./effects-panel";
export { ToolBtn, ToolRow } from "./arrange-panel";
