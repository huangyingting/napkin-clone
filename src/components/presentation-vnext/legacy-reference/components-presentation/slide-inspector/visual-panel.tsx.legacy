"use client";

import { Link2 } from "lucide-react";

import { PanelSection } from "./primitives";
import { FOCUS_RING } from "@/components/ui/tokens";
import type { SlideElement } from "@/lib/presentation/deck";
import type { StaleReason } from "@/lib/presentation/source-link-staleness";
import {
  resolveVisualPanelActions,
  resolveVisualPanelStatus,
} from "@/lib/presentation/visual-panel-status";

export function VisualPanel({
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
      <PanelSection>
        <p className="text-xs text-ds-text-muted">
          Select an element to see its document visual link.
        </p>
      </PanelSection>
    );
  }
  const ref = (element as { source?: SlideElement["source"] }).source;
  if (!ref) {
    return (
      <PanelSection>
        <p className="text-sm font-medium text-ds-text-primary">Standalone</p>
        <p className="text-xs text-ds-text-muted">
          Not linked to a document. Use the Add menu in the toolbar to link
          content.
        </p>
      </PanelSection>
    );
  }

  const status = resolveVisualPanelStatus({
    hasSourceRef: true,
    unlinked: ref.unlinked === true,
    staleReason,
  });
  const actions = resolveVisualPanelActions(status);

  const statusMeta = {
    unlinked: { label: "Unlinked", tone: "text-ds-text-secondary" },
    visual_missing: { label: "Visual missing", tone: "text-ds-danger-text" },
    stale: { label: "Stale", tone: "text-ds-warning-text" },
    linked: { label: "Up to date", tone: "text-ds-success-text" },
    standalone: { label: "Standalone", tone: "text-ds-text-secondary" },
  }[status];

  const explanation = {
    unlinked: "Unlinked. Relink to track the document block again.",
    visual_missing: "Linked block is gone. Unlink to keep standalone.",
    stale: "Document block changed since last sync. Update to pull changes.",
    linked: "Matches the linked document block.",
    standalone: "Not linked to a document.",
  }[status];

  const actionClass = `rounded-ds-md border border-ds-border-subtle px-2.5 py-1.5 text-xs font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`;

  return (
    <PanelSection title="Visual" icon={<Link2 size={12} aria-hidden="true" />}>
      <div className="flex flex-col gap-1">
        <span
          className={`text-sm font-semibold ${statusMeta.tone}`}
          data-testid="visual-status"
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
            Update visual
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
    </PanelSection>
  );
}
