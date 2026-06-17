"use client";

import { useMemo } from "react";

import { STYLE_THEMES, type StyleTheme } from "@/lib/visual/themes";
import type { Visual, VisualNode, VisualStyle } from "@/lib/visual/schema";

import { IconPicker } from "./icon-picker";

/** Selectable label font weights (US-014). */
const FONT_WEIGHTS: { value: number; label: string }[] = [
  { value: 400, label: "Normal" },
  { value: 500, label: "Medium" },
  { value: 600, label: "Semibold" },
  { value: 700, label: "Bold" },
  { value: 800, label: "Black" },
];

const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 28;

/** Per-node style override fields the selected-element controls can set. */
type NodeStyleField = "color" | "stroke" | "textColor";

function setStyle(visual: Visual, patch: Partial<VisualStyle>): Visual {
  return { ...visual, style: { ...visual.style, ...patch } };
}

function applyTheme(visual: Visual, theme: StyleTheme): Visual {
  return { ...visual, style: { ...visual.style, ...theme.colors } };
}

function setNodeStyle(
  visual: Visual,
  id: string,
  field: NodeStyleField,
  value: string,
): Visual {
  return {
    ...visual,
    nodes: visual.nodes.map((node) =>
      node.id === id ? { ...node, [field]: value } : node,
    ),
  };
}

/** Clears every per-node color override, falling back to the theme defaults. */
function resetNodeStyle(visual: Visual, id: string): Visual {
  return {
    ...visual,
    nodes: visual.nodes.map((node) => {
      if (node.id !== id) {
        return node;
      }
      const next: VisualNode = { ...node };
      delete next.color;
      delete next.stroke;
      delete next.textColor;
      return next;
    }),
  };
}

/** Assigns a catalog icon name to a node. */
function setNodeIcon(visual: Visual, id: string, icon: string): Visual {
  return {
    ...visual,
    nodes: visual.nodes.map((node) =>
      node.id === id ? { ...node, icon } : node,
    ),
  };
}

/** Removes a node's icon, falling back to no icon. */
function clearNodeIcon(visual: Visual, id: string): Visual {
  return {
    ...visual,
    nodes: visual.nodes.map((node) => {
      if (node.id !== id) {
        return node;
      }
      const next: VisualNode = { ...node };
      delete next.icon;
      return next;
    }),
  };
}

function themeActive(style: VisualStyle, theme: StyleTheme): boolean {
  const c = theme.colors;
  return (
    style.background === c.background &&
    style.nodeFill === c.nodeFill &&
    style.nodeStroke === c.nodeStroke &&
    style.nodeText === c.nodeText &&
    style.edgeColor === c.edgeColor &&
    style.palette.length === c.palette.length &&
    style.palette.every((color, index) => color === c.palette[index])
  );
}

/** Coerces an arbitrary CSS color to a `#rrggbb` value for a native picker. */
function toHex(value: string | undefined, fallback: string): string {
  if (value && /^#[0-9a-fA-F]{6}$/.test(value)) {
    return value.toLowerCase();
  }
  return fallback;
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-zinc-600 dark:text-zinc-300">
      <span>{label}</span>
      <input
        type="color"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-7 w-9 cursor-pointer rounded border border-black/[.12] bg-transparent p-0.5 dark:border-white/20"
      />
    </label>
  );
}

/**
 * Style panel for the editor's attached visual (US-014). Lets the user:
 *
 * - pick a color theme/palette applied to the whole visual,
 * - override the visual's background / node fill / border / text / edge colors,
 * - set the label font size and weight,
 * - override the selected element's fill / border / text color (when a node is
 *   selected in the canvas).
 *
 * Every change is pushed up through `onChange`; the parent live-renders it and
 * debounce-saves it to the document, so styling persists across reloads.
 */
export function StylePanel({
  visual,
  selectedNodeId,
  onChange,
}: {
  visual: Visual;
  selectedNodeId: string | null;
  onChange: (next: Visual) => void;
}) {
  const { style } = visual;

  const selectedNode = useMemo(
    () =>
      selectedNodeId
        ? (visual.nodes.find((node) => node.id === selectedNodeId) ?? null)
        : null,
    [visual.nodes, selectedNodeId],
  );

  return (
    <section
      aria-label="Style"
      className="space-y-4 border-t border-black/[.06] px-4 py-3 dark:border-white/[.08]"
    >
      <div>
        <p className="mb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Theme
        </p>
        <div
          role="group"
          aria-label="Color theme"
          className="flex flex-wrap gap-1.5"
        >
          {STYLE_THEMES.map((theme) => {
            const active = themeActive(style, theme);
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => onChange(applyTheme(visual, theme))}
                aria-pressed={active}
                aria-label={`Theme ${theme.name}`}
                title={theme.name}
                className={[
                  "flex items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-1 text-xs font-medium transition",
                  active
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
                    : "border-black/[.08] text-zinc-600 hover:border-black/20 hover:text-zinc-900 dark:border-white/[.12] dark:text-zinc-300 dark:hover:border-white/30 dark:hover:text-zinc-100",
                ].join(" ")}
              >
                <span
                  aria-hidden="true"
                  className="h-4 w-4 rounded-full border border-black/10 dark:border-white/20"
                  style={{ backgroundColor: theme.colors.nodeStroke }}
                />
                {theme.name}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Colors
        </p>
        <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
          <ColorField
            label="Background color"
            value={toHex(style.background, "#ffffff")}
            onChange={(value) =>
              onChange(setStyle(visual, { background: value }))
            }
          />
          <ColorField
            label="Node fill color"
            value={toHex(style.nodeFill, "#eef2ff")}
            onChange={(value) =>
              onChange(setStyle(visual, { nodeFill: value }))
            }
          />
          <ColorField
            label="Node border color"
            value={toHex(style.nodeStroke, "#6366f1")}
            onChange={(value) =>
              onChange(setStyle(visual, { nodeStroke: value }))
            }
          />
          <ColorField
            label="Node text color"
            value={toHex(style.nodeText, "#1e1b4b")}
            onChange={(value) =>
              onChange(setStyle(visual, { nodeText: value }))
            }
          />
          <ColorField
            label="Edge color"
            value={toHex(style.edgeColor, "#94a3b8")}
            onChange={(value) =>
              onChange(setStyle(visual, { edgeColor: value }))
            }
          />
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Typography
        </p>
        <div className="space-y-2">
          <label className="flex items-center justify-between gap-2 text-xs text-zinc-600 dark:text-zinc-300">
            <span>Font size</span>
            <span className="flex items-center gap-2">
              <input
                type="range"
                aria-label="Font size"
                min={FONT_SIZE_MIN}
                max={FONT_SIZE_MAX}
                step={1}
                value={style.fontSize}
                onChange={(event) =>
                  onChange(
                    setStyle(visual, { fontSize: Number(event.target.value) }),
                  )
                }
                className="w-32 accent-zinc-900 dark:accent-white"
              />
              <span className="w-9 text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                {style.fontSize}px
              </span>
            </span>
          </label>
          <label className="flex items-center justify-between gap-2 text-xs text-zinc-600 dark:text-zinc-300">
            <span>Font weight</span>
            <select
              aria-label="Font weight"
              value={style.fontWeight}
              onChange={(event) =>
                onChange(
                  setStyle(visual, { fontWeight: Number(event.target.value) }),
                )
              }
              className="rounded-md border border-black/[.12] bg-white px-2 py-1 text-xs text-zinc-700 outline-none dark:border-white/20 dark:bg-zinc-900 dark:text-zinc-200"
            >
              {FONT_WEIGHTS.map((weight) => (
                <option key={weight.value} value={weight.value}>
                  {weight.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Selected element
          </p>
          {selectedNode ? (
            <button
              type="button"
              aria-label="Reset element style"
              onClick={() => onChange(resetNodeStyle(visual, selectedNode.id))}
              className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Reset
            </button>
          ) : null}
        </div>
        {selectedNode ? (
          <div className="space-y-1.5">
            <p className="truncate text-[11px] text-zinc-400 dark:text-zinc-500">
              {selectedNode.label || "Untitled node"}
            </p>
            <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
              <ColorField
                label="Element fill color"
                value={toHex(
                  selectedNode.color,
                  toHex(style.nodeFill, "#eef2ff"),
                )}
                onChange={(value) =>
                  onChange(
                    setNodeStyle(visual, selectedNode.id, "color", value),
                  )
                }
              />
              <ColorField
                label="Element border color"
                value={toHex(
                  selectedNode.stroke,
                  toHex(style.nodeStroke, "#6366f1"),
                )}
                onChange={(value) =>
                  onChange(
                    setNodeStyle(visual, selectedNode.id, "stroke", value),
                  )
                }
              />
              <ColorField
                label="Element text color"
                value={toHex(
                  selectedNode.textColor,
                  toHex(style.nodeText, "#1e1b4b"),
                )}
                onChange={(value) =>
                  onChange(
                    setNodeStyle(visual, selectedNode.id, "textColor", value),
                  )
                }
              />
            </div>
            <IconPicker
              key={selectedNode.id}
              nodeLabel={selectedNode.label}
              value={selectedNode.icon}
              onSelect={(name) =>
                onChange(setNodeIcon(visual, selectedNode.id, name))
              }
              onRemove={() => onChange(clearNodeIcon(visual, selectedNode.id))}
            />
          </div>
        ) : (
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
            Click an element in the canvas to override its colors.
          </p>
        )}
      </div>
    </section>
  );
}
