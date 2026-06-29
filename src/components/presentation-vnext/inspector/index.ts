/**
 * Inspector sub-components for the vNext slide editor.
 *
 * - {@link StyleBindingPanel}  — semantic role + style ref / variant selector.
 * - {@link LocalOverrideBadge} — override count badge with reset-to-theme action.
 * - {@link DiagnosticsPanel}   — structured diagnostics with spec action buttons.
 * - {@link SlideControlsPanel} — tone, density, emphasis, decoration, chrome controls.
 */

export { StyleBindingPanel } from "./style-binding-panel";
export type { StyleBindingPanelProps } from "./style-binding-panel";

export { LocalOverrideBadge } from "./local-override-badge";
export type { LocalOverrideBadgeProps } from "./local-override-badge";

export { DiagnosticsPanel } from "./diagnostics-panel";
export type { DiagnosticsPanelProps } from "./diagnostics-panel";

export { SlideControlsPanel } from "./slide-controls-panel";
export type { SlideControlsPanelProps } from "./slide-controls-panel";
