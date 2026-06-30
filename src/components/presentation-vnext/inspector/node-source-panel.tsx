"use client";

import type { JSX } from "react";

import type {
  NodeSourceMetadata,
  SlideChildNode,
} from "@/lib/presentation-vnext/schema";
import { FOCUS_RING } from "@/components/ui/tokens";

export interface NodeSourcePanelProps {
  node: SlideChildNode;
  onUpdateSource: (source: NodeSourceMetadata | undefined) => void;
  onRefreshSource?: () => void;
}

const BLOCK_KIND_OPTIONS: NonNullable<NodeSourceMetadata["blockKind"]>[] = [
  "text",
  "visual",
  "table",
  "image",
];

export function sourceStatus(
  source: NodeSourceMetadata | undefined,
): "Standalone" | "Unlinked" | "Linked" | "Draft link" {
  const hasLink = Boolean(source?.documentId || source?.blockId);
  return !source
    ? "Standalone"
    : source.unlinked
      ? "Unlinked"
      : hasLink
        ? "Linked"
        : "Draft link";
}

export function sourceWithPatch(
  source: NodeSourceMetadata | undefined,
  patch: Partial<NodeSourceMetadata>,
): NodeSourceMetadata {
  return {
    documentId: source?.documentId ?? "",
    blockId: source?.blockId ?? "",
    ...(source?.blockKind ? { blockKind: source.blockKind } : {}),
    ...(source?.contentHash ? { contentHash: source.contentHash } : {}),
    ...(source?.linkedAt ? { linkedAt: source.linkedAt } : {}),
    ...(source?.unlinked ? { unlinked: source.unlinked } : {}),
    ...patch,
  };
}

export function NodeSourcePanel({
  node,
  onUpdateSource,
  onRefreshSource,
}: NodeSourcePanelProps): JSX.Element {
  const source = node.source;
  const status = sourceStatus(source);

  function updateSource(patch: Partial<NodeSourceMetadata>) {
    onUpdateSource(sourceWithPatch(source, patch));
  }

  return (
    <section className="flex flex-col gap-2 px-3 py-2.5">
      <h4 className="text-[10px] font-bold uppercase tracking-[0.06em] text-ds-text-muted">
        Source
      </h4>
      <div className="rounded-ds-sm border border-ds-border-subtle bg-ds-surface-raised px-2 py-1.5 text-xs text-ds-text-secondary">
        <div className="font-medium text-ds-text-primary">{status}</div>
        {source?.linkedAt ? (
          <div className="mt-0.5 font-mono text-[11px] text-ds-text-muted">
            Linked {source.linkedAt}
          </div>
        ) : null}
        {source?.contentHash ? (
          <div className="mt-0.5 truncate font-mono text-[11px] text-ds-text-muted">
            Hash {source.contentHash}
          </div>
        ) : null}
      </div>
      <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
        Document id
        <input
          value={source?.documentId ?? ""}
          onChange={(event) =>
            updateSource({ documentId: event.currentTarget.value })
          }
          className={`rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 font-mono text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
        Block id
        <input
          value={source?.blockId ?? ""}
          onChange={(event) =>
            updateSource({ blockId: event.currentTarget.value })
          }
          className={`rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 font-mono text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
        Kind
        <select
          value={source?.blockKind ?? ""}
          onChange={(event) =>
            updateSource({
              blockKind: event.currentTarget.value as NonNullable<
                NodeSourceMetadata["blockKind"]
              >,
            })
          }
          className={`rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
        >
          <option value="">Unspecified</option>
          {BLOCK_KIND_OPTIONS.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-xs text-ds-text-secondary">
        <input
          type="checkbox"
          checked={source?.unlinked === true}
          onChange={(event) =>
            updateSource({ unlinked: event.currentTarget.checked })
          }
        />
        Unlinked
      </label>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={!source}
          onClick={() =>
            updateSource({
              linkedAt: new Date().toISOString(),
              unlinked: false,
            })
          }
          className="rounded-ds-sm border border-ds-border-subtle px-2 py-1 text-xs text-ds-text-secondary hover:bg-ds-state-hover disabled:opacity-40"
        >
          Mark updated
        </button>
        <button
          type="button"
          disabled={!source || onRefreshSource === undefined}
          onClick={onRefreshSource}
          className="rounded-ds-sm border border-ds-border-subtle px-2 py-1 text-xs text-ds-text-secondary hover:bg-ds-state-hover disabled:opacity-40"
        >
          Update from document
        </button>
        <button
          type="button"
          disabled={!source || source.unlinked === true}
          onClick={() => updateSource({ unlinked: true })}
          className="rounded-ds-sm border border-ds-border-subtle px-2 py-1 text-xs text-ds-text-secondary hover:bg-ds-state-hover disabled:opacity-40"
        >
          Unlink
        </button>
        <button
          type="button"
          disabled={!source || source.unlinked !== true}
          onClick={() =>
            updateSource({
              linkedAt: new Date().toISOString(),
              unlinked: false,
            })
          }
          className="rounded-ds-sm border border-ds-border-subtle px-2 py-1 text-xs text-ds-text-secondary hover:bg-ds-state-hover disabled:opacity-40"
        >
          Relink
        </button>
      </div>
      {source ? (
        <button
          type="button"
          onClick={() => onUpdateSource(undefined)}
          className="self-start rounded-ds-sm border border-ds-border-subtle px-2 py-1 text-xs text-ds-text-secondary hover:bg-ds-state-hover"
        >
          Clear source
        </button>
      ) : null}
    </section>
  );
}
