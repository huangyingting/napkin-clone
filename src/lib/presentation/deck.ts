/**
 * Public deck model facade.
 *
 * Re-export focused schema modules while downstream imports migrate. Persisted
 * decks still use only CURRENT_DECK_SCHEMA_VERSION and Slide.elements[].
 */

export {
  DEFAULT_SLIDE_FORMAT,
  SLIDE_FORMAT_CONFIGS,
  SLIDE_FORMATS,
  resolveSlideFormat,
  slideAspectRatio,
  slideFormatConfig,
} from "@/lib/presentation/slide-format";
export type { SlideFormat } from "@/lib/presentation/slide-format";

export { CURRENT_DECK_SCHEMA_VERSION, DECK_THEMES } from "./deck-core";
export type { DeckTheme, Slide, Deck } from "./deck-core";

export {
  normalizeBulletItems,
  IMAGE_FIT_MODES,
  IMAGE_MASK_SHAPES,
  DEFAULT_VISUAL_BOX,
  buildVisualElement,
} from "./deck-elements";
export type {
  ElementBox,
  TextRun,
  TextFitMode,
  TextElementStyle,
  ShapeKind,
  ConnectorAnchor,
  ConnectorEndpoint,
  ConnectorPointFree,
  ConnectorPoint,
  ConnectorRouting,
  ConnectorElement,
  BaseElement,
  PlaceholderElement,
  TextElement,
  BulletItem,
  BulletsElement,
  VisualElement,
  ConnectorArrow,
  ElementAlign,
  ImageFitMode,
  ImageMaskShape,
  ImageCrop,
  ImageElement,
  ShapeElement,
  SlideElement,
} from "./deck-elements";

export {
  isSourceLinked,
  isSourceStale,
  unlinkSource,
  relinkSource,
  activeSourceRef,
} from "./deck-source-refs";
export type { SourceRef } from "./deck-source-refs";

export {
  SLIDE_LAYOUTS,
  PLACEHOLDER_TYPES,
  PLACEHOLDER_TYPE_LABELS,
  layoutHintForReusableLayout,
  defaultLayouts,
} from "./deck-layouts-model";
export type {
  SlideLayoutHint,
  PlaceholderType,
  SlideLayout,
} from "./deck-layouts-model";

export { makeElementId, makeSlideId } from "./deck-ids";

export {
  MAX_BULLETS,
  buildSlideElementsFromContent,
  buildDeckFromBlocks,
} from "./deck-derivation";
