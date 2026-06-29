"use client";

import type { JSX } from "react";

import type { SlideChildNode } from "@/lib/presentation-vnext/schema";
import type { StylePatch } from "@/lib/presentation-vnext/style-schema";
import { FOCUS_RING } from "@/components/ui/tokens";

export interface LocalStylePanelProps {
  node: SlideChildNode;
  onUpdateLocalStyle: (patch: StylePatch) => void;
}

function solidFillColor(localStyle: StylePatch | undefined): string {
  const fill = localStyle?.fill;
  return fill?.type === "solid" && typeof fill.color === "string"
    ? fill.color
    : "#ffffff";
}

export function LocalStylePanel({
  node,
  onUpdateLocalStyle,
}: LocalStylePanelProps): JSX.Element {
  const textColor =
    typeof node.localStyle?.text?.color === "string"
      ? node.localStyle.text.color
      : "#111111";
  const fontSize = node.localStyle?.text?.fontSizePt ?? 14;
  const opacity = node.localStyle?.opacity ?? 1;
  const canEditText = node.type === "text" || node.type === "shape";
  const canEditFill = node.type === "shape" || node.type === "text";

  return (
    <section className="flex flex-col gap-2 px-3 py-2.5">
      <h4 className="text-[10px] font-bold uppercase tracking-[0.06em] text-ds-text-muted">
        Local Style
      </h4>
      {canEditText ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
            Text color
            <input
              type="color"
              value={textColor}
              onChange={(event) =>
                onUpdateLocalStyle({
                  text: { color: event.currentTarget.value },
                })
              }
              className={`h-8 w-full rounded-ds-md border border-ds-border-subtle bg-ds-surface ${FOCUS_RING}`}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
            Font size
            <input
              type="number"
              value={fontSize}
              min={4}
              max={160}
              step={1}
              onChange={(event) =>
                onUpdateLocalStyle({
                  text: { fontSizePt: Number(event.currentTarget.value) },
                })
              }
              className={`h-8 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
            />
          </label>
        </div>
      ) : null}
      {canEditFill ? (
        <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
          Fill color
          <input
            type="color"
            value={solidFillColor(node.localStyle)}
            onChange={(event) =>
              onUpdateLocalStyle({
                fill: { type: "solid", color: event.currentTarget.value },
              })
            }
            className={`h-8 w-full rounded-ds-md border border-ds-border-subtle bg-ds-surface ${FOCUS_RING}`}
          />
        </label>
      ) : null}
      <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
        Opacity
        <input
          type="range"
          value={opacity}
          min={0}
          max={1}
          step={0.05}
          onChange={(event) =>
            onUpdateLocalStyle({ opacity: Number(event.currentTarget.value) })
          }
        />
      </label>
    </section>
  );
}
