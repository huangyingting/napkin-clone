import type { Metadata } from "next";
import Link from "next/link";

import { documentCapabilities } from "@/lib/auth/document-permissions";
import { excerpt, readingTimeMinutes } from "@/lib/document-stats";
import { DOCUMENT_LIST_LIMIT, capList } from "@/lib/documents";
import { createTranslator } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { computeOnboardingState } from "@/lib/onboarding/checklist";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { safeParseVisual, type Visual } from "@/lib/visual/schema";

import { purgeDeletedDocuments } from "./actions";
import { DocumentList } from "./document-list";
import { ImportDocumentButton } from "./import-document-button";
import { NewDocumentButton } from "./new-document-button";
import { OnboardingChecklist } from "./onboarding-checklist";

export const metadata: Metadata = {
  title: "Dashboard — TextIQ",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const primaryButtonClass =
  "flex h-10 items-center justify-center rounded-full bg-ds-accent px-5 text-sm font-medium text-ds-text-on-accent transition hover:opacity-90 disabled:opacity-60";

export default async function DashboardPage() {
  const user = await requireUser();
  const locale = await getLocale();
  const t = createTranslator(locale);

  // Opportunistically purge documents soft-deleted beyond the retention window.
  await purgeDeletedDocuments();

  // Fetch onboarding dismissal flag for this user.
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { onboardingDismissed: true },
  });

  // Get user's personal documents (soft-deleted ones are excluded). Capped at
  // DOCUMENT_LIST_LIMIT (one extra row requested so we can flag `hasMore`).
  const personalRows = await prisma.document.findMany({
    where: { ownerId: user.id, workspaceId: null, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    take: DOCUMENT_LIST_LIMIT + 1,
    select: {
      id: true,
      title: true,
      favorite: true,
      content: true,
      createdAt: true,
      updatedAt: true,
      ownerId: true,
      workspaceId: true,
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

  // Get documents from workspaces the user has access to. Capped the same way.
  const workspaceRows = await prisma.document.findMany({
    where: {
      workspaceId: { not: null },
      deletedAt: null,
      workspace: {
        OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }],
      },
    },
    orderBy: { updatedAt: "desc" },
    take: DOCUMENT_LIST_LIMIT + 1,
    select: {
      id: true,
      title: true,
      favorite: true,
      content: true,
      createdAt: true,
      updatedAt: true,
      ownerId: true,
      workspaceId: true,
      visuals: {
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        take: 1,
        select: { data: true },
      },
      tags: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, slug: true },
      },
      workspace: {
        select: {
          name: true,
          ownerId: true,
          members: {
            where: { userId: user.id },
            select: { userId: true, role: true },
          },
        },
      },
    },
  });

  const personal = capList(personalRows, DOCUMENT_LIST_LIMIT);
  const workspace = capList(workspaceRows, DOCUMENT_LIST_LIMIT);
  // Either list hitting its cap means the dashboard is showing a partial set.
  const listCapped = personal.hasMore || workspace.hasMore;

  const allDocuments = [
    ...personal.items.map((d) => ({ ...d, workspace: null })),
    ...workspace.items,
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
    const { canEdit, canManage } = documentCapabilities(document, user.id);
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
      canEdit,
      canManage,
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

  // Compute onboarding state: check if the user has any visuals across
  // their accessible documents (a lightweight count query).
  const hasVisuals =
    (await prisma.visual.count({
      where: {
        document: {
          deletedAt: null,
          OR: [
            { ownerId: user.id },
            {
              workspace: {
                OR: [
                  { ownerId: user.id },
                  { members: { some: { userId: user.id } } },
                ],
              },
            },
          ],
        },
      },
    })) > 0;

  const onboarding = computeOnboardingState({
    dismissed: dbUser?.onboardingDismissed ?? false,
    hasDocuments: allDocuments.length > 0,
    hasVisuals,
  });

  return (
    <main className="flex flex-1 flex-col items-center bg-ds-surface-sunken px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex w-full max-w-5xl flex-col gap-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-ds-text-primary">
              {t("dashboard.title")}
            </h1>
            <p className="text-sm text-ds-text-secondary">
              {t("dashboard.subtitle", user.email ?? "")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/app/trash"
              className="flex h-10 items-center justify-center rounded-full border border-ds-border-strong px-5 text-sm font-medium text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary"
            >
              Trash
            </Link>
            <ImportDocumentButton className={`${primaryButtonClass} gap-2`} />
            <NewDocumentButton className={primaryButtonClass} enableShortcut>
              {t("dashboard.action.newDocument")}
            </NewDocumentButton>
          </div>
        </header>

        {onboarding.show && <OnboardingChecklist steps={onboarding.steps} />}

        <DocumentList
          documents={documents}
          availableTags={availableTags}
          listCapped={listCapped}
        />
      </div>
    </main>
  );
}
