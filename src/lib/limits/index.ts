/* node:coverage disable */
/* Limits barrel re-exports are facade wiring covered by consumers. */
export {
  AI_GENERATION_INPUT_MAX_CHARS,
  AI_JSON_BODY_MAX_BYTES,
  AI_OPTION_MAX_CHARS,
  AI_VISUAL_INVENTORY_MAX_ITEMS,
  AI_MODEL_OUTPUT_MAX_BYTES,
  AI_MODEL_OUTPUT_MAX_JSON_NODES,
  GENERATED_DECK_MAX_SLIDES,
  DECK_OUTPUT_TOKEN_BUDGET,
  AI_INPUT_LIMIT,
  AI_DECK_INPUT_LIMIT,
  GENERATED_DECK_SLIDE_LIMIT,
  DECK_OUTPUT_TOKEN_LIMIT,
  formatVisualInputTooLongError,
  formatDeckInputTooLongError,
  formatAiOptionTooLongError,
} from "@/lib/limits/ai";

export {
  /* node:coverage ignore next 12 -- Slide asset limit facade re-export rows are import wiring. */
  IMPORT_MAX_UPLOAD_BYTES,
  IMPORT_ACCEPTED_MIME_TYPES,
  IMPORT_MAX_BYTES_BY_MIME,
  BRAND_FONT_ACCEPTED_TYPES,
  BRAND_LOGO_ACCEPTED_TYPES,
  BRAND_FONT_MAX_BYTES,
  BRAND_LOGO_MAX_BYTES,
  SLIDE_IMAGE_TYPES,
  SLIDE_ASSET_MAX_BYTES,
  SLIDE_ASSET_MAX_DIMENSION_PX,
  IMPORT_UPLOAD_LIMIT,
  IMPORT_TEXT_UPLOAD_LIMIT,
  BRAND_FONT_UPLOAD_LIMIT,
  BRAND_LOGO_UPLOAD_LIMIT,
  SLIDE_ASSET_UPLOAD_LIMIT,
  SLIDE_ASSET_DIMENSION_LIMIT,
  formatImportFileTooLargeError,
  formatAssetFileTooLargeError,
} from "@/lib/limits/assets";
/* node:coverage ignore next 4 -- Asset limit type facade exports are erased by tsx. */
export type {
  ImportAcceptedMimeType,
  SlideImageMime,
} from "@/lib/limits/assets";

export {
  checkBudget,
  checkLimit,
  budgetExceededDiagnostic,
  formatBytesAsMb,
} from "@/lib/limits/budgets";
export type {
  /* node:coverage ignore next 9 -- Budget type facade exports are erased by tsx. */
  LimitEnforcement,
  LimitUnit,
  LimitDiagnosticMetadata,
  LimitDefinition,
  BudgetCheckResult,
  LimitCheckResult,
  BudgetExceededDiagnostic,
} from "@/lib/limits/budgets";

export {
  DECK_JSON_MAX_BYTES,
  MAX_DECK_JSON_BYTES,
  DECK_JSON_NON_IMAGE_RESERVE,
  DECK_JSON_HARD_BYTES,
  DECK_JSON_WARN_BYTES,
  SLIDES_HARD_COUNT,
  SLIDES_WARN_COUNT,
  EXPORT_PREFLIGHT_MAX_SLIDES,
  ELEMENTS_PER_SLIDE_HARD_COUNT,
  ELEMENTS_PER_SLIDE_WARN_COUNT,
  VISUALS_PER_DOCUMENT_HARD_COUNT,
  VISUALS_PER_DOCUMENT_WARN_COUNT,
  INLINE_IMAGE_HARD_BYTES,
  INLINE_IMAGE_WARN_BYTES,
  INLINE_IMAGES_HARD_COUNT,
  INLINE_IMAGES_WARN_COUNT,
  TOTAL_IMAGE_BUDGET_BYTES,
  MAX_IMAGE_UPLOAD_BYTES,
  AUTOSAVE_WARN_MS,
  EXPORT_PREFLIGHT_WARN_MS,
  EDITOR_OPEN_WARN_MS,
  DECK_JSON_LIMIT,
  SLIDE_COUNT_LIMIT,
  ELEMENTS_PER_SLIDE_LIMIT,
  VISUALS_PER_DOCUMENT_LIMIT,
  INLINE_IMAGE_LIMIT,
  INLINE_IMAGES_LIMIT,
  TIMING_BUDGETS,
  formatDeckTooLargeError,
  checkDeckJsonBudget,
  checkSlideCountBudget,
  checkVisualCountBudget,
  checkInlineImageBudget,
} from "@/lib/limits/deck";

export {
  /* node:coverage ignore next 24 -- Document limit facade re-export rows are import wiring. */
  DOCUMENT_TITLE_MAX_LENGTH,
  DOCUMENT_CONTENT_MAX_LENGTH,
  LEXICAL_STATE_MAX_LENGTH,
  WORKSPACE_NAME_MAX_LENGTH,
  TAG_NAME_MAX_LENGTH,
  COMMENT_BODY_MAX_LENGTH,
  COMMENT_ANCHOR_TEXT_MAX_LENGTH,
  COMMENT_ANCHOR_NODE_ID_MAX_LENGTH,
  CONTENT_HARD_BYTES,
  CONTENT_WARN_BYTES,
  LEXICAL_STATE_HARD_BYTES,
  LEXICAL_STATE_WARN_BYTES,
  DOCUMENT_TITLE_LIMIT,
  DOCUMENT_CONTENT_LIMIT,
  LEXICAL_STATE_LIMIT,
  WORKSPACE_NAME_LIMIT,
  TAG_NAME_LIMIT,
  COMMENT_LIMITS,
  formatLexicalStateTooLargeError,
  checkLexicalStateBudget,
  checkContentBudget,
} from "@/lib/limits/document";

export { LIMIT_INVENTORY } from "@/lib/limits/inventory";
/* node:coverage ignore next -- Re-enabling coverage marker has no runtime branch. */
/* node:coverage enable */
