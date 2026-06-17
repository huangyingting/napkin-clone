import type { Metadata } from "next";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

import { NewDocumentButton } from "./new-document-button";

export const metadata: Metadata = {
  title: "Dashboard — Napkin Clone",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const primaryButtonClass =
  "flex h-10 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200";

function DocumentThumbnail() {
  return (
    <div className="flex aspect-[16/10] items-center justify-center bg-zinc-50 transition group-hover:bg-zinc-100 dark:bg-zinc-900 dark:group-hover:bg-zinc-800">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-8 w-8 text-zinc-300 dark:text-zinc-600"
      >
        <path d="M14 3v4a1 1 0 0 0 1 1h4" />
        <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
        <path d="M9 13h6" />
        <path d="M9 17h4" />
      </svg>
    </div>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();

  // Get user's personal documents
  const personalDocuments = await prisma.document.findMany({
    where: { ownerId: user.id, workspaceId: null },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, updatedAt: true },
  });

  // Get documents from workspaces the user has access to
  const workspaceDocuments = await prisma.document.findMany({
    where: {
      workspaceId: { not: null },
      workspace: {
        OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }],
      },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      workspace: { select: { name: true } },
    },
  });

  const allDocuments = [
    ...personalDocuments.map((d) => ({ ...d, workspace: null })),
    ...workspaceDocuments,
  ].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  return (
    <main className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-12 dark:bg-black">
      <div className="flex w-full max-w-5xl flex-col gap-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Your documents
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Signed in as{" "}
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {user.email}
              </span>
            </p>
          </div>
          <NewDocumentButton className={primaryButtonClass} />
        </header>

        {allDocuments.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-black/10 bg-white px-6 py-16 text-center dark:border-white/15 dark:bg-zinc-950">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
                No documents yet
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Create your first document to start turning text into visuals.
              </p>
            </div>
            <NewDocumentButton className={primaryButtonClass}>
              Create your first document
            </NewDocumentButton>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {allDocuments.map((document) => (
              <li key={document.id}>
                <Link
                  href={`/app/documents/${document.id}`}
                  className="group flex flex-col overflow-hidden rounded-xl border border-black/[.06] bg-white transition hover:border-black/15 hover:shadow-sm dark:border-white/[.08] dark:bg-zinc-950 dark:hover:border-white/20"
                >
                  <DocumentThumbnail />
                  <div className="flex flex-col gap-1 p-4">
                    <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {document.title}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        Edited {dateFormatter.format(document.updatedAt)}
                      </span>
                      {document.workspace && (
                        <>
                          <span className="text-xs text-zinc-300 dark:text-zinc-600">
                            ·
                          </span>
                          <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                            {document.workspace.name}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
