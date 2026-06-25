import type { AspectRatioPreset } from "@/lib/visual/schema";
import {
  applyExportPolicyWatermark,
  type ExportPolicy,
} from "@/lib/visual/export-policy";
import {
  DEFAULT_EXPORT_OPTIONS,
  type ExportOptions,
} from "@/lib/visual/export-options";

/**
 * Export preferences persisted on the Visual schema. `aspectRatio` intentionally
 * remains schema-owned because it is stored with each visual, not just a dialog
 * toggle.
 */
export interface PersistedVisualExportSettings {
  aspectRatio?: AspectRatioPreset;
}

/**
 * One-off dialog/export state. These values are not persisted back to Visual
 * rows unless explicitly mapped into {@link PersistedVisualExportSettings}.
 */
export type TransientExportDialogOptions = ExportOptions;

export function createDefaultExportDialogOptions(
  policy: ExportPolicy,
): TransientExportDialogOptions {
  return applyExportPolicyWatermark({ ...DEFAULT_EXPORT_OPTIONS }, policy);
}

export function syncExportDialogOptionsWithPolicy(
  options: TransientExportDialogOptions,
  policy: ExportPolicy,
): TransientExportDialogOptions {
  return applyExportPolicyWatermark(options, policy);
}
