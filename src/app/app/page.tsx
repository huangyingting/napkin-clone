import type { Metadata } from "next";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

import { DocumentCard } from "./document-card";
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
              <DocumentCard
                key={document.id}
                id={document.id}
                title={document.title}
                editedLabel={dateFormatter.format(document.updatedAt)}
                workspaceName={document.workspace?.name ?? null}
              />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
