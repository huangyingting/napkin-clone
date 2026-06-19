import type { Metadata } from "next";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { safeParseVisual, type Visual } from "@/lib/visual/schema";

import { purgeDeletedDocuments } from "./actions";
import { DocumentList } from "./document-list";
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
  "flex h-10 items-center justify-center rounded-full bg-ghost-accent px-5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60";

export default async function DashboardPage() {
  const user = await requireUser();

  // Opportunistically purge documents soft-deleted beyond the retention window.
  await purgeDeletedDocuments();

  // Get user's personal documents (soft-deleted ones are excluded).
  const personalDocuments = await prisma.document.findMany({
    where: { ownerId: user.id, workspaceId: null, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      favorite: true,
      createdAt: true,
      updatedAt: true,
      visuals: {
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        take: 1,
        select: { data: true },
      },
    },
  });

  // Get documents from workspaces the user has access to
  const workspaceDocuments = await prisma.document.findMany({
    where: {
      workspaceId: { not: null },
      deletedAt: null,
      workspace: {
        OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }],
      },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      favorite: true,
      createdAt: true,
      updatedAt: true,
      visuals: {
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        take: 1,
        select: { data: true },
      },
      workspace: { select: { name: true } },
    },
  });

  const allDocuments = [
    ...personalDocuments.map((d) => ({ ...d, workspace: null })),
    ...workspaceDocuments,
  ].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  const documents = allDocuments.map((document) => {
    const firstVisual = document.visuals[0];
    let thumbnail: Visual | null = null;
    if (firstVisual) {
      const parsed = safeParseVisual(firstVisual.data);
      if (parsed.success) {
        thumbnail = parsed.data;
      }
    }
    return {
      id: document.id,
      title: document.title,
      favorite: document.favorite,
      editedLabel: dateFormatter.format(document.updatedAt),
      workspaceName: document.workspace?.name ?? null,
      thumbnail,
      createdAtMs: document.createdAt.getTime(),
      updatedAtMs: document.updatedAt.getTime(),
    };
  });

  return (
    <main className="flex flex-1 flex-col items-center bg-ghost-wash px-6 py-12">
      <div className="flex w-full max-w-5xl flex-col gap-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-ghost-text">
              Your documents
            </h1>
            <p className="text-sm text-ghost-secondary">
              Signed in as{" "}
              <span className="font-medium text-ghost-text">{user.email}</span>
            </p>
          </div>
          <NewDocumentButton className={primaryButtonClass} enableShortcut />
        </header>

        <DocumentList documents={documents} />
      </div>
    </main>
  );
}
