import type { Metadata } from "next";

import { excerpt, readingTimeMinutes } from "@/lib/document-stats";
import { createTranslator } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { safeParseVisual, type Visual } from "@/lib/visual/schema";

import { purgeDeletedDocuments } from "./actions";
import { DocumentList } from "./document-list";
import { ImportDocumentButton } from "./import-document-button";
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
  const locale = await getLocale();
  const t = createTranslator(locale);

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
      content: true,
      createdAt: true,
      updatedAt: true,
      visuals: {
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        take: 1,
        select: { data: true },
      },
      tags: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, slug: true },
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
      content: true,
      createdAt: true,
      updatedAt: true,
      visuals: {
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        take: 1,
        select: { data: true },
      },
      tags: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, slug: true },
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
    const content = document.content ?? "";
    return {
      id: document.id,
      title: document.title,
      favorite: document.favorite,
      editedLabel: dateFormatter.format(document.updatedAt),
      workspaceName: document.workspace?.name ?? null,
      thumbnail,
      excerpt: excerpt(content),
      readingMinutes: readingTimeMinutes(content),
      createdAtMs: document.createdAt.getTime(),
      updatedAtMs: document.updatedAt.getTime(),
      tags: document.tags.map((tag) => ({ slug: tag.slug, name: tag.name })),
    };
  });

  // The user's own tags, plus any tags present on accessible workspace
  // documents (which may be owned by collaborators), form the filter control.
  const ownTags = await prisma.tag.findMany({
    where: { ownerId: user.id },
    select: { slug: true, name: true },
  });
  const tagMap = new Map<string, string>();
  for (const tag of ownTags) {
    tagMap.set(tag.slug, tag.name);
  }
  for (const document of documents) {
    for (const tag of document.tags) {
      if (!tagMap.has(tag.slug)) {
        tagMap.set(tag.slug, tag.name);
      }
    }
  }
  const availableTags = Array.from(tagMap, ([slug, name]) => ({
    slug,
    name,
  })).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  return (
    <main className="flex flex-1 flex-col items-center bg-ghost-wash px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex w-full max-w-5xl flex-col gap-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-ghost-text">
              {t("dashboard.title")}
            </h1>
            <p className="text-sm text-ghost-secondary">
              {t("dashboard.subtitle", user.email ?? "")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ImportDocumentButton className={`${primaryButtonClass} gap-2`} />
            <NewDocumentButton className={primaryButtonClass} enableShortcut>
              {t("dashboard.action.newDocument")}
            </NewDocumentButton>
          </div>
        </header>

        <DocumentList documents={documents} availableTags={availableTags} />
      </div>
    </main>
  );
}
