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
  DiagnosticAction,
  PresentationDiagnostic,
} from "./diagnostics";
export { makeDiagnostic, DiagnosticCollector } from "./diagnostics";

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
  SlideNode,
  DeckV7,
} from "./schema";
export { DECK_SCHEMA_VERSION_V7 } from "./schema";

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
  applyTemplate,
  updateSlideControls,
  setThemePackage,
  updateNodeContent,
  updateNodeLayout,
  updateNodeStyleBinding,
  updateLocalStyle,
  resetLocalStyleOverride,
  detachDecoration,
  groupNodes,
  reorderZIndex,
  updateAssetMetadata,
} from "./editor-commands";

// Theme packages (built-in template registry)
export {
  createDefaultTemplateRegistry,
  BUILT_IN_TEMPLATES,
} from "./theme-packages";

// Neutral fallback theme package
export { NEUTRAL_THEME_PACKAGE } from "./neutral-theme-package";

// Native v7 starter decks
export { createBlankDeckV7 } from "./empty-deck";

// Open-deck boundary helper (v7-only runtime parse path)
export type { OpenDeckResult } from "./open-deck";
export { openDeckFromJson, looksLikeDeckV7 } from "./open-deck";

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

// Theme package registry
export type { ThemeResolutionResult } from "./theme-package-registry";
export {
  resolveThemePackage,
  registeredThemePackageIds,
} from "./theme-package-registry";

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
