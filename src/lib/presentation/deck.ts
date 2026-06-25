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
  type SlideFormat,
} from "@/lib/presentation/slide-format";
export * from "./deck-core";
export * from "./deck-elements";
export * from "./deck-source-refs";
export * from "./deck-layouts-model";
export * from "./deck-ids";
export * from "./deck-derivation";
