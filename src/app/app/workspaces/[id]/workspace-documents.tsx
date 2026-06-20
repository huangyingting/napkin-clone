"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import Link from "next/link";

import { Dialog } from "@/components/ui/dialog";
import { TEMPLATE_CATALOG } from "@/lib/templates/catalog";
import {
  canCreateInWorkspace,
  canImportInWorkspace,
} from "@/lib/workspace/capabilities";

import {
  createWorkspaceDocument,
  importWorkspaceDocument,
  getWorkspaceDocuments,
  type WorkspaceDocument,
} from "./actions";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function DocumentThumbnail() {
  return (
    <div className="flex aspect-[16/10] items-center justify-center bg-ds-surface-sunken transition group-hover:bg-ds-state-hover">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-8 w-8 text-ds-text-muted"
      >
        <path d="M14 3v4a1 1 0 0 0 1 1h4" />
        <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
        <path d="M9 13h6" />
        <path d="M9 17h4" />
      </svg>
    </div>
  );
}

/** Accepted file extensions for workspace import. */
const ACCEPTED_EXTENSIONS = ".md,.html,.htm,.docx,.pptx,.pdf";

/** Template picker dialog for creating workspace documents. */
function WorkspaceTemplatePicker({
  workspaceId,
  onClose,
}: {
  workspaceId: string;
  onClose: () => void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const choose = (id: string) => {
    setPendingId(id);
    startTransition(async () => {
      await createWorkspaceDocument(workspaceId, id);
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      aria-labelledby="ws-template-picker-title"
      className="flex max-h-[85vh] flex-col overflow-hidden"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2
            id="ws-template-picker-title"
            className="text-base font-semibold text-ds-text-primary"
          >
            New document
          </h2>
          <p className="mt-1 text-sm text-ds-text-secondary">
            Choose a template to get started.
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      <ul className="mt-4 grid grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
        {TEMPLATE_CATALOG.map((template) => (
          <li key={template.id}>
            <button
              type="button"
              aria-label={`${template.name} template`}
              disabled={isPending}
              onClick={() => choose(template.id)}
              className="flex h-full w-full flex-col gap-1 rounded-xl border border-ds-border-strong p-4 text-left transition hover:border-ds-accent/40 hover:bg-ds-surface-sunken disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="text-sm font-medium text-ds-text-primary">
                {pendingId === template.id ? "Creating…" : template.name}
              </span>
              <span className="text-xs text-ds-text-secondary">
                {template.description}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 items-center justify-center rounded-full border border-ds-border-strong px-4 text-sm font-medium text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary"
        >
          Cancel
        </button>
      </div>
    </Dialog>
  );
}

/** Toolbar with New and Import buttons for owners and editors. */
function WorkspaceDocumentActions({
  workspaceId,
  canCreate,
  canImport,
}: {
  workspaceId: string;
  canCreate: boolean;
  canImport: boolean;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      setImportError("File too large (max 20 MB).");
      return;
    }
    setImportError(null);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as
        | { markdown: string }
        | { error: string };

      if (!response.ok || "error" in data) {
        setImportError("error" in data ? data.error : "Import failed.");
        setIsUploading(false);
        return;
      }

      const title =
        file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ") ||
        "Imported document";

      startTransition(async () => {
        await importWorkspaceDocument(workspaceId, data.markdown, title);
      });
    } catch {
      setImportError("Could not reach the server. Please try again.");
      setIsUploading(false);
    }
  };

  if (!canCreate && !canImport) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canCreate && (
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex h-9 items-center gap-2 rounded-full bg-ds-accent px-4 text-sm font-medium text-white transition hover:opacity-90"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          New document
        </button>
      )}

      {canImport && (
        <div className="flex flex-col items-end gap-1">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
            className="sr-only"
            aria-label="Import a document file into workspace"
          />
          <button
            type="button"
            disabled={isUploading}
            onClick={() => {
              setImportError(null);
              inputRef.current?.click();
            }}
            className="flex h-9 items-center gap-2 rounded-full border border-ds-border-strong px-4 text-sm font-medium text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Import document"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            {isUploading ? "Importing…" : "Import"}
          </button>
          {importError && (
            <p role="alert" className="text-xs text-ds-danger-text">
              {importError} —{" "}
              <button
                type="button"
                onClick={() => {
                  setImportError(null);
                  inputRef.current?.click();
                }}
                className="underline"
              >
                retry
              </button>
            </p>
          )}
        </div>
      )}

      {createOpen && (
        <WorkspaceTemplatePicker
          workspaceId={workspaceId}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  );
}

export function WorkspaceDocuments({
  workspaceId,
  userRole,
}: {
  workspaceId: string;
  userRole: "OWNER" | "EDITOR" | "VIEWER";
}) {
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const canCreate = canCreateInWorkspace(userRole);
  const canImport = canImportInWorkspace(userRole);

  useEffect(() => {
    getWorkspaceDocuments(workspaceId).then((docs) => {
      setDocuments(docs);
      setLoading(false);
    });
  }, [workspaceId]);

  if (loading) {
    return (
      <div className="rounded-xl border border-ds-border-subtle bg-ds-surface-raised p-6 text-center text-sm text-ds-text-muted">
        Loading documents...
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <WorkspaceDocumentActions
          workspaceId={workspaceId}
          canCreate={canCreate}
          canImport={canImport}
        />
        <div className="rounded-xl border border-dashed border-ds-border-strong bg-ds-surface-raised p-6 text-center">
          <p className="text-sm text-ds-text-muted">
            No documents in this workspace yet.
            {canCreate && " Create or import one to get started."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <WorkspaceDocumentActions
        workspaceId={workspaceId}
        canCreate={canCreate}
        canImport={canImport}
      />
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {documents.map((document) => (
          <li key={document.id}>
            <Link
              href={`/app/documents/${document.id}`}
              className="group flex flex-col overflow-hidden rounded-xl border border-ds-border-subtle bg-ds-surface-raised transition hover:border-ds-border-strong hover:shadow-sm"
            >
              <DocumentThumbnail />
              <div className="flex flex-col gap-1 p-4">
                <span className="truncate text-sm font-medium text-ds-text-primary">
                  {document.title}
                </span>
                <span className="text-xs text-ds-text-muted">
                  Edited {dateFormatter.format(new Date(document.updatedAt))}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
