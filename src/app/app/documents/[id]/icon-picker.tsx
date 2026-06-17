"use client";

import { useId, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";

import { resolveIconComponent } from "@/components/visual/icon-registry";
import { searchIcons } from "@/lib/icons/catalog";

/** How many search results to show in the grid at once. */
const RESULT_LIMIT = 36;

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
    "flex aspect-square items-center justify-center rounded-md border text-zinc-700 transition dark:text-zinc-200",
    active
      ? "border-zinc-900 bg-zinc-900/5 dark:border-white dark:bg-white/10"
      : "border-transparent hover:border-black/15 hover:bg-black/[.03] dark:hover:border-white/20 dark:hover:bg-white/[.06]",
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
  value,
  onSelect,
  onRemove,
}: {
  value?: string;
  onSelect: (name: string) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listId = useId();

  const results = useMemo(() => searchIcons(query, RESULT_LIMIT), [query]);
  const CurrentIcon = resolveIconComponent(value);

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-zinc-600 dark:text-zinc-300">Icon</span>
        <div className="flex items-center gap-2">
          {value && CurrentIcon ? (
            <span className="inline-flex max-w-[8rem] items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              <IconThumb Icon={CurrentIcon} size={14} />
              <span className="truncate">{value}</span>
            </span>
          ) : (
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
              None
            </span>
          )}
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((prev) => !prev)}
            className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            {open ? "Close" : value ? "Change" : "Add"}
          </button>
        </div>
      </div>

      {open ? (
        <div className="mt-2 space-y-2 rounded-md border border-black/[.08] bg-black/[.015] p-2 dark:border-white/[.10] dark:bg-white/[.02]">
          <input
            type="search"
            aria-label="Search icons"
            placeholder="Search icons…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
            className="w-full rounded-md border border-black/[.12] bg-white px-2 py-1 text-xs text-zinc-700 outline-none placeholder:text-zinc-400 focus:border-zinc-400 dark:border-white/20 dark:bg-zinc-900 dark:text-zinc-200 dark:placeholder:text-zinc-500"
          />
          {results.length > 0 ? (
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
                  <button
                    key={entry.name}
                    type="button"
                    role="option"
                    aria-selected={active}
                    aria-label={`Icon: ${entry.name}`}
                    title={entry.name}
                    onClick={() => onSelect(entry.name)}
                    className={iconButtonClass(active)}
                  >
                    <IconThumb Icon={Icon} size={18} />
                  </button>
                );
              })}
            </div>
          ) : (
            <p
              id={listId}
              className="px-1 py-2 text-[11px] text-zinc-400 dark:text-zinc-500"
            >
              No icons match “{query.trim()}”.
            </p>
          )}
          {value ? (
            <button
              type="button"
              aria-label="Remove icon"
              onClick={onRemove}
              className="w-full rounded-md border border-black/[.08] px-2 py-1 text-[11px] font-medium text-zinc-600 transition hover:border-black/20 hover:text-zinc-900 dark:border-white/[.12] dark:text-zinc-300 dark:hover:border-white/30 dark:hover:text-zinc-100"
            >
              Remove icon
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
