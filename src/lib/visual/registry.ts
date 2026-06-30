/**
 * Visual-kind registry — the single public facade for per-kind capability
 * contracts (Epic #442, issues #443–#447).
 *
 * Owned data lives in concern-specific modules: display/layout metadata,
 * editing capabilities, export support, AI prompt guidance, and validation.
 * This facade composes those framework-free records so callers keep using
 * getKindEntry and VISUAL_KIND_REGISTRY without knowing about the split.
 */

import {
  VISUAL_KINDS,
  type NodeShape,
  type VisualKind,
} from "@/lib/visual/schema";
import { KIND_DISPLAY_METADATA } from "./registry-display";
import { KIND_EDITING_CAPABILITIES } from "./registry-editing";
import { KIND_EXPORT_SUPPORT } from "./registry-export";
import { KIND_PROMPT_CONSTRAINTS } from "./registry-prompt";
import { KIND_RUNTIME_DESCRIPTORS } from "./registry-runtime";
import { assertRegistryCompletenessFor } from "./registry-validation";
/* node:coverage ignore next 6 -- type-only registry imports are erased by tsx but mapped as uncovered. */
import type {
  LayoutFamily,
  VisualKindEntry,
  VisualRuntimeDescriptor,
  VisualRegistry,
} from "./registry-types";

export type {
  KindEditingCapabilities,
  KindExportSupport,
  KindPromptConstraints,
  LayoutFamily,
  VisualKindDisplayMetadata,
  VisualKindEntry,
  VisualRuntimeDescriptor,
  VisualRegistry,
} from "./registry-types";

function buildVisualKindRegistry(): VisualRegistry {
  const registry = {} as VisualRegistry;
  for (const kind of VISUAL_KINDS) {
    registry[kind] = {
      id: kind,
      ...KIND_DISPLAY_METADATA[kind],
      runtime: KIND_RUNTIME_DESCRIPTORS[kind],
      editing: KIND_EDITING_CAPABILITIES[kind],
      export: KIND_EXPORT_SUPPORT[kind],
      prompt: KIND_PROMPT_CONSTRAINTS[kind],
    };
  }
  return registry;
}

/** The authoritative registry for all VisualKinds. */
export const VISUAL_KIND_REGISTRY: VisualRegistry = buildVisualKindRegistry();

/**
 * Returns the VisualKindEntry for a given kind.
 * TypeScript guarantees this is always defined for a valid VisualKind.
 */
export function getKindEntry(kind: VisualKind): VisualKindEntry {
  return VISUAL_KIND_REGISTRY[kind];
}

/** Returns the full runtime descriptor for a visual kind. */
export function getKindRuntimeDescriptor(
  kind: VisualKind,
): VisualRuntimeDescriptor {
  return VISUAL_KIND_REGISTRY[kind].runtime;
}

/** Returns true when the kind uses explicit node x/y coordinates. */
export function isPositionedKind(kind: VisualKind): boolean {
  return VISUAL_KIND_REGISTRY[kind].layoutFamily === "positioned";
}

/** Returns true when the kind derives node layout at render time. */
export function isDerivedLayoutKind(kind: VisualKind): boolean {
  return VISUAL_KIND_REGISTRY[kind].layoutFamily === "derived";
}

/** Returns true when the kind supports interactive node/edge graph editing. */
export function isGraphEditable(kind: VisualKind): boolean {
  const e = VISUAL_KIND_REGISTRY[kind].editing;
  return e.nodeAddable && e.edgeAddable;
}

/** Returns the allowed NodeShapes for a kind. */
export function getAllowedShapes(kind: VisualKind): readonly NodeShape[] {
  return VISUAL_KIND_REGISTRY[kind].allowedShapes;
}

/** Returns true when the given shape is valid for the kind. */
export function isShapeAllowed(kind: VisualKind, shape: NodeShape): boolean {
  return (VISUAL_KIND_REGISTRY[kind].allowedShapes as string[]).includes(shape);
}

/** Returns every kind that satisfies the given layout family. */
export function getKindsByLayoutFamily(family: LayoutFamily): VisualKind[] {
  return VISUAL_KINDS.filter(
    (k) => VISUAL_KIND_REGISTRY[k].layoutFamily === family,
  );
}

/** Returns the AI prompt guidance string for a kind. */
export function getKindPromptGuidance(kind: VisualKind): string {
  return VISUAL_KIND_REGISTRY[kind].prompt.guidance;
}

/** Derives the export support matrix from the registry. */
export function buildExportSupportMatrix(): Array<{
  kind: VisualKind;
  svg: boolean;
  png: boolean;
  pdf: boolean;
  pptxNative: boolean;
  pptxRasterFallback: boolean;
  pptxDegradations: readonly string[];
}> {
  return VISUAL_KINDS.map((kind) => ({
    kind,
    ...VISUAL_KIND_REGISTRY[kind].export,
  }));
}

/** Returns an array of { kind, guidance } pairs for all registered kinds. */
export function getAllKindPromptGuidance(): Array<{
  kind: VisualKind;
  guidance: string;
}> {
  return VISUAL_KINDS.map((kind) => ({
    /* node:coverage disable */ kind,
    guidance: VISUAL_KIND_REGISTRY[kind].prompt.guidance,
  }));
}

/** Asserts that every split data concern and composed registry covers all kinds. */
export function assertRegistryCompleteness(): void {
  /* node:coverage enable */
  assertRegistryCompletenessFor(VISUAL_KIND_REGISTRY);
}
