"use client";

/**
 * Diagnostics panel for the vNext slide inspector.
 *
 * Shows structured `PresentationDiagnostic` items grouped by severity and
 * surfaces one-click action buttons whose labels map exactly to the
 * `DiagnosticAction` enum from the spec:
 *
 *   reset-to-theme, choose-denser-layout, split-slide, open-asset-panel,
 *   repair-ai-plan, remove-override, replace-style-ref
 *
 * Purely prop-driven; callers handle the actual action routing.
 */

import type { JSX } from "react";

import type {
  PresentationDiagnostic,
  DiagnosticSeverity,
  DiagnosticAction,
} from "@/lib/presentation-vnext/diagnostics";
import { FOCUS_RING } from "@/components/ui/tokens";

// ---------------------------------------------------------------------------
// Action labels (matching spec §Validation And Diagnostics)
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<DiagnosticAction, string> = {
  "reset-to-theme": "Reset to theme",
  "choose-denser-layout": "Use denser layout",
  "split-slide": "Split slide",
  "open-asset-panel": "Open asset panel",
  "repair-ai-plan": "Repair AI plan",
  "remove-override": "Remove override",
  "replace-style-ref": "Replace style ref",
};

// ---------------------------------------------------------------------------
// Severity badge styles
// ---------------------------------------------------------------------------

const SEVERITY_STYLES: Record<
  DiagnosticSeverity,
  { badge: string; row: string }
> = {
  fatal: {
    badge: "bg-ds-status-error-fill text-ds-status-error-text",
    row: "border-l-2 border-ds-status-error-fill bg-ds-status-error-subtle",
  },
  error: {
    badge: "bg-ds-status-error-fill text-ds-status-error-text",
    row: "border-l-2 border-ds-status-error-fill bg-ds-status-error-subtle",
  },
  warning: {
    badge: "bg-ds-status-warning-fill text-ds-status-warning-text",
    row: "border-l-2 border-ds-status-warning-fill bg-ds-status-warning-subtle",
  },
  info: {
    badge: "bg-ds-surface-2 text-ds-text-secondary",
    row: "border-l-2 border-ds-border-subtle bg-ds-surface",
  },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DiagnosticsPanelProps {
  diagnostics: PresentationDiagnostic[];
  /**
   * Called when the user clicks an action button.
   * The caller is responsible for routing to the appropriate editor command.
   */
  onAction: (
    action: DiagnosticAction,
    diagnostic: PresentationDiagnostic,
  ) => void;
  /** When true, info-severity diagnostics are hidden. Defaults to false. */
  hideInfo?: boolean;
}

// ---------------------------------------------------------------------------
// Sorting helpers
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<DiagnosticSeverity, number> = {
  fatal: 0,
  error: 1,
  warning: 2,
  info: 3,
};

function sortDiagnostics(
  diagnostics: PresentationDiagnostic[],
): PresentationDiagnostic[] {
  return [...diagnostics].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DiagnosticsPanel({
  diagnostics,
  onAction,
  hideInfo = false,
}: DiagnosticsPanelProps): JSX.Element | null {
  const visible = sortDiagnostics(
    hideInfo ? diagnostics.filter((d) => d.severity !== "info") : diagnostics,
  );

  if (visible.length === 0) return null;

  return (
    <section className="flex flex-col gap-1 px-3 py-2.5">
      <h4 className="text-[10px] font-bold uppercase tracking-[0.06em] text-ds-text-muted">
        Diagnostics
      </h4>
      <ul className="flex flex-col gap-1" role="list">
        {visible.map((d, i) => {
          const styles = SEVERITY_STYLES[d.severity];
          return (
            <li
              key={`${d.code}-${i}`}
              className={`flex flex-col gap-1 rounded-ds-sm px-2 py-1.5 text-xs ${styles.row}`}
            >
              <div className="flex items-start gap-1.5">
                <span
                  className={`mt-0.5 shrink-0 rounded px-1 py-0.5 text-[10px] font-bold uppercase ${styles.badge}`}
                >
                  {d.severity}
                </span>
                <span className="text-ds-text-primary">{d.message}</span>
              </div>
              {d.action && (
                <button
                  type="button"
                  onClick={() => onAction(d.action!, d)}
                  className={`self-start rounded-ds-sm px-2 py-0.5 text-[11px] font-medium text-ds-accent-text underline-offset-2 hover:underline ${FOCUS_RING}`}
                >
                  {ACTION_LABELS[d.action]}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
