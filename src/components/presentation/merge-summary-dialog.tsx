"use client";

import { useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { FOCUS_RING } from "@/components/ui/tokens";
import { useFocusTrap } from "@/lib/presentation/use-focus-trap";
import type { MergeSummary } from "@/lib/presentation/deck-merge";

/**
 * Modal summary shown before a "Sync from document" merge is applied. Lists the
 * per-slide before/after effect (updated / appended / preserved) so the user
 * sees exactly what will change — and that no manual element work is discarded —
 * before confirming. Pure presentation: all merge logic lives in `deck-merge`.
 */
export function MergeSummaryDialog({
  summary,
  onApply,
  onCancel,
}: {
  summary: MergeSummary;
  onApply: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);
  const KIND_LABEL: Record<string, string> = {
    updated: "Updated",
    appended: "New",
    preserved: "Kept",
  };
  const hasChanges = summary.updatedCount > 0 || summary.appendedCount > 0;

  return createPortal(
    <div
      ref={dialogRef}
      data-floating-panel="true"
      role="dialog"
      aria-modal="true"
      aria-label="Sync from document"
      className="fixed inset-0 z-modal flex items-center justify-center bg-ds-backdrop p-4"
    >
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-ds-lg border border-ds-border-subtle bg-ds-surface-base shadow-lg">
        <div className="flex items-center justify-between border-b border-ds-border-subtle px-5 py-4">
          <h3 className="text-sm font-semibold text-ds-text-primary">
            Sync from document
          </h3>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel sync"
            className={`flex h-7 w-7 items-center justify-center rounded-ds-md text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>

        <div className="border-b border-ds-border-subtle px-5 py-3 text-xs text-ds-text-secondary">
          <p>
            {summary.updatedCount} updated · {summary.appendedCount} new ·{" "}
            {summary.preservedCount} kept · {summary.preservedElementCount}{" "}
            element{summary.preservedElementCount === 1 ? "" : "s"} preserved
          </p>
          {!hasChanges ? (
            <p className="mt-1 text-ds-text-muted">
              This deck already matches the document.
            </p>
          ) : null}
        </div>

        <ul className="min-h-0 flex-1 divide-y divide-ds-border-subtle overflow-y-auto px-5 py-2 text-xs">
          {summary.changes.map((change) => (
            <li
              key={`${change.kind}-${change.index}`}
              className="flex items-center gap-3 py-2"
            >
              <span
                className={`shrink-0 rounded-ds-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  change.kind === "updated"
                    ? "bg-ds-warning-surface text-ds-warning-text"
                    : change.kind === "appended"
                      ? "bg-ds-success-surface text-ds-success-text"
                      : "bg-ds-state-hover text-ds-text-muted"
                }`}
              >
                {KIND_LABEL[change.kind]}
              </span>
              <span className="min-w-0 flex-1 truncate text-ds-text-primary">
                {change.after.title || "(untitled slide)"}
              </span>
              <span className="shrink-0 text-ds-text-muted">
                {change.after.bulletCount} bullet
                {change.after.bulletCount === 1 ? "" : "s"}
                {change.elementsPreserved > 0
                  ? ` · ${change.elementsPreserved} kept`
                  : ""}
              </span>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-end gap-2 border-t border-ds-border-subtle px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className={`flex h-8 items-center rounded-ds-md border border-ds-border-subtle px-3 text-sm font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={!hasChanges}
            className={`flex h-8 items-center rounded-ds-md bg-ds-accent px-3 text-sm font-medium text-ds-text-on-accent transition-colors hover:bg-ds-accent-hover disabled:opacity-60 ${FOCUS_RING}`}
          >
            Apply changes
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
