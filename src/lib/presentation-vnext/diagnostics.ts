/**
 * Diagnostic types and codes for the v7 presentation system.
 *
 * Diagnostics are produced at every validation/compile/render/export boundary
 * and are stable enough for test assertions and UI grouping.
 */

import type { NodeId, SlideId, JsonValue } from "./types";

export type PresentationDiagnosticCode =
  | "invalid-schema-version"
  | "unknown-field"
  | "duplicate-id"
  | "unknown-template-kind"
  | "unknown-template-layout"
  | "unknown-theme-package"
  | "unknown-style-ref"
  | "missing-style-default"
  | "missing-style-variant"
  | "missing-token"
  | "invalid-node-layout"
  | "missing-node-layout"
  | "missing-asset"
  | "invalid-asset-reference"
  | "invalid-text-runs"
  | "invalid-table-shape"
  | "slot-over-capacity"
  | "missing-required-slot"
  | "unsupported-template-control"
  | "theme-decoration-export-fallback"
  | "unsupported-export-feature"
  | "local-style-overrides"
  | "migration-id-rewrite"
  | "migration-dropped-node"
  | "migration-unmapped-reference";

export type DiagnosticSeverity = "info" | "warning" | "error" | "fatal";

export type DiagnosticAction =
  | "reset-to-theme"
  | "choose-denser-layout"
  | "split-slide"
  | "open-asset-panel"
  | "repair-ai-plan"
  | "remove-override"
  | "replace-style-ref";

export type PresentationDiagnostic = {
  code: PresentationDiagnosticCode;
  severity: DiagnosticSeverity;
  path?: string;
  message: string;
  nodeId?: NodeId;
  slideId?: SlideId;
  action?: DiagnosticAction;
  details?: Record<string, JsonValue>;
};

/** Convenience builder for diagnostics. */
export function makeDiagnostic(
  code: PresentationDiagnosticCode,
  severity: DiagnosticSeverity,
  message: string,
  opts?: {
    path?: string;
    nodeId?: NodeId;
    slideId?: SlideId;
    action?: DiagnosticAction;
    details?: Record<string, JsonValue>;
  },
): PresentationDiagnostic {
  return {
    code,
    severity,
    message,
    ...(opts?.path !== undefined ? { path: opts.path } : {}),
    ...(opts?.nodeId !== undefined ? { nodeId: opts.nodeId } : {}),
    ...(opts?.slideId !== undefined ? { slideId: opts.slideId } : {}),
    ...(opts?.action !== undefined ? { action: opts.action } : {}),
    ...(opts?.details !== undefined ? { details: opts.details } : {}),
  };
}

/** Collects diagnostics during a validation pass. */
export class DiagnosticCollector {
  readonly diagnostics: PresentationDiagnostic[] = [];

  add(d: PresentationDiagnostic): void {
    this.diagnostics.push(d);
  }

  error(
    code: PresentationDiagnosticCode,
    message: string,
    opts?: Parameters<typeof makeDiagnostic>[3],
  ): void {
    this.add(makeDiagnostic(code, "error", message, opts));
  }

  warning(
    code: PresentationDiagnosticCode,
    message: string,
    opts?: Parameters<typeof makeDiagnostic>[3],
  ): void {
    this.add(makeDiagnostic(code, "warning", message, opts));
  }

  info(
    code: PresentationDiagnosticCode,
    message: string,
    opts?: Parameters<typeof makeDiagnostic>[3],
  ): void {
    this.add(makeDiagnostic(code, "info", message, opts));
  }

  fatal(
    code: PresentationDiagnosticCode,
    message: string,
    opts?: Parameters<typeof makeDiagnostic>[3],
  ): void {
    this.add(makeDiagnostic(code, "fatal", message, opts));
  }

  hasFatal(): boolean {
    return this.diagnostics.some((d) => d.severity === "fatal");
  }

  hasErrors(): boolean {
    return this.diagnostics.some(
      (d) => d.severity === "error" || d.severity === "fatal",
    );
  }
}
