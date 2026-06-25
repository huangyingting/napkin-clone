import type {
  AvailableTag,
  DashboardDocument,
  DashboardDocumentList,
} from "@/lib/document-management/list";
import type { Locale } from "@/lib/i18n";
import { createTranslator } from "@/lib/i18n";
import {
  computeOnboardingState,
  type OnboardingState,
} from "@/lib/onboarding/checklist";

export interface DashboardViewModel {
  title: string;
  subtitle: string;
  newDocumentLabel: string;
  onboarding: OnboardingState;
  documents: DashboardDocument[];
  availableTags: AvailableTag[];
  listCapped: boolean;
}

export function buildDashboardViewModel({
  userEmail,
  locale,
  documentList,
  onboardingDismissed,
  hasVisuals,
}: {
  userEmail: string;
  locale: Locale;
  documentList: DashboardDocumentList;
  onboardingDismissed: boolean;
  hasVisuals: boolean;
}): DashboardViewModel {
  const t = createTranslator(locale);
  const onboarding = computeOnboardingState({
    dismissed: onboardingDismissed,
    hasDocuments: documentList.hasDocuments,
    hasVisuals,
  });

  return {
    title: t("dashboard.title"),
    subtitle: t("dashboard.subtitle", userEmail),
    newDocumentLabel: t("dashboard.action.newDocument"),
    onboarding,
    documents: documentList.documents,
    availableTags: documentList.availableTags,
    listCapped: documentList.listCapped,
  };
}
