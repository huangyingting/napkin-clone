"use client";

import { FileText, Plus, Type } from "lucide-react";

import { VisualRenderer } from "@/components/visual/visual-renderer";
import { FOCUS_RING } from "@/components/ui/tokens";
import type { Insertable } from "@/lib/presentation/document-insertable";
import type { StaleSourceLink } from "@/lib/presentation/source-link-staleness";
import type { Visual } from "@/lib/visual/schema";

/** Short accessible label for a document visual card. */
function fromDocVisualLabel(id: string, visual: Visual): string {
  const title = visual.title?.trim();
  if (title) return title;
  const kind = visual.type
    ? visual.type.charAt(0).toUpperCase() + visual.type.slice(1)
    : "Visual";
  return `${kind} · ${id.slice(0, 6)}`;
}

/**
 * The "From document" quick-insert panel (issue #293). Lists the document's
 * visuals and text as click-to-insert cards plus an "Add all visuals" action.
 * Each insert is routed through the editor's undoable `addElement` path; the
 * panel stays open after an insert so several items can be placed in a row.
 *
 * Issue #408/#410: When `staleLinks` is non-empty, a "Source links" section
 * is shown above the insert cards, listing each stale element with its reason
 * (changed vs orphaned/missing) and per-element actions (update, unlink/keep,
 * relink, remove). The panel never auto-deletes elements (#410).
 */
export function FromDocumentPanel({
  visuals,
  textItems,
  staleLinks = [],
  onAddAllVisuals,
  onInsertVisual,
  onInsertText,
  onUpdateFromSource,
  onUnlinkSource,
  onRelinkSource,
  onRemoveOrphaned,
  documentTextInsertables = [],
  documentVisualInsertables = [],
}: {
  visuals: readonly (readonly [string, Visual])[];
  textItems: readonly Extract<Insertable, { kind: "text" }>[];
  staleLinks?: StaleSourceLink[];
  onAddAllVisuals: () => void;
  onInsertVisual: (item: Extract<Insertable, { kind: "visual" }>) => void;
  onInsertText: (item: Extract<Insertable, { kind: "text" }>) => void;
  onUpdateFromSource?: (link: StaleSourceLink) => void;
  onUnlinkSource?: (link: StaleSourceLink) => void;
  onRelinkSource?: (
    link: StaleSourceLink,
    newBlockId: string,
    newContentHash: string,
  ) => void;
  onRemoveOrphaned?: (link: StaleSourceLink) => void;
  documentTextInsertables?: readonly Extract<Insertable, { kind: "text" }>[];
  documentVisualInsertables?: readonly Extract<
    Insertable,
    { kind: "visual" }
  >[];
}) {
  const hasVisuals = visuals.length > 0;
  const hasText = textItems.length > 0;
  const hasStale = staleLinks.length > 0;
  const changedLinks = staleLinks.filter((l) => l.reason === "content_changed");
  const missingLinks = staleLinks.filter((l) => l.reason === "block_missing");

  return (
    <div className="flex max-h-[70vh] flex-col rounded-ds-md bg-ds-surface-raised">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <FileText
            aria-hidden="true"
            className="h-5 w-5 shrink-0 text-ds-text-primary"
          />
          <h4 className="truncate text-sm font-bold leading-none text-ds-text-primary">
            From document
          </h4>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Stale source links section (#408 / #410) */}
        {hasStale ? (
          <section
            aria-label="Stale source links"
            className="border-b border-ds-border-subtle p-3"
          >
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ds-warning-text">
              Source links
            </h3>
            {changedLinks.length > 0 && (
              <div className="mb-2">
                <p className="mb-1.5 text-[11px] text-ds-text-muted">
                  Content changed
                </p>
                <ul className="flex flex-col gap-1">
                  {changedLinks.map((link) => (
                    <li
                      key={link.elementId}
                      className="flex items-center gap-1 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-[11px] text-ds-text-secondary">
                        {link.blockKind === "visual" ? "Visual" : "Text"} ·{" "}
                        {link.blockId.slice(0, 8)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateFromSource?.(link)}
                        aria-label="Update element from source"
                        title="Update from source"
                        className={`shrink-0 rounded-ds-sm px-1.5 py-0.5 text-[11px] font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
                      >
                        Update
                      </button>
                      <button
                        type="button"
                        onClick={() => onUnlinkSource?.(link)}
                        aria-label="Unlink element from source"
                        title="Keep as manual (unlink)"
                        className={`shrink-0 rounded-ds-sm px-1.5 py-0.5 text-[11px] font-medium text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
                      >
                        Unlink
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {missingLinks.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] text-ds-text-muted">
                  Orphaned (source deleted)
                </p>
                <ul className="flex flex-col gap-1">
                  {missingLinks.map((link) => (
                    <li
                      key={link.elementId}
                      className="flex items-center gap-1 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-[11px] text-ds-text-secondary">
                        {link.blockKind === "visual" ? "Visual" : "Text"} ·{" "}
                        {link.blockId.slice(0, 8)}
                      </span>
                      {/* Relink to a new block (visual or text) */}
                      {link.blockKind === "visual" &&
                        documentVisualInsertables.length > 0 && (
                          <select
                            aria-label="Relink to visual"
                            defaultValue=""
                            onChange={(e) => {
                              const item = documentVisualInsertables.find(
                                (i) => i.visualId === e.target.value,
                              );
                              if (item)
                                onRelinkSource?.(
                                  link,
                                  item.visualId,
                                  item.contentHash,
                                );
                            }}
                            className={`shrink-0 rounded-ds-sm border border-ds-border-subtle bg-ds-surface px-1 py-0.5 text-[11px] text-ds-text-secondary ${FOCUS_RING}`}
                          >
                            <option value="" disabled>
                              Relink…
                            </option>
                            {documentVisualInsertables.map((i) => (
                              <option key={i.visualId} value={i.visualId}>
                                {i.visualId.slice(0, 8)}
                              </option>
                            ))}
                          </select>
                        )}
                      {link.blockKind === "text" &&
                        documentTextInsertables.length > 0 && (
                          <select
                            aria-label="Relink to text block"
                            defaultValue=""
                            onChange={(e) => {
                              const item = documentTextInsertables.find(
                                (i) => i.blockId === e.target.value,
                              );
                              if (item)
                                onRelinkSource?.(
                                  link,
                                  item.blockId!,
                                  item.contentHash,
                                );
                            }}
                            className={`shrink-0 rounded-ds-sm border border-ds-border-subtle bg-ds-surface px-1 py-0.5 text-[11px] text-ds-text-secondary ${FOCUS_RING}`}
                          >
                            <option value="" disabled>
                              Relink…
                            </option>
                            {documentTextInsertables
                              .filter((i) => i.blockId !== undefined)
                              .map((i) => (
                                <option key={i.blockId} value={i.blockId}>
                                  {i.label}
                                </option>
                              ))}
                          </select>
                        )}
                      <button
                        type="button"
                        onClick={() => onUnlinkSource?.(link)}
                        aria-label="Keep element as manual (unlink from source)"
                        title="Keep as manual"
                        className={`shrink-0 rounded-ds-sm px-1.5 py-0.5 text-[11px] font-medium text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
                      >
                        Keep
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveOrphaned?.(link)}
                        aria-label="Remove orphaned element"
                        title="Remove element"
                        className={`shrink-0 rounded-ds-sm px-1.5 py-0.5 text-[11px] font-medium text-ds-error-text transition-colors hover:bg-ds-error-surface ${FOCUS_RING}`}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ) : null}

        {!hasVisuals && !hasText && !hasStale ? (
          <p className="px-3 py-8 text-center text-xs text-ds-text-muted">
            This document has no text or visuals yet. Add content in the
            document to reuse it on a slide.
          </p>
        ) : (
          <div className="p-3">
            {hasVisuals ? (
              <section aria-label="Document visuals">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ds-text-muted">
                    Visuals
                  </h3>
                  <button
                    type="button"
                    onClick={onAddAllVisuals}
                    className={`flex h-6 items-center gap-1 rounded-ds-sm border border-ds-border-subtle bg-ds-surface px-2 text-[11px] font-semibold text-ds-text-secondary transition-colors hover:border-ds-accent-border hover:bg-ds-state-hover hover:text-ds-text-primary ${FOCUS_RING}`}
                  >
                    <Plus size={12} aria-hidden="true" />
                    Add all visuals
                  </button>
                </div>
                <ul className="grid grid-cols-2 gap-1.5">
                  {visuals.map(([id, visual]) => {
                    const insertable = documentVisualInsertables.find(
                      (i) => i.visualId === id,
                    ) ?? {
                      kind: "visual" as const,
                      visualId: id,
                      contentHash: "",
                    };
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => onInsertVisual(insertable)}
                          aria-label={`Insert ${fromDocVisualLabel(id, visual)}`}
                          title={fromDocVisualLabel(id, visual)}
                          className={`group flex w-full flex-col gap-1 rounded-ds-md border border-ds-border-subtle bg-ds-surface p-1.5 text-left transition-colors hover:border-ds-accent-border hover:bg-ds-state-hover ${FOCUS_RING}`}
                        >
                          <span className="flex aspect-video items-center justify-center overflow-hidden rounded-ds-sm bg-ds-surface-base">
                            <VisualRenderer
                              visual={visual}
                              className="h-full w-full object-contain"
                              transparentBackground
                            />
                          </span>
                          <span className="truncate text-[11px] text-ds-text-muted">
                            {fromDocVisualLabel(id, visual)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {hasText ? (
              <section
                aria-label="Document text"
                className={hasVisuals ? "mt-4" : ""}
              >
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ds-text-muted">
                  Text
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {textItems.map((item, index) => (
                    <li key={index}>
                      <button
                        type="button"
                        onClick={() => onInsertText(item)}
                        aria-label={`Insert ${item.heading ? "heading" : "text"}: ${item.label}`}
                        title={item.text}
                        className={`flex w-full items-center gap-2 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-left transition-colors hover:border-ds-accent-border hover:bg-ds-state-hover ${FOCUS_RING}`}
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-ds-sm bg-ds-accent-surface text-ds-accent-text">
                          <Type size={13} aria-hidden="true" />
                        </span>
                        <span
                          className={`min-w-0 flex-1 truncate text-xs ${
                            item.heading
                              ? "font-semibold text-ds-text-primary"
                              : "text-ds-text-secondary"
                          }`}
                        >
                          {item.label}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
