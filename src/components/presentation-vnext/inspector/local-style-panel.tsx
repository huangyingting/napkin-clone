"use client";

import type { JSX } from "react";

import type { SlideChildNode } from "@/lib/presentation-vnext/schema";
import type { StylePatch } from "@/lib/presentation-vnext/style-schema";
import { FOCUS_RING } from "@/components/ui/tokens";
import {
  clampToRange,
  parseFiniteNumberInput,
  sanitizeBoundedNumber,
} from "./numeric-sanitization";

export interface LocalStylePanelProps {
  node: SlideChildNode;
  onUpdateLocalStyle: (patch: StylePatch) => void;
}

export function solidFillColor(localStyle: StylePatch | undefined): string {
  const fill = localStyle?.fill;
  return fill?.type === "solid" && typeof fill.color === "string"
    ? fill.color
    : "#ffffff";
}

export function strokeColor(localStyle: StylePatch | undefined): string {
  return typeof localStyle?.stroke?.color === "string"
    ? localStyle.stroke.color
    : "#111111";
}

export function connectorStrokeColor(
  localStyle: StylePatch | undefined,
): string {
  return typeof localStyle?.connector?.stroke?.color === "string"
    ? localStyle.connector.stroke.color
    : "#111111";
}

export function tableFillColor(
  fill: StylePatch["table"] extends { headerFill?: infer F } ? F : unknown,
  fallback: string,
): string {
  return typeof fill === "object" &&
    fill !== null &&
    "type" in fill &&
    fill.type === "solid" &&
    "color" in fill &&
    typeof fill.color === "string"
    ? fill.color
    : fallback;
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
  const lineHeight = node.localStyle?.text?.lineHeight ?? 1.15;
  const opacity = node.localStyle?.opacity ?? 1;
  const canEditText = node.type === "text" || node.type === "shape";
  const canEditFill = node.type === "shape" || node.type === "text";
  const canEditStroke = node.type === "shape";
  const canEditConnector = node.type === "connector";
  const canEditVisual = node.type === "visual";
  const canEditTable = node.type === "table";

  return (
    <section className="flex flex-col gap-2 px-3 py-2.5">
      <h4 className="text-[10px] font-bold uppercase tracking-[0.06em] text-ds-text-muted">
        Local Style
      </h4>
      {canEditText ? (
        <div className="flex flex-col gap-2">
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
                onChange={(event) => {
                  const parsed = parseFiniteNumberInput(
                    event.currentTarget.value,
                  );
                  const fontSize =
                    parsed === undefined
                      ? undefined
                      : sanitizeBoundedNumber(parsed, 4, 160);
                  if (fontSize === undefined) return;
                  onUpdateLocalStyle({
                    text: { fontSizePt: fontSize },
                  });
                }}
                className={`h-8 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
              Weight
              <select
                value={node.localStyle?.text?.weight ?? 400}
                onChange={(event) => {
                  const parsed = parseFiniteNumberInput(
                    event.currentTarget.value,
                  );
                  if (parsed === undefined) return;
                  onUpdateLocalStyle({
                    text: {
                      weight: Math.round(clampToRange(parsed, 100, 900)),
                    },
                  });
                }}
                className={`h-8 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
              >
                <option value={300}>Light</option>
                <option value={400}>Regular</option>
                <option value={600}>Semibold</option>
                <option value={700}>Bold</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
              Align
              <select
                value={node.localStyle?.text?.align ?? "left"}
                onChange={(event) =>
                  onUpdateLocalStyle({
                    text: {
                      align: event.currentTarget.value as
                        "left" | "center" | "right",
                    },
                  })
                }
                className={`h-8 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
            Line height
            <input
              type="range"
              value={lineHeight}
              min={0.8}
              max={2}
              step={0.05}
              onChange={(event) => {
                const parsed = parseFiniteNumberInput(
                  event.currentTarget.value,
                );
                const lineHeight =
                  parsed === undefined
                    ? undefined
                    : sanitizeBoundedNumber(parsed, 0.8, 2);
                if (lineHeight === undefined) return;
                onUpdateLocalStyle({
                  text: { lineHeight },
                });
              }}
            />
          </label>
          <div className="flex gap-4 text-xs text-ds-text-secondary">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={node.localStyle?.text?.italic === true}
                onChange={(event) =>
                  onUpdateLocalStyle({
                    text: { italic: event.currentTarget.checked },
                  })
                }
              />
              Italic
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={node.localStyle?.text?.underline === true}
                onChange={(event) =>
                  onUpdateLocalStyle({
                    text: { underline: event.currentTarget.checked },
                  })
                }
              />
              Underline
            </label>
          </div>
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
      {canEditStroke ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
            Stroke color
            <input
              type="color"
              value={strokeColor(node.localStyle)}
              onChange={(event) =>
                onUpdateLocalStyle({
                  stroke: {
                    color: event.currentTarget.value,
                    widthPt: node.localStyle?.stroke?.widthPt ?? 1,
                  },
                })
              }
              className={`h-8 w-full rounded-ds-md border border-ds-border-subtle bg-ds-surface ${FOCUS_RING}`}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
            Stroke width
            <input
              type="number"
              value={node.localStyle?.stroke?.widthPt ?? 1}
              min={0}
              max={24}
              step={0.5}
              onChange={(event) => {
                const parsed = parseFiniteNumberInput(
                  event.currentTarget.value,
                );
                const widthPt =
                  parsed === undefined
                    ? undefined
                    : sanitizeBoundedNumber(parsed, 0, 24);
                if (widthPt === undefined) return;
                onUpdateLocalStyle({
                  stroke: {
                    color: strokeColor(node.localStyle),
                    widthPt,
                  },
                });
              }}
              className={`h-8 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
            />
          </label>
        </div>
      ) : null}
      {canEditConnector ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
            Line color
            <input
              type="color"
              value={connectorStrokeColor(node.localStyle)}
              onChange={(event) =>
                onUpdateLocalStyle({
                  connector: {
                    ...node.localStyle?.connector,
                    stroke: {
                      color: event.currentTarget.value,
                      widthPt:
                        node.localStyle?.connector?.stroke?.widthPt ?? 1.5,
                    },
                  },
                })
              }
              className={`h-8 w-full rounded-ds-md border border-ds-border-subtle bg-ds-surface ${FOCUS_RING}`}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
            Line width
            <input
              type="number"
              value={node.localStyle?.connector?.stroke?.widthPt ?? 1.5}
              min={0.5}
              max={24}
              step={0.5}
              onChange={(event) => {
                const parsed = parseFiniteNumberInput(
                  event.currentTarget.value,
                );
                const widthPt =
                  parsed === undefined
                    ? undefined
                    : sanitizeBoundedNumber(parsed, 0.5, 24);
                if (widthPt === undefined) return;
                onUpdateLocalStyle({
                  connector: {
                    ...node.localStyle?.connector,
                    stroke: {
                      color: connectorStrokeColor(node.localStyle),
                      widthPt,
                    },
                  },
                });
              }}
              className={`h-8 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
            Dash
            <select
              value={node.localStyle?.connector?.stroke?.dash ?? "solid"}
              onChange={(event) =>
                onUpdateLocalStyle({
                  connector: {
                    ...node.localStyle?.connector,
                    stroke: {
                      color: connectorStrokeColor(node.localStyle),
                      widthPt:
                        node.localStyle?.connector?.stroke?.widthPt ?? 1.5,
                      dash: event.currentTarget.value as
                        "solid" | "dashed" | "dotted",
                    },
                  },
                })
              }
              className={`h-8 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
            Start arrow
            <select
              value={node.localStyle?.connector?.startArrow ?? "none"}
              onChange={(event) =>
                onUpdateLocalStyle({
                  connector: {
                    ...node.localStyle?.connector,
                    startArrow: event.currentTarget.value as
                      "none" | "arrow" | "filled",
                  },
                })
              }
              className={`h-8 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
            >
              <option value="none">None</option>
              <option value="arrow">Arrow</option>
              <option value="filled">Filled</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
            End arrow
            <select
              value={node.localStyle?.connector?.endArrow ?? "arrow"}
              onChange={(event) =>
                onUpdateLocalStyle({
                  connector: {
                    ...node.localStyle?.connector,
                    endArrow: event.currentTarget.value as
                      "none" | "arrow" | "filled",
                  },
                })
              }
              className={`h-8 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
            >
              <option value="none">None</option>
              <option value="arrow">Arrow</option>
              <option value="filled">Filled</option>
            </select>
          </label>
        </div>
      ) : null}
      {canEditVisual ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
            Visual theme
            <select
              value={node.localStyle?.visual?.styleThemeId ?? "default"}
              onChange={(event) =>
                onUpdateLocalStyle({
                  visual: { styleThemeId: event.currentTarget.value },
                })
              }
              className={`h-8 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
            >
              <option value="default">Default</option>
              <option value="accent">Accent</option>
              <option value="muted">Muted</option>
              <option value="contrast">Contrast</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 self-end text-xs text-ds-text-secondary">
            <input
              type="checkbox"
              checked={node.localStyle?.visual?.transparentBackground === true}
              onChange={(event) =>
                onUpdateLocalStyle({
                  visual: {
                    ...node.localStyle?.visual,
                    transparentBackground: event.currentTarget.checked,
                  },
                })
              }
            />
            Transparent
          </label>
          {(["primary", "secondary", "accent", "muted"] as const).map(
            (channel) => (
              <label
                key={channel}
                className="flex flex-col gap-1 text-xs text-ds-text-secondary"
              >
                {channel} color
                <input
                  type="color"
                  value={
                    typeof node.localStyle?.visual?.channelColors?.[channel] ===
                    "string"
                      ? (node.localStyle.visual.channelColors[
                          channel
                        ] as string)
                      : channel === "primary"
                        ? "#2563eb"
                        : channel === "secondary"
                          ? "#64748b"
                          : channel === "accent"
                            ? "#f59e0b"
                            : "#94a3b8"
                  }
                  onChange={(event) =>
                    onUpdateLocalStyle({
                      visual: {
                        ...node.localStyle?.visual,
                        channelColors: {
                          ...node.localStyle?.visual?.channelColors,
                          [channel]: event.currentTarget.value,
                        },
                      },
                    })
                  }
                  className={`h-8 w-full rounded-ds-md border border-ds-border-subtle bg-ds-surface ${FOCUS_RING}`}
                />
              </label>
            ),
          )}
        </div>
      ) : null}
      {canEditTable ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
            Header fill
            <input
              type="color"
              value={tableFillColor(
                node.localStyle?.table?.headerFill,
                "#f8fafc",
              )}
              onChange={(event) =>
                onUpdateLocalStyle({
                  table: {
                    ...node.localStyle?.table,
                    headerFill: {
                      type: "solid",
                      color: event.currentTarget.value,
                    },
                  },
                })
              }
              className={`h-8 w-full rounded-ds-md border border-ds-border-subtle bg-ds-surface ${FOCUS_RING}`}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
            Row fill
            <input
              type="color"
              value={tableFillColor(node.localStyle?.table?.rowFill, "#ffffff")}
              onChange={(event) =>
                onUpdateLocalStyle({
                  table: {
                    ...node.localStyle?.table,
                    rowFill: {
                      type: "solid",
                      color: event.currentTarget.value,
                    },
                  },
                })
              }
              className={`h-8 w-full rounded-ds-md border border-ds-border-subtle bg-ds-surface ${FOCUS_RING}`}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
            Alternate fill
            <input
              type="color"
              value={tableFillColor(
                node.localStyle?.table?.alternateRowFill,
                "#f8fafc",
              )}
              onChange={(event) =>
                onUpdateLocalStyle({
                  table: {
                    ...node.localStyle?.table,
                    alternateRowFill: {
                      type: "solid",
                      color: event.currentTarget.value,
                    },
                  },
                })
              }
              className={`h-8 w-full rounded-ds-md border border-ds-border-subtle bg-ds-surface ${FOCUS_RING}`}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
            Border color
            <input
              type="color"
              value={
                typeof node.localStyle?.table?.border?.color === "string"
                  ? node.localStyle.table.border.color
                  : "#cbd5e1"
              }
              onChange={(event) =>
                onUpdateLocalStyle({
                  table: {
                    ...node.localStyle?.table,
                    border: {
                      color: event.currentTarget.value,
                      widthPt: node.localStyle?.table?.border?.widthPt ?? 1,
                    },
                  },
                })
              }
              className={`h-8 w-full rounded-ds-md border border-ds-border-subtle bg-ds-surface ${FOCUS_RING}`}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
            Border width
            <input
              type="number"
              value={node.localStyle?.table?.border?.widthPt ?? 1}
              min={0}
              max={8}
              step={0.5}
              onChange={(event) => {
                const parsed = parseFiniteNumberInput(
                  event.currentTarget.value,
                );
                const widthPt =
                  parsed === undefined
                    ? undefined
                    : sanitizeBoundedNumber(parsed, 0, 8);
                if (widthPt === undefined) return;
                onUpdateLocalStyle({
                  table: {
                    ...node.localStyle?.table,
                    border: {
                      color:
                        typeof node.localStyle?.table?.border?.color ===
                        "string"
                          ? node.localStyle.table.border.color
                          : "#cbd5e1",
                      widthPt,
                    },
                  },
                });
              }}
              className={`h-8 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
            Cell padding
            <input
              type="number"
              value={node.localStyle?.table?.cellPaddingPt?.top ?? 4}
              min={0}
              max={24}
              step={1}
              onChange={(event) => {
                const parsed = parseFiniteNumberInput(
                  event.currentTarget.value,
                );
                const padding =
                  parsed === undefined
                    ? undefined
                    : sanitizeBoundedNumber(parsed, 0, 24);
                if (padding === undefined) return;
                onUpdateLocalStyle({
                  table: {
                    ...node.localStyle?.table,
                    cellPaddingPt: {
                      top: padding,
                      right: padding,
                      bottom: padding,
                      left: padding,
                    },
                  },
                });
              }}
              className={`h-8 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
            />
          </label>
        </div>
      ) : null}
      <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
        Opacity
        <input
          type="range"
          value={opacity}
          min={0}
          max={1}
          step={0.05}
          onChange={(event) => {
            const parsed = parseFiniteNumberInput(event.currentTarget.value);
            const nextOpacity =
              parsed === undefined
                ? undefined
                : sanitizeBoundedNumber(parsed, 0, 1);
            if (nextOpacity === undefined) return;
            onUpdateLocalStyle({ opacity: nextOpacity });
          }}
        />
      </label>
    </section>
  );
}
