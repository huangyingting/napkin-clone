import type { Metadata } from "next";
import Link from "next/link";

import { listDashboardDocumentsForUser } from "@/lib/document-management/list";
import { runDashboardLoadMaintenance } from "@/lib/document-management/trash";
import { createTranslator } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { computeOnboardingState } from "@/lib/onboarding/checklist";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

import { DocumentList } from "./document-list";
import { ImportDocumentButton } from "./import-document-button";
import { NewDocumentButton } from "./new-document-button";
import { OnboardingChecklist } from "./onboarding-checklist";

export const metadata: Metadata = {
  title: "Dashboard — TextIQ",
};

const primaryButtonClass =
  "flex h-10 items-center justify-center rounded-full bg-ds-accent px-5 text-sm font-medium text-ds-text-on-accent transition hover:opacity-90 disabled:opacity-60";

export default async function DashboardPage() {
  const user = await requireUser();
  const locale = await getLocale();
  const t = createTranslator(locale);

  // Explicit dashboard-load policy: preserve the previous opportunistic,
  // throttled maintenance sweep without hiding it in a list query.
  await runDashboardLoadMaintenance();

  // Fetch onboarding dismissal flag for this user.
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { onboardingDismissed: true },
  });

  const { documents, availableTags, listCapped, hasDocuments } =
    await listDashboardDocumentsForUser(user.id);

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
    hasDocuments,
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
