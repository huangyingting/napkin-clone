"use client";

import type { JSX } from "react";

import type { SourceBlockIndexEntry } from "@/lib/presentation-vnext/block-index";
import type { SourceReviewItem } from "@/lib/presentation-vnext/source-links";

export interface SourceReviewPanelProps {
  items: readonly SourceReviewItem[];
  sourceBlocks: readonly SourceBlockIndexEntry[];
  onSelect: (slideId: string, nodeId: string) => void;
  onRefresh: (slideId: string, nodeId: string) => void;
  onUnlink: (slideId: string, nodeId: string) => void;
  onRelink: (
    slideId: string,
    nodeId: string,
    block: SourceBlockIndexEntry,
  ) => void;
  onDismiss: (slideId: string, nodeId: string) => void;
  onRefreshAll: () => void;
  statusMessage?: string;
}

const STATE_LABEL: Record<SourceReviewItem["state"], string> = {
  fresh: "Fresh",
  stale: "Stale",
  orphan: "Orphaned",
  unknown: "Unknown",
  unlinked: "Unlinked",
};

function stateClass(state: SourceReviewItem["state"]): string {
  switch (state) {
    case "stale":
      return "bg-ds-status-warning-subtle text-ds-status-warning-text";
    case "orphan":
      return "bg-ds-status-error-subtle text-ds-status-error-text";
    case "unknown":
    case "unlinked":
      return "bg-ds-surface-2 text-ds-text-secondary";
    case "fresh":
      return "bg-ds-status-success-subtle text-ds-status-success-text";
  }
}

export function SourceReviewPanel({
  items,
  sourceBlocks,
  onSelect,
  onRefresh,
  onUnlink,
  onRelink,
  onDismiss,
  onRefreshAll,
  statusMessage,
}: SourceReviewPanelProps): JSX.Element | null {
  const relinkOptions = sourceBlocks;
  if (items.length === 0) return null;
  const staleCount = items.filter((item) => item.state === "stale").length;

  return (
    <section className="shrink-0 border-b border-ds-border-subtle bg-ds-surface px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-ds-text-muted">
            Source Review
          </h3>
          <p className="mt-0.5 text-xs text-ds-text-secondary">
            {items.length} source issue{items.length === 1 ? "" : "s"} across
            the deck
          </p>
        </div>
        <button
          type="button"
          disabled={staleCount === 0}
          onClick={onRefreshAll}
          className="rounded-ds-sm border border-ds-border-subtle px-2.5 py-1 text-xs font-medium text-ds-text-primary hover:bg-ds-state-hover disabled:opacity-40"
        >
          Refresh all safe stale ({staleCount})
        </button>
      </div>
      {statusMessage ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-2 rounded-ds-sm bg-ds-surface-raised px-2 py-1 text-xs text-ds-text-secondary"
        >
          {statusMessage}
        </p>
      ) : null}
      <div className="mt-2 max-h-44 overflow-auto rounded-ds-sm border border-ds-border-subtle">
        <table className="min-w-full text-left text-xs">
          <thead className="sticky top-0 bg-ds-surface-raised text-ds-text-muted">
            <tr>
              <th className="px-2 py-1 font-medium">Slide</th>
              <th className="px-2 py-1 font-medium">Node</th>
              <th className="px-2 py-1 font-medium">Source block</th>
              <th className="px-2 py-1 font-medium">State</th>
              <th className="px-2 py-1 font-medium">Reason</th>
              <th className="px-2 py-1 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ds-border-subtle">
            {items.map((item) => (
              <tr key={`${item.slideId}-${item.nodeId}`}>
                <td className="px-2 py-1 text-ds-text-primary">
                  {item.slideLabel}
                </td>
                <td className="px-2 py-1 font-mono text-ds-text-secondary">
                  {item.nodeName ?? item.nodeId}
                </td>
                <td className="px-2 py-1 text-ds-text-secondary">
                  <span>{item.sourceLabel}</span>
                  <span className="ml-1 font-mono text-ds-text-muted">
                    {item.source.blockKind ?? item.block?.kind ?? "source"}:
                    {item.source.blockId ?? "unknown"}
                  </span>
                </td>
                <td className="px-2 py-1">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${stateClass(item.state)}`}
                  >
                    {STATE_LABEL[item.state]}
                  </span>
                </td>
                <td className="max-w-[14rem] px-2 py-1 text-ds-text-muted">
                  {item.reason}
                </td>
                <td className="px-2 py-1">
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => onSelect(item.slideId, item.nodeId)}
                      className="rounded-ds-sm border border-ds-border-subtle px-1.5 py-0.5 text-[11px] text-ds-text-secondary hover:bg-ds-state-hover"
                    >
                      Go
                    </button>
                    <button
                      type="button"
                      disabled={item.state !== "stale"}
                      onClick={() => onRefresh(item.slideId, item.nodeId)}
                      className="rounded-ds-sm border border-ds-border-subtle px-1.5 py-0.5 text-[11px] text-ds-text-secondary hover:bg-ds-state-hover disabled:opacity-40"
                    >
                      Refresh
                    </button>
                    <select
                      aria-label={`Relink ${item.nodeName ?? item.nodeId}`}
                      defaultValue=""
                      disabled={relinkOptions.length === 0}
                      onChange={(event) => {
                        const block = relinkOptions.find(
                          (option) =>
                            `${option.kind}:${option.id}` ===
                            event.currentTarget.value,
                        );
                        if (block) onRelink(item.slideId, item.nodeId, block);
                        event.currentTarget.value = "";
                      }}
                      className="rounded-ds-sm border border-ds-border-subtle bg-ds-surface px-1.5 py-0.5 text-[11px] text-ds-text-secondary disabled:opacity-40"
                    >
                      <option value="">Relink…</option>
                      {relinkOptions.map((block) => (
                        <option
                          key={`${block.kind}:${block.id}`}
                          value={`${block.kind}:${block.id}`}
                        >
                          {block.displayLabel} ({block.kind}:{block.id})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => onUnlink(item.slideId, item.nodeId)}
                      className="rounded-ds-sm border border-ds-border-subtle px-1.5 py-0.5 text-[11px] text-ds-text-secondary hover:bg-ds-state-hover"
                    >
                      Mark unlinked
                    </button>
                    <button
                      type="button"
                      onClick={() => onDismiss(item.slideId, item.nodeId)}
                      className="rounded-ds-sm border border-ds-border-subtle px-1.5 py-0.5 text-[11px] text-ds-text-secondary hover:bg-ds-state-hover"
                    >
                      Dismiss
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
