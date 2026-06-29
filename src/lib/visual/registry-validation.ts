/** Completeness and drift checks for split visual-registry data. */

import { VISUAL_KINDS } from "@/lib/visual/schema";
import { KIND_DISPLAY_METADATA } from "./registry-display";
import { KIND_EDITING_CAPABILITIES } from "./registry-editing";
import { KIND_EXPORT_SUPPORT } from "./registry-export";
import { KIND_PROMPT_CONSTRAINTS } from "./registry-prompt";
import { KIND_RUNTIME_DESCRIPTORS } from "./registry-runtime";
import type { VisualRegistry } from "./registry-types";

function assertCompleteKindMap<T>(
  label: string,
  record: Record<string, T>,
): void {
  const expected = new Set<string>(VISUAL_KINDS);
  const actual = new Set(Object.keys(record));

  for (const kind of VISUAL_KINDS) {
    if (!actual.has(kind)) {
      throw new Error("[registry] Missing " + label + " for kind: " + kind);
    }
  }

  for (const key of actual) {
    if (!expected.has(key)) {
      throw new Error("[registry] Unexpected " + label + " kind: " + key);
    }
  }
}

export function assertRegistryDataCompleteness(): void {
  assertCompleteKindMap("display metadata", KIND_DISPLAY_METADATA);
  assertCompleteKindMap("editing capabilities", KIND_EDITING_CAPABILITIES);
  assertCompleteKindMap("export support", KIND_EXPORT_SUPPORT);
  assertCompleteKindMap("prompt constraints", KIND_PROMPT_CONSTRAINTS);
  assertCompleteKindMap("runtime descriptor", KIND_RUNTIME_DESCRIPTORS);
}

export function assertRegistryCompletenessFor(registry: VisualRegistry): void {
  assertRegistryDataCompleteness();
  assertCompleteKindMap("registry entry", registry);

  for (const kind of VISUAL_KINDS) {
    const entry = registry[kind];
    if (!entry) {
      throw new Error("[registry] Missing entry for kind: " + kind);
    }
    if (entry.id !== kind) {
      throw new Error(
        '[registry] Entry id mismatch: expected "' +
          kind +
          '", got "' +
          entry.id +
          '"',
      );
    }
    if (!entry.label) {
      throw new Error('[registry] Entry for "' + kind + '" is missing a label');
    }
    if (!entry.iconName) {
      throw new Error(
        '[registry] Entry for "' + kind + '" is missing an iconName',
      );
    }
    if (entry.allowedShapes.length === 0) {
      throw new Error(
        '[registry] Entry for "' +
          kind +
          '" has no allowedShapes — at least one shape is required',
      );
    }
    const runtime = entry.runtime;
    if (!runtime) {
      throw new Error(
        '[registry] Entry for "' + kind + '" is missing runtime descriptor',
      );
    }
    if (runtime.layout.family !== entry.layoutFamily) {
      const message = `[registry] Runtime layout family mismatch for "${kind}"`;
      throw new Error(message);
      /* node:coverage ignore next -- layout mismatch throw is asserted; tsx maps the closing brace as uncovered. */
    }
    if (runtime.transform.defaultShape !== entry.defaultShape) {
      throw new Error(
        '[registry] Runtime default shape mismatch for "' + kind + '"',
      );
    }
    if (
      runtime.transform.autoLayoutSupported !==
      entry.editing.autoLayoutSupported
    ) {
      throw new Error(
        '[registry] Runtime auto-layout support mismatch for "' + kind + '"',
      );
    }
    if (
      runtime.validation.requiresNodeValue !== entry.prompt.requiresNodeValue ||
      runtime.validation.requiresNodePosition !==
        entry.prompt.requiresNodePosition ||
      runtime.validation.edgesRelevant !== entry.prompt.edgesRelevant
    ) {
      throw new Error(
        '[registry] Runtime validation/prompt mismatch for "' + kind + '"',
      );
    }
    for (const [item, covered] of Object.entries(runtime.checklist)) {
      if (covered !== true) {
        throw new Error(
          '[registry] Runtime checklist item "' +
            item +
            '" is incomplete for kind: ' +
            kind,
        );
      }
    }
  }
}
