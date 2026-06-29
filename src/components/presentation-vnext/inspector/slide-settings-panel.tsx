"use client";

import type { JSX } from "react";

import type {
  NodeSourceMetadata,
  SlideNode,
} from "@/lib/presentation-vnext/schema";
import type { StylePatch } from "@/lib/presentation-vnext/style-schema";
import { FOCUS_RING } from "@/components/ui/tokens";

export interface SlideSettingsPanelProps {
  slide: SlideNode;
  onUpdateSlide: (patch: { name?: string; notes?: string }) => void;
  onUpdateSource: (source: NodeSourceMetadata | undefined) => void;
  onUpdateLocalStyle: (patch: StylePatch) => void;
  onResetLocalStyle: () => void;
}

function slideBackgroundColor(slide: SlideNode): string {
  const background = slide.localStyle?.slide?.background;
  return background?.type === "solid" && typeof background.color === "string"
    ? background.color
    : "#ffffff";
}

export function SlideSettingsPanel({
  slide,
  onUpdateSlide,
  onUpdateSource,
  onUpdateLocalStyle,
  onResetLocalStyle,
}: SlideSettingsPanelProps): JSX.Element {
  function updateSource(patch: Partial<NodeSourceMetadata>) {
    onUpdateSource({
      documentId: slide.source?.documentId ?? "",
      blockId: slide.source?.blockId ?? "",
      ...(slide.source?.blockKind ? { blockKind: slide.source.blockKind } : {}),
      ...(slide.source?.contentHash
        ? { contentHash: slide.source.contentHash }
        : {}),
      ...(slide.source?.linkedAt ? { linkedAt: slide.source.linkedAt } : {}),
      ...(slide.source?.unlinked ? { unlinked: slide.source.unlinked } : {}),
      ...patch,
    });
  }

  return (
    <section className="flex flex-col gap-2 px-3 py-2.5">
      <h4 className="text-[10px] font-bold uppercase tracking-[0.06em] text-ds-text-muted">
        Slide
      </h4>
      <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
        Name
        <input
          value={slide.name ?? ""}
          onChange={(event) =>
            onUpdateSlide({ name: event.currentTarget.value })
          }
          className={`rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
        Notes
        <textarea
          value={slide.notes ?? ""}
          rows={4}
          onChange={(event) =>
            onUpdateSlide({ notes: event.currentTarget.value })
          }
          className={`min-h-20 resize-y rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
        />
      </label>
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
          Background
          <input
            type="color"
            value={slideBackgroundColor(slide)}
            onChange={(event) =>
              onUpdateLocalStyle({
                slide: {
                  background: {
                    type: "solid",
                    color: event.currentTarget.value,
                  },
                },
              })
            }
            className={`h-8 w-full rounded-ds-md border border-ds-border-subtle bg-ds-surface ${FOCUS_RING}`}
          />
        </label>
        <button
          type="button"
          onClick={onResetLocalStyle}
          className="h-8 rounded-ds-sm border border-ds-border-subtle px-2 text-xs text-ds-text-secondary hover:bg-ds-state-hover"
        >
          Reset
        </button>
      </div>
      <div className="my-1 h-px bg-ds-border-subtle" aria-hidden="true" />
      <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
        Source document
        <input
          value={slide.source?.documentId ?? ""}
          onChange={(event) =>
            updateSource({ documentId: event.currentTarget.value })
          }
          className={`rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 font-mono text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
        Source block
        <input
          value={slide.source?.blockId ?? ""}
          onChange={(event) =>
            updateSource({ blockId: event.currentTarget.value })
          }
          className={`rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 font-mono text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
        />
      </label>
      {slide.source ? (
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
