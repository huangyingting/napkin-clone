import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getLocale } from "@/lib/i18n/server";
import { loadDashboardViewModel } from "@/lib/dashboard/loader";
import { requireUser } from "@/lib/session";
import Link from "next/link";

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
  const user = await requireUser(redirect);
  const locale = await getLocale();
  const viewModel = await loadDashboardViewModel({
    userId: user.id,
    userEmail: user.email ?? "",
    locale,
  });

  return (
    <main className="flex flex-1 flex-col items-center bg-ds-surface-sunken px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex w-full max-w-5xl flex-col gap-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-ds-text-primary">
              {viewModel.title}
            </h1>
            <p className="text-sm text-ds-text-secondary">
              {viewModel.subtitle}
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
              {viewModel.newDocumentLabel}
            </NewDocumentButton>
          </div>
        </header>

        {viewModel.onboarding.show && (
          <OnboardingChecklist steps={viewModel.onboarding.steps} />
        )}

        <DocumentList
          documents={viewModel.documents}
          availableTags={viewModel.availableTags}
          listCapped={viewModel.listCapped}
        />
      </div>
    </main>
  );
}
