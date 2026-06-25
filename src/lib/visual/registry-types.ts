import type { NodeShape, VisualKind } from "@/lib/visual/schema";

/**
 * "positioned" means nodes carry explicit x/y coordinates. "derived" means the
 * renderer computes positions from order/value at render time.
 */
export type LayoutFamily = "positioned" | "derived";

/** Describes how well a visual kind renders to each export format. */
export interface KindExportSupport {
  svg: boolean;
  png: boolean;
  pdf: boolean;
  pptxNative: boolean;
  pptxRasterFallback: boolean;
  pptxDegradations: readonly string[];
}

/** Per-kind flags that control which graph-editing operations are available. */
export interface KindEditingCapabilities {
  nodeAddable: boolean;
  nodeDeletable: boolean;
  edgeAddable: boolean;
  edgeDeletable: boolean;
  edgeReconnectable: boolean;
  nodeDuplicatable: boolean;
  autoLayoutSupported: boolean;
}

/** Registry-derived AI generation hints for a kind. */
export interface KindPromptConstraints {
  guidance: string;
  requiresNodeValue: boolean;
  requiresNodePosition: boolean;
  edgesRelevant: boolean;
}

/** Display, layout, and shape metadata owned separately from capabilities. */
export interface VisualKindDisplayMetadata {
  readonly label: string;
  readonly description: string;
  readonly keywords: readonly string[];
  readonly iconName: string;
  readonly layoutFamily: LayoutFamily;
  readonly allowedShapes: readonly NodeShape[];
  readonly defaultShape: NodeShape;
}

/** The complete capability contract for a single VisualKind. */
export interface VisualKindEntry extends VisualKindDisplayMetadata {
  readonly id: VisualKind;
  readonly editing: KindEditingCapabilities;
  readonly export: KindExportSupport;
  readonly prompt: KindPromptConstraints;
}

/** The complete registry: one entry per VisualKind. */
export type VisualRegistry = Record<VisualKind, VisualKindEntry>;
