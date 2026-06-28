/**
 * Single test-support surface for all shared builders, fixtures, and helpers.
 *
 * Import from here in test files instead of from individual sub-modules.
 */

// assets
export {
  FIXTURE_PNG_BASE64,
  fixturePngBuffer,
  fixtureAssetChecksum,
  buildAssetPolicyMeta,
  buildAssetRecord,
} from "./assets";

// commands
export {
  FIXTURE_COMMAND_ACTOR,
  resetCommandCounter,
  makeVisualCommand,
} from "./commands";

// comments
export {
  buildCommentAuthor,
  buildCommentNode,
  buildCommentAnchor,
  buildCommentThread,
  buildSlideCommentAnchor,
  buildCommentAnchorRecord,
} from "./comments";

// deck + element builders
export {
  buildElementBox,
  buildTextStyle,
  buildSourceRef,
  buildTextElement,
  buildBulletsElement,
  buildVisualElement,
  buildImageElement,
  buildShapeElement,
  buildConnectorElement,
  buildPlaceholderElement,
  buildSlide,
  buildDeck,
  makeSlideWithElementIds,
  makeMinimalSlide,
  makeMinimalDeck,
  makeDeckFromIds,
} from "./deck";

// e2e profile (re-exports FIXTURE_PNG_BASE64 etc. — prefer assets directly)
export {
  E2E_PROFILE_FIXTURE,
  buildE2EProfileVisual,
  buildE2EProfileContentJson,
  buildE2EProfileDeck,
  buildE2EProfileFixtureDescriptor,
  e2eProfileAssetChecksum,
} from "./e2e-profile";

// lexical
export {
  FORMAT_BOLD,
  FORMAT_ITALIC,
  FORMAT_CODE,
  buildTextNode,
  buildParagraphNode,
  buildHeadingNode,
  buildQuoteNode,
  buildListItemNode,
  buildListNode,
  buildHorizontalRuleNode,
  buildVisualLexicalNode,
  buildEditorState,
  buildContentJson,
} from "./lexical";

// lexical types
export type {
  SerializedFixtureTextNode,
  SerializedFixtureParagraphNode,
  SerializedFixtureHeadingNode,
  SerializedFixtureQuoteNode,
  SerializedFixtureListItemNode,
  SerializedFixtureListNode,
  SerializedFixtureHorizontalRuleNode,
  SerializedFixtureVisualNode,
  SerializedFixtureRootChild,
  SerializedFixtureEditorState,
} from "./lexical";

// visual
export {
  buildVisualNode,
  buildVisualEdge,
  buildVisualStyle,
  buildVisual,
  buildVisualMap,
} from "./visual";

// Re-export the deck-export seam helpers alongside the builders so there is
// one unified test-support entry point for presentation-layer tests.
export { deckExportTestHelpers } from "@/test/deck-export-helpers";
