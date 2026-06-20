"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

import { getWorkspaceDocuments, type WorkspaceDocument } from "./actions";

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

export function WorkspaceDocuments({
  workspaceId,
}: {
  workspaceId: string;
  userRole: "OWNER" | "EDITOR" | "VIEWER";
}) {
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  const [loading, setLoading] = useState(true);

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
      <div className="rounded-xl border border-dashed border-ds-border-strong bg-ds-surface-raised p-6 text-center">
        <p className="text-sm text-ds-text-muted">
          No documents in this workspace yet.
        </p>
      </div>
    );
  }

  return (
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
  );
}
