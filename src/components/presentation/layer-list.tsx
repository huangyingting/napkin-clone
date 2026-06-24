"use client";

/**
 * Layer / object list for the slide editor (issue #331).
 *
 * Shows every element in the current slide ordered by z-index (highest on top,
 * as they appear in the editor). Each row exposes:
 *  - click to select
 *  - eye-icon toggle (show/hide)
 *  - lock icon toggle (lock/unlock)
 *  - up/down reorder buttons
 *  - inline rename (double-click or press F2)
 *  - connector endpoint labels when the element is a connector
 *  - search filter at the top
 *
 * Fully keyboard accessible: arrow keys move focus between rows, Enter/Space
 * select, pressing the icon buttons is reachable via Tab within a row.
 */

import {
  ArrowDown,
  ArrowUp,
  Box,
  Image as ImageIcon,
  Link2,
  List,
  Lock,
  LockOpen,
  Minus,
  PenLine,
  Shapes,
  Type,
  Eye,
  EyeOff,
  Search,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { FOCUS_RING } from "@/components/motion/control-styles";
import { Tooltip } from "@/components/ui";
import { elementAccessibleName } from "@/lib/presentation/element-accessible-name";
import { filterLayers } from "@/lib/presentation/layer-filter";
import type { SlideElement } from "@/lib/presentation/deck";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive a display label for an element — custom name first, then content. */
function getDisplayName(
  element: SlideElement,
  allElements: readonly SlideElement[],
): string {
  if ("name" in element && element.name) return element.name;
  return elementAccessibleName(element, allElements);
}

/** Icon component for each element kind. */
function KindIcon({ element }: { element: SlideElement }) {
  const cls = "shrink-0 text-ds-text-muted";
  switch (element.kind) {
    case "placeholder":
      return <PenLine size={12} className={cls} aria-hidden="true" />;
    case "text":
      return <Type size={12} className={cls} aria-hidden="true" />;
    case "bullets":
      return <List size={12} className={cls} aria-hidden="true" />;
    case "image":
      return <ImageIcon size={12} className={cls} aria-hidden="true" />;
    case "visual":
      return <Box size={12} className={cls} aria-hidden="true" />;
    case "shape":
      return element.shape === "line" ? (
        <Minus size={12} className={cls} aria-hidden="true" />
      ) : (
        <Shapes size={12} className={cls} aria-hidden="true" />
      );
    case "connector":
      return <Link2 size={12} className={cls} aria-hidden="true" />;
    default:
      return <Box size={12} className={cls} aria-hidden="true" />;
  }
}

/** Connector endpoint summary — shows "→ targetName" for each bound end. */
function ConnectorEndpointLabels({
  element,
  allElements,
}: {
  element: SlideElement & { kind: "connector" };
  allElements: readonly SlideElement[];
}) {
  function resolveTarget(
    endpoint: typeof element.start | typeof element.end,
  ): string | null {
    if (!("elementId" in endpoint)) return null;
    const target = allElements.find((el) => el.id === endpoint.elementId);
    if (!target) return null;
    return getDisplayName(target, allElements);
  }

  const startName = resolveTarget(element.start);
  const endName = resolveTarget(element.end);

  if (!startName && !endName) return null;

  return (
    <div className="mt-0.5 flex flex-col gap-0 pl-1 text-[10px] text-ds-text-muted">
      {startName && (
        <span className="truncate" title={`Start: ${startName}`}>
          ⊕ {startName}
        </span>
      )}
      {endName && (
        <span className="truncate" title={`End: ${endName}`}>
          → {endName}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row rename field
// ---------------------------------------------------------------------------

function RenameField({
  initialValue,
  onCommit,
  onCancel,
}: {
  initialValue: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.select();
  }, []);

  function commit() {
    onCommit(value.trim());
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }

  return (
    <input
      ref={ref}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      className={`min-w-0 flex-1 truncate rounded-ds-sm border border-ds-accent-border bg-ds-surface px-1 py-0 text-xs text-ds-text-primary outline-none ${FOCUS_RING}`}
      aria-label="Rename element"
    />
  );
}

// ---------------------------------------------------------------------------
// LayerRow
// ---------------------------------------------------------------------------

interface LayerRowProps {
  element: SlideElement;
  allElements: readonly SlideElement[];
  selected: boolean;
  isFirst: boolean;
  isLast: boolean;
  onSelect: () => void;
  onToggleHidden: () => void;
  onToggleLocked: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRename: (name: string) => void;
  draggable?: boolean;
  isDragTarget?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDropOnRow?: () => void;
}

function LayerRow({
  element,
  allElements,
  selected,
  isFirst,
  isLast,
  onSelect,
  onToggleHidden,
  onToggleLocked,
  onMoveUp,
  onMoveDown,
  onRename,
  draggable = false,
  isDragTarget = false,
  onDragStart,
  onDragEnd,
  onDropOnRow,
}: LayerRowProps) {
  const [renaming, setRenaming] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const displayName = getDisplayName(element, allElements);

  function handleRowKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    } else if (e.key === "F2") {
      e.preventDefault();
      setRenaming(true);
    }
  }

  const iconBtn =
    `flex h-6 w-6 shrink-0 items-center justify-center rounded-ds-sm text-ds-text-muted ` +
    `transition-colors hover:bg-ds-state-active hover:text-ds-text-primary ${FOCUS_RING}`;

  return (
    <div
      ref={rowRef}
      role="option"
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      onKeyDown={handleRowKeyDown}
      onClick={onSelect}
      draggable={draggable && !renaming}
      onDragStart={(e) => {
        if (!draggable) return;
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.();
      }}
      onDragEnd={() => {
        setDragOver(false);
        onDragEnd?.();
      }}
      onDragOver={(e) => {
        if (!isDragTarget) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!dragOver) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onDropOnRow?.();
      }}
      className={`flex flex-col gap-0 rounded-ds-sm border px-2 py-1 transition-colors ${
        selected
          ? "border-ds-accent-border bg-ds-accent-surface"
          : "border-transparent hover:bg-ds-state-hover"
      } ${dragOver ? "border-ds-accent-border ring-1 ring-ds-accent-border" : ""} ${
        element.hidden ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-center gap-1">
        {/* Kind icon */}
        <KindIcon element={element} />

        {/* Name / rename */}
        {renaming ? (
          <RenameField
            initialValue={"name" in element && element.name ? element.name : ""}
            onCommit={(name) => {
              onRename(name);
              setRenaming(false);
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <span
            className="min-w-0 flex-1 truncate text-xs text-ds-text-secondary"
            title={displayName}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setRenaming(true);
            }}
          >
            {displayName}
          </span>
        )}

        {/* Rename button */}
        {!renaming && (
          <Tooltip label="Rename (F2)" side="top">
            <button
              type="button"
              aria-label={`Rename ${displayName}`}
              onClick={(e) => {
                e.stopPropagation();
                setRenaming(true);
              }}
              className={iconBtn}
            >
              <PenLine size={11} aria-hidden="true" />
            </button>
          </Tooltip>
        )}

        {/* Hide/show */}
        <Tooltip
          label={element.hidden ? "Show element" : "Hide element"}
          side="top"
        >
          <button
            type="button"
            aria-label={
              element.hidden ? `Show ${displayName}` : `Hide ${displayName}`
            }
            aria-pressed={element.hidden === true}
            onClick={(e) => {
              e.stopPropagation();
              onToggleHidden();
            }}
            className={iconBtn}
          >
            {element.hidden ? (
              <EyeOff size={12} aria-hidden="true" />
            ) : (
              <Eye size={12} aria-hidden="true" />
            )}
          </button>
        </Tooltip>

        {/* Lock/unlock */}
        <Tooltip
          label={element.locked ? "Unlock element" : "Lock element"}
          side="top"
        >
          <button
            type="button"
            aria-label={
              element.locked ? `Unlock ${displayName}` : `Lock ${displayName}`
            }
            aria-pressed={element.locked === true}
            onClick={(e) => {
              e.stopPropagation();
              onToggleLocked();
            }}
            className={iconBtn}
          >
            {element.locked ? (
              <Lock size={12} aria-hidden="true" />
            ) : (
              <LockOpen size={12} aria-hidden="true" />
            )}
          </button>
        </Tooltip>

        {/* Move up (higher z = rendered on top = appears earlier in list) */}
        <Tooltip label="Move up in stack" side="top">
          <button
            type="button"
            aria-label={`Move ${displayName} up`}
            disabled={isFirst}
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp();
            }}
            className={`${iconBtn} disabled:cursor-not-allowed disabled:opacity-30`}
          >
            <ArrowUp size={12} aria-hidden="true" />
          </button>
        </Tooltip>

        {/* Move down */}
        <Tooltip label="Move down in stack" side="top">
          <button
            type="button"
            aria-label={`Move ${displayName} down`}
            disabled={isLast}
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown();
            }}
            className={`${iconBtn} disabled:cursor-not-allowed disabled:opacity-30`}
          >
            <ArrowDown size={12} aria-hidden="true" />
          </button>
        </Tooltip>
      </div>

      {/* Connector endpoint labels */}
      {element.kind === "connector" && (
        <ConnectorEndpointLabels element={element} allElements={allElements} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LayerList
// ---------------------------------------------------------------------------

export interface LayerListProps {
  /** All elements on the current slide. Ordering is by zIndex descending (top first). */
  elements: readonly SlideElement[];
  /** Currently selected element id (single selection). */
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  onToggleHidden: (elementId: string) => void;
  onToggleLocked: (elementId: string) => void;
  /** Move element one step up (higher zIndex) or down (lower zIndex). */
  onMoveZOrder: (elementId: string, direction: "up" | "down") => void;
  onRename: (elementId: string, name: string) => void;
  /** Drag-reorder: move `elementId` to the z-position of `targetElementId` (#639). */
  onReorder?: (elementId: string, targetElementId: string) => void;
}

export function LayerList({
  elements,
  selectedElementId,
  onSelectElement,
  onToggleHidden,
  onToggleLocked,
  onMoveZOrder,
  onRename,
  onReorder,
}: LayerListProps) {
  const [query, setQuery] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const listId = useId();
  const searchId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  // Sort descending by zIndex: top-most element first in the list.
  const sorted = [...elements].sort((a, b) => b.zIndex - a.zIndex);

  const filtered = filterLayers(sorted, query, (el) =>
    getDisplayName(el, elements),
  );

  // Keyboard navigation: arrow keys cycle through rows in the listbox.
  const handleListKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!filtered.length) return;
      const currentIndex = filtered.findIndex(
        (el) => el.id === selectedElementId,
      );

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = filtered[(currentIndex + 1) % filtered.length];
        if (next) onSelectElement(next.id);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev =
          filtered[(currentIndex - 1 + filtered.length) % filtered.length];
        if (prev) onSelectElement(prev.id);
      } else if (e.key === "Home") {
        e.preventDefault();
        onSelectElement(filtered[0]?.id ?? null);
      } else if (e.key === "End") {
        e.preventDefault();
        onSelectElement(filtered[filtered.length - 1]?.id ?? null);
      }
    },
    [filtered, selectedElementId, onSelectElement],
  );

  // Keep the selected row scrolled into view.
  useEffect(() => {
    if (!selectedElementId || !listRef.current) return;
    const row = listRef.current.querySelector(
      `[role="option"][aria-selected="true"]`,
    ) as HTMLElement | null;
    row?.scrollIntoView({ block: "nearest" });
  }, [selectedElementId]);

  return (
    <div className="flex flex-col gap-2">
      {/* Search */}
      <div className="relative">
        <Search
          size={12}
          aria-hidden="true"
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ds-text-muted"
        />
        <input
          id={searchId}
          type="text"
          placeholder="Filter… (kind:text, is:locked, is:hidden)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={`w-full rounded-ds-md border border-ds-border-subtle bg-ds-surface py-1.5 pl-6 pr-2 text-xs text-ds-text-primary placeholder:text-ds-text-muted outline-none ${FOCUS_RING}`}
          aria-label="Filter layers"
          aria-controls={listId}
        />
      </div>

      {/* Layer rows */}
      <div
        id={listId}
        ref={listRef}
        role="listbox"
        aria-label="Layers"
        aria-activedescendant={selectedElementId ?? undefined}
        onKeyDown={handleListKeyDown}
        className="flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden"
        style={{ maxHeight: "20rem" }}
      >
        {filtered.length === 0 ? (
          <p className="py-2 text-center text-xs text-ds-text-muted">
            {query
              ? "No layers match the filter."
              : "No elements on this slide."}
          </p>
        ) : (
          filtered.map((element, idx) => (
            <LayerRow
              key={element.id}
              element={element}
              allElements={elements}
              selected={element.id === selectedElementId}
              isFirst={idx === 0}
              isLast={idx === filtered.length - 1}
              onSelect={() => onSelectElement(element.id)}
              onToggleHidden={() => onToggleHidden(element.id)}
              onToggleLocked={() => onToggleLocked(element.id)}
              onMoveUp={() => onMoveZOrder(element.id, "up")}
              onMoveDown={() => onMoveZOrder(element.id, "down")}
              onRename={(name) => onRename(element.id, name)}
              draggable={Boolean(onReorder)}
              isDragTarget={dragId !== null && dragId !== element.id}
              onDragStart={() => setDragId(element.id)}
              onDragEnd={() => setDragId(null)}
              onDropOnRow={() => {
                if (onReorder && dragId && dragId !== element.id) {
                  onReorder(dragId, element.id);
                }
                setDragId(null);
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}
