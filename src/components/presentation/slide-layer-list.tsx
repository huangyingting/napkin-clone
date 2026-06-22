"use client";

/**
 * Accessible layer/object list for the slide inspector (issue #331).
 *
 * Shows all free-form elements ordered front-to-back (top of list = highest
 * z-index = visually in front). Each row provides:
 *  - A selection button (the element name/accessible name)
 *  - A visibility toggle (eye icon)
 *  - A lock toggle (lock icon)
 *  - A connector badge that names bound endpoints
 *  - Reorder up/down buttons (bring-forward / send-backward)
 *  - Group indentation/badge when `groupId` is set
 *
 * A search input (Ctrl/Cmd+F) provides case-insensitive filtering.
 * Keyboard navigation: ArrowUp/Down moves focus between rows; Space/Enter
 * selects the focused element.
 *
 * Purely presentational: all mutations are forwarded via callbacks.
 */

import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { FOCUS_RING } from "@/components/motion/control-styles";
import type { SlideElement } from "@/lib/presentation/deck";
import { elementAccessibleName } from "@/lib/presentation/element-accessible-name";
import {
  filterElementsByName,
  getConnectorTargetNames,
} from "@/lib/presentation/layer-list";
import type { ArrangeMode } from "@/lib/presentation/element-arrange";

export interface SlideLayerListProps {
  elements: readonly SlideElement[];
  /** The single-select element id (may also be in selectedIds). */
  selectedElementId: string | null;
  /** Multi-select set — used only for highlight styling. */
  selectedIds: ReadonlySet<string>;
  onSelectElement: (id: string | null) => void;
  onToggleHidden: (id: string) => void;
  onToggleLocked: (id: string) => void;
  /** Reorder one element: "forward" = move toward front, "backward" = toward back. */
  onArrange: (ids: string[], mode: ArrangeMode) => void;
}

/** Returns a short display label for an element row. */
function rowLabel(element: SlideElement): string {
  switch (element.kind) {
    case "text":
      return element.role === "title" ? "Title" : "Text";
    case "bullets":
      return "Bullets";
    case "visual":
      return "Visual";
    case "image":
      return "Image";
    case "shape":
      return `Shape · ${element.shape}`;
    case "connector":
      return "Connector";
    default:
      return "Element";
  }
}

export function SlideLayerList({
  elements,
  selectedElementId,
  selectedIds,
  onSelectElement,
  onToggleHidden,
  onToggleLocked,
  onArrange,
}: SlideLayerListProps) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Ctrl/Cmd+F within the component focuses the search field.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key === "f" &&
        searchRef.current
      ) {
        event.preventDefault();
        searchRef.current.focus();
        searchRef.current.select();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Front-to-back order: highest zIndex first.
  const ordered = [...elements].sort((a, b) => b.zIndex - a.zIndex);
  const filtered = filterElementsByName(ordered, query);

  const handleRowKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>, id: string) => {
      const list = listRef.current;
      if (!list) return;
      const items = Array.from(
        list.querySelectorAll<HTMLElement>("[data-layer-row]"),
      );
      const index = items.findIndex(
        (item) => item.getAttribute("data-layer-row") === id,
      );
      if (event.key === "ArrowDown") {
        event.preventDefault();
        items[index + 1]?.focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        items[index - 1]?.focus();
      } else if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        onSelectElement(id);
      }
    },
    [onSelectElement],
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Search */}
      <label className="relative flex items-center">
        <Search
          size={12}
          aria-hidden="true"
          className="pointer-events-none absolute left-2 text-ds-text-muted"
        />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search layers…"
          aria-label="Search layers"
          className={`w-full rounded-ds-md border border-ds-border-subtle bg-ds-surface py-1 pl-6 pr-2 text-xs text-ds-text-primary outline-none placeholder:text-ds-text-muted ${FOCUS_RING}`}
        />
      </label>

      {/* Layer rows */}
      {filtered.length === 0 ? (
        <p className="py-2 text-center text-xs text-ds-text-muted">
          {query ? "No matching layers." : "No elements on this slide."}
        </p>
      ) : (
        <ul
          ref={listRef}
          role="listbox"
          aria-label="Slide layers"
          aria-multiselectable="true"
          className="flex flex-col gap-0.5"
        >
          {filtered.map((element, listIndex) => {
            const isSelected =
              element.id === selectedElementId || selectedIds.has(element.id);
            const isHidden = element.hidden === true;
            const isLocked = element.locked === true;
            const hasGroup = Boolean(element.groupId);
            const isFirst = listIndex === 0;
            const isLast = listIndex === filtered.length - 1;
            const name = elementAccessibleName(element, elements);
            const displayLabel = rowLabel(element);

            return (
              <li key={element.id} role="option" aria-selected={isSelected}>
                <div
                  data-layer-row={element.id}
                  tabIndex={0}
                  onKeyDown={(e) => handleRowKeyDown(e, element.id)}
                  className={`group flex items-center gap-1 rounded-ds-sm border px-1.5 py-1 text-xs transition-colors ${
                    isSelected
                      ? "border-ds-control bg-ds-state-selected text-ds-text-primary"
                      : "border-transparent hover:bg-ds-state-hover text-ds-text-secondary"
                  } ${isHidden ? "opacity-50" : ""} ${FOCUS_RING}`}
                >
                  {/* Indent for grouped elements */}
                  {hasGroup ? (
                    <span
                      aria-hidden="true"
                      className="ml-2 mr-0.5 h-3 w-0.5 shrink-0 rounded-full bg-ds-border-subtle"
                    />
                  ) : null}

                  {/* Select button */}
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => onSelectElement(element.id)}
                    aria-label={`Select ${name}`}
                    title={name}
                    className="min-w-0 flex-1 truncate text-left leading-tight"
                  >
                    <span className="truncate font-medium">{displayLabel}</span>
                    {name !== displayLabel ? (
                      <span className="ml-1 truncate text-ds-text-muted">
                        {name}
                      </span>
                    ) : null}
                  </button>

                  {/* Connector badge */}
                  {element.kind === "connector" ? (
                    <ConnectorBadge
                      connector={element}
                      allElements={elements}
                    />
                  ) : null}

                  {/* Visibility toggle */}
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => onToggleHidden(element.id)}
                    aria-label={isHidden ? `Show ${name}` : `Hide ${name}`}
                    aria-pressed={isHidden}
                    title={isHidden ? "Show" : "Hide"}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-ds-sm transition-colors hover:bg-ds-state-active ${
                      isHidden
                        ? "text-ds-text-muted"
                        : "text-ds-text-secondary opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                    } ${FOCUS_RING}`}
                  >
                    {isHidden ? (
                      <EyeOff size={11} aria-hidden="true" />
                    ) : (
                      <Eye size={11} aria-hidden="true" />
                    )}
                  </button>

                  {/* Lock toggle */}
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => onToggleLocked(element.id)}
                    aria-label={isLocked ? `Unlock ${name}` : `Lock ${name}`}
                    aria-pressed={isLocked}
                    title={isLocked ? "Unlock" : "Lock"}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-ds-sm transition-colors hover:bg-ds-state-active ${
                      isLocked
                        ? "text-ds-text-muted"
                        : "text-ds-text-secondary opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                    } ${FOCUS_RING}`}
                  >
                    {isLocked ? (
                      <Lock size={11} aria-hidden="true" />
                    ) : (
                      <LockOpen size={11} aria-hidden="true" />
                    )}
                  </button>

                  {/* Reorder: move toward front */}
                  <button
                    type="button"
                    tabIndex={-1}
                    disabled={isFirst}
                    onClick={() => onArrange([element.id], "forward")}
                    aria-label={`Move ${name} forward`}
                    title="Move forward"
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-ds-sm transition-colors hover:bg-ds-state-active disabled:cursor-not-allowed disabled:opacity-30 text-ds-text-secondary opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 ${FOCUS_RING}`}
                  >
                    <ArrowUpNarrowWide size={11} aria-hidden="true" />
                  </button>

                  {/* Reorder: move toward back */}
                  <button
                    type="button"
                    tabIndex={-1}
                    disabled={isLast}
                    onClick={() => onArrange([element.id], "backward")}
                    aria-label={`Move ${name} backward`}
                    title="Move backward"
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-ds-sm transition-colors hover:bg-ds-state-active disabled:cursor-not-allowed disabled:opacity-30 text-ds-text-secondary opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 ${FOCUS_RING}`}
                  >
                    <ArrowDownNarrowWide size={11} aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Compact connector endpoint badge shown on connector rows. */
function ConnectorBadge({
  connector,
  allElements,
}: {
  connector: Extract<SlideElement, { kind: "connector" }>;
  allElements: readonly SlideElement[];
}) {
  const { start, end } = getConnectorTargetNames(connector, allElements);
  const label = `${start} → ${end}`;
  return (
    <span
      title={label}
      aria-label={`Connects ${start} to ${end}`}
      className="shrink-0 rounded bg-ds-surface-raised px-1 py-0.5 text-[10px] text-ds-text-muted"
    >
      ⇒
    </span>
  );
}
