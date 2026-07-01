/**
 * Barrel export for the v7 presentation core library.
 *
 * UI/render/export agents should import from here rather than from individual
 * modules to get a stable surface that can be reorganised without changing
 * consumer imports.
 */

// Primitive types
export type {
  DeckId,
  SlideId,
  NodeId,
  AssetId,
  ThemePackageId,
  ThemeVersion,
  TemplateVersion,
  StyleVariantId,
  TokenPath,
  IsoDateTime,
  JsonPrimitive,
  JsonValue,
  DeepPartial,
  CanvasFormat,
  CanvasSpec,
  InsetsPct,
  InsetsPt,
  FramePct,
  PointPct,
} from "./types";

// ID helpers
export {
  isValidId,
  isNonEmptyAsciiString,
  isFiniteNumber,
  isPositiveFinite,
  isHexColor,
  clamp,
} from "./ids";

// Diagnostics
export type {
  PresentationDiagnosticCode,
  DiagnosticSeverity,
  DiagnosticCategory,
  DiagnosticTargetScope,
  DiagnosticTarget,
  DiagnosticAction,
  DiagnosticActionType,
  DiagnosticGroup,
  PresentationDiagnostic,
} from "./diagnostics";
export {
  DIAGNOSTIC_CATEGORIES,
  DIAGNOSTIC_TARGET_SCOPES,
  DIAGNOSTIC_SEVERITY_RANK,
  makeDiagnostic,
  categoryForDiagnosticCode,
  retargetDiagnostic,
  getDiagnosticTarget,
  getDiagnosticNodeId,
  getDiagnosticSlideId,
  diagnosticTargetKey,
  diagnosticTargetLabel,
  groupDiagnostics,
  DiagnosticCollector,
} from "./diagnostics";
export type {
  DiagnosticRepairContext,
  DiagnosticRepairFocus,
  DiagnosticRepairResult,
} from "./diagnostic-repairs";
export { applyDiagnosticRepairAction } from "./diagnostic-repairs";

// Style schema
export type {
  TokenRef,
  ColorValue,
  TextStyle,
  GradientStop,
  FillStyle,
  StrokeStyle,
  RadiusStyle,
  ShadowStyle,
  EffectStyle,
  ImageFitMode,
  ImageStyle,
  ConnectorStyle,
  TableStyle,
  SlideSurfaceStyle,
  VisualStyle,
  ClipStyle,
  StyleObject,
  StylePatch,
  StyleRef,
  StyleBinding,
  ThemeTokens,
} from "./style-schema";
export { resolveToken } from "./style-schema";
export type {
  SupportedVisualColorChannel,
  ResolvedVisualChannelColors,
} from "./visual-channel-colors";
export {
  SUPPORTED_VISUAL_COLOR_CHANNELS,
  DEFAULT_VISUAL_CHANNEL_COLORS,
  isSupportedVisualColorChannel,
  normalizeVisualChannelColors,
  visualChannelColorWithDefaults,
} from "./visual-channel-colors";

// Style registry
export { STYLE_REFS, isStyleRef } from "./style-registry";

// Core schema
export type {
  DeckMetadata,
  AssetOrigin,
  ImageAsset,
  FontAsset,
  VisualAssetRef,
  FileAsset,
  DeckAssetRegistry,
  ThemeOverridePatch,
  DeckThemeBinding,
  LayoutConstraints,
  LayoutBox,
  AccessibilityMetadata,
  SourceRefreshState,
  SourceRefreshMetadata,
  SourceDisplayMetadata,
  NodeSourceMetadata,
  SemanticRole,
  SlotKey,
  TextRun,
  ListMarker,
  Paragraph,
  TextFitMode,
  TextContent,
  ShapeKind,
  SvgPathData,
  ShapeContent,
  ImageCrop,
  ImageContent,
  ConnectorAnchor,
  ConnectorEndpoint,
  ConnectorContent,
  TableColumn,
  TableCell,
  TableRow,
  TableContent,
  VisualContent,
  GroupComponentKind,
  BaseNode,
  TextNode,
  ImageNode,
  ShapeNode,
  ConnectorNode,
  TableNode,
  VisualNode,
  GroupNode,
  SlideChildNode,
  SemanticTemplateKind,
  SlideTemplateBinding,
  SlideTone,
  SlideDensity,
  SlideEmphasis,
  SlideControls,
  SlideProps,
  DeckChromeKind,
  DeckChromeLayer,
  DeckChromeBase,
  DeckChromeLogoPlacement,
  DeckChromeLogoSize,
  DeckChromeLogo,
  DeckChromeTextAlign,
  DeckChromeFooter,
  DeckChromePageNumberFormat,
  DeckChromePageNumberPlacement,
  DeckChromePageNumber,
  DeckChromeWatermarkLayout,
  DeckChromeWatermarkSize,
  DeckChromeWatermark,
  DeckChromeBorder,
  DeckChromeSafeArea,
  DeckChromeConfig,
  SlideDeckChromeOverrideMode,
  SlideDeckChromeOverride,
  SlideDeckChromeOverrides,
  SlideNode,
  DeckV7,
} from "./schema";
export { DECK_SCHEMA_VERSION_V7 } from "./schema";

// Source-link block index and review helpers
export type {
  SourceBlockKind,
  SourceBlockRefreshPayload,
  SourceBlockIndexEntry,
  SourceBlockIndex,
} from "./block-index";
export { buildSourceBlockIndex, findSourceBlock } from "./block-index";
export type {
  SourceLinkClassification,
  SourceRefreshResult,
  SourceRefreshAllResult,
  SourceReviewItem,
} from "./source-links";
export {
  classifyNodeSource,
  classifyDeckSourceLinks,
  sourceReviewItems,
  sourceLinkDiagnostics,
  refreshNodeSource,
  unlinkNodeSource,
  relinkNodeSource,
  updateNodeSourceState,
  dismissNodeSourceIssue,
  refreshAllSafeSourceLinks,
} from "./source-links";

// Validation
export type { DeckV7ParseResult } from "./validation";
export { safeParseDeckV7 } from "./validation";

// Theme package schema
export type {
  TemplateStaticContent,
  ThemeDecorationRecipe,
  ThemeAssetManifest,
  ThemePackageV1,
  ThemePackageValidationResult,
} from "./theme-package-schema";
export { validateThemePackage } from "./theme-package-schema";

// Style resolver
export type { StyleResolutionResult, ResolvedTheme } from "./style-resolver";
export { resolveNodeStyle, resolveTheme } from "./style-resolver";

// Template registry
export type {
  SlotValueType,
  OverflowPolicy,
  SlotContract,
  TemplateControlSupport,
  TemplateGroup,
  TemplateNodeBlueprint,
  TemplateLayoutVariant,
  TemplateSelectionMetadata,
  SemanticTemplateV1,
} from "./template-registry";
export {
  SEMANTIC_TEMPLATE_KINDS,
  isSemanticTemplateKind,
  SemanticTemplateRegistry,
  selectLayout,
} from "./template-registry";

// AI plan schema
export type {
  BulletSlotItem,
  MetricSlotItem,
  CardSlotItem,
  StepSlotItem,
  TimelineSlotItem,
  SlotValue,
  AiSlideSpec,
  AiDeckPlanV1,
} from "./ai-plan-schema";
export { isSlotValue } from "./ai-plan-schema";

// AI plan repair
export type { AiPlanRepairResult } from "./ai-plan-repair";
export { repairAiDeckPlan } from "./ai-plan-repair";

// Template compiler
export type { TemplateCompileResult } from "./template-compiler";
export { compileSlide, resetIdCounter } from "./template-compiler";

// Slide spec projection
export { slideSpecFromSlide, emptySlideSpecFromLayout } from "./slide-spec";

// Render tree
export type {
  ResolvedLayoutBox,
  ResolvedNodeContent,
  ResolvedRenderNode,
  ResolvedSlideBackground,
  ResolvedSlideRenderTree,
  ResolvedDeckRenderTree,
} from "./render-tree";

// Render resolver
export type { ResolveDeckOptions } from "./render-resolver";
export { resolveDeckRenderTree } from "./render-resolver";

// Export spec
export type {
  ExportBackgroundOperation,
  ExportTextOperation,
  ExportShapeOperation,
  ExportImageOperation,
  ExportConnectorOperation,
  ExportVisualOperation,
  ExportTableShapeOperation,
  ExportOperation,
  ExportSlideSpec,
  ExportDeckSpec,
} from "./export-spec";
export { buildExportSpec } from "./export-spec";

// Editor commands
export {
  insertSlide,
  insertTemplateSlide,
  insertBlankSlide,
  duplicateSlide,
  deleteSlide,
  moveSlide,
  applyTemplate,
  updateSlideControls,
  updateSlideAttributes,
  updateSlideLocalStyle,
  resetSlideLocalStyle,
  updateSlideSourceMetadata,
  setThemePackage,
  updateDeckChrome,
  insertNode,
  pasteNodes,
  updateNodeContent,
  resetImageCrop,
  updateNodeLayout,
  updateNodeRotation,
  updateNodeLayouts,
  updateNodeAttributes,
  updateNodeSourceMetadata,
  moveNodesBy,
  deleteNodes,
  duplicateNodes,
  updateNodeStyleBinding,
  updateLocalStyle,
  resetLocalStyleOverride,
  restoreThemeDecoration,
  detachDecoration,
  detachDeckChrome,
  groupNodes,
  ungroupNodes,
  reorderZIndex,
  updateAssetMetadata,
} from "./editor-commands";

export type {
  StageGuide,
  StageGuideInput,
  SnapFrameResult,
} from "./stage-guides";
export {
  alignmentGuidesForFrames,
  snapFrameToStageGuides,
} from "./stage-guides";
export type { SelectionFrame } from "./selection-geometry";
export {
  normalizeSelectionFrame,
  selectNodesInFrame,
} from "./selection-geometry";

// Theme packages (built-in template registry)
export {
  createDefaultTemplateRegistry,
  BUILT_IN_TEMPLATES,
} from "./theme-packages";

// Neutral fallback theme package
export { NEUTRAL_THEME_PACKAGE } from "./neutral-theme-package";

// Runtime v7 theme package registry
export type { ThemePackageResolution } from "./theme-package-registry";
export {
  THEME_PACKAGE_REGISTRY,
  resolveThemePackageIdV7,
  getThemePackageV7,
  listThemePackagesV7,
  resolveThemePackageForDeck,
} from "./theme-package-registry";

// Native v7 starter decks
export { createBlankDeckV7 } from "./empty-deck";

// Open-deck boundary helper (current DeckV7 runtime parse)
export type { OpenDeckResult, DeckOpenDecision } from "./open-deck";
export {
  openDeckFromJson,
  openAiGeneratedDeck,
  decideDeckOpen,
  looksLikeDeckV7,
} from "./open-deck";

// Undo/redo focus targeting (structural diff of committed deck snapshots)
export type { DeckNodeDiff } from "./deck-diff";
export { diffDeckNodes, pickUndoFocusTarget } from "./deck-diff";

// PPTX export adapter (DOM-free; browser applier calls PptxGenJS with the result)
export type {
  VnextPptxLayout,
  VnextPptxTextStyle,
  VnextPptxBackgroundOp,
  VnextPptxTextOp,
  VnextPptxShapeOp,
  VnextPptxImageOp,
  VnextPptxConnectorOp,
  VnextPptxVisualOp,
  VnextPptxTableOp,
  VnextPptxOp,
  VnextPptxSlideSpec,
  VnextPptxDeckSpec,
  BuildVnextPptxSpecOptions,
} from "./pptx-export-adapter";
export { buildVnextPptxSpec } from "./pptx-export-adapter";

// Browser-only v7 PPTX applier and high-level export function
export type { PptxTextRun } from "./pptx-vnext-apply";
export {
  textContentToPptxRuns,
  vnextShapeToName,
  applyVnextTextOp,
  applyVnextShapeOp,
  applyVnextImageOp,
  applyVnextConnectorOp,
  applyVnextTableOp,
  applyVnextPptxSpec,
  exportDeckV7AsPPTX,
} from "./pptx-vnext-apply";
