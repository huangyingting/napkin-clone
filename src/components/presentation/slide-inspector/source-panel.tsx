"use client";

import { FOCUS_RING } from "@/components/ui/tokens";
import type { SlideElement } from "@/lib/presentation/deck";
import type { StaleReason } from "@/lib/presentation/source-link-staleness";
import {
  resolveSourcePanelActions,
  resolveSourcePanelStatus,
} from "@/lib/presentation/source-panel-status";

export function SourceSummary({
  element,
  staleReason,
  onUpdateFromSource,
  onUnlink,
  onRelink,
}: {
  element: SlideElement | null | undefined;
  staleReason?: StaleReason;
  onUpdateFromSource?: (elementId: string) => void;
  onUnlink?: (elementId: string) => void;
  onRelink?: (elementId: string) => void;
}) {
  if (!element) {
    return (
      <p className="text-xs text-ds-text-muted">
        Select an element to see its document source link.
      </p>
    );
  }
  const ref = (element as { source?: SlideElement["source"] }).source;
  if (!ref) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-ds-text-primary">Standalone</p>
        <p className="text-xs text-ds-text-muted">
          This element is not linked to a document. Insert content from the
          stage toolbar’s “From document” menu to establish a source link.
        </p>
      </div>
    );
  }

  const status = resolveSourcePanelStatus({
    hasSourceRef: true,
    unlinked: ref.unlinked === true,
    staleReason,
  });
  const actions = resolveSourcePanelActions(status);

  const statusMeta = {
    unlinked: { label: "Unlinked", tone: "text-ds-text-secondary" },
    source_missing: { label: "Source missing", tone: "text-ds-danger-text" },
    stale: { label: "Stale", tone: "text-ds-warning-text" },
    linked: { label: "Up to date", tone: "text-ds-success-text" },
    standalone: { label: "Standalone", tone: "text-ds-text-secondary" },
  }[status];

  const explanation = {
    unlinked:
      "This link was intentionally unlinked. Relink to track the source block again.",
    source_missing:
      "The linked source block no longer exists in the document. Unlink to keep this element as standalone.",
    stale:
      "The linked source block changed since this element was last synced. Update to pull the latest content.",
    linked: "This element matches its linked source block.",
    standalone: "This element is not linked to a document.",
  }[status];

  const actionClass = `rounded-ds-md border border-ds-border-subtle px-2.5 py-1.5 text-xs font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span
          className={`text-sm font-semibold ${statusMeta.tone}`}
          data-testid="source-status"
        >
          {statusMeta.label}
        </span>
        <p className="text-xs text-ds-text-muted">{explanation}</p>
      </div>
      <dl className="flex flex-col gap-1.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-ds-text-muted">Block kind</dt>
          <dd className="font-medium capitalize text-ds-text-secondary">
            {ref.blockKind}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="shrink-0 text-ds-text-muted">Block id</dt>
          <dd className="truncate font-mono text-ds-text-secondary">
            {ref.blockId}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-ds-text-muted">Linked</dt>
          <dd className="text-ds-text-secondary">
            {new Date(ref.linkedAt).toLocaleString()}
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        {actions.canUpdate && onUpdateFromSource ? (
          <button
            type="button"
            className={actionClass}
            onClick={() => onUpdateFromSource(element.id)}
          >
            Update from source
          </button>
        ) : null}
        {actions.canUnlink && onUnlink ? (
          <button
            type="button"
            className={actionClass}
            onClick={() => onUnlink(element.id)}
          >
            Unlink
          </button>
        ) : null}
        {actions.canRelink && onRelink ? (
          <button
            type="button"
            className={actionClass}
            onClick={() => onRelink(element.id)}
          >
            Relink
          </button>
        ) : null}
      </div>
    </div>
  );
}
