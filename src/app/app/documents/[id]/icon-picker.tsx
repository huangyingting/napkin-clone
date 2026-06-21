"use client";

import { useId, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";

import { Tooltip } from "@/components/ui";
import { resolveIconComponent } from "@/components/visual/icon-registry";
import { searchIcons, suggestIconsForLabel } from "@/lib/icons/catalog";

/** How many search results to show in the grid at once. */
const RESULT_LIMIT = 36;
const SUGGESTION_LIMIT = 6;

/**
 * Renders a resolved lucide icon. Taking the component as a prop (rather than
 * deriving and rendering it in the picker's own render body) keeps the picker
 * compatible with the `react-hooks/static-components` lint rule, mirroring how
 * `VisualRenderer`'s `IconGlyph` consumes resolved icons.
 */
function IconThumb({ Icon, size }: { Icon: LucideIcon; size: number }) {
  return <Icon size={size} aria-hidden="true" />;
}

function iconButtonClass(active: boolean): string {
  return [
    "flex aspect-square items-center justify-center rounded-md border text-ds-text-secondary transition",
    active
      ? "border-ds-control bg-ds-state-selected text-ds-text-primary"
      : "border-transparent hover:border-ds-border-strong hover:bg-ds-state-hover",
  ].join(" ");
}

/**
 * Searchable icon picker for a single node (US-004). Renders a text input
 * (backed by the offline `searchIcons` catalog) and a results grid of bundled
 * lucide icons. Selecting a result calls `onSelect(name)`; a Remove action
 * (shown only when an icon is set) calls `onRemove`. The control is collapsed
 * by default and toggles open, so it doesn't crowd the style panel.
 *
 * It is purely presentational about persistence: the parent wires `onSelect` /
 * `onRemove` to set/clear `node.icon` and persist via the existing debounced
 * `attachVisual` path, so the canvas updates live and survives reload.
 */
export function IconPicker({
  nodeLabel,
  value,
  onSelect,
  onRemove,
  expanded = false,
}: {
  nodeLabel: string;
  value?: string;
  onSelect: (name: string) => void;
  onRemove: () => void;
  expanded?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listId = useId();
  const showPicker = expanded || open;

  const results = useMemo(() => searchIcons(query, RESULT_LIMIT), [query]);
  const suggestions = useMemo(
    () => suggestIconsForLabel(nodeLabel, SUGGESTION_LIMIT),
    [nodeLabel],
  );
  const CurrentIcon = resolveIconComponent(value);

  return (
    <div>
      {expanded ? null : (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-ds-text-secondary">Icon</span>
          <div className="flex items-center gap-2">
            {value && CurrentIcon ? (
              <span className="inline-flex max-w-[8rem] items-center gap-1 text-[11px] text-ds-text-muted">
                <IconThumb Icon={CurrentIcon} size={14} />
                <span className="truncate">{value}</span>
              </span>
            ) : (
              <span className="text-[11px] text-ds-text-muted">None</span>
            )}
            <button
              type="button"
              aria-expanded={open}
              aria-controls={listId}
              onClick={() => setOpen((prev) => !prev)}
              className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-ds-text-muted transition hover:text-ds-text-primary"
            >
              {open ? "Close" : value ? "Change" : "Add"}
            </button>
          </div>
        </div>
      )}

      {showPicker ? (
        <div
          className={[
            "space-y-2 rounded-md border border-ds-border-subtle bg-ds-surface-sunken p-2",
            expanded ? "" : "mt-2",
          ].join(" ")}
        >
          {expanded ? null : (
            <input
              type="search"
              aria-label="Search icons"
              placeholder="Search icons…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
              className="w-full rounded-md border border-ds-border-subtle bg-ds-surface-raised px-2 py-1 text-xs text-ds-text-primary outline-none placeholder:text-ds-text-muted focus:border-ds-border-strong"
            />
          )}
          {suggestions.length > 0 ? (
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-ds-text-muted">
                Suggestions
              </p>
              <div className="flex flex-wrap gap-1">
                {suggestions.map((entry) => {
                  const Icon = resolveIconComponent(entry.name);
                  if (!Icon) {
                    return null;
                  }
                  const active = entry.name === value;
                  return (
                    <button
                      key={entry.name}
                      type="button"
                      aria-label={`Icon: ${entry.name}`}
                      onClick={() => onSelect(entry.name)}
                      className={[
                        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium transition",
                        active
                          ? "border-ds-control bg-ds-state-selected text-ds-text-primary"
                          : "border-ds-border-subtle text-ds-text-secondary hover:border-ds-border-strong hover:text-ds-text-primary",
                      ].join(" ")}
                    >
                      <IconThumb Icon={Icon} size={14} />
                      <span>{entry.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {!expanded && results.length > 0 ? (
            <div
              id={listId}
              role="listbox"
              aria-label="Icons"
              className="grid max-h-44 grid-cols-6 gap-1 overflow-y-auto"
            >
              {results.map((entry) => {
                const Icon = resolveIconComponent(entry.name);
                if (!Icon) {
                  return null;
                }
                const active = entry.name === value;
                return (
                  <Tooltip key={entry.name} label={entry.name} side="bottom">
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      aria-label={`Icon: ${entry.name}`}
                      onClick={() => onSelect(entry.name)}
                      className={iconButtonClass(active)}
                    >
                      <IconThumb Icon={Icon} size={18} />
                    </button>
                  </Tooltip>
                );
              })}
            </div>
          ) : !expanded ? (
            <p id={listId} className="px-1 py-2 text-[11px] text-ds-text-muted">
              No icons match “{query.trim()}”.
            </p>
          ) : null}
          {value ? (
            <button
              type="button"
              aria-label="Remove icon"
              onClick={onRemove}
              className="w-full rounded-md border border-ds-border-subtle px-2 py-1 text-[11px] font-medium text-ds-text-secondary transition hover:border-ds-border-strong hover:text-ds-text-primary"
            >
              Remove icon
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
