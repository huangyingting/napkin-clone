"use client";

import { useCallback, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import {
  listDocumentVersions,
  restoreDocumentVersion,
  type DocumentVersionSummary,
} from "./actions";

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Version History panel for the editor chrome (issue #158). Lists a document's
 * saved snapshots newest-first and lets an editor restore one. Mounted from
 * `lexical-editor.tsx`; lazily loads versions when first opened.
 *
 * Restore writes the chosen snapshot back as the current document state (after
 * checkpointing the pre-restore state server-side) and reloads so the
 * collaborative editor re-seeds from the restored content.
 */
export function VersionHistoryPanel({
  documentId,
  canEdit,
}: {
  documentId: string;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<DocumentVersionSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    setError(null);
    startTransition(async () => {
      try {
        setVersions(await listDocumentVersions(documentId));
        setLoaded(true);
      } catch {
        setError("Couldn't load version history. Please try again.");
      }
    });
  }, [documentId]);

  const toggleOpen = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (next && !loaded) {
        refresh();
      }
      return next;
    });
  }, [loaded, refresh]);

  const restore = useCallback((versionId: string) => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await restoreDocumentVersion(versionId);
        if (!res.ok) {
          setError(res.error);
          setConfirmId(null);
          return;
        }
        // Reload so the collaborative editor re-seeds from restored content.
        window.location.reload();
      } catch {
        setError("Couldn't restore this version. Please try again.");
        setConfirmId(null);
      }
    });
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={toggleOpen}
        aria-label="Version history"
        aria-expanded={open}
        className="relative inline-flex items-center gap-1.5 rounded-full border border-ds-border-subtle px-4 py-2 text-sm font-medium text-ds-text-secondary transition hover:bg-ds-state-hover hover:text-ds-text-primary"
      >
        History
      </button>

      {open
        ? createPortal(
            <aside
              role="dialog"
              aria-label="Version history"
              className="fixed inset-y-0 right-0 z-panel flex w-full max-w-md flex-col border-l border-ds-border-subtle bg-ds-surface-overlay shadow-ds-popover"
            >
              <div className="flex items-center justify-between border-b border-ds-border-subtle px-4 py-3">
                <h2 className="text-sm font-semibold text-ds-text-primary">
                  Version history
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={refresh}
                    disabled={isPending}
                    aria-label="Refresh version history"
                    className="rounded-md px-2 py-1 text-xs font-medium text-ds-text-muted transition hover:bg-ds-state-hover hover:text-ds-text-primary disabled:opacity-50"
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close version history"
                    className="rounded-md px-2 py-1 text-sm text-ds-text-muted transition hover:bg-ds-state-hover hover:text-ds-text-primary"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3">
                {error ? (
                  <p role="alert" className="mb-3 text-xs text-ds-danger-text">
                    {error}
                  </p>
                ) : null}

                {loaded && versions.length === 0 && !isPending ? (
                  <p className="text-sm text-ds-text-muted">
                    No saved versions yet. Snapshots are captured periodically
                    as you edit.
                  </p>
                ) : null}

                {!loaded && isPending ? (
                  <p className="text-sm text-ds-text-muted">Loading…</p>
                ) : null}

                <ul className="flex flex-col gap-2">
                  {versions.map((version) => (
                    <li
                      key={version.id}
                      className="rounded-lg border border-ds-border-subtle bg-ds-surface-raised px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ds-text-primary">
                            {formatTime(version.createdAt)}
                          </p>
                          <p className="truncate text-xs text-ds-text-muted">
                            {version.label ? `${version.label} · ` : ""}
                            {version.authorName ?? "Unknown"}
                            {version.hasDeck ? " · deck" : ""}
                          </p>
                        </div>
                        {canEdit ? (
                          confirmId === version.id ? (
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() => restore(version.id)}
                                disabled={isPending}
                                aria-label="Confirm restore"
                                className="rounded-full bg-ds-control px-2.5 py-1 text-xs font-medium text-ds-control-text transition hover:bg-ds-control-hover disabled:opacity-50"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmId(null)}
                                disabled={isPending}
                                aria-label="Cancel restore"
                                className="rounded-full border border-ds-border-subtle px-2.5 py-1 text-xs font-medium text-ds-text-secondary transition hover:text-ds-text-primary disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmId(version.id)}
                              disabled={isPending}
                              aria-label="Restore this version"
                              className="shrink-0 rounded-full border border-ds-border-subtle px-2.5 py-1 text-xs font-medium text-ds-text-secondary transition hover:border-ds-border-strong hover:text-ds-text-primary disabled:opacity-50"
                            >
                              Restore
                            </button>
                          )
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>,
            document.body,
          )
        : null}
    </>
  );
}
